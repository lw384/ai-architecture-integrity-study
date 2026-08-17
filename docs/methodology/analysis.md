# Analysis Methodology

本文档回答一个问题：**拿到 harness 产出的 `evaluation.json` 之后，应该按什么顺序、用什么方法、画什么图，才能从数据里挖出 AI agent 在架构完整性维度的具体表现？**

这是一份分析思路文档，不是分析脚本本身——目的是先把"从总体到具体"的推理链条想清楚，再据此实现具体的聚合/绘图代码。

---

## 0. 目的与范围

**研究问题**：在持续、多步骤的 AI agent 修改下，软件系统的架构完整性如何演变？这种演变在不同 agent、不同 prompting 策略、不同任务复杂度下是否存在系统性差异？

**范围声明**：本研究聚焦**架构完整性**（architecture integrity），不覆盖功能正确性。评估体系的方法论设计里包含 `judgments` 层（用于对照每个任务的 `SHALL` 验收条件评估功能完成度），但受限于实验落地时间，该层未实现——所有分析结论都只能回答"架构变得更好还是更差"，不能回答"功能做对了没有"。这个边界在 §8 单独说明,不在每一节分析里重复强调。

**分析哲学**：五个递进阶段，从"数据能不能信"到"数据里藏着什么故事"：

```
Stage 0  数据清洗与基线校准   → 这批数据干不干净、能不能直接用
Stage 1  描述性总览           → 整体上违规集中在哪
Stage 2  横向比较             → 不同条件（agent/策略）之间差在哪
Stage 3  纵向趋势             → 同一条件下，随迭代怎么变
Stage 4  深层机制挖掘         → 上面三步看不出来的、需要跨字段联合分析的现象
```

每一节都按 **目的 → 做法 → 推荐图表 → 期望结论** 的顺序展开。

---

## 1. 数据基础

分析建立在 `experiment/workspace/run_*/evaluation.json` 之上，聚合前先记清楚它的形状：

- **三层结构**：`layers.constraints`（二元 pass/fail + findings 文本）、`layers.metrics`（连续值，含 `score`、`delta_vs_baseline`、`status`）、`layers.judgments`（设计存在，本研究未产出数据，见 §8）
- **两种 delta**：`deltas.run_local`（当次改动相对上一个快照的增量）、`deltas.trajectory_cumulative`（相对最初 baseline 的累积增量）——纵向分析（Stage 3）用后者，横向单点比较（Stage 1、2）用前者
- **`manifest.json`**：`status`（`evaluated`/`partial`/...）和 `events` 数组（`agent_started`/`agent_completed`/`evaluation_completed`），可作为"agent 有没有跑完全程"的免费二元信号
- **实验设计的自变量轴**：`agent`（Claude/Codex/…）× `task`（T0–T5）× `strategy`（minimal/structured）；把同一个 `agent×strategy` 沿 `task` 序列排开，就是第四个轴——迭代序号，供纵向分析用

三个必须提前知道的数据陷阱，处理办法留到 Stage 0：

1. **baseline 自身不干净**——实测中 baseline 在没有任何 agent 触碰的情况下，就已经对 frontend JSX 深度规则产生 33 条违规。任何"总违规数"都会把这笔预存债务错误地记到 agent 头上。
2. **metrics 层可能整条报错**——实测中 `dependency-graph-size` 这类指标出现过 `status: "error"`（找不到 dep-cruiser 报告），此时 `score` 是 `null`，绝不能当 0 处理。
3. **架构完整性数据和任务完成情况来自完全不同的文件**——`harness_evaluation.json` 只回答"架构变得更好还是更差"，不知道 agent 有没有按协议正常收尾、生成的功能有没有通过独立验收测试。这两件事的信号在 `execution.json` / `test_execution.json` / `test_result.json` 里，必须单独核实，不能和架构退化的结论混在一起。

---

## 2. Stage 0 — 数据清洗与基线校准

在看任何"结论"之前，先确认数据本身可信。

### 2.1 Harness 可靠性核查

**目的**：区分"agent 把架构写坏了"和"我的评估工具自己跑崩了"——这两者必须分开统计，否则会把工具故障误读成架构退化信号。

**做法**：遍历所有 run 的 `layers.metrics[*].status`，统计 `error` 状态出现的频率，按指标名分组，看是不是集中在某几个指标（比如依赖图相关的，往往因为 `depcruise-raw.json` 生成失败而连带报错）。

**推荐图表**：条形图——x 轴为指标名，y 轴为该指标在全部 run 中的 error 出现次数/占比。

**期望结论**：得到一份"可信指标清单"和"高故障率指标清单"。后续所有分析只用前者的数值型结果；后者要么单独记录为"工具局限性"，要么在正文分析前先修复。如果某个指标的 error 率高到影响样本量，这本身就是方法论章节里值得写一笔的局限。

### 2.2 预存债务扣除（净新增违规）

**目的**：把 baseline 自带的违规和 agent 新引入的违规分开，避免高估或错误归因。

**做法**：对每个 run，用 `deltas.run_local` / `deltas.trajectory_cumulative` 而不是原始 `findings` 计数作为分析对象——这两个字段本身就是"相对基线的增量"，已经完成了这一步扣除，不需要手工再算一遍；但要在方法论里明确写出"我们用的是净增量而非绝对计数"，并用一次 baseline-vs-baseline 自比对（理论上 delta 应为 0）验证 delta 计算管线本身没有 bug。

**推荐图表**：不需要图，一张对照表即可——「类目｜baseline 原始违规数｜agent 后原始违规数｜净新增（delta）」。

**期望结论**：确认后续所有分析都建立在"净新增"而不是"总量"之上；顺带验证 delta 计算逻辑本身可信。

### 2.3 任务完成度校验（Task Completion Gate）

**目的**：`harness_evaluation.json` 只测架构完整性，完全不知道"agent 有没有跑完、生成的功能有没有通过验收测试"。这两件事都可能因为执行层面的原因失真——agent 没有按协议正常收尾（比如没有输出 `[TASK_COMPLETED]`），或者独立的功能验收套件本身跑挂了（`error`，不是 `fail`）。如果不单独核实，容易把执行层面的问题误读成架构完整性的结论。

**做法**：对每个 `session × task`，联合读取三份与 `harness_evaluation.json` 平级的文件：
- `execution.json`（agent 执行记录）：`metrics.status`（success/failed）、`completion_marker_found`、`agent_reported_error`、`num_turns`、`total_cost_usd`、`duration_seconds`
- `test_result.json`（功能验收结果，标准化后）：`status`（pass/fail/error/skipped）
- `test_execution.json`（功能验收原始记录）：仅在需要下钻某个 `error`/`fail` 的具体原因时使用（是哪个 suite、install 阶段还是 test 阶段失败）

产出一张 `session × task` 粒度的核对表。**注意边界**：`test_status` 不作为架构完整性分析的过滤条件——按 §0 的范围声明，功能是否正确和架构是否完整是两个独立问题，功能验收 `fail`（真实的功能缺陷）不代表这次架构评估的数据不可用；但 `error`（验收基础设施本身没跑起来）和 agent 未按协议完成，需要在正文或附录里明确标注，避免读者误解为"这个条件下架构分数低是因为代码根本跑不起来"。

**推荐图表**：不强制要求图，一张核对表即可（处理方式同 §2.2）。如果需要图，可以画一个按 `task_id` 分组的 `test_status` 堆叠条形图（展示验收套件覆盖率和通过率），或者把 `num_turns` / `total_cost_usd` / `duration_seconds` 做成箱型图——这类图更适合放进论文的实验设置/成本附录，不属于 Results 正文。

**期望结论**：确认所有进入 Stage 1 及以后分析的 run，都来自协议上正常完成的 agent 执行；同时保留一份"这次架构评估对应的实现功能是否可用"的旁证信息，供讨论"架构完整性 vs 功能正确性"是否存在反直觉组合时引用——即便 §8 的四象限分析要等 `judgments` 层实现才能真正做，这里先把功能维度的原始信号积累起来。

---

## 3. Stage 1 — 描述性总览

数据清洗完，先建立"整体上问题出在哪"的第一印象，不做任何条件切分。

### 3.1 违规热力图

**目的**：9 个 backend 类目（STRUCT/DEP/DOM/DUP/ERR/ROUTE/SIZE/CONTRACT/TEST）里，AI agent 的违规是均匀分布还是集中在少数几类？

**做法**：以 `agent × 类目` 为矩阵，格子填该类目在该 agent 全部 run 中的平均净违规率（用 Stage 0.2 的净增量）。

**推荐图表**：热力图（heatmap），行=agent，列=9 个类目，颜色深浅=违规率。

**期望结论**：识别 AI 的系统性架构盲区——大概率不是均匀弱，而是集中在某几类（例如预期 DUP、SIZE 会明显更差，因为这两类分别对应"复制粘贴"和"方法臃肿"这类 agent 常见反模式，参见 `metrics-literature-review.md` 里 GitClear (2026) 的产业数据）。这张图是全文"AI 架构弱点长什么样"的第一张证据图。

### 3.2 指标分布总览

**目的**：在看条件差异之前，先知道每个连续指标本身的分布形态——是集中在低值偶有极端离群，还是普遍偏高。

**做法**：对每个已实现的连续指标（`dependency-violation-density`、`cross-module-deep-import-count`、`exception-unification-violation-density` 等），汇总所有 run 的取值分布。

**推荐图表**：箱型图或小提琴图，每个指标一个箱子，全部并排放在一张图里（数值量纲不同的话分两组子图：比例型 0–1 一组，计数型一组）。

**期望结论**：确定每个指标的"正常波动范围"和离群值阈值，为 Stage 4.1（隐性腐化）里"显著劣化"的判定标准提供依据（比如用四分位距之外定义"显著"，而不是拍脑袋定阈值）。

---

## 4. Stage 2 — 横向比较

在同一时间切片上，比较不同实验条件之间的差异。

### 4.1 Prompt 策略对比（minimal vs structured）

**目的**：把架构规则明确写进 prompt（`_structured` 变体），是否显著降低违规率？回答"约束应该放在 prompt 里，还是必须靠外部 harness 强制"这个方法论问题。

**做法**：对每个 `agent × task` 组合，配对比较 `_minimal` 和 `_structured` 两个 run 的净违规率。样本量通常不大，优先用 Wilcoxon 符号秩检验而不是假设正态分布的配对 t 检验；同时报告效应量（比如中位数差值），不要只报 p 值。

**推荐图表**：斜率图（slope chart）——每个 `agent×task` 组合画一条从 minimal 值连到 structured 值的线段，线段整体向下倾斜说明 structured 有效，线段方向混乱说明没有稳定效果。

**期望结论**：两种可能的结论都有价值——如果 structured 显著更好，支持"prompt 层面的架构声明有效"；如果差异有限甚至无差异，这是一个更有冲击力的发现："仅靠 prompt 声明规则不足以约束 agent 行为，必须有 harness 这类外部强制机制"，直接呼应整个研究的立项动机。

### 4.2 Agent 间"架构人格"对比

**目的**：如果测了多个 agent，它们的架构弱点是不是"整体强弱有别"，还是"各有各的坑"？

**做法**：把 3.1 热力图里每个 agent 对应的一行（9 个类目的违规率向量）单独拿出来比较。

**推荐图表**：雷达图（radar/spider chart），每个 agent 一条多边形轮廓线，9 个类目为轴，叠在同一张图上对比形状而不只是面积大小。

**期望结论**：预期不同 agent 的轮廓形状（而非整体大小）有明显差异——即"没有绝对更好的 agent，只有不同的弱点分布"。这个发现比单纯排名"哪个 agent 更好"更有研究价值，也更适合写成一个独立的讨论段落。

---

## 5. Stage 3 — 纵向趋势

固定 `agent × strategy`，沿任务序列（T0 → T1 → T2 → T3 → T5）看指标怎么变，这是整个研究"long-term software evolution"这个卖点真正落地的地方。

### 5.1 Trajectory 曲线形状分析

**目的**：退化是匀速的、加速的，还是会趋于平台甚至回落？这三种形状分别对应完全不同的理论解释。

**做法**：对每个类目/指标，以任务序号为 x 轴，`deltas.trajectory_cumulative` 为 y 轴，按 `agent × strategy` 分组画折线。重点看曲线的**二阶变化**（斜率是否随 x 增大），而不只是终点数值。

**推荐图表**：折线图，x=任务序号，y=累积净违规/指标值，每条线代表一个 `agent×strategy` 组合；如果同组合有重复 run，可以加阴影表示的置信区间带。

**期望结论**：三种可能的曲线形状分别对应：
- **线性递增**——退化匀速发生，符合"每一步都引入恒定量的架构损耗"的简单叠加模型
- **加速上翘（凸函数）**——退化在自我加速，呼应 Lehman (1980) 的复杂度递增定律：系统越乱，agent 越难在乱系统里做出干净的改动，形成正反馈
- **平台期甚至回落**——agent 在某个复杂度水平上表现出"自我稳定"甚至顺手重构的能力，这是最反直觉、也最值得单独讨论的发现

这张图/这组结论建议作为论文 Results 的核心图之一。

---

## 6. Stage 4 — 深层机制挖掘

前三个 Stage 都是单一字段或单一切分维度的分析；这一节的三个现象都需要**联合读取两个以上字段**才能看到，是"总体到具体"里最具体的一层。

### 6.1 隐性腐化（Silent Decay）

**目的**：二元 `constraints` 全部 pass，不代表架构没有变差——连续 `metrics` 可能在同一个 run 里已经开始劣化。这是能直接证明"为什么需要 metrics 层、不能只靠 constraints"的核心证据，建议作为全文最重要的单点发现。

**做法**：对每个 run，交叉 `layers.constraints[*].status` 和该 run 里每个 metric 的 `delta_vs_baseline` 方向，划出四类：
1. constraints 全 pass 且所有 metrics 同向改善或持平
2. **constraints 全 pass 但至少一个 metric 显著劣化**（用 3.2 的分布定的阈值判定"显著"）——这就是隐性腐化
3. constraints 出现 fail（无论 metrics 如何）
4. 数据不足以判定（存在 error 状态指标）

**推荐图表**：堆叠条形图，x 轴为 `agent` 或 `task`，y 轴为 run 数量，堆叠段按上面四类着色。

**期望结论**：量化"隐性腐化"发生的比例——如果第 2 类占比不低，就是本研究方法论设计（二元约束 + 连续指标双层评估）价值的直接证据：只看 pass/fail 会漏掉一大批真实存在的架构退化。

### 6.2 违规空间分布：集中 vs 扩散

**目的**：同一次 run 里的违规，是集中在少数几个文件（agent 对某个局部改动失控），还是分散在整个改动范围（agent 对整体设计理解存在系统性偏差）？这两种失败模式需要完全不同的干预方式。

**做法**：用指标 `details` 数组里的文件级信息（比如 `module-composition-violation-ratio` 的每模块明细），对每个 run 算"违规文件数 / 改动涉及的文件总数"的比例，或直接算基尼系数衡量违规在文件间的集中程度。

**推荐图表**：洛伦兹曲线（Lorenz curve）或简单直方图——x 轴按文件的违规贡献排序累积占比，越靠左上角越集中。

**期望结论**：判定 AI 架构失误的"颗粒度"——集中型失败可能靠更严格的 diff 范围限制就能缓解；扩散型失败说明问题出在 agent 对整体架构的理解上，需要更强的上下文注入或更频繁的中途校验。

### 6.3 指标相关性结构

**目的**：9 个 backend 指标是不是在测同一件事的不同侧面？比如 DEP 和 DOM 都源自同一份依赖图报告，很可能高度相关，那么论文里逐个类目单独报数字就是冗余的。

**做法**：对全部 run 的 9 个指标值算相关系数矩阵；如果想进一步降维，做一次主成分分析（PCA），看能不能提炼出 1–2 个"潜在架构健康因子"。

**推荐图表**：相关系数热力图；如果做了 PCA，再加一张 biplot（前两个主成分的散点图，叠加各指标的载荷向量）。

**期望结论**：确认哪些指标是真正独立的信号、哪些是同一现象的冗余测量。这既能简化 Results 的呈现（不用堆 9 张图），也能反过来验证 Stage 0（数据清洗）阶段没有遗漏——如果两个理论上无关的指标出现异常高相关，可能提示计算逻辑有共享 bug。

### 6.4 Agent 自评校准度（Self-Assessment Calibration）

**目的**：T5 让 agent 在看不到 Harness 客观结果的前提下，自己审查 T1–T3 结束后的 workspace 并指出架构一致性问题。这份自评本身不是架构完整性的度量，但可以回答一个不同的问题——**agent 对自己造成的架构问题有没有自知之明**。这需要联合读取 T5 的自评结果和同一个 commit（`reviewed_from_tag`，目前恒为 `task-T3-done`）上 Harness 的客观 finding，属于本节"跨字段联合分析"的范畴。

**做法**：
- **数量校准**：对比 agent 自报的 finding 数和 Harness 在同一个 commit 上的绝对 finding 数（§2.2 的 `absolute` 口径）。如果 agent 报告"没有问题"（`NO_ARCHITECTURE_CONSISTENCY_ISSUES_FOUND`）但 Harness 在那个 commit 上有真实违规，记为 **盲区（blind spot）**；如果 agent 报了问题但数量远少于 Harness 的客观计数，记为**低估（under-reported）**。
- **位置校准**：agent 自报 finding 里提到的文件路径，和 Harness 在同一 commit 上真正标记违规的文件，按文件名做粗粒度匹配（自由文本和结构化规则 finding 没法做到精确匹配，这里只做启发式的"点没点对地方"检验，不追求语义级对齐）。

**推荐图表**：不强制要求图，一张对照表即可（自报数 vs Harness 客观数 vs 位置匹配率）。样本积累到一定量后，可以画一个散点图——x 轴 Harness 客观 finding 数，y 轴 agent 自报 finding 数，理想校准应该落在 y=x 附近；点越靠近 x 轴（y 远小于 x），说明 agent 对自己的架构问题越没有自知之明。

**期望结论**：这是一个关于"AI 能不能被信任做自我审查"的独立发现，不影响 §2–§6 其他小节对架构完整性本身的结论。如果盲区或低估比例高，说明不能把"让 agent 自己审查代码"当作 Harness 之外的替代机制——这本身也呼应了整个研究"为什么需要外部强制约束"的立项动机。

---

## 7. Stage 间的依赖关系

```
Stage 0（数据清洗）
   │  必须先做，否则后面所有结论都建立在脏数据上
   ▼
Stage 1（描述性总览）──────┐
   │                        │ 为 Stage 4.1 的"显著"阈值提供依据
   ▼                        │
Stage 2（横向比较）          │
   │                        │
   ▼                        │
Stage 3（纵向趋势）          │
   │                        │
   ▼                        ▼
Stage 4（深层机制挖掘：隐性腐化 / 空间分布 / 相关性结构）
```

如果时间有限，**优先级建议**：Stage 0 → Stage 1.1（热力图）→ Stage 4.1（隐性腐化）→ Stage 3.1（trajectory 曲线）。这四步组合起来已经能撑起一个完整的 Results 叙事：数据可信 → 问题在哪 → 为什么二元约束不够 → 问题怎么随时间演化。Stage 2 和 Stage 4.2/4.3 是加分项，样本量或时间不够时可以放进 Future Work。

---

## 8. 范围外方向：架构 × 执行关联（Future Work）

方法论设计的第三层 `judgments` 用于对照每个任务的 `SHALL` 验收条件评估功能完成度，但本研究未实现该层（见 §0 范围声明）。如果未来补上，自然的下一步分析是：

**架构完整性 × 执行正确性四象限**——x 轴为 judgments 层产出的功能合规率，y 轴为 Stage 1–4 里已经算出的综合架构健康分数，每个 run 一个点，按 `agent × strategy` 上色。最值得深挖的是"执行正确性高、架构完整性低"这个象限——即"功能做对了但代码是垃圾"，可与 Zhu, Tsantalis & Rigby (2026) 提出的 Volume-Quality Inverse Law（见 `metrics-literature-review.md`）做直接对照。这张图和这个假设检验，是本研究方法论上已经设计好、但需要先把 `judgments` 层实现出来才能画的下一步工作。

---

## 9. 与其他文档的关系

- 每个 Stage 用到的具体指标定义、计算公式、文献依据 → `docs/methodology/metrics-literature-review.md`
- 指标与 backend 约束类目的对应关系 → 同上文档 Part 1、Part 2
- `evaluation.json` / `manifest.json` 的字段与产物版本控制策略 → `docs/methodology/run-artifact-policy.md`
