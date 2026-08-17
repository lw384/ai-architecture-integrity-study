// Functional acceptance suite (frontend half) for T1 ("Add Deal tracking to
// the CRM"). Not part of baseline/, never visible to the agent. Overlaid by
// experiment/instruments/agent-runners/test_runner.py into a throwaway copy
// of the produced workspace at exactly
// <workspace>/frontend/src/test/acceptance/T1/deal.render.test.jsx (so the
// `routes/route-registry` import below resolves through the same Vite/Vitest
// alias config the rest of frontend/src already uses), then run with
// the configured npm/Vitest command and discarded.
//
// Known limitation, by design: this renders the Deals page component
// directly with only QueryClientProvider + MemoryRouter around it — it does
// NOT boot the full App shell (ThemeCustomization / SnackbarProvider /
// RouteAccessProvider / Layout, see src/App.jsx). If the agent's page
// component reaches into one of those at render time, this test can fail for
// reasons unrelated to Deal correctness. Combined with the route-registry
// check below (which does prove the route is centrally registered and
// nav-visible), this is a best-effort functional smoke check, not a full
// browser E2E test — the project has no Playwright/Cypress today. Treat a
// failure here as "investigate", not as an automatic verdict.
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routeDefinitions } from 'routes/route-registry';

const MOCK_DEALS_RESPONSE = {
  items: [
    {
      id: 'a3f8c1e2-1234-5678-9ab0-def012345678',
      name: 'Acceptance Test Deal With Contact',
      value: 50000,
      stage: 'qualified',
      companyId: 'b4e9d2f3-1234-5678-9ab0-def012345678',
      contactId: 'c5f0e3a4-1234-5678-9ab0-def012345678',
      expectedCloseDate: '2026-09-30',
      createdAt: '2026-07-03T10:30:00.000Z',
      updatedAt: '2026-07-19T14:22:11.000Z',
    },
    {
      id: 'd4a9c1e2-1234-5678-9ab0-def012345678',
      name: 'Acceptance Test Deal Without Contact Or Close Date',
      value: 12000,
      stage: 'lead',
      companyId: 'b4e9d2f3-1234-5678-9ab0-def012345678',
      contactId: null,
      expectedCloseDate: null,
      createdAt: '2026-07-03T10:30:00.000Z',
      updatedAt: '2026-07-19T14:22:11.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

function findDealsRouteEntry() {
  return routeDefinitions.find(
    (definition) => definition.path === 'deals' || /deals?$/i.test(String(definition.title ?? '')),
  );
}

function stubDealsFetch(responseBody) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input?.url ?? '';

      if (!/\/api\/deals/.test(url)) {
        throw new Error(`Unexpected fetch call in Deal acceptance test: ${url}`);
      }

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(responseBody),
      };
    }),
  );
}

function renderPage(Component) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Deal frontend acceptance (T1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Checkpoint 7 — Req 22: Deals is reachable from the primary navigation,
  // and its list view renders real (mocked) Deal data.
  it('registers a nav-visible Deals route and renders the list with mock data', async () => {
    const entry = findDealsRouteEntry();

    expect(entry, 'expected a "deals" entry in routes/route-registry.js').toBeTruthy();
    expect(entry.menu, 'expected the Deals route to be reachable from primary navigation (menu: true)').toBe(true);

    stubDealsFetch(MOCK_DEALS_RESPONSE);

    const pageModule = await entry.loader();
    const DealsPage = pageModule.default;

    renderPage(DealsPage);

    await waitFor(() => {
      expect(screen.getByText('Acceptance Test Deal With Contact')).toBeInTheDocument();
    });
  });

  // Checkpoint 8 — Req 19,20 (frontend half): a Deal with contactId=null and
  // expectedCloseDate=null renders on the list view without crashing.
  it('renders a Deal with a null contact and null expectedCloseDate without crashing', async () => {
    const entry = findDealsRouteEntry();
    expect(entry).toBeTruthy();

    stubDealsFetch(MOCK_DEALS_RESPONSE);

    const pageModule = await entry.loader();
    const DealsPage = pageModule.default;

    renderPage(DealsPage);

    await waitFor(() => {
      expect(
        screen.getByText('Acceptance Test Deal Without Contact Or Close Date'),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined$/i)).not.toBeInTheDocument();
  });
});
