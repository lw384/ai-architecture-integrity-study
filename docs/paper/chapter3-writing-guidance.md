# Chapter 3 — 写作指导（风格 / 逻辑 / 图表）

针对当前草稿 §3.1–3.7 的三方面建议。所有 before/after 均引自草稿实际文字，可直接对照 Word 修改。与 `chapter3-run-reality-changelog.md`（事实修正）互补——本文件**只谈写作**，不重复那里的事实性改动。

---

## 一、写作风格（Writing Style）

### 1.1 全章统一的 5 条风格规则（现在都被违反）

| 规则 | 现状问题 | 处理 |
|---|---|---|
| **人称统一** | 混用 "this study designs" / "We chose" / "our sprint chain" / "we construct" | 学位论文选一种。推荐 **"this study / this chapter / the framework"** 为主语的客观语气；`we` 只在描述主动设计决策时偶用，且全章一致。当前 §3.2 一段内就从 "We therefore focus" 跳到 "this study" 又跳回 "we construct"。 |
| **时态统一** | 方法描述混用现在/过去时："is verified" / "was applied" / "were made" | 方法学章节的**装置描述用现在时**（"the codebase is verified…"），**已执行的一次性动作用过去时**（"approval was confirmed prior to…"）。不要在同一段里跳。 |
| **术语统一** | `sprint` vs `task`；`Structural prompt` vs `Structured`；`concern` vs `dimension` | 选定后全章唯一：建议 **task**（配合三任务事实）、**Structured**（与 Table 3.4 表头一致，§3.5.1 正文写成 "Structural" 是笔误）、**concern**（保留 "dimension" 只作数量单位如 "9 dimensions"）。 |
| **去营销形容词** | "robust foundation" / "comprehensive rulepack" / "pristine state" / "optimal metric baselines" / "state-of-the-art" | 学术审稿人对这类词敏感。删或替换为可验证表述。见 1.2 例。 |
| **不过度断言** | "successfully isolate the agent's impact, **guaranteeing** that any structural deviation…" / "**ensuring** a pristine state" | 实验方法无法 "guarantee"。改为 "is intended to isolate" / "so that any deviation can be attributed to"。这是构念效度问题，审稿人会直接盯。 |

### 1.2 六处代表性 before/after（其余同类照此模式）

**① §3.2.3 过度断言 + 营销词（最该改的一处）**
- Before: *"Before the experiment, this repository is strictly verified against the rulepack… ensuring a pristine state with zero constraint violations and optimal metric baselines. By initialising the testbed in this verified state, we successfully isolate the agent's impact, guaranteeing that any structural deviation observed during the cumulative sprints is exclusively introduced by the agent under test."*
- After: *"Before the experiment, the repository is verified against the rulepack (§3.4) and recorded as a zero-violation baseline. Initialising the testbed in this verified state isolates the agent's contribution, so that any structural deviation observed across the task chain can be attributed to the agent under test rather than to inherited debt."*
- 改动：删 "strictly / pristine / optimal / successfully / guaranteeing / exclusively"；"guarantee/isolate" → "can be attributed to"（可验证的因果表述）。

**② §3.4.1 冗长定语从句**
- Before: *"To capture both overt violations and subtle structural degradation, the framework decomposes into three distinct analytical roles, two of which — Constraints and Metrics — are empirically operationalised in this study, while the third (Judgments) is retained for taxonomic completeness:"*
- After: *"The framework defines three analytical roles. Two — Constraints and Metrics — are operationalised in this study; the third, Judgments, is defined but not implemented (§3.1.2)."*
- 改动：拆成两句；把 scope 说明前指到 §3.1.2，避免此处第二次软化处理。

**③ §3.1.1 开头堆叠**
- Before: *"existing evaluation paradigms — issue-resolution benchmarks such as SWE-Bench (…) and SWE-Bench Pro (…), and evolutionary paradigms such as SWE-EVO (…) — leave task isolation, evaluation reduction to functional signals, and replay-based framing unresolved for the study of long-horizon architectural behaviour."*
- 问题：一句话塞了 3 个基准 + 3 个 gap，读者记不住。
- After（拆为"命名 gap → 逐一对应组件"）：*"Chapter 2 identified three unresolved gaps for studying long-horizon architectural behaviour: task isolation, the reduction of evaluation to functional signals, and replay-based framing. This study addresses each with one dedicated component — a bespoke starter codebase, a three-task chain, and a multi-dimensional rulepack — introduced in turn below."* 然后三个编号段各自**显式回指一个 gap**（现在三段没有点名对应哪个 gap，逻辑链是断的，见二.2）。

**④ §3.3 空头支票句**
- Before: *"The specific tasks and their targeted architectural concerns are detailed in Table 3.2, followed by the comprehensive sprint-by-sprint specifications."*
- 问题："comprehensive sprint-by-sprint specifications" 在正文里根本没出现（承诺未兑现）。
- After：要么补上每任务一段规格（见二.3 逻辑部分，推荐），要么把这句改为 *"Table 3.2 summarises the three tasks and the architectural concerns each is designed to stress; the design rationale for each is given below."* 并确实给出 rationale。

**⑤ §3.5.1 术语/事实混淆句（风格层面：主语堆叠）**
- Before: *"First, all our experiments were powered by two leading LLMs: Claude Sonnet 4.6 (accessed through the Claude Code CLI) and GPT-5.4 (…). We selected these models for their state-of-the-art capabilities, which serve as a representative foundation for our study."*
- After: *"The first independent variable is the coding agent, at two levels: Claude Sonnet 4.6 via the Claude Code CLI and GPT-5.3 via the Codex CLI. Both are current, widely used agentic coding systems, making them representative subjects for this study."*
- 改动：删 "state-of-the-art / leading / powered by"；把 IV 结构讲清楚（"first IV… at two levels"），呼应 §3.5.1 是 Controlled Variables。（模型名事实修正见 change-log G3。）

**⑥ §3.7.2 Summary 收尾流水账**
- Before: *"Together, these three components form the benchmark on which the study operates. The experimental setup (3.5) manipulates the coding agent and the prompt structure while holding all other factors constant, executing four conditions once through the five-sprint chain."*
- After: *"Together, the starter codebase, task chain, and rulepack form the measurement apparatus; the experimental setup (§3.5) manipulates agent and prompt structure while holding all else constant. As stated at the outset (§3.1.2), this apparatus measures architectural integrity, not functional correctness — the boundary within which Chapters 4–5 interpret the results."*
- 改动：收尾回扣 §3.1.2 的 scope，形成首尾呼应（现在结尾没有回到边界声明）。

---

## 二、写作逻辑（Logic / 论证梳理）

### 2.1 全章论证弧线现状 vs 应然

**现状：** 3.1 概览 → 3.2 codebase → 3.3 任务链 → 3.4 rulepack → 3.5 setup → 3.6 threats → 3.7 ethics/summary。骨架是对的（IMRaD 方法学），问题在**关节处的论证不闭合**。

**四个断裂点（按严重度）：**

1. **§3.1.2 Scope Boundary 是空标题** —— 全章最该先说的"测架构完整性、不测功能正确性"从未在前面出现，直到 §3.4.1 才半遮半掩地提 Judgments "retained for taxonomic completeness"。**后果**：读者到 Chapter 4 看到 test pass/fail 会困惑"说好的不测功能呢"。**修**：§3.1.2 补 scope 段（change-log 已给 paste-ready 文本），并让 §3.4.1、§3.7.2 各回指它一次即可，不要三处各软化一遍。

2. **三组件↔三 gap 的映射是"声称"而非"论证"** —— §3.1.1 列了 3 个 gap，又列了 3 个组件，但三个编号段没有任何一句说"组件 X 关闭 gap Y"。**修**：每个编号段开头一句点名它对应哪个 gap（starter codebase ↔ 归因/stack-coverage；task chain ↔ task-isolation + replay-based framing；rulepack ↔ evaluation-reduction-to-functional-signals）。这是本章"为什么正好是这三件"的核心论证，现在缺。

3. **§3.3 承诺 "sprint-by-sprint specifications" 却没有** —— 表 3.2 只给了 concern ID，没有任何一句解释"为什么这个任务会压这些 concern 而不是别的"。**后果**：Chapter 4 出现某 concern 的 violation 时，读者无法回溯"这是被设计出来的预期，还是意外"。**修**：每任务补一段（business framing → targeted concerns → *why this task stresses them* → 与上一任务的纠缠点）。T2/T3 的 rationale change-log 已给示例。这是本章"任务是有意累积轨迹而非三个独立任务"这一核心前提的唯一落点。

4. **Judgments 处理分散、语气软** —— "retained for taxonomic completeness" 出现两次，都是回避式措辞。**修**：在 §3.1.2 一次性、明确地说"设计了但因时间未实现"，其余各处只做交叉引用。诚实且集中的 limitation 陈述比两处暗示更有说服力。

### 2.2 段内逻辑：三处"顺序反了"

- **§3.4 内部顺序**：现在是 Layers(3.4.1) → Concerns(3.4.2) → Nomenclature(3.4.3) → Table 3.3。建议在 3.4.2 之后、Table 3.3 之前**插入 Metric Selection Principle**（minimum covering set / complexity-over-volume），否则读者看 Table 3.3 每个 concern"为什么只选这一个 metric"时没有依据。（该段 paste-ready 文本在 `chapter3-table3.2-revision.md`。）
- **§3.5**：Controlled Variables(3.5.1) → Prompt Design(3.5.2) → Execution Protocol(3.5.3)。合理，但**数据/轨迹的 schema 没有落点**——读者看 Figure 3.1 说"3-point trajectory"却不知道一个 point 是什么数据结构。建议在 3.5.3 执行协议**之前**插一小节 Data Capture & Trajectory Schema（run_local vs trajectory_cumulative + execution_status），让读者先有词汇再看流程图。
- **§3.6 Threats**：四类效度顺序（construct/internal/external/conclusion）符合 Wohlin，保留。仅需把 proxy-metric、cross-rulepack experimental 两条并入 construct validity（现在这两条只在实现里存在，正文没承认）。

### 2.3 "承诺—兑现"检查表（逻辑闭合用）

编辑时逐条确认每个 forward-reference 都有落点：

| 正文承诺 | 现在是否兑现 | 动作 |
|---|---|---|
| §3.3 "comprehensive sprint-by-sprint specifications" | ✗ 无 | 补每任务一段 |
| §3.4.3 "exhaustive rule text provided in Appendix [X]" | 待定 | 确认 Appendix 存在并填编号 |
| §3.5.1（新增）"CLI invocation commands in Appendix [X]" | ✗ 待建 | 建 Appendix |
| §3.4.1 Judgments "future extensions" | ✓ 但语气软 | 集中到 §3.1.2 |
| §3.1.2 scope → Chapter 4 functional signal | ✗ scope 空 | 补 scope 段并点名 test_result.json |

---

## 三、图、表建议（Figures & Tables）

### 3.1 现有图表逐一裁决

| 编号 | 现状 | 裁决 | 说明 |
|---|---|---|---|
| **Table 3.1** | 标题写"Specific Tasks…"，内容却是 Constraints/Metrics 两行 | **改造** | 标题错（与 3.2 撞名）。两种处理：(a) 重命名为"Table 3.0a Measurement Layers & Operationalisation Status"并补 Judgments 行（推荐，同时兑现 scope）；(b) 内容太短，直接并入 §3.4.1 正文一句话，取消成表。 |
| **Table 3.2** | 5 行（T1–T5），旧 concern ID，空"Sources"列 | **重画** | 删 T4，T5 移出成 §3.3.3 文字；3 行；concern ID 更新；"Sources"列换成"Design Rationale"一句话指向正文（否则该列无意义）。这是把"任务为何压这些 concern"可视化的地方。 |
| **Table 3.3** | 18/20 行混乱、旧 ID、缺 BE-TEST | **重画（核心表）** | 用 `chapter3-table3.2-revision.md` 的 19 行版整体替换。这是全章分量最重的表，必须准。 |
| **Table 3.4** | Prompt block 组成，Minimal/Structured | **保留** | 内容正确。仅正文 §3.5.2 需补"为何 API Contract + Guidance 作为一个联合处理"的论证段（表本身不动）。 |
| **Figure 3.1** | workflow 图，编码旧五任务设计 | **改标签，不重画** | k=1…3、3-point trajectory、19 concerns、effort=high、T1–T3 标签、T5 移出循环成独立终端框。同时**削减与正文重复**：图后那段"At the start of each condition…"几乎复述图内文字，正文只留图未表达的（no-reset 的因果 + 四条件各一次），其余交给图。 |

### 3.2 是否新增图表——我的取舍（章约 3000 词，图表偏密）

outline 提议了 Table 3.0a/3.0b、Figure 3.A/3.B。我的建议是**只加两个高价值视觉，其余降级为句子**：

- **值得加 · Figure 3.A（Task Entanglement）**：三框 T1→T2→T3 + 箭头标注"上一任务交给下一任务的具体产物"（T1→T2: Deal↔Company/Contact 关系；T2→T3: linked-Contacts 作为 T3 转移前置条件）。**理由**：本研究"有意累积轨迹"这一核心前提，目前只在文字里被"声称"，这是唯一能"展示"它的地方，回报最高。
- **值得加 · Table 3.0a（Layers × Operationalised）**：3 行小表，放 §3.1.2。**理由**：以最低成本把 scope 边界钉死，防 Chapter 4 误读。可与被改造的 Table 3.1 合并为同一个。
- **可降级为句子 · Table 3.0b（Baseline Verification）**：一句话"baseline 经全 rulepack 验证为零违规，存档于 reports/baseline/harness_evaluation.json"即可，不必成表（除非你想把 19 concern 的 clean pass 逐行展示给 examiner 当证据——那才值一个表）。
- **可降级 · Figure 3.B（Concerns×Layers Status Map）**：想法好（一眼看出哪些是 proxy / experimental），但和 Table 3.3 信息重叠，3000 词章里显冗。**替代**：在 Table 3.3 里给 proxy 行加一个上标符号 + 表注，达到同样"诚实标注 instrument 成熟度"的效果，省一张图。

### 3.3 图表通用改进点

- **两处撞名标题**（Table 3.1 与 3.2 现在同名）必须消除。
- **Figure 3.1 与其后正文重复度过高** —— 图能表达的就别在正文再讲一遍；正文只补图无法表达的因果/约束。
- **所有表加一句 lead-in**：表不能"裸放"，前面一句话交代"这张表回答什么问题"（如 Table 3.3 前："Table 3.3 gives, for each of the nineteen concerns, the binary constraint and the continuous metric that operationalise it."）。
- **数字一致性**：全章 concern 数（19）、任务数（3）、轨迹点数（3）、条件数（4）必须处处一致——现在图/表/正文出现过 18、20、19 三个 concern 数和 3、5 两个任务数。

---

## 优先级（如果时间有限，按此顺序做）

1. **逻辑**：填 §3.1.2 scope（空标题）+ 每任务 rationale 段（§3.3）——这两处是"洞"，不是"瑕疵"。
2. **图表**：重画 Table 3.2（3 行）、整体替换 Table 3.3（19 行）、改 Figure 3.1 标签。
3. **风格**：全章跑一遍人称/时态/术语统一 + 删 6 类营销/过度断言词（1.2 的六例是模板）。
4. **锦上添花**：Figure 3.A（entanglement）、Table 3.0a（layers）。
