# Docs

Dissertation-level documentation.

## Structure

- `api/` — cross-cutting API contracts (principles.md, {company,contact,interaction,deal}.md, cross-entity.md, README.md)
- `methodology/` — methodology chapter drafts and supporting arguments
- `figures/` — figure source (Mermaid, matplotlib scripts, TikZ)
- `references/` — .bib files, literature notes

## Distinction from other packages' docs

- **This `docs/`** contains cross-package methodological content
- **`baseline/docs/specs/`** contains baseline-internal implementation specs
- **`experiment/prompts/`** contains experimental instrument files (prompts)

The distinction is deliberate: this `docs/` package is a first-class research
artifact alongside code, reflecting that 85% of the value of a research
project resides in interpretation and documentation, not code alone.
