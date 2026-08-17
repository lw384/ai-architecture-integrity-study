import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useRouteAccess from 'hooks/useRouteAccess';

import { RouteAccessProvider } from './RouteAccessContext';

function RouteAccessProbe() {
  const { allowedRouteIds, filteredMenuGroups, isRouteAllowed } = useRouteAccess();

  const menuRouteIds = filteredMenuGroups.flatMap((group) => group.children ?? []).map((item) => item.id);

  return (
    <div>
      <output data-testid="allowed-routes">{allowedRouteIds.join(',') || 'none'}</output>
      <output data-testid="menu-routes">{menuRouteIds.join(',') || 'none'}</output>
      <output data-testid="contacts-access">{String(isRouteAllowed('contacts'))}</output>
      <output data-testid="companies-access">{String(isRouteAllowed('companies'))}</output>
      <output data-testid="unknown-access">{String(isRouteAllowed('unknown'))}</output>
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
  it('uses local permissions to filter menus and protect registered routes', () => {
    renderProvider();

    expect(screen.getByTestId('allowed-routes')).toHaveTextContent('contacts,companies');
    expect(screen.getByTestId('menu-routes')).toHaveTextContent('contacts,companies');
    expect(screen.getByTestId('contacts-access')).toHaveTextContent('true');
    expect(screen.getByTestId('companies-access')).toHaveTextContent('true');
    expect(screen.getByTestId('unknown-access')).toHaveTextContent('false');
  });
});
