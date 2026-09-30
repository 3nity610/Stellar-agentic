#![no_std]

//! # Governance Multi-Sig Contract
//!
//! Provides k-of-n multi-signature governance, proposal lifecycle management,
//! timelock enforcement, proposal expiration, owner rotation, and replay protection
//! for administrative actions across all agent payment rail contracts.
//!
//! ## Key Invariants
//! 1. **k-of-n Quorum**: A proposal cannot transition to `Approved` or `Executed` without
//!    accumulating at least `threshold` unique owner approvals.
//! 2. **Timelock Delay**: An approved proposal must wait `timelock_delay_ledgers` after
//!    reaching quorum before it can be executed.
//! 3. **Proposal Expiry**: Proposals must be executed within `proposal_ttl_ledgers` of
//!    creation. Expired proposals can never be executed.
//! 4. **Replay Protection**: A proposal can be executed at most once. State transitions
//!    occur before external invocation (Checks-Effects-Interactions).
//! 5. **Self-Governed Rotation**: Owner set and threshold changes require full governance
//!    proposals and cannot be bypassed by any individual owner.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, FromVal,
    String, Symbol, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidThreshold = 3,
    EmptyOwners = 4,
    DuplicateOwner = 5,
    NotAnOwner = 6,
    ProposalNotFound = 7,
    ProposalNotPending = 8,
    AlreadyApproved = 9,
    ProposalExpired = 10,
    TimelockNotElapsed = 11,
    ProposalAlreadyExecuted = 12,
    ThresholdNotMet = 13,
    Unauthorized = 14,
    SelfCallOnly = 15,
    InvalidTtl = 16,
    InvalidTimelock = 17,
}

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum ProposalStatus {
    Pending = 0,
    Approved = 1,
    Executed = 2,
    Cancelled = 3,
    Expired = 4,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub target: Address,
    pub action: Symbol,
    pub args: Vec<Val>,
    pub title: String,
    pub description: String,
    pub status: ProposalStatus,
    pub created_at_ledger: u32,
    pub approved_at_ledger: Option<u32>,
    pub executed_at_ledger: Option<u32>,
    pub eta_ledger: Option<u32>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Initialized,
    Owners,
    Threshold,
    TimelockDelay,
    ProposalTtl,
    NextProposalId,
    Proposal(u32),
    Approvals(u32),
    HasApproved(u32, Address),
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialize the governance contract with an initial owner set, threshold,
    /// timelock delay (in ledgers), and proposal TTL (in ledgers).
    pub fn initialize(
        env: Env,
        owners: Vec<Address>,
        threshold: u32,
        timelock_delay_ledgers: u32,
        proposal_ttl_ledgers: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }

        Self::validate_owners_and_threshold(&owners, threshold)?;

        if proposal_ttl_ledgers == 0 {
            return Err(Error::InvalidTtl);
        }

        if timelock_delay_ledgers >= proposal_ttl_ledgers {
            return Err(Error::InvalidTimelock);
        }

        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Owners, &owners);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        env.storage()
            .instance()
            .set(&DataKey::TimelockDelay, &timelock_delay_ledgers);
        env.storage()
            .instance()
            .set(&DataKey::ProposalTtl, &proposal_ttl_ledgers);
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &1u32);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("init")),
            (threshold, timelock_delay_ledgers, proposal_ttl_ledgers),
        );

        Ok(())
    }

    /// Submit a new administrative proposal. Proposer must be an owner and
    /// is automatically registered as the first approval.
    pub fn propose(
        env: Env,
        proposer: Address,
        target: Address,
        action: Symbol,
        args: Vec<Val>,
        title: String,
        description: String,
    ) -> Result<u32, Error> {
        Self::require_initialized(&env)?;
        proposer.require_auth();

        if !Self::is_owner(env.clone(), proposer.clone()) {
            return Err(Error::NotAnOwner);
        }

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &(id + 1));

        let current_ledger = env.ledger().sequence();
        let threshold = Self::get_threshold(env.clone());
        let timelock = Self::get_timelock(env.clone());

        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());
        env.storage()
            .instance()
            .set(&DataKey::Approvals(id), &approvals);
        env.storage()
            .instance()
            .set(&DataKey::HasApproved(id, proposer.clone()), &true);

        let (status, approved_at, eta) = if approvals.len() >= threshold {
            let approved_ledger = current_ledger;
            let eta = approved_ledger + timelock;
            (ProposalStatus::Approved, Some(approved_ledger), Some(eta))
        } else {
            (ProposalStatus::Pending, None, None)
        };

        let proposal = Proposal {
            id,
            proposer: proposer.clone(),
            target: target.clone(),
            action: action.clone(),
            args,
            title,
            description,
            status,
            created_at_ledger: current_ledger,
            approved_at_ledger: approved_at,
            executed_at_ledger: None,
            eta_ledger: eta,
        };

        env.storage()
            .instance()
            .set(&DataKey::Proposal(id), &proposal);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("propose")),
            (id, proposer, target),
        );

        if status == ProposalStatus::Approved {
            env.events().publish(
                (symbol_short!("gov"), symbol_short!("approved")),
                (id, current_ledger, eta.unwrap()),
            );
        }

        Ok(id)
    }

    /// Cast an approval vote on an existing proposal.
    pub fn approve(env: Env, owner: Address, proposal_id: u32) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        owner.require_auth();

        if !Self::is_owner(env.clone(), owner.clone()) {
            return Err(Error::NotAnOwner);
        }

        let mut proposal =
            Self::get_proposal(env.clone(), proposal_id).ok_or(Error::ProposalNotFound)?;

        let current_ledger = env.ledger().sequence();
        let ttl = Self::get_proposal_ttl(env.clone());

        // Check proposal expiry
        if current_ledger > proposal.created_at_ledger + ttl {
            proposal.status = ProposalStatus::Expired;
            env.storage()
                .instance()
                .set(&DataKey::Proposal(proposal_id), &proposal);
            return Err(Error::ProposalExpired);
        }

        if proposal.status != ProposalStatus::Pending && proposal.status != ProposalStatus::Approved
        {
            return Err(Error::ProposalNotPending);
        }

        let has_approved: bool = env
            .storage()
            .instance()
            .get(&DataKey::HasApproved(proposal_id, owner.clone()))
            .unwrap_or(false);

        if has_approved {
            return Err(Error::AlreadyApproved);
        }

        let mut approvals: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Approvals(proposal_id))
            .unwrap_or(Vec::new(&env));

        approvals.push_back(owner.clone());
        env.storage()
            .instance()
            .set(&DataKey::Approvals(proposal_id), &approvals);
        env.storage()
            .instance()
            .set(&DataKey::HasApproved(proposal_id, owner.clone()), &true);

        let threshold = Self::get_threshold(env.clone());
        let timelock = Self::get_timelock(env.clone());

        if approvals.len() >= threshold && proposal.approved_at_ledger.is_none() {
            proposal.status = ProposalStatus::Approved;
            proposal.approved_at_ledger = Some(current_ledger);
            let eta = current_ledger + timelock;
            proposal.eta_ledger = Some(eta);

            env.events().publish(
                (symbol_short!("gov"), symbol_short!("approved")),
                (proposal_id, current_ledger, eta),
            );
        }

        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("vote")),
            (proposal_id, owner),
        );

        Ok(())
    }

    /// Execute a proposal once quorum is reached and the timelock delay has elapsed.
    /// Uses the Checks-Effects-Interactions pattern for absolute replay protection.
    pub fn execute(env: Env, executor: Address, proposal_id: u32) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        executor.require_auth();

        let mut proposal =
            Self::get_proposal(env.clone(), proposal_id).ok_or(Error::ProposalNotFound)?;

        if proposal.status == ProposalStatus::Executed {
            return Err(Error::ProposalAlreadyExecuted);
        }

        let current_ledger = env.ledger().sequence();
        let ttl = Self::get_proposal_ttl(env.clone());

        if current_ledger > proposal.created_at_ledger + ttl {
            proposal.status = ProposalStatus::Expired;
            env.storage()
                .instance()
                .set(&DataKey::Proposal(proposal_id), &proposal);
            return Err(Error::ProposalExpired);
        }

        let threshold = Self::get_threshold(env.clone());
        let approvals = Self::get_approvals(env.clone(), proposal_id);
        if approvals.len() < threshold {
            return Err(Error::ThresholdNotMet);
        }

        let eta = proposal.eta_ledger.ok_or(Error::ThresholdNotMet)?;
        if current_ledger < eta {
            return Err(Error::TimelockNotElapsed);
        }

        // Effects: transition state to Executed BEFORE external interaction to prevent replay/reentrancy
        proposal.status = ProposalStatus::Executed;
        proposal.executed_at_ledger = Some(current_ledger);
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        // Interaction: invoke target contract with proposal arguments
        if proposal.target == env.current_contract_address() {
            Self::execute_internal_action(&env, proposal.action, proposal.args)?;
        } else {
            let _result: Val =
                env.invoke_contract(&proposal.target, &proposal.action, proposal.args.clone());
        }

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("executed")),
            (proposal_id, executor, proposal.target),
        );

        Ok(())
    }

    /// Cancel a pending proposal. Can be called by the proposer.
    pub fn cancel(env: Env, caller: Address, proposal_id: u32) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        caller.require_auth();

        let mut proposal =
            Self::get_proposal(env.clone(), proposal_id).ok_or(Error::ProposalNotFound)?;

        if proposal.proposer != caller && !Self::is_owner(env.clone(), caller.clone()) {
            return Err(Error::Unauthorized);
        }

        if proposal.status == ProposalStatus::Executed {
            return Err(Error::ProposalAlreadyExecuted);
        }

        proposal.status = ProposalStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("cancelled")),
            (proposal_id, caller),
        );

        Ok(())
    }

    // ── Self-Governed Administrative Actions ───────────────────────────────────

    /// Rotate the owner set and threshold. Can ONLY be invoked via an executed
    /// governance proposal targetting this contract.
    pub fn rotate_owners(
        _env: Env,
        _new_owners: Vec<Address>,
        _new_threshold: u32,
    ) -> Result<(), Error> {
        Err(Error::SelfCallOnly)
    }

    /// Update the timelock delay. Can ONLY be invoked via an executed proposal.
    pub fn set_timelock(_env: Env, _new_timelock: u32) -> Result<(), Error> {
        Err(Error::SelfCallOnly)
    }

    /// Update the proposal TTL. Can ONLY be invoked via an executed proposal.
    pub fn set_proposal_ttl(_env: Env, _new_ttl: u32) -> Result<(), Error> {
        Err(Error::SelfCallOnly)
    }

    fn execute_internal_action(env: &Env, action: Symbol, args: Vec<Val>) -> Result<(), Error> {
        let rotate_sym = Symbol::new(env, "rotate_owners");
        let timelock_sym = Symbol::new(env, "set_timelock");
        let ttl_sym = Symbol::new(env, "set_proposal_ttl");

        if action == rotate_sym {
            let new_owners: Vec<Address> = Vec::from_val(env, &args.get(0).unwrap());
            let new_threshold: u32 = u32::from_val(env, &args.get(1).unwrap());
            Self::do_rotate_owners(env, new_owners, new_threshold)?;
        } else if action == timelock_sym {
            let new_timelock: u32 = u32::from_val(env, &args.get(0).unwrap());
            Self::do_set_timelock(env, new_timelock)?;
        } else if action == ttl_sym {
            let new_ttl: u32 = u32::from_val(env, &args.get(0).unwrap());
            Self::do_set_proposal_ttl(env, new_ttl)?;
        } else {
            return Err(Error::SelfCallOnly);
        }
        Ok(())
    }

    fn do_rotate_owners(
        env: &Env,
        new_owners: Vec<Address>,
        new_threshold: u32,
    ) -> Result<(), Error> {
        Self::validate_owners_and_threshold(&new_owners, new_threshold)?;

        env.storage().instance().set(&DataKey::Owners, &new_owners);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &new_threshold);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("rotated")),
            (new_threshold, new_owners),
        );

        Ok(())
    }

    fn do_set_timelock(env: &Env, new_timelock: u32) -> Result<(), Error> {
        let ttl = Self::get_proposal_ttl(env.clone());
        if new_timelock >= ttl {
            return Err(Error::InvalidTimelock);
        }

        env.storage()
            .instance()
            .set(&DataKey::TimelockDelay, &new_timelock);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("timelock")),
            new_timelock,
        );

        Ok(())
    }

    fn do_set_proposal_ttl(env: &Env, new_ttl: u32) -> Result<(), Error> {
        let timelock = Self::get_timelock(env.clone());
        if new_ttl <= timelock {
            return Err(Error::InvalidTtl);
        }

        env.storage()
            .instance()
            .set(&DataKey::ProposalTtl, &new_ttl);

        env.events()
            .publish((symbol_short!("gov"), symbol_short!("ttl")), new_ttl);

        Ok(())
    }

    // ── Read-only Queries ──────────────────────────────────────────────────────

    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal> {
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))?;
        let current_ledger = env.ledger().sequence();
        let ttl = Self::get_proposal_ttl(env);
        if (proposal.status == ProposalStatus::Pending
            || proposal.status == ProposalStatus::Approved)
            && current_ledger > proposal.created_at_ledger + ttl
        {
            proposal.status = ProposalStatus::Expired;
        }
        Some(proposal)
    }

    pub fn get_proposal_status(env: Env, proposal_id: u32) -> Option<ProposalStatus> {
        Self::get_proposal(env, proposal_id).map(|p| p.status)
    }

    pub fn get_approvals(env: Env, proposal_id: u32) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Approvals(proposal_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn has_approved(env: Env, proposal_id: u32, owner: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::HasApproved(proposal_id, owner))
            .unwrap_or(false)
    }

    pub fn get_owners(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Owners)
            .unwrap_or(Vec::new(&env))
    }

    pub fn is_owner(env: Env, account: Address) -> bool {
        let owners = Self::get_owners(env);
        owners.contains(account)
    }

    pub fn get_threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(0)
    }

    pub fn get_timelock(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TimelockDelay)
            .unwrap_or(0)
    }

    pub fn get_proposal_ttl(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ProposalTtl)
            .unwrap_or(0)
    }

    pub fn get_proposal_count(env: Env) -> u32 {
        let next_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap_or(1);
        next_id.saturating_sub(1)
    }

    // ── Internal Helpers ───────────────────────────────────────────────────────

    fn require_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Initialized) {
            Err(Error::NotInitialized)
        } else {
            Ok(())
        }
    }

    fn validate_owners_and_threshold(owners: &Vec<Address>, threshold: u32) -> Result<(), Error> {
        if owners.is_empty() {
            return Err(Error::EmptyOwners);
        }
        if threshold == 0 || threshold > owners.len() {
            return Err(Error::InvalidThreshold);
        }

        // Ensure no duplicate owners
        for i in 0..owners.len() {
            for j in (i + 1)..owners.len() {
                if owners.get(i).unwrap() == owners.get(j).unwrap() {
                    return Err(Error::DuplicateOwner);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
