# Metrics Literature Review

Grounds the harness's architectural-integrity metrics (`harness/adapters/computed-metrics/`) in established software engineering literature, plus the AI-coding-agent empirical work motivating the study's core claim.

**Compiled:** 2026-08-16 | **Verification:** every citation below was located and confirmed via live web search/fetch (title, authors, venue, and — where available — DOI cross-checked against publisher/arXiv/ACM pages). No entry is included on memory alone; where a metric has no defensible academic anchor, that is stated explicitly rather than forcing a citation.

---

## Part 1 — Backend Metrics Matrix

This is the finalized **minimum covering set** for the 9 backend constraint categories (`harness/rulepacks/ts-nestjs-backend/rules/`): one metric per category, each entry giving its reference (if any), what it targets, and exactly how it is computed — read directly from source, not paraphrased from memory.

Each entry follows this order: **参考文献 → 作用 → 计算方式**.

---

### STRUCT — `module-composition-violation-ratio` (`BE-STRUCT-M-001`)

**参考文献**：无。这是仓库自定义的结构性检查（模块目录是否具备该模块类型所要求的文件层），未见对应的学术指标定义，直接照搬约束规则 `BE-STRUCT-C-001-module-composition` 的判定逻辑。

**作用**：检测每个后端模块目录是否"配齐"了该类型模块应有的文件层——例如一个带 `*.entity.ts` 的实体模块，理应同时存在 controller、service、repository 三层文件；如果 agent 改动后只留下部分文件（比如删掉了 repository 却继续在 service 里裸写 SQL），这里就会被标记为"不完整模块"。

**计算方式**（`harness/adapters/computed-metrics/implementations/module-composition-violation-ratio.mjs`）：
1. 在 `module_roots`（默认 `backend/src/module(s)`、`src/module(s)`）下逐个子目录寻找 `*.module.ts`（排除 `app.module.ts`）
2. 按目录名分类："以 `-link`/`-relation` 结尾" → 关联模块（要求 controller + service）；"含 `*.entity.ts`" → 实体模块（要求 controller + service + repository）；否则 → 纯服务模块（仅要求 service）
3. 检查每个必需层文件 `{moduleBase}.{layer}.ts` 是否存在，缺一个即判该模块"不完整"
4. `ratio = 不完整模块数 / 模块总数`（无模块时记 0）

---

### DEP — `dependency-violation-density` (`BE-DEP-M-001`)

**参考文献**：
- Tarjan, R. E. (1972). Depth-first search and linear graph algorithms. *SIAM Journal on Computing, 1*(2), 146–160. https://doi.org/10.1137/0201010 —— 循环依赖检测部分直接实现的就是这篇论文提出的强连通分量（SCC）算法
- Melton, H., & Tempero, E. (2007). An empirical study of cycles among classes in Java. *Empirical Software Engineering, 12*(4), 389–415. https://doi.org/10.1007/s10664-006-9033-1 —— "为什么循环依赖是架构健康问题"的实证支撑

**作用**：同时监控 `BE-DEP-C-001`（分层方向：controller→service→repository）与 `BE-DEP-C-004`（禁循环依赖）两条约束，把"依赖图形状是否符合分层架构"折算成一个连续密度值，而不是单纯的通过/不通过判定。

**计算方式**（`harness/adapters/computed-metrics/implementations/dependency-violation-density.mjs`）：
1. 从 dependency-cruiser 报告收集全部导入边 `(source → target)`
2. 按文件名后缀判定层级（`.controller.ts`/`.service.ts`/`.repository.ts`），若某条边的方向不在 `allowed_transitions`（默认 `controller→service`、`service→service|repository`、`repository→repository`）之内，记一次 **MVC 方向违规**
3. 用 Tarjan 算法（代码里的 `strongConnect` 函数）对整张依赖图求强连通分量；任何大小 > 1 的分量、或存在自环的节点，其内部所有边都记为 **循环依赖边**
4. `value = (MVC方向违规边数 + 循环依赖边数) / 总导入边数`

---

### DOM — `cross-module-deep-import-count` (`BE-DOM-M-001`)

**参考文献**：Parnas, D. L. (1972). On the criteria to be used in decomposing systems into modules. *Communications of the ACM, 15*(12), 1053–1058. https://doi.org/10.1145/361598.361623 —— "模块该隐藏什么、暴露什么"的信息隐藏原则，是这条约束（禁止跨模块深导入内部文件）的理论源头。

**作用**：统计有多少次导入"越过"了目标模块的公开边界，直接伸手进别的模块内部实现细节——这是模块封装被破坏的直接信号,也是（架构侵蚀 architecture erosion）里"实际实现偏离既定边界"的一种具体形式。

**计算方式**（`harness/adapters/computed-metrics/implementations/cross-module-deep-import-count.mjs`）：
1. 复用同一份 dependency-cruiser 报告，只保留被 dep-cruiser 规则 `BE-DOM-C-001-no-cross-module-deep-import` 标记过的边（即已经在约束层判定为"深导入"的边，这里不重新跑规则，只是计数汇总）
2. `value = 命中该规则的边总数`（原始计数，非比例——因为深导入本应为零，任何非零值都值得关注）
3. 按 `module_root_pattern`（默认 `^src/modules?/([^/]+)/`）解析每条边的来源/目标模块名，供细粒度归因

---

### DUP — Clone Ratio（**建议新增，目前无实现**）

**参考文献**：
- Juergens, E., Deissenboeck, F., Hummel, B., & Wagner, S. (2009). Do code clones matter? In *Proceedings of the 31st International Conference on Software Engineering (ICSE 2009)* (pp. 485–495). IEEE. https://doi.org/10.1109/ICSE.2009.5070547 —— 实证证明重复代码不是风格问题而是缺陷预测因子（52% 的克隆被不一致修改，其中 15% 导致真实故障）
- Roy, C. K., Cordy, J. R., & Koschke, R. (2009). Comparison and evaluation of code clone detection techniques and tools: A qualitative approach. *Science of Computer Programming, 74*(7), 470–495. https://doi.org/10.1016/j.scico.2009.02.007 —— 克隆检测技术分类法（Type-1/2/3/4），是下面计算方式的算法依据

**作用**：填补 `BE-DUP-C-001`（单一资源所有者）、`BE-DUP-C-002`（单一策略实现）、`BE-DUP-C-003`（禁等价重复代码）这三条约束目前**零指标覆盖**的空白——约束层能抓到"是否存在重复"，但抓不到"重复的严重程度随迭代如何变化"。这在 AI agent 场景下尤其关键：GitClear (2026) 的产业数据显示 agent 辅助开发中复制粘贴行为在两年内增长约 4 倍。

**计算方式**（建议实现，仓库内目前没有对应 `.mjs` 文件）：
1. 对 backend 生产代码（排除测试文件）做 token 化或 AST 子树归一化
2. 用滑动窗口检测长度 ≥ 阈值（例如连续 ≥5 行或 ≥50 token）的重复片段，对应 Roy et al. 分类法里的 Type-1（完全一致）/Type-2（改了变量名/字面量）克隆
3. `ratio = 被判定为重复片段覆盖的代码行数 / 生产代码总行数`

---

### ERR — `exception-unification-violation-density` (`BE-ERR-M-001`)

**参考文献**：无。这是仓库自定义的异常处理一致性检查，未见对应的独立学术指标——它本质是把三条具体规则的命中数做加权密度化，性质上更接近工程规范而非通用理论构念。

**作用**：把 `BE-ERR-C-001`（禁止在 service 抛 HTTP 异常）、`BE-ERR-C-002`（只能抛 AppException）、`BE-ERR-C-003`（禁止静默 catch）这三条规则的命中数，按 service 文件规模归一化成一个密度值，衡量异常处理规范被破坏的"浓度"而不只是"有没有"。

**计算方式**（`harness/adapters/computed-metrics/implementations/exception-unification-violation-density.mjs`）：
1. 直接复用 constraints 层已经产出的三条规则命中数（`findings_by_rule[ruleId].length`），不重新跑 AST 扫描
2. 按 `weights` 加权求和：`Σ(count_i × weight_i)`（默认权重均为 1）
3. 分母 = 遍历 `targetDir/src` 统计的 `*.service.ts` 文件数（排除 `node_modules`/`dist`/`build`），至少取 1 避免除零
4. `value = 加权命中总数 / service 文件数`

---

### ROUTE — `route-prefix-violation-ratio` (`BE-ROUTE-M-001`)

**参考文献**：无。纯 API 命名规范检查（全局前缀 + kebab-case），是项目约定而非学术构念,文献 10 类里没有对应项。

**作用**：衡量对外暴露的 HTTP 端点有多少比例偏离了既定的路由规范（缺失全局 `api` 前缀，或路径不是 kebab-case）——路由是前后端契约的一部分，命名漂移会直接影响 API 的可预测性和一致性。

**计算方式**（`harness/adapters/computed-metrics/implementations/route-prefix-violation-ratio.mjs` → `analyzeRoutes`）：
1. 解析 `main.ts`，检查是否调用了 `setGlobalPrefix('api')`
2. 遍历所有 `*.controller.ts`，取 `@Controller(path)` 的类级路径和每个 HTTP 方法装饰器（`@Get`/`@Post`/…）的路径
3. 用正则校验路径每一段是否符合 kebab-case（`^[a-z0-9]+(-[a-z0-9]+)*$`，路径参数 `:xxx` 单独放行）
4. 若缺全局前缀，或类级/方法级路径任一不符合 kebab-case，该端点记为违规
5. `ratio = 违规端点数 / 端点总数`

---

### SIZE — Cyclomatic Complexity（**建议替换** `method-parameter-violation-ratio`，目前无实现）

**参考文献**：McCabe, T. J. (1976). A complexity measure. *IEEE Transactions on Software Engineering, SE-2*(4), 308–320. https://doi.org/10.1109/TSE.1976.233837

**作用**：衡量单个方法内部的分支路径复杂度——比现有的"参数数量"指标更贴近"这个方法是不是做了太多事"这一核心问题；参数膨胀往往只是复杂度膨胀的一个弱相关副产品，圈复杂度直接测的是控制流本身。

**计算方式**（建议实现，替换现有的参数计数逻辑）：
- `V(G) = E − N + 2P`（边数 − 节点数 + 2×连通分量数），实践中等价于 `V(G) = 1 + 分支判断语句数`（每个 `if`/`while`/`for`/`case`/`&&`/`||`/三元表达式 +1）
- 对 controller/service/repository 每个非构造函数方法逐一计算，取全体方法的平均值，或"超阈值方法占比"作为归一化输出

> **现有实现对照**（`method-parameter-violation-ratio.mjs`，本轮建议由上面的指标取代）：解析同一批文件里每个非构造函数方法的参数个数，`ratio = 参数数超过 max_parameters（默认 3）的方法数 / 方法总数`。逻辑保留在仓库中，但作为 SIZE 类目的代表指标建议切换为圈复杂度。

---

### CONTRACT — `dto-validator-coverage` (`BE-CONTRACT-M-001`)

**参考文献**：Meyer, B. (1992). Applying design by contract. *IEEE Computer, 25*(10), 40–51. https://doi.org/10.1109/2.161279 —— "契约"（前置/后置条件、不变量）作为组件间协作的显式规范，是这条指标要衡量的"输入契约是否被严格校验"的理论出处。

**作用**：衡量请求 DTO 的字段有多大比例真正挂了 class-validator 校验装饰器——这是 `BE-CONTRACT-C-002`（DTO 必须用 class-validator）和 `BE-CONTRACT-C-003`（可选属性也要校验取值）两条规则的连续化版本,直接覆盖 4 条 CONTRACT 约束里的 2 条（另外 2 条——迁移文件要求、全局 ValidationPipe 白名单——本质是二元全局配置判定，不适合做比例型指标，留给 constraint 层判定即可，不算覆盖缺口）。

**计算方式**（`harness/adapters/computed-metrics/implementations/dto-validator-coverage.mjs` → `analyzeDtoValidatorCoverage`）：
1. 在 `dto_roots`（默认 `src/modules`）下找所有 `dto/*.ts` 生产代码文件
2. 解析出被判定为"请求 DTO"的 class（`isRequestDtoClass`），收集该文件里 class-validator 的导入名
3. 对每个非 static 属性字段，检查其装饰器列表里是否有一个是 class-validator 校验装饰器（如 `@IsString`、`@IsOptional` 等）
4. `ratio = 有校验装饰器的字段数 / 总字段数`（无字段时记 1，视为满分）

---

### TEST — `mock-per-test-case` (`BE-TEST-M-002`)

**参考文献**：Fowler, M. (2004). *Inversion of control containers and the dependency injection pattern*. https://martinfowler.com/articles/injection.html —— 依赖注入/控制反转的经典阐述，是 `BE-TEST-C-001`（禁止在测试里直接 `new Repository()`）这条约束的理论依据：测试应该通过 DI 注入替身，而不是绕开容器直接构造真实依赖。

**作用**：`BE-TEST-C-001` 本身是二元判定（有没有直接构造 repository），`mock-per-test-case` 是目前仓库里能找到的最接近的连续代理信号——如果 agent 绕开 DI 直接实例化依赖，测试用例通常会连带表现出 mock 使用密度偏低。**这是全表里覆盖最弱的一环**：它测的是"平均每个测试用例用了多少次 mock"，不是"是否直接构造了 repository"本身，两者只是相关，不是等价，需要在论文里如实标注为代理指标而非直接指标。

**计算方式**（`harness/adapters/computed-metrics/implementations/mock-per-test-case.mjs` → `analyzeMockUsage`）：
1. 遍历 `test_roots`（默认 `src`、`test`）下的 `*.spec.ts`/`*.test.ts` 文件
2. 统计 `it(...)`/`test(...)` 调用次数为"测试用例数"
3. 统计 mock 相关调用：`jest.mock()`、`jest.spyOn()`，以及对象字面量里出现的 `useValue`/`useFactory`/`useClass` 属性，计为"mock 使用次数"
4. `ratio = mock 使用次数 / 测试用例数`（若测试用例数为 0，指标记为 `null`，即不适用）

---

## Part 2 — Coverage Summary（Backend）

| 类目 | Constraint 条数 | 选定 Metric | 状态 | 覆盖方式 |
|---|---|---|---|---|
| STRUCT | 1 | `module-composition-violation-ratio` | ✅ 已实现 | 直接 |
| DEP | 4 | `dependency-violation-density` | ✅ 已实现 | 直接（含 Tarjan SCC 环检测） |
| DOM | 2 | `cross-module-deep-import-count` | ✅ 已实现 | 直接（覆盖第 1 条，第 2 条经架构上的深导入模式间接覆盖） |
| DUP | 3 | Clone Ratio | ❌ **建议新增** | 直接，目前零实现 |
| ERR | 3 | `exception-unification-violation-density` | ✅ 已实现 | 直接 |
| ROUTE | 1 | `route-prefix-violation-ratio` | ✅ 已实现 | 直接 |
| SIZE | 1 | Cyclomatic Complexity | ❌ **建议替换现有实现** | 直接 |
| CONTRACT | 4 | `dto-validator-coverage` | ✅ 已实现 | 直接覆盖 2 条，另 2 条为二元判定留给 constraint 层 |
| TEST | 1 | `mock-per-test-case` | ✅ 已实现 | **代理**（相关但非等价） |

---

## Part 3 — 补充文献：研究前提与外部对照基准

以下文献不直接对应某一个 backend metric 的计算公式，而是给整个研究"AI agent 迭代修改会导致架构退化"这个前提，以及"退化"这个概念本身，提供理论/实证支撑。写论文 Introduction / Related Work 时用得上。

**架构侵蚀理论：**

- Perry, D. E., & Wolf, A. L. (1992). Foundations for the study of software architecture. *ACM SIGSOFT Software Engineering Notes, 17*(4), 40–52. https://doi.org/10.1145/141874.141884 —— 最早提出"架构侵蚀"（architecture erosion）概念：既定架构与实际实现之间的偏离
- Lehman, M. M. (1980). Programs, life cycles, and laws of software evolution. *Proceedings of the IEEE, 68*(9), 1060–1076. https://doi.org/10.1109/PROC.1980.11805 —— 复杂度递增定律：E 型系统的复杂度会随迭代自然增加，除非主动投入精力抑制
- van Gurp, J., & Bosch, J. (2002). Design erosion: Problems and causes. *Journal of Systems and Software, 61*(2), 105–119. https://doi.org/10.1016/S0164-1212(01)00152-2 —— 实证归纳设计侵蚀的成因（进度压力、架构知识传递缺失、局部临时修补）
- Fontana, F. A., Pigazzini, I., Roveda, R., Tamburri, D. A., Zanoni, M., & Di Nitto, E. (2017). Arcan: A tool for architectural smells detection. In *2017 IEEE International Conference on Software Architecture Workshops (ICSAW)* (pp. 282–285). IEEE. https://doi.org/10.1109/ICSAW.2017.16 —— 定义 Unstable Dependency / Hub-Like Dependency 等可检测的架构坏味道

**AI coding agent 与代码质量退化（2023–2026 实证研究）：**

- Zhu, Y., Tsantalis, N., & Rigby, P. C. (2026). AI-generated smells: An analysis of code and architecture in LLM- and agent-driven development. arXiv:2605.02741 [cs.SE]. https://arxiv.org/abs/2605.02741 —— 提出 "Reasoning-Complexity Trade-off" 与 "Volume-Quality Inverse Law"，是本研究核心假设最直接的文献锚点
- Agarwal, S., He, H., & Vasilescu, B. (2026). AI IDEs or autonomous agents? Measuring the impact of coding agents on software development. arXiv:2601.13597 [cs.SE]. https://arxiv.org/abs/2601.13597 —— 静态分析告警 +18%、认知复杂度 +39%（agent 首次引入时）
- Sawada, S., Shirai, T., Kashiwa, Y., Yamaguchi, K., Iwata, H., & Iida, H. (2026). To what extent does agent-generated code require maintenance? An empirical study. arXiv:2605.06464 [cs.SE]. https://arxiv.org/abs/2605.06464
- Mazloomzadeh, I., Morovati, M. M., & Khomh, F. (2026). How do AI coding agents contribute to software development? An empirical study of agentic pull requests. arXiv:2607.21832 [cs.SE]. https://arxiv.org/abs/2607.21832
- Siddiq, M. L., Majumder, S. H., Mim, M. R., Jajodia, S., & Santos, J. C. S. (2022). An empirical study of code smells in transformer-based code generation techniques. In *2022 IEEE 22nd International Working Conference on Source Code Analysis and Manipulation (SCAM)* (pp. 71–82). IEEE.
- Ehsani, R., Rawal, S., Cai, Y., & Chatterjee, P. (2026). Faster code, deeper debt? A multivocal literature review on technical debt and its early signs in LLM-assisted software development. *ACM Transactions on Software Engineering and Methodology*. https://doi.org/10.1145/3820165
- GitClear. (2026, January). *AI Copilot code quality: 2025 look back at 12 months of data*. https://www.gitclear.com/ai_assistant_code_quality_2025_research —— ⚠️ Tier 3 灰色文献（无具名作者、非同行评审），仅作补充语境，不作为主要实证证据

**Not found / 未采用**（anti-fabrication）：

- 一篇 *Empirical Software Engineering* (2026) 关于 LLM 修复代码质量问题的论文（DOI `10.1007/s10664-026-10858-8`）卡在 Springer 付费墙后，拿不到完整作者名单，未编号引用
- jscpd 本身没有对应学术论文，克隆检测的算法依据用 Roy, Cordy & Koschke (2009) 代替，工具本身引用其官方文档，不作为学术来源
