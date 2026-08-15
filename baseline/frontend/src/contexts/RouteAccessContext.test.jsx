import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import useRouteAccess from 'hooks/useRouteAccess';

import { RouteAccessProvider } from './RouteAccessContext';

function RouteAccessProbe() {
  const { allowedRouteIds, filteredMenuGroups, isLoading, isRouteAllowed, source } = useRouteAccess();

  if (isLoading) {
    return <p>Loading permissions</p>;
  }

  const menuRouteIds = filteredMenuGroups.flatMap((group) => group.children ?? []).map((item) => item.id);

  return (
    <div>
      <output data-testid="source">{source}</output>
      <output data-testid="allowed-routes">{allowedRouteIds.join(',') || 'none'}</output>
      <output data-testid="menu-routes">{menuRouteIds.join(',') || 'none'}</output>
      <output data-testid="contacts-access">{String(isRouteAllowed('contacts'))}</output>
      <output data-testid="companies-access">{String(isRouteAllowed('companies'))}</output>
    </div>
  );
}

function renderProvider() {
  return render(
    <RouteAccessProvider>
      <RouteAccessProbe />
    </RouteAccessProvider>,
  );
}

describe('RouteAccessProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('uses the local default permissions when no endpoint is configured', async () => {
    vi.stubEnv('VITE_ROUTE_ACCESS_ENDPOINT', '');

    renderProvider();

    expect(await screen.findByTestId('source')).toHaveTextContent('mock');
    expect(screen.getByTestId('allowed-routes')).toHaveTextContent('contacts,companies');
    expect(screen.getByTestId('menu-routes')).toHaveTextContent('contacts,companies');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses API permissions and filters the visible menu', async () => {
    vi.stubEnv('VITE_ROUTE_ACCESS_ENDPOINT', '/route-access');
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ allowedRouteIds: ['companies'] }),
    });

    renderProvider();

    expect(await screen.findByTestId('source')).toHaveTextContent('api');
    expect(screen.getByTestId('allowed-routes')).toHaveTextContent('companies');
    expect(screen.getByTestId('menu-routes')).toHaveTextContent('companies');
    expect(screen.getByTestId('contacts-access')).toHaveTextContent('false');
    expect(screen.getByTestId('companies-access')).toHaveTextContent('true');
    expect(fetch).toHaveBeenCalledWith('/route-access', {
      headers: { Accept: 'application/json' },
    });
  });

  it('preserves an explicit empty permission response', async () => {
    vi.stubEnv('VITE_ROUTE_ACCESS_ENDPOINT', '/route-access');
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ allowedRouteIds: [] }),
    });

    renderProvider();

    expect(await screen.findByTestId('source')).toHaveTextContent('api');
    expect(screen.getByTestId('allowed-routes')).toHaveTextContent('none');
    expect(screen.getByTestId('menu-routes')).toHaveTextContent('none');
    expect(screen.getByTestId('contacts-access')).toHaveTextContent('false');
    expect(screen.getByTestId('companies-access')).toHaveTextContent('false');
  });

  it('falls back to local defaults when the permission endpoint fails', async () => {
    vi.stubEnv('VITE_ROUTE_ACCESS_ENDPOINT', '/route-access');
    fetch.mockResolvedValue({ ok: false, status: 503 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderProvider();

    expect(await screen.findByTestId('source')).toHaveTextContent('mock');
    expect(screen.getByTestId('allowed-routes')).toHaveTextContent('contacts,companies');
    expect(warn).toHaveBeenCalledWith(
      'Falling back to mock route access config.',
      expect.any(Error),
    );
  });
});
