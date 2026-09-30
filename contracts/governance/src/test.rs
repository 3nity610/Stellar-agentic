#![cfg(test)]

use crate::{Error, GovernanceContract, GovernanceContractClient, ProposalStatus};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger},
    Address, Env, IntoVal, String, Symbol, Vec,
};

#[contract]
struct MockTargetContract;

#[contractimpl]
impl MockTargetContract {
    pub fn update_val(env: Env, new_val: u32) -> u32 {
        env.storage()
            .instance()
            .set(&symbol_short!("val"), &new_val);
        new_val
    }

    pub fn get_val(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("val"))
            .unwrap_or(0)
    }
}

fn setup_test() -> (
    Env,
    GovernanceContractClient<'static>,
    Vec<Address>,
    [Address; 3],
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(&env, &contract_id);

    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let owner3 = Address::generate(&env);

    let mut owners = Vec::new(&env);
    owners.push_back(owner1.clone());
    owners.push_back(owner2.clone());
    owners.push_back(owner3.clone());

    (env, client, owners, [owner1, owner2, owner3])
}

#[test]
fn test_initialize_success() {
    let (_, client, owners, _) = setup_test();

    client.initialize(&owners, &2u32, &100u32, &1000u32);

    assert_eq!(client.get_threshold(), 2);
    assert_eq!(client.get_timelock(), 100);
    assert_eq!(client.get_proposal_ttl(), 1000);
    assert_eq!(client.get_owners(), owners);
    assert_eq!(client.get_proposal_count(), 0);
}

#[test]
fn test_initialize_already_initialized_fails() {
    let (_, client, owners, _) = setup_test();

    client.initialize(&owners, &2u32, &100u32, &1000u32);
    let res = client.try_initialize(&owners, &2u32, &100u32, &1000u32);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn test_initialize_invalid_threshold() {
    let (env, client, owners, _) = setup_test();

    // 0 threshold
    let res = client.try_initialize(&owners, &0u32, &100u32, &1000u32);
    assert_eq!(res, Err(Ok(Error::InvalidThreshold)));

    // threshold > owners.len()
    let res2 = client.try_initialize(&owners, &4u32, &100u32, &1000u32);
    assert_eq!(res2, Err(Ok(Error::InvalidThreshold)));

    // empty owners
    let empty_owners = Vec::new(&env);
    let res3 = client.try_initialize(&empty_owners, &1u32, &100u32, &1000u32);
    assert_eq!(res3, Err(Ok(Error::EmptyOwners)));
}

#[test]
fn test_initialize_duplicate_owners_rejected() {
    let (env, client, _, [owner1, owner2, _]) = setup_test();

    let mut dup_owners = Vec::new(&env);
    dup_owners.push_back(owner1.clone());
    dup_owners.push_back(owner2.clone());
    dup_owners.push_back(owner1.clone());

    let res = client.try_initialize(&dup_owners, &2u32, &100u32, &1000u32);
    assert_eq!(res, Err(Ok(Error::DuplicateOwner)));
}

#[test]
fn test_initialize_invalid_timelock_and_ttl() {
    let (_, client, owners, _) = setup_test();

    // ttl == 0
    let res = client.try_initialize(&owners, &2u32, &100u32, &0u32);
    assert_eq!(res, Err(Ok(Error::InvalidTtl)));

    // timelock >= ttl
    let res2 = client.try_initialize(&owners, &2u32, &1000u32, &1000u32);
    assert_eq!(res2, Err(Ok(Error::InvalidTimelock)));
}

#[test]
fn test_propose_by_owner_and_voting_flow() {
    let (env, client, owners, [owner1, owner2, _]) = setup_test();
    client.initialize(&owners, &2u32, &50u32, &500u32);

    let target = Address::generate(&env);
    let title = String::from_str(&env, "Test Proposal");
    let desc = String::from_str(&env, "Set parameter");
    let mut args = Vec::new(&env);
    args.push_back(100u32.into_val(&env));

    let pid = client.propose(
        &owner1,
        &target,
        &symbol_short!("set_val"),
        &args,
        &title,
        &desc,
    );

    assert_eq!(pid, 1);
    assert_eq!(client.get_proposal_count(), 1);

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Pending);
    assert_eq!(p.proposer, owner1);
    assert_eq!(p.target, target);
    assert_eq!(p.created_at_ledger, env.ledger().sequence());
    assert_eq!(p.approved_at_ledger, None);

    // Proposer is automatically recorded as first approval
    let approvals = client.get_approvals(&pid);
    assert_eq!(approvals.len(), 1);
    assert!(client.has_approved(&pid, &owner1));

    // Owner 2 approves -> reaches threshold (2 of 3)
    client.approve(&owner2, &pid);

    let p_after = client.get_proposal(&pid).unwrap();
    assert_eq!(p_after.status, ProposalStatus::Approved);
    assert_eq!(p_after.approved_at_ledger, Some(env.ledger().sequence()));
    assert_eq!(p_after.eta_ledger, Some(env.ledger().sequence() + 50));
    assert_eq!(client.get_approvals(&pid).len(), 2);
}

#[test]
fn test_propose_by_non_owner_rejected() {
    let (env, client, owners, _) = setup_test();
    client.initialize(&owners, &2u32, &50u32, &500u32);

    let stranger = Address::generate(&env);
    let target = Address::generate(&env);
    let title = String::from_str(&env, "Unauthorized");
    let desc = String::from_str(&env, "Desc");
    let args = Vec::new(&env);

    let res = client.try_propose(
        &stranger,
        &target,
        &symbol_short!("action"),
        &args,
        &title,
        &desc,
    );
    assert_eq!(res, Err(Ok(Error::NotAnOwner)));
}

#[test]
fn test_single_owner_threshold_one_auto_approves() {
    let (env, client, _, [owner1, _, _]) = setup_test();

    let mut single_owner = Vec::new(&env);
    single_owner.push_back(owner1.clone());
    client.initialize(&single_owner, &1u32, &20u32, &200u32);

    let target = Address::generate(&env);
    let title = String::from_str(&env, "Instant Approve");
    let desc = String::from_str(&env, "Desc");
    let args = Vec::new(&env);

    let current_seq = env.ledger().sequence();
    let pid = client.propose(
        &owner1,
        &target,
        &symbol_short!("act"),
        &args,
        &title,
        &desc,
    );

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Approved);
    assert_eq!(p.approved_at_ledger, Some(current_seq));
    assert_eq!(p.eta_ledger, Some(current_seq + 20));
}

#[test]
fn test_duplicate_approval_rejected() {
    let (env, client, owners, [owner1, _, _]) = setup_test();
    client.initialize(&owners, &2u32, &50u32, &500u32);

    let target = Address::generate(&env);
    let title = String::from_str(&env, "Proposal");
    let desc = String::from_str(&env, "Desc");
    let args = Vec::new(&env);

    let pid = client.propose(
        &owner1,
        &target,
        &symbol_short!("act"),
        &args,
        &title,
        &desc,
    );

    // Owner1 is already recorded upon proposal, voting again should fail
    let res = client.try_approve(&owner1, &pid);
    assert_eq!(res, Err(Ok(Error::AlreadyApproved)));
}

#[test]
fn test_approval_by_stranger_rejected() {
    let (env, client, owners, [owner1, _, _]) = setup_test();
    client.initialize(&owners, &2u32, &50u32, &500u32);

    let stranger = Address::generate(&env);
    let target = Address::generate(&env);
    let pid = client.propose(
        &owner1,
        &target,
        &symbol_short!("act"),
        &Vec::new(&env),
        &String::from_str(&env, "T"),
        &String::from_str(&env, "D"),
    );

    let res = client.try_approve(&stranger, &pid);
    assert_eq!(res, Err(Ok(Error::NotAnOwner)));
}

#[test]
fn test_proposal_expiry_enforcement() {
    let (env, client, owners, [owner1, owner2, _]) = setup_test();
    // TTL is 100 ledgers
    client.initialize(&owners, &2u32, &20u32, &100u32);

    let target = Address::generate(&env);
    let pid = client.propose(
        &owner1,
        &target,
        &symbol_short!("act"),
        &Vec::new(&env),
        &String::from_str(&env, "T"),
        &String::from_str(&env, "D"),
    );

    // Fast forward ledger sequence past TTL (100 + 1)
    env.ledger().with_mut(|l| l.sequence_number += 105);

    // Approving after expiry should fail and mark Expired
    let res = client.try_approve(&owner2, &pid);
    assert_eq!(res, Err(Ok(Error::ProposalExpired)));
    assert_eq!(
        client.get_proposal_status(&pid),
        Some(ProposalStatus::Expired)
    );

    // Executing after expiry should also fail
    let res_exec = client.try_execute(&owner1, &pid);
    assert_eq!(res_exec, Err(Ok(Error::ProposalExpired)));
}

#[test]
fn test_timelock_enforcement_and_execution_success() {
    let (env, client, owners, [owner1, owner2, _]) = setup_test();
    // Timelock = 50 ledgers, TTL = 200 ledgers
    client.initialize(&owners, &2u32, &50u32, &200u32);

    let mock_id = env.register(MockTargetContract, ());
    let mock_client = MockTargetContractClient::new(&env, &mock_id);
    assert_eq!(mock_client.get_val(), 0);

    let mut args = Vec::new(&env);
    args.push_back(777u32.into_val(&env));

    let pid = client.propose(
        &owner1,
        &mock_id,
        &Symbol::new(&env, "update_val"),
        &args,
        &String::from_str(&env, "Update Mock"),
        &String::from_str(&env, "Set to 777"),
    );

    // Owner 2 approves -> reaches threshold 2
    client.approve(&owner2, &pid);

    let p = client.get_proposal(&pid).unwrap();
    let eta = p.eta_ledger.unwrap();

    // Try executing immediately before timelock elapses
    let res_early = client.try_execute(&owner1, &pid);
    assert_eq!(res_early, Err(Ok(Error::TimelockNotElapsed)));

    // Fast forward ledger to eta - 1 -> still rejected
    env.ledger().with_mut(|l| l.sequence_number = eta - 1);
    let res_edge = client.try_execute(&owner1, &pid);
    assert_eq!(res_edge, Err(Ok(Error::TimelockNotElapsed)));

    // Advance to eta -> execution succeeds!
    env.ledger().with_mut(|l| l.sequence_number = eta);
    client.execute(&owner1, &pid);

    // Verify mock target contract received the call and updated state
    assert_eq!(mock_client.get_val(), 777);

    // Verify proposal status is now Executed
    let p_exec = client.get_proposal(&pid).unwrap();
    assert_eq!(p_exec.status, ProposalStatus::Executed);
    assert_eq!(p_exec.executed_at_ledger, Some(eta));
}

#[test]
fn test_replay_protection_cannot_execute_twice() {
    let (env, client, owners, [owner1, owner2, _]) = setup_test();
    client.initialize(&owners, &2u32, &10u32, &200u32);

    let mock_id = env.register(MockTargetContract, ());
    let mut args = Vec::new(&env);
    args.push_back(42u32.into_val(&env));

    let pid = client.propose(
        &owner1,
        &mock_id,
        &Symbol::new(&env, "update_val"),
        &args,
        &String::from_str(&env, "T"),
        &String::from_str(&env, "D"),
    );
    client.approve(&owner2, &pid);

    let eta = client.get_proposal(&pid).unwrap().eta_ledger.unwrap();
    env.ledger().with_mut(|l| l.sequence_number = eta);

    // First execution succeeds
    client.execute(&owner1, &pid);

    // Second execution must be rejected (Replay Protection)
    let res_replay = client.try_execute(&owner1, &pid);
    assert_eq!(res_replay, Err(Ok(Error::ProposalAlreadyExecuted)));
}

#[test]
fn test_cancel_proposal() {
    let (env, client, owners, [owner1, _, _]) = setup_test();
    client.initialize(&owners, &2u32, &50u32, &500u32);

    let target = Address::generate(&env);
    let pid = client.propose(
        &owner1,
        &target,
        &symbol_short!("act"),
        &Vec::new(&env),
        &String::from_str(&env, "T"),
        &String::from_str(&env, "D"),
    );

    // Stranger cannot cancel
    let stranger = Address::generate(&env);
    let res_unauth = client.try_cancel(&stranger, &pid);
    assert_eq!(res_unauth, Err(Ok(Error::Unauthorized)));

    // Proposer cancels
    client.cancel(&owner1, &pid);
    assert_eq!(
        client.get_proposal_status(&pid),
        Some(ProposalStatus::Cancelled)
    );

    // Cancelled proposal cannot be approved or executed
    let res_approve = client.try_approve(&owner1, &pid);
    assert_eq!(res_approve, Err(Ok(Error::ProposalNotPending)));
}

#[test]
fn test_self_governed_owner_rotation() {
    let (env, client, owners, [owner1, owner2, owner3]) = setup_test();
    client.initialize(&owners, &2u32, &20u32, &200u32);

    let new_owner_a = Address::generate(&env);
    let new_owner_b = Address::generate(&env);
    let mut new_owners = Vec::new(&env);
    new_owners.push_back(new_owner_a.clone());
    new_owners.push_back(new_owner_b.clone());

    // Direct call from an external caller without proposal must fail
    let res_direct = client.try_rotate_owners(&new_owners, &2u32);
    assert_eq!(res_direct, Err(Ok(Error::SelfCallOnly)));

    // Create a proposal to rotate owners
    let mut args = Vec::new(&env);
    args.push_back(new_owners.clone().into_val(&env));
    args.push_back(2u32.into_val(&env));

    let pid = client.propose(
        &owner1,
        &client.address,
        &Symbol::new(&env, "rotate_owners"),
        &args,
        &String::from_str(&env, "Rotate Owners"),
        &String::from_str(&env, "Transition to 2-of-2 new set"),
    );

    // Quorum: owner2 approves
    client.approve(&owner2, &pid);

    let eta = client.get_proposal(&pid).unwrap().eta_ledger.unwrap();
    env.ledger().with_mut(|l| l.sequence_number = eta);

    // Execute proposal
    client.execute(&owner1, &pid);

    // Verify owner rotation took effect!
    assert_eq!(client.get_owners(), new_owners);
    assert_eq!(client.get_threshold(), 2);
    assert!(client.is_owner(&new_owner_a));
    assert!(client.is_owner(&new_owner_b));
    assert!(!client.is_owner(&owner1));
    assert!(!client.is_owner(&owner2));
    assert!(!client.is_owner(&owner3));

    // Old owners cannot propose anymore
    let res_old = client.try_propose(
        &owner1,
        &client.address,
        &symbol_short!("act"),
        &Vec::new(&env),
        &String::from_str(&env, "T"),
        &String::from_str(&env, "D"),
    );
    assert_eq!(res_old, Err(Ok(Error::NotAnOwner)));

    // New owners can propose
    let new_pid = client.propose(
        &new_owner_a,
        &client.address,
        &symbol_short!("act"),
        &Vec::new(&env),
        &String::from_str(&env, "New T"),
        &String::from_str(&env, "New D"),
    );
    assert_eq!(new_pid, 2);
}

#[test]
fn test_self_governed_timelock_update() {
    let (env, client, owners, [owner1, owner2, _]) = setup_test();
    client.initialize(&owners, &2u32, &20u32, &200u32);

    let mut args = Vec::new(&env);
    args.push_back(50u32.into_val(&env));

    let pid = client.propose(
        &owner1,
        &client.address,
        &Symbol::new(&env, "set_timelock"),
        &args,
        &String::from_str(&env, "Update Timelock"),
        &String::from_str(&env, "Increase delay to 50"),
    );

    client.approve(&owner2, &pid);
    let eta = client.get_proposal(&pid).unwrap().eta_ledger.unwrap();
    env.ledger().with_mut(|l| l.sequence_number = eta);

    client.execute(&owner1, &pid);
    assert_eq!(client.get_timelock(), 50);
}
