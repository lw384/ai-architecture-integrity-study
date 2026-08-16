# `js-react-frontend` 规则审计报告

本报告梳理 `harness/rulepacks/js-react-frontend` 下全部 **13 条 constraint 规则**与
**7 条 metric 规则**：每条规则由什么代码实现、实际检测口径、fixture/单元测试覆盖情况，以及 metric
与同分类 constraint 是否真的衡量同一件事。全文只记录当前实现的真实状态，不把 YAML 描述当作实现证据。

---

## 0. 结论摘要（TL;DR）

| 项目 | 结论 |
|---|---|
| 13 条 constraint 的接入情况 | 全部登记在 `manifest.yaml`，并由 Base、T0、T1、T2、T3 的 frontend scope 启用；统一通过 `frontend-static` adapter 进入评估 pipeline |
| constraint fixture 覆盖 | 每条都有 positive/negative/nearMiss/ignored 四类用例；另有 7 类 `FE-DUP-C-002` 重复原因测试和 2 条协议/任务完整性测试。`node --test core/tests/frontend-constraint-fixtures.test.mjs` 实测 **61/61 通过** |
| 7 条 metric 的接入情况 | 全部登记在 manifest，并由五份任务配置启用；`computed-metrics` 能解析并执行全部 7 个 `FE-*-M-001.mjs` 实现 |
| metric 测试覆盖 | 7 条 metric 各有 2 条专用行为测试，共 14 条；另有 2 条注册/全链路执行测试。前端 constraint + metric 定向测试实测 **77/77 通过** |
| metric 与 constraint 的一致性 | 只有 `FE-DATA-M-001` 与 `FE-DATA-C-001` 衡量同一类“网络调用位置”问题，但两者调用识别和允许路径仍不一致；其余 6 条主要是同分类的独立代理指标，不能用 metric 数值替代对应 constraint finding |
| 文档/配置与实现的一致性 | 有 5 组需要在解读时注意的差异：深层组件由目录代理、`Fragment` 在 depth constraint/metric 中口径不同、data-access 允许路径不同、prop-drilling 实为单节点属性扇出、duplication YAML 的“code-block”范围宽于实际实现 |

---

## 1. 执行链路总览

一条前端规则从声明到结果的完整路径：

```text
manifest.yaml（声明 13 constraints + 7 metrics，并配置 adapter）
   → tasks/Base.eval.yaml、T0-T3.eval.yaml（frontend scope 启用规则短 ID）
   → core/layers/constraints_runner.mjs
       → adapters/frontend-static/adapter.mjs
       → inventory.mjs 一次性构建生产代码 AST / import / route / component / style inventory
       → rules.mjs 对同一 inventory 执行 13 条约束
       → normalized_events → 按规则 YAML evidence_sources 匹配为 findings
   → core/layers/metrics_runner.mjs
       → adapters/computed-metrics/adapter.mjs
       → 按 YAML implementation 动态加载 implementations/frontend/FE-*-M-001.mjs
       → metric_result（score / delta_vs_baseline / findings / raw_artifact_path）
```

`frontend-static` 的代码职责如下：

```text
adapters/frontend-static/
  adapter.mjs    — 读取 frontend-static.config.json，构建 inventory，规范化 constraint events
  inventory.mjs  — 复用 backend-static/project.mjs 的项目模型；补充 JSX、组件、route、hook、
                   style file、函数和变量等前端事实
  rules.mjs      — 13 条 constraint 的全部判定逻辑，按 rule ID/文件/位置稳定排序
```

两层都会复用 `adapters/_shared/production-files.mjs` 排除 `*.test.*`、`*.spec.*`、story、generated
以及对应目录。constraint 的 JS/TS inventory 固定从 `src/` 扫描 `.js/.jsx/.ts/.tsx/.mjs/.cjs`；
style 文件另行扫描 `src/` 下的 `.css/.scss/.sass`。多数 metric 默认扫描 `src/` 下
`.js/.jsx/.ts/.tsx`，route metric 则只扫描配置的 `src/routes`。

7 条 metric 中，前 6 条共享：

```text
implementations/frontend/frontend-source-analysis.mjs
```

`FE-DUP-M-001` 不重复实现 clone detector，而是调用 backend 的 `BE-DUP-M-001`，并把扫描扩展名改为
`.js/.jsx/.ts/.tsx`。所有 metric 都会对 target 和可选 baseline 使用同一配置计算，再输出差值。

---

## 2. Constraint 规则逐条梳理（13 条）

fixture 协议对每条 constraint 统一定义四类用例：

- **positive**：标准合规实现，期望 0 条 finding；
- **negative**：一个最小违规，精确断言 1 条 finding 的 rule ID、位置和完整 evidence payload；
- **nearMiss**：外形相似但不应违规，期望 0 条 finding；
- **ignored**：违规形状位于 test/spec/story/generated 文件，期望 0 条 finding。

### 2.1 Components

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-COM-C-001**<br>component-file-max-lines | frontend-static<br>`analyzeComponents()`<br>`rules.mjs:112` | 先把“含大写命名且返回 JSX 的函数”，或“文件名大写且文件含 JSX”的文件识别为 component；再统计非空、非纯注释行，超过配置 `component_max_lines`（当前 300）时报 1 条 finding | 4/4 | ✅ 已验证 300/301 边界、非组件大文件和测试文件排除。⚠️ 行数统计是轻量文本算法，行内块注释仍可能按代码行计数 |
| **FE-COM-C-002**<br>jsx-max-depth | frontend-static<br>`analyzeComponents()` | 对每个 JSX element 沿父节点向上计算业务层深度；fragment、配置的 transparent wrapper、以及 render-prop 回调外层不计。仅在 `depth === maxDepth + 1` 时报告跨过阈值的边界节点，当前阈值 5 | 4/4 | ✅ 验证 5/6 层边界、wrapper import alias、render-prop 和非生产文件。只报告每条过深分支首次跨过阈值的位置，不枚举该分支后续所有更深节点 |

### 2.2 State management

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-STATE-C-001**<br>no-usestate-in-deep-child-components | frontend-static<br>`analyzeState()`<br>`rules.mjs:170` | 把 `src/components/**` 和 `src/layout/components/**` 定义为受控 child-component 目录；其中出现从 React 导入（含别名）或通过 React namespace 调用的 `useState`/`useReducer` 即违规 | 4/4 | ✅ import binding 可防止把本地同名函数误判为 React hook。⚠️ “deep child”不是按组件树深度推导，而是完全由文件目录代理；YAML 只写 `useState`，实现还包含 `useReducer` |
| **FE-STATE-C-002**<br>context-provider-only-in-controlled-locations | frontend-static<br>`analyzeState()` | 放行 `src/App.*`、`src/index.*`、`src/main.*`、`src/providers/**`、`src/contexts/**`、`src/routes/**/*Layout.*`；其余文件中的 `<X.Provider>`、名字以 `Provider` 结尾的 JSX 节点、或可追踪到 contexts 目录的 context JSX 使用均报违规 | 4/4 | ✅ 验证合法 layout、非法 child、仅名字含 Provider 的 near miss 和 ignored 文件。⚠️ 这是基于位置和命名/import 来源的启发式，不验证 provider 是否真正由 `createContext` 产生 |

### 2.3 Routes

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-ROUTE-C-001**<br>route-definitions-centralized | frontend-static<br>`analyzeRoutes()`<br>`rules.mjs:286` | 识别从 `react-router-dom` 导入的 `create*Router`/`createRoutesFromElements`/`useRoutes` 调用、导入后的 `<Route>`，以及名为 `routes/router/routeConfig` 的 route object 变量；这些定义若不在 `src/routes/**` 即违规 | 4/4 | ✅ 使用 import binding，普通 `useNavigate`/未实际使用的 `Route` import 不会误报。⚠️ 自定义路由封装或动态生成、且不符合上述 API/命名形状时不会被识别 |
| **FE-ROUTE-C-002**<br>route-maps-to-page-component | frontend-static<br>`analyzeRoutes()` | 只检查 `src/routes/**` 中识别出的 object route 或 JSX `<Route>`。非纯容器 route 必须通过 `element`/`Component`/`lazy`/`loader` 映射到 `src/pages/**`；支持相对 import、barrel 最终目标、静态常量、动态 import、`Navigate` 和特定 React.lazy loader 形状 | 4/4 | ✅ 验证 page barrel、错误映射、嵌套路由容器和 generated 排除。⚠️ 页面判断以静态 import/AST 可追踪性为边界，运行时注册或任意高阶包装可能无法证明来源 |

### 2.4 Styles

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-STYLE-C-001**<br>no-raw-jsx-style | frontend-static<br>`analyzeStyles()`<br>`rules.mjs:328` | 任意生产 JSX opening element 出现名为 `style` 的普通 JSX attribute 即违规；不分析 value 内容 | 4/4 | ✅ 判定简单直接，精确验证 `style`/`sx`/普通变量/生成文件四类边界 |
| **FE-STYLE-C-002**<br>global-styles-only-in-approved-locations | frontend-static<br>`analyzeStyles()` | 扫描 `src/**` 的 `.css/.scss/.sass`；CSS Module（`*.module.*`）和 `src/styles/global/**` 放行，其余样式文件一律作为非批准 global stylesheet 报告 | 4/4 | ✅ 三类扩展名共享同一规则，并验证 global/module/generated 边界。⚠️ 不解析 stylesheet 内容或 import 方式，判定只依赖文件路径/后缀 |

### 2.5 Data access

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-DATA-C-001**<br>network-calls-only-in-approved-modules | frontend-static<br>`analyzeData()`<br>`rules.mjs:472` | 识别未被局部声明遮蔽的 `fetch`、`window/globalThis.fetch`、axios default/namespace/named `create` 产生的实例及其调用。调用文件必须命中配置路径：当前为 `src/api/`、`src/services/`、`src/hooks/` 或任意 `/hooks/` | 4/4 | ✅ 验证 axios instance、window.fetch、shadowed fetch 和非生产文件。⚠️ 只识别内置的 fetch/axios 形状，自定义 HTTP client 若不源自 axios 不在范围内 |
| **FE-DATA-C-002**<br>useeffect-requires-dependency-array | frontend-static<br>`analyzeData()` | 对 React import-bound 的 `useEffect`，要求第二参数是数组；再收集其所在函数的 props/局部变量/局部函数等 reactive binding，排除 state setter、ref 和全局对象，比较 callback 引用与 dependency 数组中的根标识符，报告缺失项 | 4/4 | ✅ 验证 alias、缺失依赖、稳定 setter/模块常量和 ignored 文件。⚠️ 这是轻量 exhaustive-deps 近似，不等价于 React/ESLint 完整作用域与 hook 语义分析 |

### 2.6 Communication

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-COMM-C-001**<br>no-global-event-bus | frontend-static<br>`analyzeCommunication()`<br>`rules.mjs:543` | 检查 module 顶层变量：初始化自 `mitt`/`events`/`eventemitter3`、`new EventTarget()`，或含 `on+emit` / `subscribe+publish` 的对象；如果变量被导出，或名称匹配 `eventBus`/`bus`/`emitter`，即视为全局 event-bus singleton | 4/4 | ✅ 验证导出 singleton、函数内局部 emitter、仅引用 factory 和 generated 排除。⚠️ 未导出且刻意使用中性名字的模块级 bus，以及自定义 factory 返回的 bus，可能不被识别 |

### 2.7 Duplication

| 规则 | 工具 / 实现 | 实际检测逻辑 | Fixture | 可信度与边界 |
|---|---|---|---|---|
| **FE-DUP-C-001**<br>single-resource-owner | frontend-static<br>`analyzeResourceDuplication()`<br>`rules.mjs:640` | 从 `src/features/<name>/**`、page component、`*Form` 函数和 route object 收集 owner；资源名经驼峰拆词、忽略 page/list/detail/edit 等词、取首个有效词并单数化/应用 alias。按 `owner kind + resource` 分组，同种 owner 出现两个不同目录/文件即违规 | 4/4 | ✅ 验证同资源双 page owner、同一资源的 page+route 不冲突及 ignored 文件。⚠️ 资源归一化主要取首个 token，复合资源名可能被过度合并；不同 owner kind 本来就不会互相冲突 |
| **FE-DUP-C-002**<br>single-authoritative-implementation | frontend-static<br>`analyzeImplementationDuplication()`<br>`rules.mjs:772` | 为生产实现生成 7 类指纹：静态 API method+endpoint、form 字段集合、validation object AST、transform 函数 AST、state/reducer AST、component AST、普通 function AST。仅比较不同文件；同一文件对只按优先级报告一种原因。函数体 AST size 小于 10 的函数不参与 | 4/4 + 7 类原因测试 | ✅ 7 种 `reason` 都有独立可执行证据。⚠️ 不是任意“code-block”克隆检测；AST 指纹会归一化 identifier，但保留 literal/成员属性等结构，覆盖范围比通用 Type-2 clone detector 窄 |

**Constraint 小结**：

```text
$ node --test core/tests/frontend-constraint-fixtures.test.mjs
# tests 61 / pass 61 / fail 0
```

61 条由 **13 × 4 = 52 条统一协议用例 + 7 条 FE-DUP-C-002 原因测试 + 2 条完整性测试**组成。
完整性测试还断言 Base、T0-T3 五份任务启用完全一致的 13 条 constraint，因此这些规则不只是存在于目录中，
而是确实接入当前评估 pipeline。

---

## 3. Metric 规则逐条梳理（7 条）

metric 输出连续数值而非二元 finding。所有实现都返回 `score`、可选 `delta_vs_baseline`、findings 和
artifact path；无 baseline 时 delta 为 `null`。除 state ratio 的解释需要看趋势外，方向来自各实现的
`direction` 字段。

| 规则 | 实现与公式 | 数据来源 / 边界 | 与 constraint 的口径一致性 |
|---|---|---|---|
| **FE-COM-M-001**<br>jsx-depth-average | `FE-COM-M-001.mjs` → `analyzeJsxDepth()`<br>`average(max JSX depth per .jsx/.tsx file)`；无文件为 0；`lower_is_better` | 扫描所有生产 `.jsx/.tsx`，不先证明文件是 component；fragment 和配置中的 exact wrapper 名透明 | ⚠️ **同类但不完全一致**：与 `FE-COM-C-002` 都测 JSX 深度，但 metric 不复用 constraint inventory/深度函数，不处理 import alias，也不在 render-prop 回调处截断；当前 metric 配置还缺少 constraint 配置中的 `Fragment` wrapper。与文件行数 constraint `FE-COM-C-001` 无直接公式关系 |
| **FE-STATE-M-001**<br>context-provider-ratio | `FE-STATE-M-001.mjs` → `analyzeStateDistribution()`<br>`provider usages / (useState + useReducer + provider usages)`；无信号为 0；当前声明 `lower_is_better` | hook 仅按 `useState/useReducer` 或 `React.*` 语法名计数，不验证 import binding；provider 只计 `<X.Provider>` | ⚠️ **独立分布指标**：不判断 hook 是否位于 deep-child 目录，也不判断 provider 是否位于批准目录，不能替代 `FE-STATE-C-001/002`。此外低值不天然代表更合规，跨版本“偏移”比绝对方向更适合解释 |
| **FE-ROUTE-M-001**<br>route-param-complexity | `FE-ROUTE-M-001.mjs` → `analyzeRoutes()`<br>`sum(static path 的 :param 段数) / static path object 数`；无 route 为 0；`lower_is_better` | 只扫描 `routes_root` 下任意带静态 `path` 属性的 object；不要求它是已识别 route，不统计 JSX `<Route>` | ⚠️ **独立复杂度指标**：`FE-ROUTE-C-001/002` 检查定义位置和 page 映射，metric 只测动态参数个数；breadcrumb 等普通 path object 也可能进入分母 |
| **FE-STYLE-M-001**<br>style-mixing-ratio | `FE-STYLE-M-001.mjs` → `analyzeStyleMixing()`<br>`使用 >1 种 style signal 的生产文件数 / 全部生产 JS/TS 文件数`；无文件为 0；`lower_is_better` | signal 为 JSX `sx/className/style` 和直接 `styled(...)`；同一 signal 在文件内去重，无 style 的文件仍进入分母 | ⚠️ **弱代理**：只用 raw `style` 的文件会违反 `FE-STYLE-C-001`，但不会被判为 mixing；metric 完全不读取 CSS/SCSS/SASS，因此不覆盖 `FE-STYLE-C-002` |
| **FE-DATA-M-001**<br>data-access-wrapping-ratio | `FE-DATA-M-001.mjs` → `analyzeDataAccessWrapping()`<br>`approved network calls / all detected network calls`；无调用为 1；`higher_is_better` | 识别直接 `fetch` 和从 axios import 的 alias 调用；按 `approved_data_paths` 正则判断整个文件是否批准 | ⚠️ **问题相同、实现口径不同**：它与 `FE-DATA-C-001` 都测网络调用位置，但 metric 不识别 `window/globalThis.fetch`、不处理 fetch shadowing/axios.create 实例；当前允许 `src/api/**`、`pages/*Queries.*`、特定 context，而 constraint 允许 api/services/hooks。两层结果可能直接相反。与 `FE-DATA-C-002` 无关系 |
| **FE-COMM-M-001**<br>prop-drilling-average | `FE-COMM-M-001.mjs` → `analyzePropDrilling()`<br>`达到阈值的 JSX 节点 prop 数之和 / 候选节点数`；默认阈值 4，无候选为 0；`lower_is_better` | 统计所有 JSX opening element 的普通 attribute；spread attribute 不计；DOM element 和 component 不区分，也不追踪 prop 穿越多层 | ⚠️ **名称强于实现**：实际是“宽 JSX 属性扇出均值”，不是 prop drilling 路径分析；与禁止 global event bus 的 `FE-COMM-C-001` 没有直接对应关系 |
| **FE-DUP-M-001**<br>clone-ratio | `FE-DUP-M-001.mjs` 复用 backend `BE-DUP-M-001`<br>`重复片段覆盖的 token-bearing 行 / 全部 token-bearing 生产行`；无代码为 0；`lower_is_better` | identifier/literal token 归一化后用 `min_tokens`（当前 50）滑窗哈希，扩展相同片段；前端扫描 JS/JSX/TS/TSX，覆盖行去重 | ⚠️ **通用 clone 指标**：能补充 `FE-DUP-C-002` 的窄语义指纹，但不理解 resource owner，因此不覆盖 `FE-DUP-C-001`。当前 detector 的 seed 已强制达到 `min_tokens`，所以后续 `min_tokens OR min_lines` 判断中的 `min_lines` 实际不会单独放行短 token clone |

### 3.1 Metric 测试清单

| Metric | 测试文件 | 用例数 | 当前断言重点 |
|---|---|---:|---|
| FE-COM-M-001 | `core/tests/frontend-com-metric.test.mjs` | 2 | 文件最大深度均值、transparent wrapper/fragment、test 排除 |
| FE-STATE-M-001 | `core/tests/frontend-state-metric.test.mjs` | 2 | hook/provider 计数、无信号边界、test 排除 |
| FE-ROUTE-M-001 | `core/tests/frontend-route-metric.test.mjs` | 2 | 静态 path 参数均值、可配置 routes root、动态 path/非生产排除 |
| FE-STYLE-M-001 | `core/tests/frontend-style-metric.test.mjs` | 2 | 四种 signal、文件分母、signal 去重、test 排除 |
| FE-DATA-M-001 | `core/tests/frontend-data-metric.test.mjs` | 2 | fetch/axios alias、批准位置比例、零调用边界、test 排除 |
| FE-COMM-M-001 | `core/tests/frontend-comm-metric.test.mjs` | 2 | threshold 候选、普通 attribute 计数、spread 排除、阈值配置 |
| FE-DUP-M-001 | `core/tests/frontend-dup-metric.test.mjs` | 2 | Type-2 JSX clone、前端扩展名、test 排除 |
| 全部 7 条注册与执行 | `core/tests/frontend-metric-registration.test.mjs` | 2 | Base/T0-T3 精确启用七条；manifest → YAML → implementation 全链路执行 |

14 条专用行为测试中，多数使用精确数值断言；clone 正例只断言 ratio/match 大于 0，并未固定具体比例。
另外 `computed-metric-naming.test.mjs` 会检查所有 ID 命名实现以 `M-001` 结尾、YAML implementation
一致、任务 selector 唯一解析，以及 implementations 目录下不存在无法从 manifest 到达的孤儿实现。

---

## 4. YAML、配置与实现的一致性

Constraint YAML 的 `evidence_sources` 都准确指向 `frontend-static` 产出的 canonical source rule ID；metric
YAML 的 `adapter: computed-metrics` 和 `implementation: FE-*-M-001` 也与实际文件一一对应。需要额外说明的
不是“规则未接入”，而是自然语言或两套配置容易让人误以为口径比实际更一致：

1. **`FE-STATE-C-001` 的 “deep child”**：YAML 写的是组件层级概念，实际实现没有建立 React component
   tree，而是把 `src/components/**`、`src/layout/components/**` 作为固定代理目录；同时实现同时禁止
   `useState` 和 `useReducer`，规则名/description 只明确写了 `useState`。
2. **JSX depth 的 `Fragment` 配置不一致**：constraint 的 `frontend-static.config.json` 把 `Fragment`
   列为透明 wrapper，并能根据 import binding 识别 alias；metric 的 `metrics.config.json` 没有 `Fragment`，
   metric 只把 `<>...</>` 自动视为透明，普通 `<Fragment>` 会多计一层。
3. **data-access 允许路径不一致**：constraint 放行 `src/api`、`src/services`、`src/hooks` 和嵌套 hooks；
   metric 放行 `src/api`、`src/pages/*Queries.*`、`src/contexts/RouteAccessContext.*`。同一个调用可能通过
   constraint 却拉低 metric，或违反 constraint 却被 metric 计为 approved。
4. **`FE-COMM-M-001` 的 prop-drilling 表述过强**：实现不追踪同一 prop 跨几层传递，只统计单个 JSX
   opening element 的普通 attribute 数；`agent_facing_message` 中“cross-component data flow”的解释只能
   当作代理假设，不能当作已观测事实。
5. **`FE-DUP-C-002` 的 code-block 范围**：YAML 写到 repeated code-block logic，实际候选是 7 种明确形状，
   一般函数/组件之外的任意语句块不会单独生成指纹；通用 Type-1/Type-2 片段重复由 `FE-DUP-M-001`
   补充，但两者不是同一判定引擎。

此外，`frontend-source-analysis.mjs` 仍导出 `analyzeUncachedApiCalls()`，但 manifest、metric YAML 和
implementations 入口均未引用它；当前 pipeline 不会执行这段分析。实现可达性测试关注的是
`implementations/**/*.mjs` 文件级依赖，因此不会把同一共享文件里的未调用 export 判作孤儿文件。

---

## 5. 总体可信度结论

- **接入完整性高**：13 条 constraint 和 7 条 metric 都在 manifest 中注册，并由 Base/T0-T3 的 frontend
  scope 启用；测试同时验证了 selector、YAML、adapter 与实现文件之间的可达链路。
- **Constraint 行为可信度较高**：13 条规则都有统一四象限 fixture，negative 使用完整 finding 快照，
  nearMiss 和 ignored 能直接防止常见误报；专用测试 **61/61 通过**。不过“deep child”“resource”“page
  mapping”等本质上仍是静态启发式，其可信边界应按第 2 节理解，不能推断为运行时语义证明。
- **Metric 实现可运行且有直接测试证据**：7 条均有专用测试，注册测试还真实执行全部实现。公式、常见边界
  和生产文件排除已有覆盖；但每条只有 2 个专用用例，尚未系统覆盖 alias/shadowing、JSX Route、复杂 wrapper、
  自定义 HTTP client 等差异点。
- **不要把同分类 metric 当作 constraint 的连续化版本**：7 条中没有一条完全复用 frontend constraint
  finding 或同一判定函数。尤其 state、route、style、communication、duplication metric 都是独立代理信号；
  data-access 虽然问题最接近，却存在明确的允许路径与调用识别差异。研究报告若同时引用 finding 数和 metric
  数值，应分别写明口径，避免把“不相关”或“方向不同”解释成实现矛盾。

本审计只覆盖 `js-react-frontend` rulepack 的声明、constraint/metric 实现和对应测试；不评价 cross rulepack、
comparison/aggregation、最终统计分析或目标前端项目本身的业务正确性。
