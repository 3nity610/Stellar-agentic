//! Benchmarks for ZK solvency proof generation and verification.
//!
//! Measures proving time, verification time, and proof size across different
//! circuit sizes (different MAX_PAYMENTS values) to determine the practical
//! ceiling for on-chain verification on Soroban.

use ark_std::rand::rngs::StdRng;
use ark_std::rand::SeedableRng;
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use solvency_proof::{prove, setup, verify_native, HistoryEntry};

/// Generate a realistic payment history for benchmarking.
fn generate_history(num_payments: usize, limit_per_period: u128) -> Vec<HistoryEntry> {
    (0..num_payments)
        .map(|i| HistoryEntry {
            amount: limit_per_period / (num_payments as u128 + 1),
            period_index: (i / 4) as u64, // Group payments into periods
        })
        .collect()
}

/// Benchmark setup (trusted setup ceremony) time.
fn bench_setup(c: &mut Criterion) {
    let mut rng = StdRng::seed_from_u64(42);

    c.bench_function("setup", |b| b.iter(|| setup(black_box(&mut rng))));
}

/// Benchmark proof generation for different circuit sizes.
fn bench_prove(c: &mut Criterion) {
    let mut rng = StdRng::seed_from_u64(42);
    let (pk, _vk) = setup(&mut rng).unwrap();

    let mut group = c.benchmark_group("prove");

    for num_payments in [1, 2, 4, 8, 16].iter() {
        let history = generate_history(*num_payments, 1_000_000);
        let limit_per_period = 1_000_000u128;
        let total_spent: u128 = history.iter().map(|h| h.amount).sum();

        group.bench_with_input(
            BenchmarkId::from_parameter(num_payments),
            num_payments,
            |b, _| {
                let mut rng = StdRng::seed_from_u64(42);
                b.iter(|| {
                    prove(
                        black_box(&pk),
                        black_box(&history),
                        black_box(limit_per_period),
                        black_box(total_spent),
                        black_box(&mut rng),
                    )
                })
            },
        );
    }
    group.finish();
}

/// Benchmark verification time for different circuit sizes.
fn bench_verify(c: &mut Criterion) {
    let mut rng = StdRng::seed_from_u64(42);
    let (pk, vk) = setup(&mut rng).unwrap();

    let mut group = c.benchmark_group("verify");

    for num_payments in [1, 2, 4, 8, 16].iter() {
        let history = generate_history(*num_payments, 1_000_000);
        let limit_per_period = 1_000_000u128;
        let total_spent: u128 = history.iter().map(|h| h.amount).sum();

        let proof = prove(&pk, &history, limit_per_period, total_spent, &mut rng).unwrap();

        group.bench_with_input(
            BenchmarkId::from_parameter(num_payments),
            num_payments,
            |b, _| {
                b.iter(|| {
                    verify_native(
                        black_box(&vk),
                        black_box(limit_per_period),
                        black_box(total_spent),
                        black_box(&proof),
                    )
                })
            },
        );
    }
    group.finish();
}

/// Benchmark proof size (memory footprint).
fn bench_proof_size(c: &mut Criterion) {
    let mut rng = StdRng::seed_from_u64(42);
    let (pk, _vk) = setup(&mut rng).unwrap();

    let mut group = c.benchmark_group("proof_size");

    for num_payments in [1, 2, 4, 8, 16].iter() {
        let history = generate_history(*num_payments, 1_000_000);
        let limit_per_period = 1_000_000u128;
        let total_spent: u128 = history.iter().map(|h| h.amount).sum();

        let proof = prove(&pk, &history, limit_per_period, total_spent, &mut rng).unwrap();
        let soroban_proof = solvency_proof::proof_to_soroban_bytes(&proof);

        group.bench_with_input(
            BenchmarkId::from_parameter(num_payments),
            num_payments,
            |b, _| {
                b.iter(|| {
                    black_box(&soroban_proof).a.len()
                        + black_box(&soroban_proof).b.len()
                        + black_box(&soroban_proof).c.len()
                })
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_setup,
    bench_prove,
    bench_verify,
    bench_proof_size
);
criterion_main!(benches);
