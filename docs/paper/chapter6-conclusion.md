# Chapter 6: Conclusion

## 6.1 Summary of the Study

This dissertation asked whether LLM-based coding agents can maintain architectural consistency and API-contract integrity across a sequence of iterative, cumulative full-stack development tasks. The question arose from a specific gap: agent evaluation is dominated by functional, test-based verification, while the structural properties that determine a system's long-term maintainability go largely unmeasured (Jiang et al., 2026; Le et al., 2026), even though those properties have been recognised as measurable and consequential for decades (Perry and Wolf, 1992; de Silva and Balasubramaniam, 2012).

To close that gap, the study built and executed a controlled longitudinal experiment. A bespoke full-stack CRM codebase, verified against a nineteen-concern rulepack and archived as a zero-violation-delta baseline, served as the testbed. Two autonomous coding agents — Claude Sonnet 4.6 and GPT-5.3, each driven through its production CLI — evolved that codebase through an entangled three-task chain (greenfield entity module; relational remodel with migration; state-machine invariant) under two prompt strategies, with architectural guidance either withheld (Minimal) or embedded in the prompt (Structured). A two-layer evaluation harness — binary constraints paired with continuous metrics, both linked to named rules — scored every task boundary. The design yielded thirteen harness evaluations (one baseline plus four conditions across three tasks), all completed without instrument error.

## 6.2 Answers to the Research Question and Objectives

The direct answer to the research question is: **not effectively, under the conditions tested.** Every trajectory, under both agents and both prompt strategies, violated the architectural rulepack from its first task onward. Erosion was not gradual drift but the immediate, repeated omission of specific cross-cutting obligations — unified exception handling, entity-change migrations, and avoidance of duplication — concentrated in a small set of backend files. At the same time, the failure was structured rather than runaway: violation accumulation tracked the structural demands of each task, no trajectory showed accelerating decay within the three-task horizon, and agents partially repaired existing violations when the final task brought them into view.

Each research objective is answered in turn.

**RO1 — construct a controlled longitudinal experimental framework.** Delivered as a working artefact. The framework isolates the agent's contribution through a verified baseline, holds workspace state across tasks so that erosion can accumulate, manipulates a single independent variable per contrast, and captures both run-local and trajectory-cumulative deltas. Its reliability is evidenced empirically: zero metric errors and zero scope errors across all thirteen evaluations, and a baseline self-comparison confirming the delta pipeline (§4.1).

**RO2 — develop a multi-dimensional conformance instrument for JavaScript/TypeScript full-stack architecture.** Delivered as the rulepack and harness: nineteen concerns across backend, frontend, and cross-stack domains, each operationalised as a binary constraint paired with a continuous metric under an explicit minimum-covering-set selection principle. The instrument's known immaturities — two proxy metrics and an experimental cross-stack layer — are documented rather than hidden (§5.3).

**RO3 — characterise the longitudinal trajectory of architectural conformance.** Characterised in four properties (§4.2, §4.5, §4.7): erosion is *immediate* (constraint failure at T1 in all conditions), *concentrated* (three rule-dominated categories; hot-spot files carrying up to 80% of findings), *task-driven* (spiking at the schema-remodelling task rather than growing uniformly), and *partially self-correcting* (negative run-local deltas at T3 in three of four conditions).

**RO4 — evaluate the effect of prompt structure.** Evaluated with a null-leaning result (§4.3): a small directional advantage for Structured prompting (median −1.5 violations per task) that reaches no statistical threshold, differs in consistency between agents, and never changed the categorical outcome of a single run. Prompt-embedded rules, as operationalised here, were insufficient to secure conformance.

**RO5 — derive evidence-based practitioner guidance.** Derived in Chapter 5 and restated compactly: treat architectural rules as machine-checked delivery gates rather than prompt content; profile review effort to the specific agent in use, because violation signatures are agent-specific (exception-handling discipline for one, complexity and layering drift for the other, duplication for both); verify completion independently, because agent self-reports overstated delivery in three of the four verifiable cases; and weigh agent speed against conformance, because the faster agent was also the more violation-prone.

Beyond the objectives, the study's central methodological hypothesis — silent decay, in which binary constraints pass while continuous metrics degrade — returned an empty class: no run ever passed the constraint gate, so the divergence had no opportunity to occur. The null is informative about instrument design (binary constraints saturated first against stress-designed tasks, with the metric layer serving as severity grading), and it remains open whether silent decay emerges on gentler task mixes (§5.2.5).

## 6.3 Contributions

The study makes three contributions, each qualified by the limits stated in §5.3.

1. **A reusable, rule-linked conformance harness for agent evaluation.** Unlike quality models that report detached metric values, every measurement in this instrument traces to a named architectural rule with a binary and a continuous operationalisation, allowing erosion findings to be stated as specific engineering omissions rather than score movements. The harness, rulepack, and analysis pipeline are reproducible artefacts, adaptable to other codebases as a template for domain-specific evaluation oracles.

2. **A longitudinal experimental design for agent-driven evolution.** The entangled task chain — each task building on the previous task's artefacts on a persistent workspace — operationalises "continuous evolution" in a way benchmark-style, task-isolated evaluations cannot (Le et al., 2026; Zeng et al., 2025), while the joint manipulation of contract and rules as one architectural-guidance treatment gives a clean first contrast for the prompt-versus-enforcement question.

3. **A controlled empirical characterisation of agent architectural erosion.** Within its scope, the study provides evidence that erosion under autonomous agents is immediate, mechanism-specific, task-driven, agent-profiled, and partially self-correcting — and that neither prompt-level guidance nor agent self-assessment can currently be relied upon to prevent or report it. To the study's knowledge, no prior work combines a rule-linked constraint-and-metric harness with a controlled prompt manipulation over a cumulative multi-task trajectory; the nearest adjacent work measures agent code quality on isolated changes (Agarwal, He and Vasilescu, 2026; Zhu, Tsantalis and Rigby, 2026) without a longitudinal, rule-linked design.

## 6.4 Closing Remarks

The delegation question posed in Chapter 1 was conditional: if agents preserve architectural integrity, larger portions of development can be handed to them with confidence; if they do not, teams need evidence about where the risk concentrates. The evidence gathered here supports the second branch, with a constructive shape. The agents studied did not fail chaotically — they failed predictably, in identifiable categories, at identifiable moments, and they repaired damage when the work put it in front of them. Predictable failure is manageable failure: it is precisely the kind that external gates, targeted review, and feedback loops can absorb.

The general lesson is therefore not that autonomous coding agents are unsafe for iterative full-stack work, but that their safety is a property of the surrounding measurement discipline rather than of the agents themselves. A team that instruments its architecture — rules made explicit, conformance checked continuously, completion verified independently — can observe erosion as it happens and correct it cheaply. A team that trusts fluent completion reports cannot. As agent capability grows and the volume of AI-authored change increases, that difference will compound. Measurement, not trust, is the precondition for delegation; this dissertation contributes one working instrument, one reusable design, and one body of controlled evidence toward making that measurement ordinary.

---

*All citations in this chapter already appear in the References list or in the additions enumerated in `chapter4-6-final-outline.md`.*
