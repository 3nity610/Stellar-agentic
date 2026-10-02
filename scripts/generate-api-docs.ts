#!/usr/bin/env tsx
/**
 * Regenerates `docs/api/` (TypeDoc, as markdown, per `typedoc.json`) from
 * `packages/core` and `packages/react`'s TSDoc comments.
 *
 * Each package is converted in its own `npx typedoc` invocation, scoped to
 * that package's own `tsconfig.json` — deliberately not TypeDoc's
 * multi-project "packages" entry point strategy, which walks every nested
 * `package.json` under a package directory to discover workspace members.
 * `packages/react/example` is itself a pnpm workspace member whose
 * `node_modules/@stellaragent/react` is a symlink back to `packages/react`,
 * and that self-reference sends the directory walk into an `ELOOP`. Scoping
 * each run to one package's own `src/index.ts` and `tsconfig.json` (whose
 * `include` never reaches `example/`) never triggers that walk at all.
 *
 * With `--check`, regenerates into a scratch directory and diffs it against
 * the committed `docs/api` instead of overwriting it — this is what CI runs
 * to catch a docs comment that changed without `pnpm docs:api` being re-run.
 *
 * ```bash
 * pnpm docs:api          # regenerate docs/api/ in place
 * pnpm docs:api:check    # verify docs/api/ matches the source (CI)
 * ```
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const committedDocsDir = join(repoRoot, 'docs/api');
const check = process.argv.includes('--check');

interface PackageTarget {
  /** The npm package name, for the index page. */
  name: string;
  /** The output subdirectory name — plain, not the scoped package name: a
   *  `--out` path containing a literal `/` (as `@stellaragent/core` does)
   *  confuses typedoc-plugin-markdown's namespace-folder naming for
   *  re-exported namespaces (e.g. `export * as math`), which ends up
   *  duplicating the scope segment into a stray nested `@stellaragent/`
   *  folder. A flat directory name sidesteps that entirely. */
  dirName: string;
  dir: string;
}

const targets: PackageTarget[] = [
  { name: '@stellaragent/core', dirName: 'core', dir: join(repoRoot, 'packages/core') },
  { name: '@stellaragent/react', dirName: 'react', dir: join(repoRoot, 'packages/react') },
];

function runTypedoc(outDir: string): void {
  // @stellaragent/react imports @stellaragent/core and resolves its types
  // through node_modules/@stellaragent/core -> ../../core/dist/index.d.ts
  // (its package.json "types" field) — core has to be built first, or
  // react's own typedoc pass can't resolve those imports.
  execFileSync('npx', ['tsup', 'src/index.ts', '--format', 'cjs,esm', '--dts', '--silent'], {
    cwd: join(repoRoot, 'packages/core'),
    stdio: 'inherit',
  });

  const readmeLines = ['# Documentation', '', '## Packages', ''];
  for (const target of targets) {
    execFileSync(
      'npx',
      [
        'typedoc',
        '--tsconfig', join(target.dir, 'tsconfig.json'),
        '--entryPoints', join(target.dir, 'src/index.ts'),
        '--out', join(outDir, target.dirName),
      ],
      { cwd: repoRoot, stdio: 'inherit' },
    );
    readmeLines.push(`- [${target.name}](${target.dirName}/README.md)`);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'README.md'), readmeLines.join('\n') + '\n');
}

if (!check) {
  rmSync(committedDocsDir, { recursive: true, force: true });
  runTypedoc(committedDocsDir);
  console.log(`Regenerated ${committedDocsDir}`);
  process.exit(0);
}

const scratchDir = mkdtempSync(join(tmpdir(), 'stellaragent-api-docs-'));
try {
  runTypedoc(scratchDir);

  if (!existsSync(committedDocsDir)) {
    console.error(`✗ docs/api does not exist. Run \`pnpm docs:api\` and commit the result.`);
    process.exit(1);
  }

  try {
    execFileSync('diff', ['-rq', committedDocsDir, scratchDir], { stdio: 'pipe' });
  } catch (error) {
    const output = error && typeof error === 'object' && 'stdout' in error
      ? String((error as { stdout: Buffer }).stdout)
      : String(error);
    console.error('✗ docs/api is stale relative to the TSDoc comments it was generated from:\n');
    console.error(output);
    console.error('\nRun `pnpm docs:api` and commit the result.');
    process.exit(1);
  }

  console.log('✓ docs/api is up to date.');
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}
