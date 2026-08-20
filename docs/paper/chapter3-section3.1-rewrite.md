# §3.1 Research Design — 定稿重写 + 全篇学术用词准则

两部分:(A) §3.1 的 paste-ready 定稿(flat 结构,无 3.1.1/3.1.2,论证链闭合,已并入所有事实修正与 J-not-substitute 口径);(B) 面向整篇论文的用词准则,附草稿实例。

---

## A. §3.1 Research Design（paste-ready，替换现 §3.1 全部内容）

> ### 3.1 Research Design
>
> This study is designed as a controlled longitudinal experiment: it observes how the architectural integrity of a full-stack system evolves as autonomous coding agents modify it across a sequence of development tasks. Two variables are manipulated — the coding agent, at two levels, and the prompt structure, in a minimal and a structured variant — while the starter system, the task sequence, and the evaluation instrument are held constant. Crossing the two variables yields four conditions; each is executed once and produces an independent trajectory of measurements across the task sequence.
>
> The design responds directly to the gaps established in Chapter 2. Existing issue-resolution and evolutionary benchmarks (§2.2–2.3) leave three conditions unaddressed for the study of long-horizon architectural behaviour: task isolation, the reduction of evaluation to functional pass/fail signals, and a replay-based framing that reconstructs historical commits rather than generating forward evolution. Beyond these, architecture-compliance tooling remains comparatively immature on the JavaScript/TypeScript stack, and manual architectural review does not scale to the rate at which agents produce code. The apparatus is assembled to address each of these in turn. A bespoke starter codebase, verified free of violations before the experiment (§3.2), removes the confound of inherited technical debt, so that any deviation observed downstream can be attributed to the agent rather than to pre-existing flaws. A cumulative task chain, executed without resetting the workspace between tasks (§3.3), generates genuine forward evolution — each task inherits the exact state its predecessor produced — rather than replaying archived commits or evaluating tasks in isolation. A multi-dimensional rulepack calibrated for the JavaScript/TypeScript stack (§3.4) measures architectural conformance through signals that a functional test suite is not designed to observe. These three components are operated by an automated harness, which supplies the evaluation throughput that manual review cannot.
>
> **Scope and measurement boundary.** The primary object of measurement is architectural integrity — whether the layered client–server structure, its data contracts, and its cross-stack consistency survive iterative modification. Functional behaviour is not disregarded: each task carries a delivery-and-verification protocol whose test suite must pass, and this pass/fail signal serves as a task-completion gate and is reported as context (Chapter 4). It is deliberately a coarse gate rather than a graded outcome; the magnitude of the functional pass rate is not itself an object of study, and no architectural conclusion is drawn from it. The evaluation instrument is organised as three layers — Constraints, Metrics, and Judgments (§3.4.1). The first two are operationalised in this study. The Judgments layer, which would interpretively grade an agent's output against each task's acceptance criteria — the fine-grained functional- and quality-compliance evaluation that the coarse test gate does not provide — is designed into the instrument and present in its data schema, but is not implemented here; its operationalisation is left to future work (§[7/8]). The test gate is therefore not a substitute for the Judgments layer, and the two are not conflated. Table 3.1 records which signals are operationalised.
>
> The remainder of this chapter specifies each component in turn: the starter codebase (§3.2), the task chain (§3.3), and the rulepack (§3.4), followed by the experimental setup that operates them (§3.5), the threats to validity (§3.6), and ethical considerations (§3.7).

### Table 3.1（重命名并扩为 4 行；取代现在那张被误标为 "Specific Tasks" 的两行表）

**Table 3.1** Measurement signals and their operationalisation status

| Signal | What it captures | Operationalised in this study? |
|---|---|---|
| Constraints (rulepack) | Binary, mechanically decidable architectural violations | Yes |
| Metrics (rulepack) | Continuous architectural drift (ratios / densities) | Yes |
| Judgments (rulepack) | Interpretive grading against task acceptance criteria | No — designed only; see future work (§[7/8]) |
| Functional test gate (outside rulepack) | Coarse task completion via test-suite pass/fail | Yes — as a gate and context, not a study outcome |

**为什么这版闭合了原稿的四处断裂**(对照上一轮诊断):
1. **假平行消除** —— 不再摆"三缺口↔三部件";改为每个缺口都有归宿、每个部件都有来处,数量不强行相等。
2. **孤儿前提认领** —— JS/TS 工具缺口 → rulepack 校准;manual-review 跟不上 → automated harness。都显式回应了。
3. **力度补齐** —— 第一段先定"受控纵向实验 + 2×2 + 每条件一次轨迹",不再像装置目录。
4. **Scope 落地** —— 收尾段按 test-gate ≠ J 的正确口径界定边界,并以 Table 3.1 锚定;不再是空标题。
5. **结构** —— flat,一节三段,无 3.1.1/3.1.2。

---

## B. 全篇学术用词准则（强建议）

### B.1 三条硬规则（违反必改）

1. **删断言、留可验证的因果。** 实验方法不能 "guarantee / ensure / prove"。凡出现,改为 "is designed to / is intended to / enables / so that / allows … to be attributed to"。
2. **删营销形容词。** robust / comprehensive / pristine / optimal / powerful / seamless / cutting-edge / state-of-the-art / leading —— 一律删,或替换为可核验的具体表述。
3. **人称与语气统一。** 全篇以 "this study / this chapter / the framework / the apparatus" 为主语的客观语气;`we` 仅在陈述主动设计决策时克制使用,并全篇一致。

### B.2 逐词对照表（左列均取自你现稿）

| 现稿用词（Avoid） | 学术替代（Prefer） | 出处 / 说明 |
|---|---|---|
| "**guaranteeing** that any structural deviation… is **exclusively** introduced by the agent" | "so that any deviation **can be attributed to** the agent" | §3.2.3;最典型的 overclaim |
| "we **successfully isolate** the agent's impact" | "this **isolates** the agent's contribution" / "is **intended to isolate**" | §3.2.3 |
| "**ensuring** a **pristine** state with zero constraint violations and **optimal** metric baselines" | "**recorded as** a zero-violation baseline" | §3.2.3;三个营销词一句内 |
| "a **robust** foundation" / "**comprehensive** rulepack" | "a **verified** baseline" / "a **multi-dimensional** rulepack" | §3.2.3 / §3.4 |
| "two **leading** LLMs … their **state-of-the-art** capabilities" | "two **current, widely used** agentic coding systems" | §3.5.1 |
| "all our experiments were **powered by**" | "the experiments **used**" / "were **conducted with**" | §3.5.1;口语化动词 |
| "A **major** challenge" | "A **key** confound" / "One **threat to attribution**" | §3.2.3 |
| "the agent's **errant** decision" | "the agent's **erroneous** decision" | §3.2.3 |
| "reduce … to a **code quality score**" | "obscure … behind an **aggregate quality score**" | §3.3;更精确 |
| "**Crucially**, the workspace is not reset" | "The workspace is not reset …"(让事实自己承重,少用副词强调) | §3.5.3 |
| "**significant**"(非统计语境) | "**substantial / marked / notable**" | 全篇;保留 "significant" 只给统计显著 |
| "**a lot of / huge / very / highly / deeply**" | 删,或替换为量化表述 | 全篇通则 |
| "In order to establish a robust foundation for evaluation, we construct…" | "To isolate the agent's contribution, the codebase is constructed…" | §3.2.3;删 filler 开场 |

### B.3 学术语域的四条通则

- **让名词和数据承重,别靠形容词。** "a robust, comprehensive rulepack of 19 concerns" → "a rulepack of nineteen concerns spanning three stack domains"。具体数字 > 主观修饰。
- **超出数据的判断要校准 hedge。** 单次运行、样本小 → 结论用 "indicative / suggests / is consistent with",不用 "demonstrates / proves / shows conclusively"。你现稿 §3.6 已有 "read as indicative rather than exact" —— 这是好范例,推广到全篇。
- **副词强调(crucially / importantly / notably)少用。** 需要强调的,靠句子位置(放段首/段尾)和事实本身,而非副词。
- **动词去口语化。** powered by → used;deal with → address;look at → examine;a lot of → numerous / substantial。

### B.4 一次性全篇扫查清单（Find 一遍即可)

按此在 Word 里 Ctrl-F 逐个过:
`guarantee` · `ensure` · `prove` · `successfully` · `exclusively` · `robust` · `comprehensive` · `pristine` · `optimal` · `powerful` · `seamless` · `state-of-the-art` · `leading` · `cutting-edge` · `crucially` · `importantly` · `very` · `highly` · `deeply` · `a lot of` · `huge` · `significant`(确认是否统计语境)· `powered by` · `in order to`

—— 命中即按 B.2 / B.3 处理。这一遍是把全篇用词拉到学术语域最省力的方式。
