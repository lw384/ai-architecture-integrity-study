import { describe, expect, it } from 'vitest';

import MainRoutes from './MainRoutes';
import { routeDefinitions, routeGroups } from './route-registry';

describe('route registry invariants', () => {
  it('uses unique route ids', () => {
    const ids = routeDefinitions.map((route) => route.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique route paths', () => {
    const paths = routeDefinitions.map((route) => route.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('defines exactly one visible default route', () => {
    const defaultRoutes = routeDefinitions.filter((route) => route.default);

    expect(defaultRoutes).toHaveLength(1);
    expect(defaultRoutes[0]).toMatchObject({ menu: true, public: false });
  });

  it('provides a loader for every route', () => {
    for (const route of routeDefinitions) {
      expect(route.loader).toEqual(expect.any(Function));
    }
  });

  it('connects menu routes to registered groups with visible metadata', () => {
    const groupIds = new Set(routeGroups.map((group) => group.id));

    for (const route of routeDefinitions.filter((definition) => definition.menu)) {
      expect(groupIds.has(route.group)).toBe(true);
      expect(route.title).toEqual(expect.any(String));
      expect(route.title.length).toBeGreaterThan(0);
      expect(route.icon).toBeTruthy();
    }
  });

  it('points access aliases at registered route ids', () => {
    const routeIds = new Set(routeDefinitions.map((route) => route.id));

    for (const route of routeDefinitions) {
      if (route.accessId) {
        expect(routeIds.has(route.accessId)).toBe(true);
      }
    }
  });

  it('generates one protected child for every registered route', () => {
    const generatedPaths = MainRoutes.children
      .filter((route) => !route.index)
      .map((route) => route.path);

    expect(generatedPaths).toEqual(routeDefinitions.map((route) => route.path));
  });

  it('redirects the index route to the registered default route', () => {
    const defaultRoute = routeDefinitions.find((route) => route.default);
    const indexRoute = MainRoutes.children.find((route) => route.index);

    expect(indexRoute.element.props).toMatchObject({
      replace: true,
      to: `/${defaultRoute.path}`,
    });
  });
});
