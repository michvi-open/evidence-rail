# Contributing to EvidenceRail

*(EvidenceRail is a working name, pending final trademark clearance.)*

This project is at v0.1 — the object is fixed (see `charter/`), but the schema, examples, and
reference tooling are still early. Contribution is intentionally lightweight right now; it will
formalize as real external adoption shows up, not before.

## How changes happen

- **Everything is schema-first.** Propose changes as pull requests against the JSON Schema files
  in `schema/`, with corresponding fixtures in `examples/` and, where relevant, updates to
  `model/EvidenceRail-DataModel-v0.1.md`.
- **Breaking schema changes** — new required fields, or changes to the closed `trigger.type` /
  `action.type` vocabularies — go through a lightweight working-group review rather than a
  same-day merge. The vocabularies are closed on purpose (see the charter's non-goals and the
  data model's decisions log); extending them is a version-bump decision, not a per-deployment one.
- **Non-breaking additions** — new optional fields, new examples, documentation fixes, reference-app
  improvements — can move faster, but should still run `python3 tests/validate.py` clean before
  merging (exit code `0`).
- **Versioning** follows semver against the schema itself, not against this repository's commit
  history or the charter's document version.

## Before you open a PR

1. Read `charter/EvidenceRail-Charter-v0.1.md` — especially the Non-Goals section. A change that
   turns this into an age-verification system, a moderation engine, a parental-monitoring tool, or
   a compliance-certification service is out of scope by design, not by oversight.
2. Read `model/EvidenceRail-DataModel-v0.1.md`'s Decisions Log before re-opening a question that's
   already been resolved there — if you disagree with a prior decision, say so explicitly and why,
   rather than quietly working around it.
3. Run the validator harness:
   ```bash
   python3 tests/validate.py
   ```
   A schema integrity failure or a fixture behaving unexpectedly should be resolved before the PR
   is opened, not left for review to catch.
4. If you're adding a new example, add it under `examples/positive/`, `examples/negative/`, or
   propose a new category if it genuinely doesn't fit either — and give it a `description` and
   (for negative cases) an `expect_error_hint` field, matching the existing fixtures' shape.

## What "no formal membership tier" means right now

There's no CLA, no working-group charter document, and no maintainer hierarchy yet. Decisions on
non-trivial changes are made by discussion in the PR itself. This is deliberate — formal governance
imposed before there's anything to govern tends to calcify around the wrong things. Expect this
document to change once there's real external usage to organize around.

## Licensing of contributions

By contributing to `schema/`, `charter/`, `model/`, or `examples/`, you agree your contribution is
released under CC0 1.0 (see `LICENSE-CC0`). By contributing to `tests/`, `reference-app/`, or
`packages/js/`, you agree your contribution is released under Apache 2.0 (see `LICENSE`).
