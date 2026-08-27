# EvidenceRail

*Release status: v0.1 release candidate. Public launch remains subject to final trademark clearance.*

**EvidenceRail — an open schema for portable child-safety control evidence.**

A vendor-neutral, machine-readable evidence layer for recording how age-related child-safety
controls operated.

## The problem this addresses

When an age-related child-safety control is questioned later, a platform may need to reconstruct
what age-state the control evaluated, which policy and control versions were active, what triggered
the control, what action was taken, and what happened on review.

Those facts may be distributed across systems and teams. EvidenceRail defines a portable,
machine-readable record for that specific evidentiary object: **what control fired, on what
age-state, under what policy version, what action followed, and what happened on review.**

Full reasoning, prior-art landscape, and scope boundaries: [`charter/EvidenceRail-Charter-v0.1.md`](charter/EvidenceRail-Charter-v0.1.md).

## The canonical object

> A **Child-Safety Control Evidence Record (CER)** is a single, immutable event capturing the
> age-state a safety control evaluated against, the policy/control version that governed the
> evaluation, the trigger condition that caused it to fire, the action the platform took, and
> whether a review/appeal path was available — with no child identity or content in the payload.
> A separate, linked **Review/Outcome Record (ROR)** captures what happened after, without ever
> editing the original.

Full field-level definitions: [`model/EvidenceRail-DataModel-v0.1.md`](model/EvidenceRail-DataModel-v0.1.md).

## Repository structure

```text
evidencerail/
├── charter/            Problem statement, scope, non-goals, interoperability boundaries
├── model/               Field-level data model + decisions log
├── schema/               JSON Schema definitions (CER, ROR, shared types, trigger-context)
├── examples/            Fixtures: positive, negative, and a flagship end-to-end scenario
├── tests/                Standalone validator/test harness (no framework dependency)
├── reference-app/       Minimal, dependency-free reference UI (see below)
├── packages/js/         Node package (`evidencerail`) wrapping the same validator + hash logic
├── CONTRIBUTING.md
├── LICENSE               Apache 2.0 — covers tests/, reference-app/, and packages/js/
├── LICENSE-CC0           CC0 1.0 — covers charter/, model/, schema/, examples/
└── README.md
```

## Quickstart

**Validate the schema and every example fixture:**
```bash
python3 tests/validate.py
```
Requires `jsonschema` and `referencing` (`pip install jsonschema referencing`). Exit code `0` means
everything passed; see the harness's own docstring for what non-zero codes mean.

**Try the reference tool:**
Open `reference-app/index.html` directly in a browser, or serve the repo (`python3 -m http.server 8000`
from the repo root, then visit `http://localhost:8000/reference-app/`). No build step, no server-side
code required either way. Click "Load demo scenario" for the flagship walkthrough (under-16 account →
circumvention attempt → restriction → guardian appeal → outcome), or build your own Control Evidence
Record and Review/Outcome Record from scratch.

**Use the Node package:**
`packages/js/` wraps the same validator and hashing logic as a zero-dependency npm package
(`evidencerail`). It is not published to the public npm registry in v0.1, but you can
build and install it locally exactly as an external project would:
```bash
cd packages/js
npm install
npm test                              # 8/8, using the repo's own example fixtures as the oracle
npm pack                              # produces evidencerail-0.1.0.tgz

mkdir /tmp/evidencerail-test && cd /tmp/evidencerail-test
npm init -y
npm install /path/to/packages/js/evidencerail-0.1.0.tgz
node -e "console.log(Object.keys(require('evidencerail')))"
```
See `packages/js/README.md` for the full API.

## What this is not

Explicit, by design (see the charter's Non-Goals section for the reasoning):

- Not an age-verification system
- Not a moderation engine
- Not a parental-monitoring tool
- Not a compliance-certification system
- Not a child-content logging system
- Does not store child identity or content, by default, anywhere in the schema

## Reference tool — what it does and doesn't do

`reference-app/index.html` is a single static file: create a CER, create a linked ROR, validate a
pasted record, and view the linked evidence chain with a real (not staged) SHA-256 integrity check
computed in your browser via the Web Crypto API. It has no login, no database, no cloud storage, no
platform integrations, no dashboard, no scoring, and renders no compliance verdict — it shows you
what a record says and whether it's well-formed, nothing more.

Its validator is a purpose-built implementation of the same rules encoded in `schema/*.schema.json`
— not a generic JSON Schema engine — kept that way deliberately so the whole tool stays
dependency-free, auditable in one file, and usable offline. It's cross-checked against the Python
`jsonschema`-based harness in `tests/`; both currently agree on all fixtures in `examples/`.

## Status

Charter ✓ → Data Model ✓ → Schema ✓ → Fixtures ✓ → Validator ✓ → Reference tool ✓

Naming: EvidenceRail is the v0.1 project name; final trademark clearance remains a public-release gate. Next: public explainer /
launch materials, not further engineering.

## License

This repository is dual-licensed by directory:

- **`tests/`, `reference-app/`, `packages/js/`** — [Apache License 2.0](LICENSE)
- **`charter/`, `model/`, `schema/`, `examples/`** — [CC0 1.0 Universal](LICENSE-CC0) (public domain)

The schema and spec are released as openly as possible on purpose — the whole point is a neutral,
adoptable interchange format, and licensing friction on the spec itself works against that.
