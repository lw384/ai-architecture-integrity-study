// harness/rulepacks/js-ts-react/adapters/dep-cruiser/config.cjs
//
// 版本冻结声明（三点冗余之一）：
// dep-cruiser 版本: 16.10.4
// recommended-strict preset 版本快照日期: 2026-07-08
// 与 rulepack manifest 的 tool_versions.dep-cruiser 必须一致
//
// 规则分组：
//   [T1-CORE]        进入研究主分析的核心规则（对应研究规则声明）
//   [T2-SECONDARY]   进入研究次要观察的规则（简化声明）
//   [T3-BACKGROUND]  背景检查规则，不进研究数据

module.exports = {
    options: {
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '\\.(spec|test)\\.(js|ts)$|test/utils' },
    },

    forbidden: [
        // ============================================================
        // [T1-CORE] ARCH (Custom Research Rules)
        // ============================================================
        {
            name: 'ARCH-001-controller-to-repo',
            severity: 'error',
            comment: 'Research rule ARCH-001. See rules/ARCH-001-layer-boundary.yaml',
            from: { path: '\\.controller\\.(ts|js)$' },
            to: { path: '\\.repository\\.(ts|js)$' }
        },

        // 2. Cross-Domain: A 不能 import B 的内部实现
        {
            name: 'ARCH-002-cross-domain-internal',
            severity: 'error',
            from: { path: 'src/modules/A/' },
            to: { path: 'src/modules/B/internal/' }
        },
        // 3. Upward-Import: Service -> Controller (禁止逆向)
        {
            name: 'ARCH-005-upward-service-to-controller',
            severity: 'error',
            from: { path: 'src/.*\\.service\\.' },
            to: { path: 'src/.*\\.controller\\.' }
        },


        // ============================================================
        // [T1-CORE] Reference:  dep-cruiser recommended-strict v16.10.4
        // ============================================================
        {
            name: 'ARCH-003-no-circular',
            severity: 'error',
            comment: 'Sourced from dep-cruiser recommended-strict v16.10.4, unchanged. Research rule ARCH-003.',
            from: {},
            to: { circular: true }
        },

        // ============================================================
        // [T2-SECONDARY] Reference:  dep-cruiser recommended-strict v16.10.4
        // ============================================================
        {
            name: 'AI-DEBT-001-hallucinated-imports',
            severity: 'error',
            comment: 'Detect hallucinated package imports. Research rule AI-DEBT-001.',
            from: {},
            to: { couldNotResolve: true }
        },

        // ============================================================
        // [T3-BACKGROUND] Reference:  dep-cruiser recommended v16.10.4
        // ============================================================
        {
            name: 'BG-no-deprecated-core',
            severity: 'warn',
            comment: 'Sourced from dep-cruiser recommended v16.10.4. Background only, tier 3.',
            from: {},
            to: { dependencyTypes: ['core'], path: ['^v8/\\w+', '^node:'] }
        },
        { name: 'BG-no-orphans', severity: 'warn', from: {}, to: { orphan: true } },
        { name: 'BG-not-to-deprecated', severity: 'warn', from: {}, to: { deprecated: true } }
    ]
};