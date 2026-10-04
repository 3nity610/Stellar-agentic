#![no_std]

//! # Escrow Contract
//! Enables agent-to-agent job delegation with trustless payment.
//!
//! Flow:
//! 1. Agent A calls `create_job` — locks funds in escrow
//! 2. Agent B accepts and completes the job
//! 3. Agent B calls `submit_result` with proof of work
//! 4. Agent A (or arbiter) calls `release` — funds go to Agent B
//! 5. If Agent B doesn't deliver, Agent A calls `refund` after deadline
//!
//! ## Events
//! See `docs/events.md` for the full topic/data layout. Topics are
//! `(symbol_short!("escrow"), <action>)` with a parallel `state`/`job` snapshot.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Map, Symbol,
    Vec,
};

/// Topic prefix used for all escrow lifecycle events.
const TOPIC_ESCROW: Symbol = symbol_short!("escrow");

#[cfg(test)]
mod test;

const DISPUTE_TIMEOUT_LEDGERS: u32 = 14400;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum JobStatus { Open, InProgress, PendingRelease, Completed, Refunded, Disputed }

#[contracttype]
#[derive(Clone, Debug)]
pub struct Job {
    pub requester: Address,
    pub worker: Option<Address>,
    pub arbiter: Option<Address>,
    pub token: Address,
    pub amount: i128,
    pub task_description: Bytes,
    pub result: Option<Bytes>,
    pub deadline_ledger: u32,
    pub dispute_deadline_ledger: Option<u32>,
    pub status: JobStatus,
    pub created_at: u32,
}

// ─── Contract ────────────────────────────────────────────────────────────────


pub const DAY_IN_LEDGERS: u32 = 17280;
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;


pub fn extend_instance_ttl(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Create an escrow job. Locks `amount` tokens from requester.
    ///
    /// # Arguments
    /// * `requester` - Agent requesting the work
    /// * `token` - Token to pay with
    /// * `amount` - Payment for completing the job
    /// * `task_description` - Description / IPFS hash of what needs doing
    /// * `deadline_ledger` - After this ledger, requester can claim a refund
    /// * `arbiter` - Optional trusted address for dispute resolution
    pub fn create_job(
        env: Env,
        requester: Address,
        token: Address,
        amount: i128,
        task_description: Bytes,
        deadline_ledger: u32,
        arbiter: Option<Address>,
    ) -> u64 {
        extend_instance_ttl(&env);
        requester.require_auth();
        
        // --- Sentinel Guard ---
        let _ = Self::validate_sentinel_guard(&amount); 
        
        if deadline_ledger <= env.ledger().sequence() { panic!("deadline must be in the future"); }
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&requester, &env.current_contract_address(), &amount);
        let job_id = Self::next_id(&env);
        let job = Job {
            requester: requester.clone(),
            worker: None,
            arbiter,
            token,
            amount,
            task_description,
            result: None,
            deadline_ledger,
            dispute_deadline_ledger: None,
            status: JobStatus::Open,
            created_at: env.ledger().sequence(),
        };

        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("created")),
            (job_id, requester, amount),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );

        job_id
    }

    pub fn accept_job(env: Env, worker: Address, job_id: u64) {
        extend_instance_ttl(&env);
        worker.require_auth();
        let mut job = Self::load_job(&env, job_id);
        if job.status != JobStatus::Open { panic!("job is not open"); }
        if env.ledger().sequence() >= job.deadline_ledger { panic!("job has expired"); }
        job.worker = Some(worker.clone());
        job.status = JobStatus::InProgress;
        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("accepted")),
            (job_id, worker),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );
    }

    pub fn submit_result(env: Env, worker: Address, job_id: u64, result: Bytes) {
        extend_instance_ttl(&env);
        worker.require_auth();
        let mut job = Self::load_job(&env, job_id);
        if job.status != JobStatus::InProgress { panic!("job not in progress"); }
        let assigned_worker = job.worker.as_ref().expect("no worker assigned");
        if *assigned_worker != worker { panic!("not the assigned worker"); }
        job.result = Some(result);
        job.status = JobStatus::PendingRelease;
        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("result")),
            (job_id, worker),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );
    }

    pub fn release(env: Env, releaser: Address, job_id: u64) {
        extend_instance_ttl(&env);
        Self::require_not_paused(&env);

        releaser.require_auth();
        let mut job = Self::load_job(&env, job_id);

        if job.status != JobStatus::PendingRelease {
            panic!("job not pending release");
        }

        // Only requester can release
        if job.requester != releaser {
            panic!("not authorized to release");
        }

        let worker = job.worker.clone().expect("no worker");
        let token_client = token::Client::new(&env, &job.token);
        token_client.transfer(&env.current_contract_address(), &worker, &job.amount);
        job.status = JobStatus::Completed;
        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("released")),
            (job_id, worker, job.amount),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );
    }

    pub fn refund(env: Env, requester: Address, job_id: u64) {
        extend_instance_ttl(&env);
        requester.require_auth();
        let mut job = Self::load_job(&env, job_id);

        if job.requester != requester {
            panic!("not the job requester");
        }

        let refundable = job.status == JobStatus::Open
            || job.status == JobStatus::InProgress
            || job.status == JobStatus::PendingRelease
            || job.status == JobStatus::Disputed;

        if !refundable {
            panic!("job cannot be refunded");
        }

        if job.status == JobStatus::Disputed {
            let dispute_deadline = job
                .dispute_deadline_ledger
                .expect("missing dispute deadline");
            if env.ledger().sequence() <= dispute_deadline {
                panic!("dispute deadline not reached yet");
            }
        } else {
            if env.ledger().sequence() < job.deadline_ledger && job.status != JobStatus::Open {
                panic!("deadline not reached yet");
            }
        }

        let token_client = token::Client::new(&env, &job.token);
        token_client.transfer(&env.current_contract_address(), &requester, &job.amount);
        job.status = JobStatus::Refunded;
        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("refunded")),
            (job_id, requester, job.amount),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );
    }

    pub fn dispute(env: Env, requester: Address, job_id: u64) {
        extend_instance_ttl(&env);
        requester.require_auth();
        let mut job = Self::load_job(&env, job_id);
        if job.requester != requester { panic!("not requester"); }
        if job.arbiter.is_none() { panic!("no arbiter"); }
        if job.status != JobStatus::PendingRelease { panic!("can only dispute pending"); }
        job.status = JobStatus::Disputed;
        job.dispute_deadline_ledger = Some(env.ledger().sequence() + DISPUTE_TIMEOUT_LEDGERS);
        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("disputed")),
            (job_id, requester),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );
    }

    /// Arbiter resolves a dispute
    pub fn resolve_dispute(env: Env, arbiter: Address, job_id: u64, favor_worker: bool) {
        extend_instance_ttl(&env);
        Self::require_not_paused(&env);
        arbiter.require_auth();

        let mut job = Self::load_job(&env, job_id);

        if job.status != JobStatus::Disputed {
            panic!("job not disputed");
        }

        let job_arbiter = job.arbiter.as_ref().expect("no arbiter set");
        if *job_arbiter != arbiter {
            panic!("not the arbiter");
        }

        let token_client = token::Client::new(&env, &job.token);

        if favor_worker {
            let worker = job.worker.clone().expect("no worker");
            token_client.transfer(&env.current_contract_address(), &worker, &job.amount);
            job.status = JobStatus::Completed;
        } else {
            token_client.transfer(&env.current_contract_address(), &job.requester, &job.amount);
            job.status = JobStatus::Refunded;
        }

        Self::save_job(&env, job_id, job.clone());

        env.events().publish(
            (TOPIC_ESCROW, symbol_short!("resolved")),
            (job_id, arbiter, favor_worker),
        );
        env.events().publish(
            (symbol_short!("state"), symbol_short!("job")),
            (job_id, job),
        );
    }

    // ── Multisig Admin Quorum ────────────────────────────────────────────────

    pub fn set_multisig_config(
        env: Env,
        caller: Address,
        owners: Vec<Address>,
        threshold: u32,
        propose_window_ledgers: u32,
    ) {
        caller.require_auth();

        if threshold == 0 {
            panic!("threshold must be positive");
        }
        if threshold > owners.len() {
            panic!("threshold cannot exceed owner count");
        }
        if propose_window_ledgers == 0 {
            panic!("propose window must be positive");
        }

        let current_threshold = Self::get_multisig_threshold(env.clone());
        let current_owners = Self::get_multisig_owners(env.clone());

        if current_threshold > 1 && !current_owners.is_empty() {
            if !current_owners.contains(&caller) {
                panic!("not an admin owner");
            }
            let key = symbol_short!("prop_ms");
            let proposals: Map<Address, u32> = env
                .storage()
                .instance()
                .get(&key)
                .unwrap_or(Map::new(&env));
            let count = Self::count_valid_proposals(
                &env,
                &proposals,
                &current_owners,
                Self::get_multisig_propose_window(env.clone()),
            );
            if count < current_threshold {
                panic!("quorum not reached");
            }
            env.storage().instance().remove(&key);
        } else if !current_owners.is_empty() && !current_owners.contains(&caller) {
            panic!("not an admin owner");
        }

        env.storage()
            .instance()
            .set(&symbol_short!("ms_own"), &owners);
        env.storage()
            .instance()
            .set(&symbol_short!("ms_thresh"), &threshold);
        env.storage()
            .instance()
            .set(&symbol_short!("ms_win"), &propose_window_ledgers);

        env.events().publish(
            (symbol_short!("admin"), symbol_short!("ms_cfg")),
            (owners, threshold),
        );
    }

    pub fn propose_circuit_breaker(env: Env, owner: Address, circuit_breaker: Address) {
        owner.require_auth();
        let owners = Self::get_multisig_owners(env.clone());
        if !owners.contains(&owner) {
            panic!("not an admin owner");
        }

        let key = (symbol_short!("cb"), circuit_breaker.clone());
        let mut proposals: Map<Address, u32> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or(Map::new(&env));
        proposals.set(owner.clone(), env.ledger().sequence());
        env.storage().instance().set(&key, &proposals);

        env.events().publish(
            (symbol_short!("admin"), symbol_short!("prop_cb")),
            (owner, circuit_breaker),
        );
    }

    /// Wire this escrow contract up to a deployed CircuitBreaker contract.
    /// In single-owner mode (default), executes with 1 signature.
    /// In multi-sig mode, gated on reaching threshold approvals.
    pub fn set_circuit_breaker(env: Env, admin: Address, circuit_breaker: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let owners = Self::get_multisig_owners(env.clone());
        let threshold = Self::get_multisig_threshold(env.clone());

        if !owners.is_empty() {
            if !owners.contains(&admin) {
                panic!("not an admin owner");
            }
            if threshold > 1 {
                let key = (symbol_short!("cb"), circuit_breaker.clone());
                let proposals: Map<Address, u32> = env
                    .storage()
                    .instance()
                    .get(&key)
                    .unwrap_or(Map::new(&env));
                let count = Self::count_valid_proposals(
                    &env,
                    &proposals,
                    &owners,
                    Self::get_multisig_propose_window(env.clone()),
                );
                if count < threshold {
                    panic!("quorum not reached");
                }
                env.storage().instance().remove(&key);
            }
        } else {
            let admin_key = symbol_short!("cb_admin");
            match env.storage().instance().get::<_, Address>(&admin_key) {
                Some(stored_admin) => {
                    if stored_admin != admin {
                        panic!("not the circuit breaker admin");
                    }
                }
                None => {
                    env.storage().instance().set(&admin_key, &admin);
                }
            }
        }

        env.storage()
            .instance()
            .set(&symbol_short!("cb"), &circuit_breaker);
    }

    pub fn get_multisig_owners(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&symbol_short!("ms_own"))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_multisig_threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("ms_thresh"))
            .unwrap_or(1)
    }

    pub fn get_multisig_propose_window(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("ms_win"))
            .unwrap_or(17_280)
    }

    pub fn get_circuit_breaker_quorum(env: Env, circuit_breaker: Address) -> u32 {
        let owners = Self::get_multisig_owners(env.clone());
        let window = Self::get_multisig_propose_window(env.clone());
        let key = (symbol_short!("cb"), circuit_breaker);
        let proposals: Map<Address, u32> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or(Map::new(&env));
        Self::count_valid_proposals(&env, &proposals, &owners, window)
    }

    fn count_valid_proposals(
        env: &Env,
        proposals: &Map<Address, u32>,
        owners: &Vec<Address>,
        window: u32,
    ) -> u32 {
        let current_ledger = env.ledger().sequence();
        let cutoff = current_ledger.saturating_sub(window);

        let mut count = 0u32;
        for owner in owners.iter() {
            if let Some(proposed_at) = proposals.get(owner) {
                if proposed_at >= cutoff {
                    count += 1;
                }
            }
        }
        count
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    pub fn get_job(env: Env, job_id: u64) -> Job {
        extend_instance_ttl(&env);
        Self::load_job(&env, job_id)
    }

    pub fn job_count(env: Env) -> u64 {
        extend_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("count"))
            .unwrap_or(0)
    }

    // ── Internals ────────────────────────────────────────────────────────────

    fn validate_sentinel_guard(amount: &i128) -> Result<(), u32> {
        if *amount <= 0 { panic!("amount must be positive"); }
        Ok(())
    }

    fn next_id(env: &Env) -> u64 {
        let count: u64 = env.storage().instance().get(&soroban_sdk::symbol_short!("count")).unwrap_or(0);
        let next = count + 1;
        env.storage().instance().set(&soroban_sdk::symbol_short!("count"), &next);
        next
    }
    fn load_job(env: &Env, job_id: u64) -> Job {
        extend_instance_ttl(env);
        let jobs: Map<u64, Job> = env
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("jobs"))
            .unwrap_or(Map::new(env));
        jobs.get(job_id).expect("job not found")
    }

    /// Panics if a CircuitBreaker is configured and reports the system as
    /// paused. If no CircuitBreaker has been wired up via
    /// `set_circuit_breaker`, this is a no-op (fail-open before setup).
    fn require_not_paused(env: &Env) {
        let cb: Option<Address> = env.storage().instance().get(&symbol_short!("cb"));
        if let Some(circuit_breaker) = cb {
            let is_paused: bool = env.invoke_contract(
                &circuit_breaker,
                &Symbol::new(env, "is_paused"),
                Vec::new(env),
            );
            if is_paused {
                panic!("system paused");
            }
        }
    }

    fn save_job(env: &Env, job_id: u64, job: Job) {
        extend_instance_ttl(env);
        let mut jobs: Map<u64, Job> = env
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("jobs"))
            .unwrap_or(Map::new(env));
        jobs.set(job_id, job);
        env.storage().instance().set(&soroban_sdk::symbol_short!("jobs"), &jobs);
    }
}
