use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

fn setup() -> (Env, AgentWalletFactoryClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AgentWalletFactory, ());
    let client = AgentWalletFactoryClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn test_initialize() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.total_agents(), 0);
}

#[test]
fn test_create_agent() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let agent_addr = Address::generate(&env);
    client.initialize(&admin);
    let agent_id = client.create_agent(&owner, &agent_addr, &String::from_str(&env, "MyAgent"));
    assert_eq!(agent_id, 1);
    assert_eq!(client.total_agents(), 1);
    let agent = client.get_agent(&1);
    assert_eq!(agent.owner, owner);
    assert_eq!(agent.address, agent_addr);
    assert!(agent.active);
    assert_eq!(agent.total_ops, 0);
}

#[test]
fn test_deactivate_reactivate() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    client.initialize(&admin);
    let agent_id = client.create_agent(&owner, &Address::generate(&env), &String::from_str(&env, "TestAgent"));
    client.deactivate_agent(&owner, &agent_id);
    assert!(!client.get_agent(&agent_id).active);
    client.reactivate_agent(&owner, &agent_id);
    assert!(client.get_agent(&agent_id).active);
}

#[test]
fn test_get_agents_by_owner() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    client.initialize(&admin);
    client.create_agent(&owner, &Address::generate(&env), &String::from_str(&env, "Agent1"));
    client.create_agent(&owner, &Address::generate(&env), &String::from_str(&env, "Agent2"));
    assert_eq!(client.get_agents_by_owner(&owner).len(), 2);
}

#[test]
#[should_panic(expected = "not the agent owner")]
fn test_deactivate_wrong_owner_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    client.initialize(&admin);
    let agent_id = client.create_agent(&owner, &Address::generate(&env), &String::from_str(&env, "Agent"));
    client.deactivate_agent(&attacker, &agent_id);
}

#[test]
fn test_record_operation() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    client.initialize(&admin);
    let agent_id = client.create_agent(&owner, &Address::generate(&env), &String::from_str(&env, "Agent"));
    client.record_operation(&agent_id);
    client.record_operation(&agent_id);
    assert_eq!(client.get_agent(&agent_id).total_ops, 2);
}

#[test]
fn test_is_active_agent() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let unknown = Address::generate(&env);
    client.initialize(&admin);
    let agent_id = client.create_agent(&owner, &agent, &String::from_str(&env, "Agent"));
    assert!(client.is_active_agent(&agent));
    assert!(!client.is_active_agent(&unknown));
    client.deactivate_agent(&owner, &agent_id);
    assert!(!client.is_active_agent(&agent));
}