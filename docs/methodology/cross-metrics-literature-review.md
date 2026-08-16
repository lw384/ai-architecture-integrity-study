# Cross-Stack Metrics Literature Review

Cross-stack 版的最小覆盖矩阵——`harness/rulepacks/cross/` 现有 7 个类目里，只保留最具特点、互不冗余的 3 个：**CROSS-EP**（端点是否存在）、**CROSS-TYPE**（请求契约字段对齐）、**CROSS-PROP**（变更传播完整性）。舍弃 CROSS-METHOD、CROSS-NAME、CROSS-ERR、CROSS-DUP 的取舍理由见本文档末尾。

`cross` rulepack 目前 `migration_status: experimental`，三条约束都已存在但 `metrics: []` 是空的——本文档同时覆盖**约束（constraints）该怎么定/要不要调**和**指标（metrics）该怎么设计**两层，格式与 `metrics-literature-review.md`（backend）、`front-metrics-literature-review.md`（frontend）一致：**参考文献 → 作用 → 计算方式**。

**Compiled:** 2026-08-16 | **Verification:** 引用均经过实时检索确认（标题/作者/期刊卷期，能查到 DOI 的都做了交叉核对）。没有学术锚点的指标明确写"无"，不硬凑引用。

---

## Part 1 — Cross-Stack Metrics Matrix

### CROSS-EP — 端点是否存在

#### Constraint 设计（沿用现有 `CROSS-EP-C-001`，建议补 1 处）

判定逻辑不变：`cross-static/frontend-endpoint-missing-backend-route` 命中一次即 fail（`aggregation: any`）——这条本来就该是"存在即失败"的硬门槛，不需要留灰度。一个前端调用打不到真实后端路由，本身就是运行时会直接 404 的 bug，不是"架构品味"问题。

**建议补**：`severity: error`（现有 yaml 缺这个字段——backend/frontend 的规则文件都有，cross 三条都没有）。三条里这条最应该标 error：它是唯一一条不需要任何推断、纯粹靠字符串/AST 匹配就能确定的运行时故障信号。

#### Metric 设计 — Endpoint Resolution Miss Ratio

**参考文献**：
- Espinha, T., Zaidman, A., & Gross, H.-G. (2014). Web API growing pains: Stories from client developers and their code. In *2014 Software Evolution Week – IEEE Conference on Software Maintenance, Reengineering, and Reverse Engineering (CSMR-WCRE)* (pp. 84–93). IEEE.
- Sohan, S. M., Anslow, C., & Maurer, F. (2015). A case study of web API evolution. In *2015 IEEE International Conference on Web Services*.

两篇都是实证研究"客户端开发者如何因为 API 变化而遭殃"，直接支撑"前端调用点解析失败率"这个连续化视角——客户端的痛苦不是二元的，是随 API 漂移程度递增的。

**作用**：把"有没有断掉的调用"连续化成"断了多大比例"。二元约束只能告诉你这次 run 里踩没踩雷；这个指标能告诉你雷区面积随迭代是在扩大还是收窄。

**计算方式**（需要 `cross-static` adapter 补一项枚举能力，见 Part 3）：
1. 静态扫描 frontend 全部 API 调用点（`fetch`/`axios`/项目里约定的 API 封装函数调用），得到调用点总数 `N`
2. 对每个调用点，尝试匹配到一个已知的 backend 公开路由；匹配不上的记为未解析
3. `value = 未解析调用点数 / N`（`lower_is_better`）

---

### CROSS-TYPE — 请求契约字段对齐

#### Constraint 设计（沿用现有 `CROSS-TYPE-C-001`）

三个 tool_rule_id（`frontend-route-param-arity-mismatch` / `frontend-query-key-mismatch` / `frontend-body-key-mismatch`）汇总进一条约束，`aggregation: any` 命中其一即 fail——这个聚合方式是对的，和 backend ERR 类目的做法一致（三条具体规则合并成一个约束层判定，细粒度留给 metric 层拆开）。

**建议补**：`severity: error`，理由同 CROSS-EP——字段级契约不对齐一样是运行时会炸的问题（缺字段校验失败、多字段被后端拒绝），不是可以"warn 一下就过"的架构品味问题。

#### Metric 设计 — Contract Field Drift Density

**参考文献**：同 CROSS-EP 引用的 Espinha et al. (2014)——该研究明确记录了客户端开发者遭遇最多的痛点之一就是参数/字段级的契约变化（不只是端点整体消失），直接对应这条指标要测的"字段级漂移"。

**作用**：把三条子规则的命中数按严重程度加权，折算成一个连续密度值——比如 body 字段缺失通常比 query 字段缺失更容易直接导致请求被拒绝，值得给更高权重，和 backend `exception-unification-violation-density` 的加权密度设计是同一个模式。

**计算方式**：
1. 按 tool_rule_id 加权求和：`Σ(weight_i × count_i)`，`i ∈ {route-param-arity-mismatch, query-key-mismatch, body-key-mismatch}`（默认权重先都设 1，后续按经验值调整，例如 body-key 给更高权重）
2. 分母 = 前端所有**可静态解析的请求契约位点总数**（路由参数位点 + query 字段位点 + body 字段位点的总枚举数，不只是命中违规的那些）
3. `value = 加权命中总数 / 契约位点总数`

---

### CROSS-PROP — 变更传播完整性

#### Constraint 设计（沿用现有 `CROSS-PROP-C-001`，建议重新考虑 severity）

`aggregation: any`，命中 `cross-static/api-facing-change-not-fully-propagated` 即 fail——判定逻辑不变。

**建议**：`severity: warn` 而不是 error。前两条（EP/TYPE）是纯机械匹配（A 是否等于 B）；CROSS-PROP 需要先"推断"某个 resource 理论上应该有哪些 counterpart surface，这一步本身带解释性，误判风险比另外两条高，标 error 可能因推断偏差而阻断本不该阻断的场景。

#### Metric 设计 — Propagation Incompleteness Ratio

**参考文献**：Gall, H., Hajek, K., & Jazayeri, M. (1998). Detection of logical coupling based on product release history. In *Proceedings of the International Conference on Software Maintenance (ICSM '98)* (pp. 190–198). IEEE.

这篇是"逻辑耦合"（logical coupling）分析的奠基论文——通过版本历史找出"经常一起变化"的文件/模块，即使它们之间没有静态依赖关系。CROSS-PROP 本质是这个概念的反向应用：**已知**哪些跨栈文件属于同一个 resource（理应共同变化），检查这次改动是否真的让它们一起变了。这是三个指标里理论出处最精确对应的一个。

**作用**：把"有没有漏改的对应面"连续化成"漏了多大比例"。这是三个指标里最能体现"agent 改一边忘一边"这一核心现象的量化版本，和整个研究的主题绑定最紧。

**计算方式**（⚠️ 与前两个性质不同，见下）：
1. 对本次 run 中被判定为"API-facing"的改动，识别涉及的 resource（比如某个 DTO/controller/route 被改了）
2. 枚举该 resource 已存在的全部 counterpart surface（例如：backend DTO ↔ frontend type 定义 ↔ frontend API 调用 ↔ frontend 表单校验）
3. `value = 本次改动中未同步更新的 counterpart surface 数 / 该 resource 关联的 counterpart surface 总数`

**必须是 diff 驱动，不是快照驱动**——EP 和 TYPE 都能在任意一次静态代码快照上直接算出来（"现在这份代码里，前端调用能不能解析到路由"），但 CROSS-PROP 天然需要"改动前 vs 改动后"的对比才有意义（"这次改动有没有传播完整"是个动作，不是状态）。实现顺序建议**最后做**——先把 EP、TYPE 这两个静态可算的落地，PROP 需要额外接一层 diff 机制，工程量更大。

---

## Part 2 — Coverage Summary（Cross-Stack）

| 类目 | Constraint | 建议 severity | Metric | 计算基础 | 状态 |
|---|---|---|---|---|---|
| CROSS-EP | `CROSS-EP-C-001` | error | Endpoint Resolution Miss Ratio | 静态快照 | ❌ 均建议新增（constraint 已存在，metric 待实现，severity 待补） |
| CROSS-TYPE | `CROSS-TYPE-C-001` | error | Contract Field Drift Density | 静态快照 | ❌ 同上 |
| CROSS-PROP | `CROSS-PROP-C-001` | warn | Propagation Incompleteness Ratio | **diff 驱动**（改动前后对比） | ❌ 同上，且实现顺序最后 |

**舍弃的 4 个类目及理由**（回顾）：

| 类目 | 舍弃理由 |
|---|---|
| CROSS-METHOD | 本质是 CROSS-EP + CROSS-TYPE 覆盖范围内的更窄的机械残差 |
| CROSS-NAME | 更偏"表层症状"——命名漂移往往是 CROSS-DUP/CROSS-PROP 已经在测的问题的副产品 |
| CROSS-ERR | 命中率天花板低（只有前端显式处理特定错误码才触发），样本量支撑不了太多结论 |
| CROSS-DUP | 判定标准最模糊（"是否存在权威源"是解释性判断），且和 CROSS-PROP 概念高度重叠 |

---

## Part 3 — 三个指标共通的实现缺口

1. **`cross-static` adapter 目前只吐"违规事件"，不吐"总检查位点数"**——三个指标的分母（调用点总数 / 契约位点总数 / counterpart surface 总数）都需要 adapter 具备"完整枚举"能力，而现在 `evidence_sources` 里描述的只有命中 `tool_rule_ids` 时的 violation event。这和 backend `dto-validator-coverage` 需要先枚举全部 DTO 字段而不只是违规字段，是同一类工程要求。
2. **Fixture 债务**：三条 constraint 目前都没有 positive/negative/near-miss/ignored 四类 fixture（backend/frontend 都有），要正式纳入评估体系需要补齐，把 `migration_status` 从 `experimental` 升级到对应的 `-constraint-protocol-v2`。
3. **Severity 字段缺失**：三个 yaml 现在都没写 `severity`，Part 1/2 里给了建议值（EP/TYPE = error，PROP = warn），需要补进去。
4. **实现顺序**：CROSS-EP、CROSS-TYPE 静态可算，优先做；CROSS-PROP 需要 diff 机制，放最后。

---

## Part 4 — 与其他文档的关系

- Backend 侧矩阵、"复杂度/边界优先于规模"这条选择原则的最初出处 → `docs/methodology/metrics-literature-review.md` Part 1
- Frontend 侧矩阵 → `docs/methodology/front-metrics-literature-review.md` Part 1
- 通用架构侵蚀理论、AI agent 实证文献（不针对单个指标，支撑研究前提本身）→ `docs/methodology/metrics-literature-review.md` Part 3，不在此文档重复
- 整体分析思路、每步该看什么图表 → `docs/methodology/analysis.md`
