# §3.4.2 修订 — Concern 选择的论证逻辑（补"为什么是这 19 个"）

**问题诊断**：现行 §3.4.2 只回答了"选了哪些"（三层分域 + 清单），没有回答"为什么选这些、为什么不是别的"。"systematically partitioned" 声称了系统性但未展示推导系统。同时注意：你贴的 §3.4.1 写 "decomposes into **two** distinct analytical roles"，而 `chapter3-section3.1-rewrite.md` 已定稿的口径是"三个角色、两个落地（Judgments 定义未实现）"——两处需统一，否则 §3.1 的 scope 声明会和这里矛盾。

---

## 一、可用的论证逻辑（三步推导链）

学术上站得住的写法不是给每个 concern 找一篇文献硬凑，而是给出一条**推导链**，让 19 这个数字成为推导的结果而非任意清单：

**第 1 步 — 从侵蚀的定义推出"选择空间"（deductive move）**
架构侵蚀的标准定义是"实现结构与预期架构（intended architecture）的渐进偏离"（de Silva and Balasubramaniam, 2012; Li et al., 2022）。要测量偏离，必须先把 intended architecture 显式化为一组"每次修改都必须遵守的约束"——这正是 Perry and Wolf (1992) 对 architecture *form* 的定义（你第 2 章已经引过这个三元组）。而本研究的 intended architecture 不是抽象的：它就是 §3.2 的 starter codebase 所承诺的那一种——分层 controller–service–repository 后端、组件化 React 前端、REST 契约连接两端。**所以 concern 的候选空间 = 这个具体架构的承重不变量（load-bearing invariants）的枚举**，即"agent 的一次迭代修改可能悄悄破坏的每一条结构承诺"。这一步回答"concern 从哪来"：不是从通用代码质量清单来，而是从被测系统的架构形式本身推出来。

**第 2 步 — 三条纳入准则过滤候选（inclusion criteria）**
候选不变量要成为 concern 必须同时满足：
1. **Architectural, not stylistic** —— 违反它改变的是依赖结构、模块边界或跨组件契约，而不是格式排版。这条准则是"侵蚀测量"与"linting"的分界线。
2. **Mechanically decidable** —— 可由静态分析在无人工解释的前提下判定，因而能同时落地为一条二元 constraint 和一个连续 metric（呼应 §3.4.1 的双层设计）。这条排除了所有需要人类判断的候选（那些进入了未实现的 Judgments 层）。
3. **Anchored（有锚点）** —— 要么锚定在 SE 文献中已确立的测量构念上（见下方映射表），要么锚定在参考系统自身成文的框架惯例上（NestJS 模块组成、React 状态放置这类 framework-idiomatic 不变量，学界没有 canonical 指标，强行配引用反而是伪引用——你的 literature review 文档本来就坚持"无锚点不硬凑"，这个诚实二分应该写进正文而不是藏起来）。

**第 3 步 — 数量与分域的论证（why this many, no more/fewer）**
- **三域划分**跟随系统的部署结构本身（backend / frontend / 连接两者的契约面），不是任意分类。
- **域内不冗余**：每个 concern 对应一个独立的侵蚀机制，没有两个 concern 操作化在同一代码性质上——这就是 §3.4.2a 的 minimum-covering-set 原则从 metric 层上移到 concern 层的同一条原则，正文只需一句话点明"同一原则在两个层级各应用一次"。
- **Cross-stack 7→3** 的裁剪段（`chapter3-table3.2-revision.md` §3.4.2 已写好）就是这条"不冗余"准则的显式执行记录——它其实是你论证系统性的最好证据，建议保留在正文而不是压缩掉。
- **不声称穷尽**：19 个 concern 编码的是对该系统架构的一种可辩护解读，非穷尽性明确让渡给 §3.6 / Limitations（这一点你的 Ch5 Limitations 草稿已写，正文加一句前向引用即可闭环）。

**可选的第 4 步 — 敏感性论证（AI-empirics anchor，建议加一句）**
留存的 concern 中有数个恰好落在实证文献归因于 AI 生成代码的失效模式上：重复（GitClear, 2026; Zhu, Tsantalis and Rigby, 2026）、复杂度上升（Agarwal, He and Vasilescu, 2026）、代码坏味道（Siddiq et al., 2022）。写法上注意方向：**不是**"为了保证测到东西才选它们"（会被读成 cherry-picking），**而是**"一个遗漏了这些维度的 rulepack 将对本研究要观察的现象不敏感"——这是仪器灵敏度论证，正当且必要。

---

## 二、Concern → 文献构念映射（Grounding 列的论证化重述）

Table 3.2 的 Grounding 列已经逐行记录了锚点；正文只需一句话把它"激活"为论证：*"Table 3.2's Grounding column records, per concern, which of the two anchoring sources applies."* 映射关系（全部已在仓库 literature review 文档中核验，无新增未验证文献）：

| 侵蚀机制 | Concern(s) | 文献构念 |
|---|---|---|
| 依赖方向 / 循环结构 | BE-DEP | Martin (1994) 稳定性原则; Tarjan (1972); Melton and Tempero (2007) |
| 信息隐藏 / 模块边界 | BE-DOM, FE-DATA | Parnas (1972) |
| 契约式接口 | BE-CONTRACT | Meyer (1992) design by contract |
| 重复 / 克隆 | BE-DUP, FE-DUP | Juergens et al. (2009); Roy, Cordy and Koschke (2009) |
| 单元复杂度 / 嵌套认知负担 | BE-SIZE, FE-COM | McCabe (1976); Harrison and Magel (1981) |
| 共变传播 / 逻辑耦合 | CROSS-PROP | Gall, Hajek and Jazayeri (1998) |
| Web API 演化断裂 | CROSS-EP, CROSS-TYPE | Espinha, Zaidman and Gross (2014); Sohan, Anslow and Maurer (2015) |
| 依赖注入 / 测试构造 | BE-TEST | Fowler (2004) |
| 组件间通信 | FE-COMM | Fowler (1999) |
| 框架惯例型（无学术锚点，锚定于参考系统成文惯例） | BE-STRUCT, BE-ERR, BE-ROUTE, FE-STATE, FE-ROUTE, FE-STYLE | —（诚实标注，不硬凑） |

**可选补充文献**（二选一即可，不必都加）：
- **Fontana et al. (2017)**（Arcan 架构坏味道检测，已在 `metrics-literature-review.md` 核验）——可用一句话把 concern 定位为"detectable architectural smell category"的同类构造，强化"concern 是业界已确立的可检测单元"的论证。
- **ISO/IEC 25010** 的 maintainability 子特性（modularity / reusability / modifiability / testability）——若想给 19 个 concern 挂一个标准化质量框架，可在第 2 步准则 1 处引用一句。⚠️ 该标准存在（2011 版，2023 有修订版），但**不在仓库已核验文献池内**，引用前需自行核对版本与条目格式。不加也完全成立。

**不建议**：为 STRUCT/ERR/ROUTE/STATE/STYLE 这类框架惯例 concern 强配文献。审稿人对"每行都有引用但引用与内容只有装饰关系"的表格比对"部分行诚实标注无锚点"的表格苛刻得多。

---

## 三、Paste-ready 正文（插入 §3.4.2 开头，替换现有 "To simulate realistic..." 引导句；清单本身保留）

> The nineteen concerns were not assembled as a general code-quality checklist; they follow from the definition of the phenomenon under study. Architectural erosion is the progressive divergence of a system's implemented structure from its intended architecture (de Silva and Balasubramaniam, 2012; Li et al., 2022), and measuring it therefore presupposes an explicit statement of that intended architecture, decomposed into the constraints every modification must observe (Perry and Wolf, 1992). For this study the intended architecture is concrete: the starter codebase (§3.2) commits to a layered controller–service–repository backend, a component-based React frontend, and a REST contract joining the two. The concern set is a deliberate selection, not an exhaustive inventory: no finite rule set can encode every structural commitment of even a single architecture, and judging which invariants are load-bearing is itself an act of architectural interpretation. The nineteen concerns therefore capture the commitments of this architecture judged most consequential for its integrity — those that an iterative modification could silently undo — selected under three explicit criteria.
>
> A candidate invariant was retained as a concern only if it met all three. First, it must be architectural rather than stylistic: violating it changes the system's dependency structure, module boundaries, or cross-component contracts, not its formatting. Second, it must be mechanically decidable from the code alone, so that it can be operationalised as both a binary constraint and a continuous metric without human interpretation (§3.4.1); candidates requiring interpretive judgment were assigned to the Judgments layer and thereby excluded from this study's scope (§3.1). Third, it must be anchored — either in an established measurement construct from the software-engineering literature, including dependency direction and cyclic structure (Martin, 1994; Tarjan, 1972), information hiding at module boundaries (Parnas, 1972), contract-based interfaces (Meyer, 1992), code duplication (Juergens et al., 2009; Roy, Cordy and Koschke, 2009), unit and nesting complexity (McCabe, 1976; Harrison and Magel, 1981), co-change propagation (Gall, Hajek and Jazayeri, 1998), and web-API evolution (Espinha, Zaidman and Gross, 2014; Sohan, Anslow and Maurer, 2015) — or, where an invariant is framework-idiomatic and no canonical academic metric exists (for example, NestJS module composition or React state placement), in the reference system's own documented conventions. Table 3.2's Grounding column records, per concern, which of the two anchoring sources applies; concerns of the second kind are deliberately reported without a forced citation.
>
> Several retained concerns additionally coincide with the failure modes that empirical studies attribute to AI-generated code — duplication (Zhu, Tsantalis and Rigby, 2026; GitClear, 2026), elevated complexity (Agarwal, He and Vasilescu, 2026), and recurring code smells (Siddiq et al., 2022). This overlap is a requirement of instrument sensitivity rather than a bias toward positive findings: a rulepack that omitted the dimensions on which agent-generated code is already documented to degrade would be insensitive to the phenomenon this study is designed to observe.
>
> The partition into backend (nine), frontend (seven), and cross-stack (three) domains follows the deployment structure of the system itself. Within each domain the concerns are mutually non-redundant: each names a distinct erosion mechanism, and no two concerns are operationalised over the same code property — the same minimum-covering-set principle that §3.4.2a applies within concerns at the metric level, applied here once at the concern level. The concern set claims coverage of this system's stated architecture, not exhaustiveness in general: the nineteen concerns encode one defensible reading of one architectural style, a scope boundary acknowledged in §3.6 and carried into the limitations discussion.

*(其后接现有的三段清单；cross-stack 7→3 裁剪段保持在清单之后，作为第 3 步"不冗余准则"的执行示例。)*

---

## 四、需要同步的引用与交叉引用

1. **新增引用**（若尚未在参考文献列表）：Martin (1994)、McCabe (1976)、Parnas (1972)、Tarjan (1972)、Meyer (1992)、Juergens et al. (2009)、Roy, Cordy and Koschke (2009)、Harrison and Magel (1981)、Gall, Hajek and Jazayeri (1998)、Espinha, Zaidman and Gross (2014)、Sohan, Anslow and Maurer (2015)、Fowler (1999; 2004)、Melton and Tempero (2007)。完整条目见 `chapter3-table3.2-revision.md` 文末（APA 格式，需转 Harvard）。Zhu/Agarwal/Siddiq/GitClear 已在 Ch4–6 的新增清单里（`chapter4-6-final-outline.md`）。
2. **§3.4.1 口径**：把 "two distinct analytical roles" 改回与 §3.1 rewrite 一致的"三角色、两落地"表述，否则第 2 步准则 2 中 "assigned to the Judgments layer" 无处着落。
3. **前向引用闭环**：本段末句指向 §3.6 与 Limitations；确认 §3.6 Construct Validity 里保留了"19 concerns 非穷尽 + 两个 proxy metric + cross rulepack experimental"三条（`chapter5-discussion.md` §5.3 已按此写）。
