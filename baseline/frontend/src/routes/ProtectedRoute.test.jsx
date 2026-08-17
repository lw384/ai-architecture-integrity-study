import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { RouteAccessContext } from 'contexts/RouteAccessContext';

import ProtectedRoute from './ProtectedRoute';

function renderProtectedRoute({ allowedRouteIds, initialPath = '/contacts' }) {
  const isRouteAllowed = (routeId) => allowedRouteIds.includes(routeId);

  return render(
    <RouteAccessContext.Provider
      value={{
        allowedRouteIds,
        filteredMenuGroups: [],
        isRouteAllowed,
      }}
    >
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/contacts"
            element={(
              <ProtectedRoute routeId="contacts">
                <h1>Contacts</h1>
              </ProtectedRoute>
            )}
          />
          <Route path="/companies" element={<h1>Companies</h1>} />
        </Routes>
      </MemoryRouter>
    </RouteAccessContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('renders the requested page when access is allowed', () => {
    renderProtectedRoute({ allowedRouteIds: ['contacts'] });

    expect(screen.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  });

  it('redirects to the first accessible page when access is denied', async () => {
    renderProtectedRoute({ allowedRouteIds: ['companies'] });

    expect(await screen.findByRole('heading', { name: 'Companies' })).toBeVisible();
  });

  it('renders an access denied state when no routes are allowed', () => {
    renderProtectedRoute({ allowedRouteIds: [] });

    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Contacts' })).not.toBeInTheDocument();
  });
});
