# Frontend Metrics Literature Review

Frontend 版的最小覆盖矩阵——7 个 constraint 类目（`harness/rulepacks/js-react-frontend/rules/`），每类目只保留一个代表指标。格式与 `metrics-literature-review.md`（backend 版）一致：**参考文献 → 作用 → 计算方式**，计算方式全部直接读自源码，不凭印象转写。

**Compiled:** 2026-08-17 | **Verification:** 引用均经过实时检索确认（标题/作者/期刊卷期，能查到 DOI 的都做了交叉核对）。没有学术锚点的指标明确写"无"，不硬凑引用。

---

## Part 1 — Frontend Metrics Matrix

从每个类目现有的两个候选指标里选一个：优先选**复杂度/边界类**指标而非**规模/计数类**指标（和 backend SIZE 类目选圈复杂度而不选参数计数是同一条原则），DUP 类目现有零覆盖，补一个新指标。

---

### COM — `render-decision-depth-average` (`FE-COM-M-001`)

**参考文献**：Harrison, W. A., & Magel, K. I. (1981). A complexity measure based on nesting level. *ACM SIGPLAN Notices, 16*(3), 63–74. https://doi.org/10.1145/947825.947829 —— 提出用控制结构的嵌套层级衡量理解复杂度，弥补 McCabe 圈复杂度“只数分支、不管嵌套深浅”的盲区；这与 React 条件渲染中需要同时维护多层分支上下文的认知负担直接对应，而不是把普通 JSX 父子结构误当作控制流。

**作用**：直接覆盖 `FE-COM-C-002`（单个 React 组件的渲染决策嵌套不超过 3 层，每组件最多一条 finding）；同时可作为 `FE-COM-C-001`（文件行数 ≤300 行）的弱代理。它只测会选择 JSX 子树的 `if`/`switch`/ternary/logical 控制流，普通布局组件、Fragment、map、文本 fallback 和非 JSX prop 条件不计，因此比原来的 JSX 标签祖先深度更接近真实可读性负担。两个候选（`component-line-average` vs `render-decision-depth-average`）里选它。

**计算方式**（`harness/adapters/computed-metrics/implementations/frontend/FE-COM-M-001.mjs` → `analyzeRenderDecisionDepth`）：
1. 使用 frontend inventory 识别所有生产 React 组件；同一文件中的多个组件分别计算，test/spec/story/generated 排除
2. 将会返回、赋值或选择 JSX 的 `IfStatement`、`SwitchStatement`、`ConditionalExpression` 和 `LogicalExpression` 识别为 render decision；连续 logical chain 视为同一层，`else-if` 保持同级
3. 对每个组件取任意渲染路径上的最大嵌套决策层数 `D(c)`；结构性 JSX 嵌套不参与计算
4. `averageDepth = Σ D(c) / 生产组件总数`；无组件时为 0
5. raw details 同时输出每组件 `maxDecisionDepth`/`decisionCount`，以及全局 `maxDepth`、`p90Depth` 和 `componentsOverLimit`

---

### STATE — `context-provider-ratio` (`FE-STATE-M-001`)

**参考文献**：无。仓库自定义的状态分布检查，未见对应的独立学术指标——本质是把两种状态管理方式（本地 hook vs. context）的用量做比例化，性质更接近工程规范而非通用理论构念。

**作用**：观察本地 state hook 与 context provider 的总体分布变化。它不判断 state hook 是否位于 `FE-STATE-C-001` 明确配置的 stateless/presentational boundary，也不判断 provider 是否位于 `FE-STATE-C-002` 的批准位置，因此只是同一状态管理分类下的辅助趋势信号，不能替代两条 constraint 的 finding。context 占比发生明显变化时，应结合具体位置违规解读，而不能把升高或降低本身视为架构改善。两个候选（`context-provider-ratio` vs `context-consumer-per-provider-ratio`）里，前者的分母覆盖面更大，选它。

**计算方式**（`harness/adapters/computed-metrics/implementations/frontend/FE-STATE-M-001.mjs` → `analyzeStateDistribution`）：
1. 遍历所有 frontend 文件，AST 扫描两类信号：`useState`/`useReducer`（含 `React.useState` 形式）调用计为一次"本地 state hook"；JSX 里形如 `<XXX.Provider>` 的开标签（`JSXMemberExpression` 且属性名为 `Provider`）计为一次"context provider"
2. `contextRatio = contextProviders / (localStateHooks + contextProviders)`（两者皆无时记 0）

---

### ROUTE — `route-param-complexity` (`FE-ROUTE-M-001`)

**参考文献**：无。文献里没有对应的"路由参数复杂度"指标，是项目自定义的接口设计复杂度检查。

**作用**：⚠️ 本表覆盖最弱的一环——`FE-ROUTE-C-001`（路由定义须集中在 `src/routes`）、`FE-ROUTE-C-002`（每条路由须映射到 page 组件）本质是**位置/映射**问题，这个指标测的是"路由动态参数堆得有多复杂"，是相邻但不完全对齐的维度。两个候选（`route-count` vs `route-param-complexity`）里选后者，是因为参数复杂度增长比单纯路由数量增长更能提示设计在失控地变复杂，而不只是功能变多了；但这终究是代理信号，不是约束本身的直接测量，需要在论文里如实标注局限（和 backend TEST 类目的处境一样）。

**计算方式**（`harness/adapters/computed-metrics/implementations/frontend/FE-ROUTE-M-001.mjs` → `analyzeRoutes`）：
1. 只扫描 `routes_root`（默认 `src/routes`）下的文件，解析每个带 `path` 属性的对象字面量（路由声明对象）
2. 取 `path` 字符串，按 `/` 切分后统计以 `:` 开头的动态参数段数量
3. `averageParamCount = Σ(每条路由的参数数) / 路由总数`

---

### STYLE — `style-mixing-ratio` (`FE-STYLE-M-001`)

**参考文献**：无。项目自定义的样式一致性检查，未见对应学术指标。

**作用**：直接覆盖 `FE-STYLE-C-001`（不要用 raw JSX `style`，优先 MUI `sx`/`styled` 等既定抽象）——衡量有多少文件在同一个文件里混用了多种样式机制，混用本身就是"没有统一遵循一种既定抽象"的信号。两个候选（`style-mixing-ratio` vs `global-style-rule-count`）里，前者诊断面更广（能感知 `FE-STYLE-C-001` 的精神），后者只是全局 CSS 规则数这一单点计数，选前者。

**计算方式**（`harness/adapters/computed-metrics/implementations/frontend/FE-STYLE-M-001.mjs` → `analyzeStyleMixing`）：
1. 对每个文件 AST 扫描四类样式信号：JSX 属性名为 `sx`、`className`、`style` 的 attribute，以及对 `styled(...)` 函数的调用
2. 每个文件收集出现过的信号种类集合（去重），种类数 > 1 即判定该文件"混用"
3. `ratio = 混用文件数 / 总文件数`

---

### DATA — `data-access-wrapping-ratio` (`FE-DATA-M-001`)

**参考文献**：Parnas, D. L. (1972). On the criteria to be used in decomposing systems into modules. *Communications of the ACM, 15*(12), 1053–1058. https://doi.org/10.1145/361598.361623 —— 和 backend DOM 类目引用的是同一篇：网络请求这个"实现细节"该被封装在谁背后，本质仍然是信息隐藏原则在前端数据访问层的应用。

**作用**：直接覆盖 `FE-DATA-C-001`（网络调用只能出现在批准的 API/数据模块里）——衡量有多少比例的 `fetch`/`axios` 调用真的老实待在批准的数据访问模块内，而不是散落在组件里到处直接发请求。两个候选（`data-access-wrapping-ratio` vs `useeffect-missing-dependency-ratio`）里选前者：后者测的是 `useEffect` 缺依赖数组，属于**代码正确性/bug 模式**（会导致闭包过期），而不是本研究定义下的**架构边界**问题，前者更贴合"架构完整性"这个研究焦点。

**计算方式**（`harness/adapters/computed-metrics/implementations/frontend/FE-DATA-M-001.mjs` → `analyzeDataAccessWrapping`）：
1. 对每个文件 AST 扫描两类网络调用：直接 `fetch(...)` 调用；以及 `axios`（含具名/别名导入）的调用
2. 判定该文件路径是否匹配 `approved_data_paths`（默认 `src/api/**`、`src/pages/*Queries.*`、`src/contexts/RouteAccessContext.*`）
3. `ratio = 落在批准路径内的调用次数 / 总调用次数`（无调用时记 1，视为满分）

---

### COMM — `prop-drilling-average` (`FE-COMM-M-001`)

**参考文献**：Fowler, M. (1999). *Refactoring: Improving the Design of Existing Code*. Addison-Wesley. —— 书中定义的 Long Parameter List / Message Chains 系列坏味道，是"数据被迫沿调用链/对象链层层透传"这一类耦合问题的经典分类学出处；prop drilling 是这一类坏味道在 React 组件树里的具体表现形式。

**作用**：间接对应 `FE-COMM-C-001`（禁止全局事件总线）——事件总线往往是 prop drilling 痛到一定程度后的"逃生舱口"，这个指标测的正是逼近那个临界点的压力信号。两个候选（`prop-count-average` vs `prop-drilling-average`）里选后者：前者测单组件接口宽度，性质上更接近 backend SIZE（参数/接口膨胀），是相邻但更窄的维度；后者才是约束背后真正的动因。

**计算方式**（`harness/adapters/computed-metrics/implementations/frontend/FE-COMM-M-001.mjs` → `analyzePropDrilling`）：
1. 对每个文件 AST 扫描所有 JSX 开标签（`JSXOpeningElement`），统计其 JSX 属性（`JSXAttribute`）个数
2. 属性数 ≥ `prop_drilling_threshold`（默认 4）的元素，记为一个"候选"，累加其 prop 数
3. `averagePropFanout = Σ(候选元素的 prop 数) / 候选元素总数`

---

### DUP — Clone Ratio（**建议新增，目前无 frontend 实现——但 backend 已有可直接复用的实现**）

**参考文献**：
- Juergens, E., Deissenboeck, F., Hummel, B., & Wagner, S. (2009). Do code clones matter? In *Proceedings of the 31st International Conference on Software Engineering (ICSE 2009)* (pp. 485–495). IEEE. https://doi.org/10.1109/ICSE.2009.5070547
- Roy, C. K., Cordy, J. R., & Koschke, R. (2009). Comparison and evaluation of code clone detection techniques and tools: A qualitative approach. *Science of Computer Programming, 74*(7), 470–495. https://doi.org/10.1016/j.scico.2009.02.007

**作用**：填补 `FE-DUP-C-001`（单一资源所有者）、`FE-DUP-C-002`（单一权威实现）目前**零指标覆盖**的空白——`FE-DUP-C-002` 的规则描述原文就写着 *"repeated API, form, validation, transformation, state, component, function, or code-block logic"*，和 Clone Ratio 要测的东西完全对上。

**计算方式**：好消息是 backend 侧已经把这个指标实现出来了——`harness/adapters/computed-metrics/implementations/backend/BE-DUP-M-001.mjs`（`clone-ratio`）：
1. 对生产代码做 token 化，标识符/字面量归一化为占位符（`«ID»`/`«LIT»`），保留关键字/标点原样，让改名不改结构的 Type-2 克隆和原始 Type-1 克隆哈希一致
2. 按固定窗口大小（`min_tokens`，默认 50）滑窗，对每个窗口的 token 序列哈希分桶
3. 同一个桶里的窗口对，逐 token 向后扩展匹配长度，达到 `min_tokens` 或 `min_lines`（默认 5）阈值即判定为一次克隆，标记双方覆盖的代码行
4. `ratio = 被克隆覆盖的行数 / 总 token 承载行数`

该实现已经原生支持 `.tsx` 解析（`jsx: filePath.endsWith('.tsx')`），frontend 版本理论上只需要把 `source_roots` 配置指向 `frontend/src` 直接复用，不需要另起一套算法。

---

## Part 2 — Coverage Summary（Frontend）

| 类目 | Constraint 条数 | 选定 Metric | 状态 | 覆盖方式 |
|---|---|---|---|---|
| COM | 2 | `render-decision-depth-average` | ✅ 已实现 | 直接（与 C-002 复用每组件决策深度）+ 弱代理（对 C-001） |
| STATE | 2 | `context-provider-ratio` | ✅ 已实现 | 直接，同时反映两条约束 |
| ROUTE | 2 | `route-param-complexity` | ✅ 已实现 | **代理**（测复杂度，约束测位置/映射，非等价） |
| STYLE | 2 | `style-mixing-ratio` | ✅ 已实现 | 直接 |
| DATA | 2 | `data-access-wrapping-ratio` | ✅ 已实现 | 直接 |
| COMM | 1 | `prop-drilling-average` | ✅ 已实现 | 间接（约束的诱因信号，非约束本身） |
| DUP | 2 | Clone Ratio | ❌ **建议新增**（可直接移植 backend 实现） | 直接，目前零实现 |

---

## Part 3 — 与其他文档的关系

- 通用架构侵蚀理论、AI agent 实证文献（不针对单个指标，支撑研究前提本身）→ `docs/methodology/metrics-literature-review.md` Part 3，不在此文档重复
- Backend 侧的对应矩阵、选择逻辑（"复杂度优先于规模"这条统一原则的最初出处）→ `docs/methodology/metrics-literature-review.md` Part 1
- 整体分析思路、每步该看什么图表 → `docs/methodology/analysis.md`
