#!/usr/bin/env tsx
/**
 * Public API surface report for `@stellaragent/core` and `@stellaragent/react`.
 *
 * TypeScript's declaration emitter includes every class member, `private`
 * ones too (just their signature, no body) — a consumer can never reach a
 * `private` member, so it isn't really part of the package's contract, but
 * it does mean a raw `.d.ts` diff flags internal reshuffling as if it were a
 * public-surface change. This script builds each package's declaration
 * file, strips anything a consumer cannot actually import or call, and
 * writes (or, with `--check`, verifies) the result as a small committed
 * report — a stand-in for a tool like `@microsoft/api-extractor`, sized for
 * what this repo needs today: a single number/diff a reviewer can look at
 * to answer "did the public surface change?" without reading the whole
 * class.
 *
 * ```bash
 * pnpm docs:api:check    # verify the committed reports are current (CI)
 * pnpm docs:api          # regenerate them after an intentional API change
 * ```
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const check = process.argv.includes('--check');

interface PackageTarget {
  name: string;
  dir: string;
  reportPath: string;
}

const targets: PackageTarget[] = [
  {
    name: '@stellaragent/core',
    dir: join(repoRoot, 'packages/core'),
    reportPath: join(repoRoot, 'packages/core/api-report.d.ts'),
  },
  {
    name: '@stellaragent/react',
    dir: join(repoRoot, 'packages/react'),
    reportPath: join(repoRoot, 'packages/react/api-report.d.ts'),
  },
];

/**
 * Strips `private` class members — and any doc comment that exists only to
 * document one — from a `.d.ts` file's text. Everything a consumer can
 * actually see (public/protected members, exported functions, types) is
 * left untouched, including its own doc comments.
 */
function stripPrivateMembers(dts: string): string {
  const lines = dts.split('\n');
  const output: string[] = [];
  let pendingComment: string[] = [];

  const isCommentLine = (line: string) => /^\s*(\/\*\*|\*\/?|\/\/)/.test(line);
  const isPrivateMember = (line: string) => /^\s*private\b/.test(line);

  for (const line of lines) {
    if (isCommentLine(line)) {
      pendingComment.push(line);
      continue;
    }
    if (isPrivateMember(line)) {
      // Discard the member and whatever comment was documenting it.
      pendingComment = [];
      continue;
    }
    output.push(...pendingComment, line);
    pendingComment = [];
  }
  // A trailing comment (e.g. right before a class's closing brace) wasn't
  // documenting a stripped member, so it belongs in the output.
  output.push(...pendingComment);

  // Collapse the blank-line runs left behind by removed members.
  return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

function buildDeclaration(target: PackageTarget): string {
  // Runs the package's own `build` script (cjs+esm+dts) rather than a
  // narrower one-off tsup invocation: @stellaragent/react imports
  // @stellaragent/core's *built* dist (its package.json "types" points at
  // dist/index.d.ts), so core has to be built first and fully, in the same
  // shape its dependents expect, or react's own dts build fails to resolve
  // it.
  execFileSync('npx', ['tsup', 'src/index.ts', '--format', 'cjs,esm', '--dts', '--silent'], {
    cwd: target.dir,
    stdio: 'inherit',
  });
  const dtsPath = join(target.dir, 'dist/index.d.ts');
  return readFileSync(dtsPath, 'utf8');
}

let drifted = false;

for (const target of targets) {
  if (!existsSync(join(target.dir, 'src/index.ts'))) continue;

  const rawDts = buildDeclaration(target);
  const publicSurface = [
    `// GENERATED FILE — do not edit by hand.`,
    `// Public API surface of ${target.name}, derived from its built .d.ts with`,
    `// \`private\` members stripped. Regenerate with \`pnpm docs:api\`.`,
    `// A diff here in review is a public-surface change — call it out.`,
    '',
    stripPrivateMembers(rawDts).trim(),
    '',
  ].join('\n');

  if (check) {
    if (!existsSync(target.reportPath)) {
      console.error(`✗ ${target.name}: no committed report at ${target.reportPath}. Run \`pnpm docs:api\`.`);
      drifted = true;
      continue;
    }
    const committed = readFileSync(target.reportPath, 'utf8');
    if (committed !== publicSurface) {
      console.error(`✗ ${target.name}: public API report is stale. Run \`pnpm docs:api\` and commit the result.`);
      drifted = true;
      continue;
    }
    console.log(`✓ ${target.name}: public API report is up to date.`);
  } else {
    mkdirSync(dirname(target.reportPath), { recursive: true });
    writeFileSync(target.reportPath, publicSurface);
    console.log(`Wrote ${target.reportPath}`);
  }
}

if (check && drifted) {
  process.exit(1);
}
