// Every frontend constraint owns the same four experimental cases. Negative
// cases are minimal single violations; the other cases must produce no finding.
function code(strings, ...values) {
    const value = String.raw({ raw: strings }, ...values).replace(/^\n/, '').replace(/\n\s*$/, '');
    const lines = value.split('\n');
    const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length);
    const indent = indents.length > 0 ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(indent)).join('\n') + '\n';
}

function componentWithLines(lineCount) {
    const middle = Array.from({ length: lineCount - 3 }, (_, index) => `  const value${index} = ${index};`);
    return [`export function LargePanel() {`, ...middle, '  return <main>ready</main>;', '}'].join('\n') + '\n';
}

const scenario = (files, expected = undefined) => expected === undefined ? { files } : { files, expected };
const empty = (files) => scenario(files, []);
const finding = (ruleId, suffix, file, line, column, payload) => ({
    rule_id: `${ruleId}-${suffix}`,
    location: { file, line, column },
    evidence: { source_tool: 'frontend-static', source_rule_id: ruleId, payload },
});

export const frontendConstraintFixtures = [
    {
        ruleId: 'FE-COM-C-001',
        cases: {
            positive: empty({ 'src/pages/LargePanel.jsx': componentWithLines(300) }),
            negative: scenario({ 'src/pages/LargePanel.jsx': componentWithLines(301) }, [
                finding('FE-COM-C-001', 'component-file-max-lines', 'src/pages/LargePanel.jsx', 1, 8, {
                    line_count: 301,
                    max_lines: 300,
                    message: 'React component file has 301 non-blank, non-comment lines; maximum is 300.',
                }),
            ]),
            nearMiss: empty({
                'src/utils/large-table.js': Array.from({ length: 340 }, (_, index) => `export const value${index} = ${index};`).join('\n'),
            }),
            ignored: empty({ 'src/pages/LargePanel.spec.jsx': componentWithLines(301) }),
        },
    },
    {
        ruleId: 'FE-COM-C-002',
        cases: {
            positive: empty({
                'src/pages/Dashboard.jsx': code`
                    export function Dashboard({ first, second, third }) {
                      return (
                        <main>
                          {first && (
                            <section>
                              {second ? (
                                <article>{third && <span>three levels</span>}</article>
                              ) : null}
                            </section>
                          )}
                        </main>
                      );
                    }
                `,
            }),
            negative: scenario({
                'src/pages/Dashboard.jsx': code`
                    export function Dashboard({ first, second, third, fourth }) {
                      return (
                        <main>
                          {first && (
                            <section>
                              {second ? (
                                <article>
                                  {third && (
                                    <div>{fourth ? <span>too deep</span> : null}</div>
                                  )}
                                </article>
                              ) : null}
                            </section>
                          )}
                        </main>
                      );
                    }
                `,
            }, [finding('FE-COM-C-002', 'render-decision-max-depth', 'src/pages/Dashboard.jsx', 9, 23, {
                component: 'Dashboard',
                decision_depth: 4,
                max_decision_depth: 3,
                deepest_decision: 'ConditionalExpression',
                decision_path: [
                    'LogicalExpression(&&)',
                    'ConditionalExpression',
                    'LogicalExpression(&&)',
                    'ConditionalExpression',
                ],
                message: 'Component Dashboard has render decision nesting depth 4; maximum is 3.',
            })]),
            nearMiss: empty({
                'src/pages/Dashboard.jsx': code`
                    export function Dashboard() {
                      return (
                        <main><section><div><article><span><b><i><em><strong><button>
                          structural depth is not decision depth
                        </button></strong></em></i></b></span></article></div></section></main>
                      );
                    }
                `,
            }),
            ignored: empty({
                'src/pages/Dashboard.story.jsx': code`
                    export function Dashboard({ a, b, c, d }) {
                      return <main>{a && <section>{b && <div>{c && <span>{d && <b>ignored</b>}</span>}</div>}</section>}</main>;
                    }
                `,
            }),
        },
    },
    {
        ruleId: 'FE-STATE-C-001',
        cases: {
            positive: empty({
                'src/components/interactive/Menu.jsx': code`
                    import { useState } from 'react';
                    export function Menu() { const [open] = useState(false); return <nav>{String(open)}</nav>; }
                `,
                'src/layout/components/Navbar/Profile.jsx': code`
                    import { useState } from 'react';
                    export function Profile() { const [tab] = useState(0); return <aside>{tab}</aside>; }
                `,
            }),
            negative: scenario({
                'src/components/presentational/UserCard.jsx': code`
                    import { useState as useLocal } from 'react';
                    export function UserCard() { const [open] = useLocal(false); return <article>{String(open)}</article>; }
                `,
            }, [finding('FE-STATE-C-001', 'no-local-state-in-stateless-components', 'src/components/presentational/UserCard.jsx', 2, 45, {
                hook: 'useLocal',
                boundary: '^src\\/components\\/presentational\\/',
                message: 'Local React state is not allowed in an explicitly stateless component boundary.',
            })]),
            nearMiss: empty({
                'src/components/presentational/value.js': code`
                    function useState(value) { return value; }
                    export const value = useState(1);
                `,
            }),
            ignored: empty({
                'src/components/presentational/UserCard.test.jsx': code`
                    import { useReducer } from 'react';
                    export function UserCard() { const [value] = useReducer((x) => x, 0); return <div>{value}</div>; }
                `,
            }),
        },
    },
    {
        ruleId: 'FE-STATE-C-002',
        cases: {
            positive: empty({
                'src/routes/AdminLayout.jsx': code`
                    import { ThemeProvider } from '@mui/material/styles';
                    export function AdminLayout({ children }) { return <ThemeProvider theme={{}}>{children}</ThemeProvider>; }
                `,
            }),
            negative: scenario({
                'src/components/UserCard.jsx': code`
                    import { AuthContext } from '../contexts/AuthContext';
                    export function UserCard({ children }) { return <AuthContext.Provider value={{}}>{children}</AuthContext.Provider>; }
                `,
                'src/contexts/AuthContext.js': code`
                    import { createContext } from 'react';
                    export const AuthContext = createContext(null);
                `,
            }, [finding('FE-STATE-C-002', 'context-provider-only-in-controlled-locations', 'src/components/UserCard.jsx', 2, 49, {
                provider: 'AuthContext.Provider',
                allowed_locations: ['src/App.*', 'src/index.*', 'src/main.*', 'src/routes/**/*Layout.*', 'src/providers/**', 'src/contexts/**'],
                message: 'Context providers must stay at an approved application or route boundary.',
            })]),
            nearMiss: empty({
                'src/components/ProviderStatus.jsx': code`
                    export function ProviderStatus() { return <aside>connected</aside>; }
                `,
            }),
            ignored: empty({
                'src/components/UserCard.story.jsx': code`
                    export const UserCard = () => <AuthContext.Provider value={{}} />;
                `,
            }),
        },
    },
    {
        ruleId: 'FE-ROUTE-C-001',
        cases: {
            positive: empty({
                'src/routes/app-routes.jsx': code`
                    import { createBrowserRouter } from 'react-router-dom';
                    export const router = createBrowserRouter([]);
                `,
            }),
            negative: scenario({
                'src/pages/Shell.jsx': code`
                    import { useRoutes } from 'react-router-dom';
                    export function Shell() { return useRoutes([]); }
                `,
            }, [finding('FE-ROUTE-C-001', 'route-definitions-centralized', 'src/pages/Shell.jsx', 2, 34, {
                definition: 'CallExpression',
                required_directory: 'src/routes/',
                message: 'Route definitions must live under src/routes/.',
            })]),
            nearMiss: empty({
                'src/components/NavLink.jsx': code`
                    import { Route, useNavigate } from 'react-router-dom';
                    export function NavLink() { const navigate = useNavigate(); return <button onClick={() => navigate('/users')}>Users</button>; }
                `,
            }),
            ignored: empty({
                'src/pages/Shell.spec.jsx': code`
                    import { useRoutes } from 'react-router-dom';
                    export const Shell = () => useRoutes([]);
                `,
            }),
        },
    },
    {
        ruleId: 'FE-ROUTE-C-002',
        cases: {
            positive: empty({
                'src/pages/index.ts': code`export { UsersPage } from './UsersPage';`,
                'src/pages/UsersPage.tsx': code`export function UsersPage() { return <main>Users</main>; }`,
                'src/routes/app-routes.tsx': code`
                    import { UsersPage } from '../pages';
                    export const routes = [{ path: '/users', Component: UsersPage }];
                `,
            }),
            negative: scenario({
                'src/components/UsersWidget.tsx': code`export function UsersWidget() { return <section>Users</section>; }`,
                'src/routes/app-routes.tsx': code`
                    import { UsersWidget } from '../components/UsersWidget';
                    export const routes = [{ path: '/users', element: <UsersWidget /> }];
                `,
            }, [finding('FE-ROUTE-C-002', 'route-maps-to-page-component', 'src/routes/app-routes.tsx', 2, 51, {
                route: '/users',
                mapping: 'element',
                message: 'Route /users must resolve to a component under src/pages/.',
            })]),
            nearMiss: empty({
                'src/pages/UsersPage.tsx': code`export function UsersPage() { return <main>Users</main>; }`,
                'src/routes/app-routes.tsx': code`
                    import { UsersPage } from '../pages/UsersPage';
                    const breadcrumb = { path: '/users', label: 'Users' };
                    export const routes = [{ path: '/', children: [{ path: 'users', Component: UsersPage }] }];
                    export { breadcrumb };
                `,
            }),
            ignored: empty({
                'src/routes/app-routes.generated.tsx': code`export const routes = [{ path: '/users' }];`,
            }),
        },
    },
    {
        ruleId: 'FE-STYLE-C-001',
        cases: {
            positive: empty({ 'src/pages/Home.jsx': code`export const Home = () => <main sx={{ color: 'red' }}>Home</main>;` }),
            negative: scenario({
                'src/pages/Home.jsx': code`export const Home = () => <main style={{ color: 'red' }}>Home</main>;`,
            }, [finding('FE-STYLE-C-001', 'no-raw-jsx-style', 'src/pages/Home.jsx', 1, 33, {
                element: 'main',
                message: 'Raw JSX style props are not allowed; use the shared styling abstraction.',
            })]),
            nearMiss: empty({ 'src/pages/Home.jsx': code`const style = { color: 'red' }; export const Home = () => <main className="home">{style.color}</main>;` }),
            ignored: empty({ 'src/pages/Home.generated.jsx': code`export const Home = () => <main style={{ color: 'red' }}>Home</main>;` }),
        },
    },
    {
        ruleId: 'FE-STYLE-C-002',
        cases: {
            positive: empty({ 'src/styles/global/app.css': 'body { margin: 0; }\n' }),
            negative: scenario({ 'src/features/users/users.css': '.user { color: red; }\n' }, [
                finding('FE-STYLE-C-002', 'global-styles-only-in-approved-locations', 'src/features/users/users.css', 1, 1, {
                    stylesheet: 'src/features/users/users.css',
                    required_directory: 'src/styles/global/',
                    message: 'Global stylesheets must live under src/styles/global/.',
                }),
            ]),
            nearMiss: empty({ 'src/features/users/users.module.scss': '.user { color: red; }\n' }),
            ignored: empty({ 'src/features/users/users.generated.css': '.user { color: red; }\n' }),
        },
    },
    {
        ruleId: 'FE-DATA-C-001',
        cases: {
            positive: empty({
                'src/api/users.ts': code`
                    import axios from 'axios';
                    const client = axios.create();
                    export const loadUsers = () => client.get('/api/users');
                `,
            }),
            negative: scenario({
                'src/pages/UsersPage.tsx': code`
                    export async function loadUsers() { return window.fetch('/api/users'); }
                `,
            }, [finding('FE-DATA-C-001', 'network-calls-only-in-approved-modules', 'src/pages/UsersPage.tsx', 1, 44, {
                client: 'fetch',
                callee: 'window.fetch',
                message: 'Direct network calls belong in an API service or data hook.',
            })]),
            nearMiss: empty({
                'src/utils/load.ts': code`
                    export function load(fetch: (key: string) => string) { return fetch('users'); }
                `,
            }),
            ignored: empty({
                'src/pages/UsersPage.test.tsx': code`export const loadUsers = () => fetch('/api/users');`,
            }),
        },
    },
    {
        ruleId: 'FE-DATA-C-002',
        cases: {
            positive: empty({
                'src/pages/UserPage.tsx': code`
                    import { useEffect } from 'react';
                    export function UserPage({ userId }) { useEffect(() => console.log(userId), [userId]); return <main />; }
                `,
            }),
            negative: scenario({
                'src/pages/UserPage.tsx': code`
                    import { useEffect as useReactiveEffect } from 'react';
                    export function UserPage({ userId }) { useReactiveEffect(() => console.log(userId), []); return <main />; }
                `,
            }, [finding('FE-DATA-C-002', 'useeffect-requires-dependency-array', 'src/pages/UserPage.tsx', 2, 40, {
                reason: 'incomplete-dependencies',
                missing_dependencies: ['userId'],
                declared_dependencies: [],
                message: 'useEffect is missing reactive dependencies: userId.',
            })]),
            nearMiss: empty({
                'src/pages/UserPage.tsx': code`
                    import { useEffect, useState } from 'react';
                    const endpoint = '/api/users';
                    export function UserPage({ userId }) { const [, setReady] = useState(false); useEffect(() => { console.log(endpoint, userId); setReady(true); }, [userId]); return <main />; }
                `,
            }),
            ignored: empty({
                'src/pages/UserPage.spec.tsx': code`import { useEffect } from 'react'; export function UserPage({ userId }) { useEffect(() => console.log(userId), []); return <main />; }`,
            }),
        },
    },
    {
        ruleId: 'FE-COMM-C-001',
        cases: {
            positive: empty({
                'src/features/users/useLocalEmitter.ts': code`
                    import mitt from 'mitt';
                    export function createLocalChannel() { const emitter = mitt(); return emitter; }
                `,
            }),
            negative: scenario({
                'src/events.ts': code`
                    import mitt from 'mitt';
                    export const eventBus = mitt();
                `,
            }, [finding('FE-COMM-C-001', 'no-global-event-bus', 'src/events.ts', 2, 14, {
                singleton: 'eventBus',
                exported: true,
                message: 'Module-level event-bus singletons are not allowed.',
            })]),
            nearMiss: empty({ 'src/events.ts': code`import mitt from 'mitt'; export const emitterLibrary = mitt;` }),
            ignored: empty({
                'src/events.generated.ts': code`import mitt from 'mitt'; export const eventBus = mitt();`,
            }),
        },
    },
    {
        ruleId: 'FE-DUP-C-001',
        cases: {
            positive: empty({
                'src/pages/users/UsersListPage.tsx': code`export function UsersListPage() { return <main>List</main>; }`,
                'src/pages/users/UsersDetailPage.tsx': code`export function UsersDetailPage() { return <main>Detail</main>; }`,
            }),
            negative: scenario({
                'src/pages/users/UsersPage.tsx': code`export function UsersPage() { return <main>Users</main>; }`,
                'src/pages/admin/UsersPage.tsx': code`export function UsersPage() { return <main>Users admin</main>; }`,
            }, [finding('FE-DUP-C-001', 'single-resource-owner', 'src/pages/users/UsersPage.tsx', 1, 8, {
                reason: 'duplicate-owner',
                resource: 'user',
                owner_type: 'page',
                owners: ['src/pages/admin', 'src/pages/users'],
                message: 'user has competing page owners.',
            })]),
            nearMiss: empty({
                'src/pages/users/UsersPage.tsx': code`export function UsersPage() { return <main>Users</main>; }`,
                'src/routes/users.tsx': code`
                    import { UsersPage } from '../pages/users/UsersPage';
                    export const routes = [{ path: '/users', Component: UsersPage }];
                `,
            }),
            ignored: empty({
                'src/pages/users/UsersPage.tsx': code`export function UsersPage() { return <main>Users</main>; }`,
                'src/pages/admin/UsersPage.spec.tsx': code`export function UsersPage() { return <main>Users admin</main>; }`,
            }),
        },
    },
    {
        ruleId: 'FE-DUP-C-002',
        cases: {
            positive: empty({
                'src/utils/normalize-user.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
                'src/features/users/load.ts': code`import { normalizeUser } from '../../utils/normalize-user'; export const load = (value) => normalizeUser(value);`,
                'src/pages/users/map.ts': code`import { normalizeUser } from '../../utils/normalize-user'; export const map = (value) => normalizeUser(value);`,
            }),
            negative: scenario({
                'src/features/users/normalize.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
                'src/pages/users/normalize.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
            }, [finding('FE-DUP-C-002', 'single-authoritative-implementation', 'src/pages/users/normalize.ts', 1, 8, {
                reason: 'transformation-duplicate',
                fingerprint: '6d8dc1965239',
                implementations: ['src/features/users/normalize.ts:1', 'src/pages/users/normalize.ts:1'],
                message: 'transformation-duplicate logic has more than one production implementation.',
            })]),
            nearMiss: empty({
                'src/features/users/normalize.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
                'src/features/teams/normalize.ts': code`export function normalizeTeam(input) { return { id: Number(input.id), label: input.label.toUpperCase() }; }`,
            }),
            ignored: empty({
                'src/features/users/normalize.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
                'src/pages/users/normalize.generated.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
            }),
        },
    },
];

export const frontendDuplicationReasonFixtures = [
    {
        reason: 'api-duplicate',
        files: {
            'src/features/users/load.ts': code`import axios from 'axios'; export const loadUsers = () => axios.get('/api/users');`,
            'src/pages/users/load.ts': code`import axios from 'axios'; export const loadUsers = () => axios.get('/api/users');`,
        },
    },
    {
        reason: 'form-duplicate',
        files: {
            'src/features/users/UserForm.tsx': code`export function UserForm() { return <form><input name="email" /><input name="name" /></form>; }`,
            'src/pages/users/UserEditor.tsx': code`export function UserEditor() { return <form><input name="email" /><input name="name" /></form>; }`,
        },
    },
    {
        reason: 'validation-duplicate',
        files: {
            'src/features/users/schema.ts': code`export const userSchema = { email: { required: true }, name: { minLength: 2 } };`,
            'src/pages/users/schema.ts': code`export const userSchema = { email: { required: true }, name: { minLength: 2 } };`,
        },
    },
    {
        reason: 'transformation-duplicate',
        files: {
            'src/features/users/normalize.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
            'src/pages/users/normalize.ts': code`export function normalizeUser(input) { return { id: String(input.id), name: input.name.trim() }; }`,
        },
    },
    {
        reason: 'state-duplicate',
        files: {
            'src/features/users/state.ts': code`export function userReducer(state, action) { return action.type === 'open' ? { ...state, open: true } : state; }`,
            'src/pages/users/state.ts': code`export function userReducer(state, action) { return action.type === 'open' ? { ...state, open: true } : state; }`,
        },
    },
    {
        reason: 'component-clone',
        files: {
            'src/features/users/UserSummary.tsx': code`export function UserSummary({ title }) { return <section><h1>{title}</h1><button type="button">Save</button></section>; }`,
            'src/pages/users/UserOverview.tsx': code`export function UserOverview({ title }) { return <section><h1>{title}</h1><button type="button">Save</button></section>; }`,
        },
    },
    {
        reason: 'function-clone',
        files: {
            'src/features/users/format.ts': code`export function formatUser(value) { const trimmed = value.trim(); return trimmed ? trimmed.toUpperCase() : 'UNKNOWN'; }`,
            'src/pages/users/format.ts': code`export function formatUser(value) { const trimmed = value.trim(); return trimmed ? trimmed.toUpperCase() : 'UNKNOWN'; }`,
        },
    },
];
