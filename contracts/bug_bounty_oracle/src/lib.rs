#![no_std]

//! Automated bug bounty payout oracle.
//!
//! The contract escrows a sponsor-funded bounty, records candidate exploit
//! payload hashes, and pays a hunter automatically once the configured verifier
//! attests that the payload reproduces the targeted assertion failure in the
//! sponsor's shadow replica.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Map,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BountyStatus {
    Open,
    Paid,
    Expired,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SubmissionStatus {
    Pending,
    Accepted,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bounty {
    pub sponsor: Address,
    pub token: Address,
    pub amount: i128,
    pub shadow_contract: Address,
    pub assertion_id: BytesN<32>,
    pub verifier: Address,
    pub deadline_ledger: u32,
    pub status: BountyStatus,
    pub winning_submission: Option<u64>,
    pub submission_count: u64,
    pub created_at: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Submission {
    pub bounty_id: u64,
    pub hunter: Address,
    pub payload_hash: BytesN<32>,
    pub failure_hash: BytesN<32>,
    pub metadata_hash: BytesN<32>,
    pub status: SubmissionStatus,
    pub submitted_at: u32,
    pub verified_at: Option<u32>,
    pub verifier_note_hash: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PayloadKey {
    pub bounty_id: u64,
    pub payload_hash: BytesN<32>,
}

#[contract]
pub struct BugBountyOracle;

#[contractimpl]
impl BugBountyOracle {
    /// Create a funded bounty for one shadow-replica assertion.
    pub fn create_bounty(
        env: Env,
        sponsor: Address,
        token: Address,
        amount: i128,
        shadow_contract: Address,
        assertion_id: BytesN<32>,
        verifier: Address,
        deadline_ledger: u32,
    ) -> u64 {
        sponsor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if deadline_ledger <= env.ledger().sequence() {
            panic!("deadline must be in the future");
        }

        let token_client = token::TokenClient::new(&env, &token);
        token_client.transfer(&sponsor, &env.current_contract_address(), &amount);

        let bounty_id = Self::next_bounty_id(&env);
        let bounty = Bounty {
            sponsor: sponsor.clone(),
            token,
            amount,
            shadow_contract,
            assertion_id,
            verifier,
            deadline_ledger,
            status: BountyStatus::Open,
            winning_submission: None,
            submission_count: 0,
            created_at: env.ledger().sequence(),
        };

        Self::save_bounty(&env, bounty_id, bounty);

        env.events().publish(
            (symbol_short!("bbounty"), symbol_short!("created")),
            (bounty_id, sponsor, amount),
        );

        bounty_id
    }

    /// Submit a candidate payload by hash.
    ///
    /// `payload_hash` commits to the transaction payload, `failure_hash`
    /// commits to the reproduced assertion failure, and `metadata_hash` can
    /// point to the off-chain reproduction bundle or report.
    pub fn submit_payload(
        env: Env,
        hunter: Address,
        bounty_id: u64,
        payload_hash: BytesN<32>,
        failure_hash: BytesN<32>,
        metadata_hash: BytesN<32>,
    ) -> u64 {
        hunter.require_auth();

        let mut bounty = Self::load_bounty(&env, bounty_id);
        if bounty.status != BountyStatus::Open {
            panic!("bounty is not open");
        }
        if env.ledger().sequence() > bounty.deadline_ledger {
            panic!("bounty deadline passed");
        }

        let payload_key = PayloadKey {
            bounty_id,
            payload_hash: payload_hash.clone(),
        };
        if Self::payload_index(&env).contains_key(payload_key.clone()) {
            panic!("duplicate payload");
        }

        let submission_id = Self::next_submission_id(&env);
        let submission = Submission {
            bounty_id,
            hunter: hunter.clone(),
            payload_hash: payload_hash.clone(),
            failure_hash,
            metadata_hash,
            status: SubmissionStatus::Pending,
            submitted_at: env.ledger().sequence(),
            verified_at: None,
            verifier_note_hash: None,
        };

        Self::save_submission(&env, submission_id, submission);
        bounty.submission_count += 1;
        Self::save_bounty(&env, bounty_id, bounty);

        let mut index = Self::payload_index(&env);
        index.set(payload_key, submission_id);
        env.storage()
            .instance()
            .set(&symbol_short!("payhash"), &index);

        env.events().publish(
            (symbol_short!("bbounty"), symbol_short!("submit")),
            (bounty_id, submission_id, hunter),
        );

        submission_id
    }

    /// Accept a pending submission and pay the hunter automatically.
    ///
    /// Only the bounty's configured verifier can call this. The verifier is
    /// expected to have replayed the submitted transaction payload against the
    /// shadow replica and confirmed that it trips the targeted assertion.
    pub fn accept_submission(
        env: Env,
        verifier: Address,
        bounty_id: u64,
        submission_id: u64,
        verifier_note_hash: BytesN<32>,
    ) {
        verifier.require_auth();

        let mut bounty = Self::load_bounty(&env, bounty_id);
        if bounty.status != BountyStatus::Open {
            panic!("bounty is not open");
        }
        if bounty.verifier != verifier {
            panic!("not the bounty verifier");
        }

        let mut submission = Self::load_submission(&env, submission_id);
        if submission.bounty_id != bounty_id {
            panic!("submission does not match bounty");
        }
        if submission.status != SubmissionStatus::Pending {
            panic!("submission is not pending");
        }

        let token_client = token::TokenClient::new(&env, &bounty.token);
        token_client.transfer(
            &env.current_contract_address(),
            &submission.hunter,
            &bounty.amount,
        );

        submission.status = SubmissionStatus::Accepted;
        submission.verified_at = Some(env.ledger().sequence());
        submission.verifier_note_hash = Some(verifier_note_hash);
        Self::save_submission(&env, submission_id, submission.clone());

        bounty.status = BountyStatus::Paid;
        bounty.winning_submission = Some(submission_id);
        Self::save_bounty(&env, bounty_id, bounty);

        env.events().publish(
            (symbol_short!("bbounty"), symbol_short!("paid")),
            (bounty_id, submission_id, submission.hunter),
        );
    }

    /// Reject a pending submission without paying it.
    pub fn reject_submission(env: Env, verifier: Address, bounty_id: u64, submission_id: u64) {
        verifier.require_auth();

        let bounty = Self::load_bounty(&env, bounty_id);
        if bounty.verifier != verifier {
            panic!("not the bounty verifier");
        }

        let mut submission = Self::load_submission(&env, submission_id);
        if submission.bounty_id != bounty_id {
            panic!("submission does not match bounty");
        }
        if submission.status != SubmissionStatus::Pending {
            panic!("submission is not pending");
        }

        submission.status = SubmissionStatus::Rejected;
        submission.verified_at = Some(env.ledger().sequence());
        Self::save_submission(&env, submission_id, submission);

        env.events().publish(
            (symbol_short!("bbounty"), symbol_short!("reject")),
            (bounty_id, submission_id),
        );
    }

    /// Return funds to the sponsor after an unpaid bounty expires.
    pub fn close_expired(env: Env, bounty_id: u64) {
        let mut bounty = Self::load_bounty(&env, bounty_id);
        if bounty.status != BountyStatus::Open {
            panic!("bounty is not open");
        }
        if env.ledger().sequence() <= bounty.deadline_ledger {
            panic!("deadline not reached yet");
        }

        let token_client = token::TokenClient::new(&env, &bounty.token);
        token_client.transfer(
            &env.current_contract_address(),
            &bounty.sponsor,
            &bounty.amount,
        );

        bounty.status = BountyStatus::Expired;
        Self::save_bounty(&env, bounty_id, bounty.clone());

        env.events().publish(
            (symbol_short!("bbounty"), symbol_short!("expired")),
            (bounty_id, bounty.sponsor),
        );
    }

    /// Sponsor cancels a bounty before any submission has won.
    pub fn cancel_bounty(env: Env, sponsor: Address, bounty_id: u64) {
        sponsor.require_auth();

        let mut bounty = Self::load_bounty(&env, bounty_id);
        if bounty.sponsor != sponsor {
            panic!("not the bounty sponsor");
        }
        if bounty.status != BountyStatus::Open {
            panic!("bounty is not open");
        }
        if bounty.submission_count > 0 {
            panic!("bounty already has submissions");
        }

        let token_client = token::TokenClient::new(&env, &bounty.token);
        token_client.transfer(
            &env.current_contract_address(),
            &bounty.sponsor,
            &bounty.amount,
        );

        bounty.status = BountyStatus::Cancelled;
        Self::save_bounty(&env, bounty_id, bounty.clone());

        env.events().publish(
            (symbol_short!("bbounty"), symbol_short!("cancel")),
            (bounty_id, bounty.sponsor),
        );
    }

    pub fn get_bounty(env: Env, bounty_id: u64) -> Bounty {
        Self::load_bounty(&env, bounty_id)
    }

    pub fn get_submission(env: Env, submission_id: u64) -> Submission {
        Self::load_submission(&env, submission_id)
    }

    pub fn bounty_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("bcount"))
            .unwrap_or(0)
    }

    pub fn submission_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("scount"))
            .unwrap_or(0)
    }

    fn next_bounty_id(env: &Env) -> u64 {
        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("bcount"))
            .unwrap_or(0);
        let next = count + 1;
        env.storage()
            .instance()
            .set(&symbol_short!("bcount"), &next);
        next
    }

    fn next_submission_id(env: &Env) -> u64 {
        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("scount"))
            .unwrap_or(0);
        let next = count + 1;
        env.storage()
            .instance()
            .set(&symbol_short!("scount"), &next);
        next
    }

    fn load_bounties(env: &Env) -> Map<u64, Bounty> {
        env.storage()
            .instance()
            .get(&symbol_short!("bounties"))
            .unwrap_or(Map::new(env))
    }

    fn load_bounty(env: &Env, bounty_id: u64) -> Bounty {
        Self::load_bounties(env)
            .get(bounty_id)
            .expect("bounty not found")
    }

    fn save_bounty(env: &Env, bounty_id: u64, bounty: Bounty) {
        let mut bounties = Self::load_bounties(env);
        bounties.set(bounty_id, bounty);
        env.storage()
            .instance()
            .set(&symbol_short!("bounties"), &bounties);
    }

    fn load_submissions(env: &Env) -> Map<u64, Submission> {
        env.storage()
            .instance()
            .get(&symbol_short!("subs"))
            .unwrap_or(Map::new(env))
    }

    fn load_submission(env: &Env, submission_id: u64) -> Submission {
        Self::load_submissions(env)
            .get(submission_id)
            .expect("submission not found")
    }

    fn save_submission(env: &Env, submission_id: u64, submission: Submission) {
        let mut submissions = Self::load_submissions(env);
        submissions.set(submission_id, submission);
        env.storage()
            .instance()
            .set(&symbol_short!("subs"), &submissions);
    }

    fn payload_index(env: &Env) -> Map<PayloadKey, u64> {
        env.storage()
            .instance()
            .get(&symbol_short!("payhash"))
            .unwrap_or(Map::new(env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    struct Fixture {
        env: Env,
        client: BugBountyOracleClient<'static>,
        token_client: TokenClient<'static>,
        sponsor: Address,
        hunter: Address,
        verifier: Address,
        shadow_contract: Address,
    }

    fn hash(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();

        let sponsor = Address::generate(&env);
        let hunter = Address::generate(&env);
        let verifier = Address::generate(&env);
        let shadow_contract = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_address = token.address();
        let asset_client = StellarAssetClient::new(&env, &token_address);
        asset_client.mint(&sponsor, &1_000);

        let contract_id = env.register(BugBountyOracle, ());
        let client = BugBountyOracleClient::new(&env, &contract_id);
        let token_client = TokenClient::new(&env, &token_address);

        Fixture {
            env,
            client,
            token_client,
            sponsor,
            hunter,
            verifier,
            shadow_contract,
        }
    }

    fn create_bounty(fx: &Fixture, amount: i128) -> u64 {
        fx.client.create_bounty(
            &fx.sponsor,
            &fx.token_client.address,
            &amount,
            &fx.shadow_contract,
            &hash(&fx.env, 1),
            &fx.verifier,
            &100,
        )
    }

    #[test]
    fn accept_submission_pays_hunter_and_closes_bounty() {
        let fx = setup();
        let bounty_id = create_bounty(&fx, 500);

        assert_eq!(fx.token_client.balance(&fx.sponsor), 500);
        assert_eq!(fx.token_client.balance(&fx.client.address), 500);

        let submission_id = fx.client.submit_payload(
            &fx.hunter,
            &bounty_id,
            &hash(&fx.env, 2),
            &hash(&fx.env, 3),
            &hash(&fx.env, 4),
        );
        fx.client
            .accept_submission(&fx.verifier, &bounty_id, &submission_id, &hash(&fx.env, 5));

        assert_eq!(fx.token_client.balance(&fx.hunter), 500);
        assert_eq!(fx.token_client.balance(&fx.client.address), 0);

        let bounty = fx.client.get_bounty(&bounty_id);
        assert_eq!(bounty.status, BountyStatus::Paid);
        assert_eq!(bounty.winning_submission, Some(submission_id));
        assert_eq!(bounty.submission_count, 1);

        let submission = fx.client.get_submission(&submission_id);
        assert_eq!(submission.status, SubmissionStatus::Accepted);
        assert_eq!(submission.verifier_note_hash, Some(hash(&fx.env, 5)));
    }

    #[test]
    #[should_panic(expected = "duplicate payload")]
    fn duplicate_payload_hash_is_rejected_per_bounty() {
        let fx = setup();
        let bounty_id = create_bounty(&fx, 500);
        let payload_hash = hash(&fx.env, 2);

        fx.client.submit_payload(
            &fx.hunter,
            &bounty_id,
            &payload_hash,
            &hash(&fx.env, 3),
            &hash(&fx.env, 4),
        );
        fx.client.submit_payload(
            &fx.hunter,
            &bounty_id,
            &payload_hash,
            &hash(&fx.env, 6),
            &hash(&fx.env, 7),
        );
    }

    #[test]
    #[should_panic(expected = "not the bounty verifier")]
    fn only_configured_verifier_can_accept() {
        let fx = setup();
        let bounty_id = create_bounty(&fx, 500);
        let attacker = Address::generate(&fx.env);
        let submission_id = fx.client.submit_payload(
            &fx.hunter,
            &bounty_id,
            &hash(&fx.env, 2),
            &hash(&fx.env, 3),
            &hash(&fx.env, 4),
        );

        fx.client
            .accept_submission(&attacker, &bounty_id, &submission_id, &hash(&fx.env, 5));
    }

    #[test]
    fn close_expired_refunds_sponsor() {
        let fx = setup();
        let bounty_id = create_bounty(&fx, 500);
        fx.env.ledger().set_sequence_number(101);

        fx.client.close_expired(&bounty_id);

        assert_eq!(fx.token_client.balance(&fx.sponsor), 1_000);
        assert_eq!(fx.token_client.balance(&fx.client.address), 0);
        assert_eq!(
            fx.client.get_bounty(&bounty_id).status,
            BountyStatus::Expired
        );
    }

    #[test]
    #[should_panic(expected = "bounty already has submissions")]
    fn sponsor_cannot_cancel_after_submission() {
        let fx = setup();
        let bounty_id = create_bounty(&fx, 500);
        fx.client.submit_payload(
            &fx.hunter,
            &bounty_id,
            &hash(&fx.env, 2),
            &hash(&fx.env, 3),
            &hash(&fx.env, 4),
        );

        fx.client.cancel_bounty(&fx.sponsor, &bounty_id);
    }
}
