/**
 * Failure diagnostic reporter and state dumper.
 */
import type { DeployedContracts } from './deployer.js';
import type { SeededScenario } from './scenarios.js';

export interface DiagnosticContext {
  suiteName: string;
  testName?: string;
  currentLedger?: number;
  scenario?: SeededScenario | null;
  contracts?: DeployedContracts | null;
  error?: unknown;
  additionalInfo?: Record<string, any>;
}

/**
 * Formats a clear, diagnostic report when an end-to-end integration test fails.
 */
export function formatFailureDiagnostic(ctx: DiagnosticContext): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('                   E2E DEVNET TEST FAILURE REPORT                      ');
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push(`Suite:       ${ctx.suiteName}`);
  if (ctx.testName) lines.push(`Test:        ${ctx.testName}`);
  if (ctx.currentLedger !== undefined) lines.push(`Ledger Seq:  #${ctx.currentLedger}`);
  if (ctx.scenario) {
    lines.push(`Scenario:    ${ctx.scenario.name} (seeded at ${ctx.scenario.seededAt})`);
  }
  lines.push('───────────────────────────────────────────────────────────────────────');

  if (ctx.contracts) {
    lines.push('Deployed Contracts:');
    for (const [k, v] of Object.entries(ctx.contracts)) {
      lines.push(`  • ${k.padEnd(22)}: ${v}`);
    }
    lines.push('───────────────────────────────────────────────────────────────────────');
  }

  if (ctx.error) {
    lines.push('Error details:');
    if (ctx.error instanceof Error) {
      lines.push(`  Message: ${ctx.error.message}`);
      if (ctx.error.stack) {
        lines.push('  Stack Trace:');
        lines.push(
          ctx.error.stack
            .split('\n')
            .map((l) => `    ${l}`)
            .join('\n')
        );
      }
    } else {
      lines.push(`  Raw error: ${String(ctx.error)}`);
    }
    lines.push('───────────────────────────────────────────────────────────────────────');
  }

  if (ctx.additionalInfo && Object.keys(ctx.additionalInfo).length > 0) {
    lines.push('Additional Context:');
    lines.push(JSON.stringify(ctx.additionalInfo, null, 2));
    lines.push('───────────────────────────────────────────────────────────────────────');
  }

  lines.push('═══════════════════════════════════════════════════════════════════════\n');
  return lines.join('\n');
}

/**
 * Dumps state to console or returns formatted string.
 */
export function logDiagnostic(ctx: DiagnosticContext): void {
  console.error(formatFailureDiagnostic(ctx));
}
