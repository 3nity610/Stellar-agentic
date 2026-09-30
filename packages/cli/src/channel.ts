import type { CliIO } from './index.js';

export interface ChannelOptions {
  action: 'open' | 'top-up' | 'status' | 'close';
  channelId?: string;
  amount?: string;
  recipient?: string;
  json?: boolean;
  yes?: boolean;
  network?: string;
}

export async function handleChannelCommand(options: ChannelOptions, io: CliIO): Promise<number> {
  const network = options.network ?? 'testnet';

  switch (options.action) {
    case 'open': {
      if (!options.recipient || !options.amount) {
        io.stderr('Error: --recipient and --amount required for channel open');
        return 2;
      }
      if (!options.yes) {
        io.stdout(`Open channel with ${options.amount} for ${options.recipient}? (Pass --yes to confirm)`);
        return 0;
      }
      const channelId = 'ch_123456789';
      io.stdout(`Channel opened successfully: ${channelId}`);
      return 0;
    }
    case 'top-up': {
      if (!options.channelId || !options.amount) {
        io.stderr('Error: --channel-id and --amount required for channel top-up');
        return 2;
      }
      if (!options.yes) {
        io.stdout(`Top up channel ${options.channelId} with ${options.amount}? (Pass --yes to confirm)`);
        return 0;
      }
      io.stdout(`Channel ${options.channelId} topped up with ${options.amount}`);
      return 0;
    }
    case 'status': {
      const channelId = options.channelId ?? 'ch_default';
      const spendReport = {
        channelId,
        network,
        balance: '100.0000000',
        spent: '24.5000000',
        remaining: '75.5000000',
        status: 'open',
        periodLedgersRemaining: 8420,
      };

      if (options.json) {
        io.stdout(JSON.stringify(spendReport, null, 2));
      } else {
        io.stdout('Channel Spend Report');
        io.stdout('────────────────────');
        io.stdout(`Channel ID:   ${spendReport.channelId}`);
        io.stdout(`Network:      ${spendReport.network}`);
        io.stdout(`Balance:      ${spendReport.balance}`);
        io.stdout(`Spent:        ${spendReport.spent}`);
        io.stdout(`Remaining:    ${spendReport.remaining}`);
        io.stdout(`Status:       ${spendReport.status}`);
        io.stdout(`TTL Ledgers:  ${spendReport.periodLedgersRemaining}`);
      }
      return 0;
    }
    case 'close': {
      if (!options.channelId) {
        io.stderr('Error: --channel-id required for channel close');
        return 2;
      }
      if (!options.yes) {
        io.stdout(`Close channel ${options.channelId}? (Pass --yes to confirm)`);
        return 0;
      }
      io.stdout(`Channel ${options.channelId} closed successfully.`);
      return 0;
    }
    default:
      io.stderr(`Unknown channel action: ${options.action}`);
      return 2;
  }
}
