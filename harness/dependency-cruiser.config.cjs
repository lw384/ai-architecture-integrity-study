/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-controller-to-repository',
      severity: 'error',
      comment: 'Controllers must not bypass the service layer and access repositories directly',
      from: { path: '(^|[/\\\\]).*\\.controller\\.(ts|js|tsx|jsx)$' },
      to:   { path: '(^|[/\\\\]).*\\.repository\\.(ts|js|tsx|jsx)$' }
    },
    {
      name: 'no-controller-to-db',
      severity: 'error',
      comment: 'Controllers must not bypass service+repository to touch db or entity layers',
      from: { path: '(^|[/\\\\]).*\\.controller\\.(ts|js|tsx|jsx)$' },
      to:   {
        path: '(^|[/\\\\]).*\\.entity\\.(ts|js|tsx|jsx)$|(^|[/\\\\])(db|database)[/\\\\]'
      }
    },
    {
      name: 'no-reverse-service-to-controller',
      severity: 'error',
      comment: 'Services must not depend on controllers (no upward dependency)',
      from: { path: '(^|[/\\\\]).*\\.service\\.(ts|js|tsx|jsx)$' },
      to:   { path: '(^|[/\\\\]).*\\.controller\\.(ts|js|tsx|jsx)$' }
    },
    {
      name: 'no-reverse-repository-to-controller',
      severity: 'error',
      comment: 'Repositories must not depend on controllers',
      from: { path: '(^|[/\\\\]).*\\.repository\\.(ts|js|tsx|jsx)$' },
      to:   { path: '(^|[/\\\\]).*\\.controller\\.(ts|js|tsx|jsx)$' }
    },
    {
      name: 'no-reverse-repository-to-service',
      severity: 'error',
      comment: 'Repositories must not depend on services (no upward dependency)',
      from: { path: '(^|[/\\\\]).*\\.repository\\.(ts|js|tsx|jsx)$' },
      to:   { path: '(^|[/\\\\]).*\\.service\\.(ts|js|tsx|jsx)$' }
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular dependencies allowed',
      from: {},
      to:   { circular: true }
    }
  ],

  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    exclude: {
      path: '(^|[/\\\\])node_modules[/\\\\]'
    },
    includeOnly: {
      path: '\\.(ts|tsx|js|jsx|mjs|cjs)$'
    },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+'
      }
    }
  }
};
