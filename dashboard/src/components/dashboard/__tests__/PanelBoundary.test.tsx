import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PanelBoundary } from '../PanelBoundary.js';
import type { Panel, PanelFailure } from '../../lib/chain/types.js';

function panel<T>(overrides: Partial<Panel<T>> & { data?: T | null }): Panel<T> {
  return {
    data: null,
    status: 'loading',
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

const rows = ['a', 'b'];
const children = (data: string[]) => <ul>{data.map((row) => <li key={row}>{row}</li>)}</ul>;

describe('PanelBoundary', () => {
  it('renders the rows once there is data', () => {
    const html = renderToStaticMarkup(
      <PanelBoundary panel={panel<string[]>({ status: 'ready', data: rows })} label="Agents" emptyMessage="none">
        {children}
      </PanelBoundary>,
    );
    expect(html).toContain('>a<');
    expect(html).toContain('>b<');
    expect(html).toContain('data-testid="panel-content"');
  });

  it('announces loading rather than rendering an empty card', () => {
    // The failure this prevents: a panel that shows the same blank card while
    // loading, after a failure, and when there is genuinely nothing.
    const html = renderToStaticMarkup(
      <PanelBoundary panel={panel<string[]>({ status: 'loading' })} label="Agents" emptyMessage="none">
        {children}
      </PanelBoundary>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="panel-loading"');
    expect(html).toContain('Loading Agents');
    expect(html).not.toContain('panel-empty');
  });

  it('treats idle as "not configured", not as work in progress', () => {
    // A spinner here would spin forever and imply a request is outstanding.
    const html = renderToStaticMarkup(
      <PanelBoundary panel={panel<string[]>({ status: 'idle' })} label="Agents" emptyMessage="none">
        {children}
      </PanelBoundary>,
    );
    expect(html).toContain('data-testid="panel-idle"');
    expect(html).toContain('Agents is not configured');
    expect(html).not.toContain('aria-busy');
  });

  it('gives an empty result its own state, distinct from an error', () => {
    const html = renderToStaticMarkup(
      <PanelBoundary panel={panel<string[]>({ status: 'ready', data: [] })} label="Agents" emptyMessage="No agents yet">
        {children}
      </PanelBoundary>,
    );
    expect(html).toContain('data-testid="panel-empty"');
    expect(html).toContain('No agents yet');
    expect(html).not.toContain('role="alert"');
  });

  it('surfaces a failure with its message, as an alert', () => {
    const html = renderToStaticMarkup(
      <PanelBoundary
        panel={panel<string[]>({ status: 'error', error: new Error('RPC connection refused') })}
        label="Agents"
        emptyMessage="none"
      >
        {children}
      </PanelBoundary>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Agents could not be loaded');
    expect(html).toContain('RPC connection refused');
    expect(html).toContain('Retry');
  });

  it('honours a custom emptiness test for a non-array payload', () => {
    const html = renderToStaticMarkup(
      <PanelBoundary
        panel={panel<{ total: number }>({ status: 'ready', data: { total: 0 } })}
        label="Spend"
        emptyMessage="Nothing spent yet"
        isEmpty={(data) => data.total === 0}
      >
        {(data) => <span>{data.total}</span>}
      </PanelBoundary>,
    );
    expect(html).toContain('Nothing spent yet');
  });

  it('reports per-item failures alongside the rows that did load', () => {
    // One unreachable address must not blank a table of fifty — but it must
    // not disappear either.
    const failures: PanelFailure[] = [{ id: 'GABC…WXYZ', error: new Error('not found') }];
    const html = renderToStaticMarkup(
      <PanelBoundary
        panel={panel<string[]>({ status: 'ready', data: rows })}
        label="Agents"
        emptyMessage="none"
        failures={failures}
      >
        {children}
      </PanelBoundary>,
    );
    expect(html).toContain('>a<');
    expect(html).toContain('1 of 3 agents could not be read');
    expect(html).toContain('GABC…WXYZ');
  });
});
