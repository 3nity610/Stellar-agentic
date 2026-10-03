import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
const committedFixture = readFileSync(join(repoRoot, 'fixtures/determinism.json'), 'utf8');

function sandbox(roots) {
  // Copy the real entry point so its import.meta.url selects a temporary
  // fixture directory. Source imports and dependencies still use the checkout.
  // Directory junctions work on Windows without file-symlink privileges.
  const root = mkdtempSync(join(tmpdir(), 'stellaragent fixtures-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'fixtures'));
  copyFileSync(join(repoRoot, 'scripts/generate-fixtures.ts'), join(root, 'scripts/generate-fixtures.ts'));
  symlinkSync(join(repoRoot, 'packages'), join(root, 'packages'), 'junction');
  // bignumber.js belongs to core, not the root manifest. Resolve it through
  // that package's dependencies even when pnpm does not hoist it to the root.
  symlinkSync(join(repoRoot, 'packages/core/node_modules'), join(root, 'node_modules'), 'junction');
  return { root, fixture: join(root, 'fixtures/determinism.json') };
}

function testWithSandboxes(name, run) {
  test(name, () => {
    const roots = [];
    try {
      run(() => sandbox(roots));
    } finally {
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    }
  });
}

function runGenerator(root, args = [], cwd = root) {
  const result = spawnSync(process.execPath, [tsxCli, join(root, 'scripts/generate-fixtures.ts'), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `generator terminated by ${result.signal}`);
  return result;
}

function seedFixture(fixture, content) {
  writeFileSync(fixture, content);
  // Byte equality alone would miss a --check regression that rewrites the
  // same content. Use an old timestamp so such a write is observable.
  const oldTime = new Date('2000-01-01T00:00:00.000Z');
  utimesSync(fixture, oldTime, oldTime);
  return statSync(fixture).mtimeMs;
}

testWithSandboxes('generation preserves fixture bytes and ordering across independent runs and working directories', (createSandbox) => {
  const first = createSandbox();
  const second = createSandbox();
  const unrelatedCwd = join(second.root, 'different working directory');
  mkdirSync(unrelatedCwd);

  const firstRun = runGenerator(first.root);
  const secondRun = runGenerator(second.root, [], unrelatedCwd);
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.equal(secondRun.status, 0, secondRun.stderr);

  const firstBytes = readFileSync(first.fixture, 'utf8');
  assert.equal(firstBytes, readFileSync(second.fixture, 'utf8'));
  // The shared corpus pins both case values and ordering, including ties and
  // non-ASCII route IDs; do not reproduce the generator's ordering algorithm.
  assert.equal(firstBytes, committedFixture);
  assert.equal(existsSync(join(unrelatedCwd, 'fixtures/determinism.json')), false);
});

testWithSandboxes('--check accepts current fixtures without rewriting them', (createSandbox) => {
  const { root, fixture } = createSandbox();
  const mtime = seedFixture(fixture, committedFixture);

  const result = runGenerator(root, ['--check']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fixtures\/determinism\.json is up to date\./);
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(fixture, 'utf8'), committedFixture);
  assert.equal(statSync(fixture).mtimeMs, mtime);
});

testWithSandboxes('--check rejects stale bytes without overwriting the fixture', (createSandbox) => {
  const { root, fixture } = createSandbox();
  assert.ok(committedFixture.endsWith('\n'));
  const stale = committedFixture.slice(0, -1);
  const mtime = seedFixture(fixture, stale);

  const result = runGenerator(root, ['--check']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /fixtures\/determinism\.json is out of date/);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(fixture, 'utf8'), stale);
  assert.equal(statSync(fixture).mtimeMs, mtime);
});

testWithSandboxes('--check rejects a missing fixture without creating it', (createSandbox) => {
  const { root, fixture } = createSandbox();

  const result = runGenerator(root, ['--check']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /does not exist\. Run: pnpm fixtures:generate/);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(fixture), false);
});
