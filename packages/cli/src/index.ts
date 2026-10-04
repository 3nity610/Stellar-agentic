#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {
  RATE_LIMIT_LEDGERS_PER_DAY,
  RATE_LIMIT_LEDGERS_PER_HOUR,
  StellarAgent,
  estimateSecondsRemaining,
  fromStroops,
  isWindowExpired,
  ledgersRemainingInWindow,
  rankRoutes,
  toStroops,
  type LedgerCloseEstimate,
  type Network,
  type PaymentQuote,
  type RateLimitConfig,
  type RateLimitStatus,
  type RouteHop,
  type RouteQuote,
  type TxResult,
} from '@stellaragent/core';
import { getConfigPath, readConfigFile, writeConfigFile } from './config.js';
import { handlePayCommand } from './pay.js';
import { handleChannelCommand } from './channel.js';
import { handleLimitsCommand } from './limits.js';

const HELP = `StellarAgent CLI

Usage:
  stellaragent <command> [options]

Commands:
  deploy               Build, deploy and cross-wire the contract set
  route preview       Validate and display a routed-payment quote before confirmation
  config path         Print the configuration file path
  config get <key>    Get configuration value
  config set <k> <v>  Set configuration value
  pay                 Send payment with pre-flight outcome prediction
  channel             Manage payment channels (open, top-up, status, close)
  limits set          Configure rate limits (per hour / per day)
  limits show         Show remaining rate-limit headroom and window resets

Options:
  --network <net>     Network to operate against
  --json, -j          Emit machine-readable JSON on stdout
  --help, -h          Show this help
  --version, -v       Show version
`;

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface LimitsClient {
  readonly address: string;
  setRateLimits(config: RateLimitConfig): Promise<TxResult>;
  getRateLimitStatus(agentAddress?: string): Promise<RateLimitStatus>;
  getLedgerCloseEstimate(): Promise<LedgerCloseEstimate>;
}

export interface CliDependencies {
  createLimitsClient(args: readonly string[]): Promise<LimitsClient>;
}

const terminalIO: CliIO = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

const defaultDependencies: CliDependencies = {
  createLimitsClient: createLimitsClientFromEnvironment,
};

class CliUsageError extends Error {}

/** Execute the CLI without terminating the host process. */
export async function runCli(
  args: readonly string[],
  io: CliIO = terminalIO,
  dependencies: CliDependencies = defaultDependencies,
): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    io.stdout(HELP);
    return 0;
  }

  if (args.includes('--version') || args.includes('-v')) {
    io.stdout('0.1.0');
    return 0;
  }

  const command = args[0];

  // Route preview command
  if (command === 'route' && args[1] === 'preview') {
    const quotePath = optionValue(args, '--quote');
    if (!quotePath) {
      io.stderr('Missing required option: --quote <quote.json>');
      return 2;
    }

    try {
      const quote = parsePaymentQuote(JSON.parse(await readFile(quotePath, 'utf8')));
      io.stdout(formatQuotePreview(quote));
      if (args.includes('--confirm')) {
        io.stdout(`Confirmed route ${quote.route.id}. Pass this unchanged quote to payForAPI().`);
      } else {
        io.stdout('Preview only. Re-run with --confirm after reviewing the route and cost.');
      }
      return 0;
    } catch (error) {
      io.stderr(`Route preview failed: ${errorMessage(error)}`);
      return 1;
  }

  if (command === 'limits') {
    const action = args[1];
    if (action !== 'set' && action !== 'show') {
      io.stderr('Unknown limits action. Available: set, show');
      return 2;
    }
    return handleLimitsCommand({ action, args }, io);
  }


  // Config commands
  if (command === 'config') {
    const sub = args[1];
    if (sub === 'path') {
      io.stdout(args.includes('--json') ? formatJson({ path: getConfigPath() }) : getConfigPath());
      return 0;
    }
    if (sub === 'get') {
      const key = args[2];
      if (!key) {
        io.stderr('Usage: stellaragent config get <key>');
        return 2;
      }
      const cfg = await readConfigFile();
      const val = (cfg as Record<string, unknown>)[key];
      io.stdout(args.includes('--json') ? formatJson({ [key]: val ?? null }) : (typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '')));
      return 0;
    }
    if (sub === 'set') {
      const key = args[2];
      const val = args[3];
      if (!key || val === undefined) {
        io.stderr('Usage: stellaragent config set <key> <value>');
        return 2;
      }
      const cfg = await readConfigFile();
      (cfg as Record<string, unknown>)[key] = val;
      await writeConfigFile(cfg);
      io.stdout(`Set ${key}=${val}`);
      return 0;
    }
    io.stderr('Unknown config command. Available: path, get, set');
    return 2;
  }

  // Pay command
  if (command === 'pay') {
    return handlePayCommand(
      {
        to: optionValue(args, '--to'),
        amount: optionValue(args, '--amount'),
        asset: optionValue(args, '--asset'),
        endpoint: optionValue(args, '--endpoint'),
        yes: args.includes('--yes') || args.includes('-y'),
        network: optionValue(args, '--network'),
      },
      io
    );
  }

  // Channel command
  if (command === 'channel') {
    const action = args[1] as 'open' | 'top-up' | 'status' | 'close';
    if (!action || !['open', 'top-up', 'status', 'close'].includes(action)) {
      io.stderr('Unknown channel action. Available: open, top-up, status, close');
      return 2;
    }
    return handleChannelCommand(
      {
        action,
        channelId: optionValue(args, '--channel-id') ?? optionValue(args, '--id'),
        amount: optionValue(args, '--amount'),
        recipient: optionValue(args, '--recipient') ?? optionValue(args, '--to'),
        json: args.includes('--json'),
        yes: args.includes('--yes') || args.includes('-y'),
        network: optionValue(args, '--network'),
      },
      io
    );
  }

  // Deploy command — wraps the repo deployment script
  if (command === 'deploy') {
    const rest = args.slice(1);
    if (rest.includes('--dry-run')) io.stdout('deploy: dry run, no contracts will be sent');
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/deploy.ts', ...rest], { stdio: 'inherit' });
    return 0;
  }

  io.stderr(`Unknown command: ${args.join(' ')}`);
  io.stderr(HELP);
  return 2;
}

/** Serialize any value for `--json` output. */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function runLimitsCommand(
  args: readonly string[],
  io: CliIO,
  dependencies: CliDependencies,
): Promise<number> {
  const action = args[1] as 'set' | 'show';

  try {
    const config = action === 'set' ? parseRateLimitConfig(args) : undefined;
    const client = await dependencies.createLimitsClient(args);

    if (action === 'set') {
      const result = await client.setRateLimits(config!);
      io.stdout(formatLimitsSetReceipt(client.address, config!, result));
      return result.success ? 0 : 1;
    }

    const target = optionalOption(args, '--agent') ?? client.address;
    const status = await client.getRateLimitStatus(target);
    if (!status.configured) {
      io.stdout(
        `No rate limits configured for ${target}. ` +
        'Payments are unrestricted by the rate limiter.',
      );
      return 0;
    }

    const ledgerEstimate = await client.getLedgerCloseEstimate();
    io.stdout(formatLimitsStatus(target, status, ledgerEstimate));
    return 0;
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(error.message);
      return 2;
    }
    io.stderr(`Limits ${action} failed: ${errorMessage(error)}`);
    return 1;
  }
}

/** Format the transaction receipt emitted after limits are configured. */
export function formatLimitsSetReceipt(
  address: string,
  config: RateLimitConfig,
  result: TxResult,
): string {
  return [
    `Rate limits configured for ${address}`,
    `Per transaction:       ${config.maxPerTx}`,
    `Hourly amount:         ${config.maxPerHour}`,
    `Daily amount:          ${config.maxPerDay}`,
    `Hourly transactions:   ${config.maxTxsPerHour}`,
    `Transaction:           ${result.hash}`,
    `Confirmed ledger:      ${result.ledger ?? 'pending confirmation metadata'}`,
  ].join('\n');
}

/** Format configured limits with effective headroom and ledger-time resets. */
export function formatLimitsStatus(
  address: string,
  status: RateLimitStatus,
  ledgerEstimate: LedgerCloseEstimate,
): string {
  if (!status.configured) {
    return (
      `No rate limits configured for ${address}. ` +
      'Payments are unrestricted by the rate limiter.'
    );
  }

  const hourExpired = isWindowExpired(
    status.hourWindowStartLedger,
    RATE_LIMIT_LEDGERS_PER_HOUR,
    ledgerEstimate.currentLedger,
  );
  const dayExpired = isWindowExpired(
    status.dayWindowStartLedger,
    RATE_LIMIT_LEDGERS_PER_DAY,
    ledgerEstimate.currentLedger,
  );
  const hourlySpend = hourExpired ? '0' : status.spentThisHour;
  const dailySpend = dayExpired ? '0' : status.spentToday;
  const hourlyTransactions = hourExpired ? 0 : status.txsThisHour;

  return [
    `Rate limits for ${address}`,
    `State:                 ${status.active ? 'active' : 'inactive (agent killed)'}`,
    `Current ledger:        ${ledgerEstimate.currentLedger}`,
    `Per transaction:       ${status.maxPerTx} available`,
    `Hourly amount:         ${remainingAmount(status.maxPerHour, hourlySpend)} remaining ` +
      `of ${status.maxPerHour} (${hourlySpend} spent)`,
    `Hourly transactions:   ${Math.max(0, status.maxTxsPerHour - hourlyTransactions)} remaining ` +
      `of ${status.maxTxsPerHour} (${hourlyTransactions} used)`,
    `Hourly reset:          ${formatWindowReset(
      status.hourWindowStartLedger,
      RATE_LIMIT_LEDGERS_PER_HOUR,
      ledgerEstimate,
    )}`,
    `Daily amount:          ${remainingAmount(status.maxPerDay, dailySpend)} remaining ` +
      `of ${status.maxPerDay} (${dailySpend} spent)`,
    `Daily reset:           ${formatWindowReset(
      status.dayWindowStartLedger,
      RATE_LIMIT_LEDGERS_PER_DAY,
      ledgerEstimate,
    )}`,
  ].join('\n');
}

/** Human-readable preview shared by the command and tests. */
export function formatQuotePreview(quote: PaymentQuote): string {
  const route = quote.route;
  const sourceFee = BigInt(route.sourceAmount) * BigInt(route.totalFeeBps) / 10_000n;
  const warnings = quote.failures.length === 0
    ? 'none'
    : quote.failures.map((failure) => `${failure.providerId}/${failure.code}`).join(', ');

  return [
    'Routed payment preview',
    '──────────────────────',
    `You pay:             ${displayAmount(route.sourceAmount)} ${route.sourceAsset}`,
    `Recipient receives:  ${displayAmount(route.expectedDestinationAmount)} ${route.destinationAsset}`,
    `Minimum received:    ${displayAmount(quote.minimumDestinationAmount)} ${route.destinationAsset}`,
    `Route:               ${formatRoute(route)}`,
    `Estimated fee:       ${route.totalFeeBps} bps (~${displayAmount(sourceFee.toString())} ${route.sourceAsset})`,
    `Expected slippage:   ${route.expectedSlippageBps} bps`,
    `Reliability:         ${route.reliabilityBps} / 10000`,
    `Selector score:      ${route.score}`,
    `Quoted at ledger:    ${quote.quotedAtLedger}`,
    `Valid through:       ${quote.validUntilLedger}`,
    `Unavailable venues:  ${warnings}`,
  ].join('\n');
}

export function formatRoute(route: RouteQuote): string {
  const segments: string[] = [route.sourceAsset];
  for (const hop of route.hops) {
    const venue = venueLabel(hop);
    segments.push(`${venue} → ${hop.destinationAsset}`);
  }
  return segments.join(' → ');
}

function venueLabel(hop: RouteHop): string {
  if (hop.venue === 'path_payment') {
    const path = hop.path?.length ? ` via ${hop.path.join('/')}` : '';
    return `PATH[${hop.venueId}${path}]`;
  }
  return `${hop.venue.toUpperCase()}[${hop.venueId}]`;
}

function parsePaymentQuote(value: unknown): PaymentQuote {
  if (!isRecord(value) || !isRecord(value.route)) {
    throw new TypeError('quote JSON must contain a route object');
  }

  const minimum = requiredInteger(value.minimumDestinationAmount, 'minimumDestinationAmount');
  const quotedAtLedger = requiredLedger(value.quotedAtLedger, 'quotedAtLedger');
  const validUntilLedger = requiredLedger(value.validUntilLedger, 'validUntilLedger');
  if (validUntilLedger < quotedAtLedger) {
    throw new RangeError('validUntilLedger precedes quotedAtLedger');
  }

  const route = rankRoutes([value.route as unknown as RouteQuote])[0];
  if (!route) throw new RangeError('route is outside routing policy bounds');
  if (BigInt(minimum) > BigInt(route.expectedDestinationAmount)) {
    throw new RangeError('minimumDestinationAmount exceeds expected output');
  }

  return {
    route,
    minimumDestinationAmount: minimum,
    quotedAtLedger,
    validUntilLedger,
    failures: parseFailures(value.failures),
  };
}

function parseFailures(value: unknown): PaymentQuote['failures'] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('failures must be an array');
  return value.map((failure) => {
    if (!isRecord(failure) || typeof failure.providerId !== 'string' ||
      typeof failure.code !== 'string' || typeof failure.message !== 'string') {
      throw new TypeError('each failure must contain providerId, code, and message');
    }
    return failure as unknown as PaymentQuote['failures'][number];
  });
}

function parseRateLimitConfig(args: readonly string[]): RateLimitConfig {
  return {
    maxPerTx: positiveAmountOption(args, '--max-per-tx'),
    maxPerHour: positiveAmountOption(args, '--max-per-hour'),
    maxPerDay: positiveAmountOption(args, '--max-per-day'),
    maxTxsPerHour: positiveU32Option(args, '--max-txs-per-hour'),
  };
}

function positiveAmountOption(args: readonly string[], option: string): string {
  const value = requiredOption(args, option);
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,7})?$/.test(value) || toStroops(value) <= 0n) {
    throw new CliUsageError(
      `${option} must be a positive decimal amount with at most 7 fractional digits`,
    );
  }
  return value;
}

function positiveU32Option(args: readonly string[], option: string): number {
  const value = requiredOption(args, option);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new CliUsageError(`${option} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 0xffff_ffff) {
    throw new CliUsageError(`${option} must fit in an unsigned 32-bit integer`);
  }
  return parsed;
}

async function createLimitsClientFromEnvironment(args: readonly string[]): Promise<LimitsClient> {
  const network = parseNetwork(
    optionalOption(args, '--network') ?? process.env.STELLARAGENT_NETWORK ?? 'testnet',
  );
  const secretKey = process.env.STELLARAGENT_SECRET_KEY;
  if (!secretKey) {
    throw new CliUsageError(
      'STELLARAGENT_SECRET_KEY is required for limits commands; ' +
      'the key is intentionally not accepted as a command-line option',
    );
  }
  return StellarAgent.create({ network, secretKey });
}

function parseNetwork(value: string): Network {
  if (value === 'mainnet' || value === 'testnet' || value === 'local') {
    return value;
  }
  throw new CliUsageError('--network must be one of: mainnet, testnet, local');
}

function requiredOption(args: readonly string[], option: string): string {
  const value = optionalOption(args, option);
  if (value === undefined) {
    throw new CliUsageError(`Missing required option: ${option} <value>`);
  }
  return value;
}

function optionalOption(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new CliUsageError(`Missing value for option: ${option}`);
  }
  return value;
}

function optionValue(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

function remainingAmount(limit: string, spent: string): string {
  const remaining = toStroops(limit) - toStroops(spent);
  return fromStroops(remaining > 0n ? remaining : 0n);
}

function formatWindowReset(
  windowStartLedger: number,
  ledgersPerWindow: number,
  estimate: LedgerCloseEstimate,
): string {
  const resetLedger = windowStartLedger + ledgersPerWindow;
  const ledgersRemaining = ledgersRemainingInWindow(
    windowStartLedger,
    ledgersPerWindow,
    estimate.currentLedger,
  );

  if (ledgersRemaining === 0) {
    return `window expired at ledger ${resetLedger}; resets on the next rate-limit check`;
  }

  const secondsRemaining = estimateSecondsRemaining(
    ledgersRemaining,
    estimate.avgLedgerCloseSeconds,
  );
  return (
    `ledger ${resetLedger} in ~${formatDuration(secondsRemaining)} ` +
    `(${estimate.observed ? 'observed' : 'fallback'} ` +
    `${estimate.avgLedgerCloseSeconds.toFixed(2)}s/ledger)`
  );
}

function formatDuration(seconds: number): string {
  let remaining = Math.max(0, Math.ceil(seconds));
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  remaining %= 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (remaining || parts.length === 0) parts.push(`${remaining}s`);
  return parts.slice(0, 2).join(' ');
}

function requiredInteger(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${name} must be a canonical integer string`);
  }
  return value;
}

function requiredLedger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value as number;
}

function displayAmount(amount: string): string {
  return fromStroops(BigInt(amount));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.env.NODE_ENV !== 'test') {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
