# EvidenceRail — v0.1 Charter

**Status:** Draft for review
**Version:** 0.1
**Working name:** EvidenceRail (subject to final trademark clearance — see naming note at the end of this document)

**Canonical public line:** EvidenceRail — an open schema for portable child-safety control evidence.

**Fuller description:** A vendor-neutral, machine-readable evidence layer for recording how age-related child-safety controls operated.

---

## 1. Problem

Regulators are increasingly requiring platforms to demonstrate — not merely assert — that child-safety controls operated as intended on a given user at a given time. Australia's Online Safety Amendment (Social Media Minimum Age) Act 2024 requires "reasonable steps," but the eSafety Commissioner has stated publicly that she cannot currently discharge the burden of proof required for civil penalty proceedings because investigations rely on platform "representations" rather than primary documents, and that third-party evidence from age-assurance vendors is "instrumental" but presently inaccessible. Equivalent evidentiary demands are emerging under the EU DSA's protection-of-minors guidelines and Ofcom's child-safety codes.

The regulatory question has shifted from *"do controls exist?"* to *"what operated, on what age-state, under what policy version, and what happened next?"*

This evidentiary layer is currently produced, if at all, as closed, vendor-proprietary infrastructure. Commercial age-compliance platforms already generate audit trails and cryptographically-verifiable receipts of age-category, jurisdiction, and consent decisions — proving the demand is real — but each vendor's format is closed, non-portable, and unreadable outside that vendor's own system. No open, vendor-neutral, cross-platform interchange format exists for this specific evidentiary object.

Adjacent standards each solve a different piece of the surrounding problem — age-assurance system design, age-credential portability, org-level trust-and-safety maturity, content-moderation transparency — but none of them record the platform-level event this project targets: *what control fired, on what age-state, under what policy version, and what happened next.*

This project defines an open schema for that missing evidentiary object.

---

## 2. Canonical Record

> A **Child-Safety Control Evidence Record** is a single, immutable event capturing the age-state a safety control evaluated against, the policy/control version that governed the evaluation, the trigger condition that caused it to fire, the action the platform took, whether a review/appeal path was available, and (via a separately linked record) the eventual outcome — with no child identity or content in the payload.

This is the one object the schema standardizes. Everything else in this charter exists to scope, bound, and protect that object.

> **North star:** the distinctive object here is not age-verification evidence — that's what upstream age-assurance systems already produce. It is evidence of *the downstream safety-control action taken because of an age-state*. Every future field, in this charter and in the data model, gets tested against whether it helps reconstruct that one thing.

**Atomic model:**

```
Age-state
  +
Policy/control version
  +
Trigger
  +
Action
  +
Review availability
  ↓
Child-Safety Control Evidence Record  (immutable, base event)
  ↓
Review/Outcome Record  (separate, linked by reference — not a mutation)
```

---

## 3. Field Groups

The schema is organized into six field groups. Exact field names/types belong in the formal spec (v0.2+); this charter fixes the groups and their intent.

**3.1 Age-state**
The age-band or age-assurance confidence state the control evaluated against at decision time (e.g., `under_16`, `high_confidence_minor`, `self_declared_unverified`). References an upstream age-assurance result (e.g., an AgeAware-style token) by identifier — does not re-encode the underlying verification method or evidence.

**3.2 Control context**
The safety control's identifier and version (`account_access_restriction v3.2`), and the policy identifier it was executed under. Enables reconstruction of "which rule, at which point in time, produced this outcome" — the core ask behind regulator document requests.

**3.3 Trigger**
The condition that caused the control to fire. Scoped strictly to age-state / access / account / parental-consent / jurisdiction / circumvention-related conditions (see §7 for the hard boundary against content-moderation triggers).

**3.4 Action**
What the platform did in response (`account_restricted`, `feature_gated`, `consent_requested`, `access_denied`). A closed, versioned action vocabulary — not free text.

**3.5 Review availability**
A boolean plus an optional reference to the review/appeal mechanism that was available at the time of the action. Does not record the outcome of a review — only that a path existed.

**3.6 Evidence metadata**
Timestamp, record ID, source system identifier, verifier/attestor identifier, and integrity metadata (cryptographic hash of the record, signing key reference). This group exists purely to make the record independently verifiable and tamper-evident — not to identify the child.

**Explicitly excluded from every group:** child name, contact details, device identifiers, content text/media, precise geolocation, or any field that re-identifies an individual child. See §6.

---

## 4. Append-Only Model

Two hard constraints, non-negotiable in v0.1:

1. **The base Control Evidence Record is immutable.** Once written, it is never edited in place; lifecycle handling such as lawful retention or deletion is outside the schema and must not rewrite historical record semantics. Persistence follows an append-only pattern with a stored, independently recomputable integrity hash. Immutability is a guarantee about *how a record may be modified while it exists*, not a guarantee that it exists forever — retention and deletion obligations are jurisdiction- and deployment-specific and are deliberately left to implementers.
2. **Outcomes and reviews are never written back into the base record.** A later appeal resolution, correction, or review outcome is captured as a **separate Review/Outcome Record**, linked to the original by a stable record reference. The chain (base record → zero or more linked outcome records) is what gets reconstructed at audit time.

This preserves the property that makes the record regulator-credible in the first place: a record that could be quietly edited after the fact has no evidentiary value. It also means "getting it wrong the first time" doesn't corrupt history — it just appends a correction, visibly.

---

## 5. Interoperability

The schema is designed to **reference**, not replace, adjacent frameworks:

| Adjacent standard | Relationship |
|---|---|
| Age-assurance credentials (e.g., AgeAware/euCONSENT-style tokens) | Upstream input — age-state field references the credential/result by ID, does not re-implement it |
| ISO/IEC 27566-1, IEEE 2089.1 | Govern the age-assurance *system's* design and conformance; out of scope here |
| ISO/IEC 25389 (DTSP Safe Framework) | Org-level maturity/best-practices layer this schema could sit underneath as an implementation artifact, not a competing framework |
| DSA Statements of Reason | Sibling record type for content-moderation actions; may be cross-referenced by ID when a single incident touches both content and access controls, but the two record types are never merged (see §7) |
| OSCAL | Nearest structural analog (control + evidence + machine-readable audit artifact) from the IT-security compliance domain; informs schema design patterns, not directly reused |
| OCSF | Nearest structural analog for a portable, vendor-neutral event taxonomy; informs categorical design, different domain |

---

## 6. Privacy Boundary

- No child identity in the payload, by default, in any field.
- No content (text, image, video, message) in the payload, ever.
- Age-state is a category or confidence label, never a raw date of birth or biometric value.
- Data minimization is a hard design constraint, not a configuration option: fields that aren't required to reconstruct "what control operated, under what policy, with what outcome" are out of scope for the schema, full stop.
- Aggregation/statistical use (e.g., regulator-facing rollups) is expected to happen *on top of* individual records, not by embedding identity into the record to make aggregation easier later.

---

## 7. DSA / Age-Assurance Boundary

Two explicit exclusions, carried over as hard constraints from scoping discussion:

- **Not a content-moderation record.** Triggers are limited to age-state, access, account, parental-consent, jurisdiction, and circumvention-related conditions. A recommender or classifier flagging content as age-inappropriate is a *DSA Statement-of-Reason-shaped* event, not a Control Evidence Record. The two record types may reference each other by ID when they relate to the same incident; they are never the same record.
- **Not an age-assurance evidence record.** This schema does not encode *how* age was determined (document check, estimation, self-declaration) or the age-assurance system's own conformance evidence — that's ISO/IEC 27566-1 / IEEE 2089.1 territory. This schema starts *after* an age-state has already been produced and records what the platform did with it.

---

## 8. Regulator / Auditor Use

The record is designed to answer from the record itself, without requiring reconstruction from multiple proprietary platform systems (verifier keys, referenced credentials, or external policy documents may still need to be resolved separately):

- What control evaluated this account, and under what policy version, at time T?
- What triggered the evaluation?
- What action resulted?
- Was a review path available, and if a review happened, what was its outcome (via linked record)?
- Can the record be verified as unmodified since creation (via integrity hash)?

It is explicitly **not** designed to answer "how many under-16 accounts exist" or "was this specific child harmed" — those require aggregation and case-specific investigation respectively, both out of scope for the schema itself.

---

## 9. Reference Implementation Scope (v0.1)

In scope:
- JSON Schema definition for the Control Evidence Record and the linked Review/Outcome Record.
- A validator (schema conformance checker).
- A minimal example event emitter/consumer (illustrative, not production SDK).
- Worked examples showing the append-only linkage pattern.

Out of scope for v0.1:
- Platform-specific SDKs or integrations.
- A hosted/shared ledger or transparency database (open question for a later version — DSA's Transparency Database is a useful reference model, not a v0.1 commitment).
- Any certification or conformance-assessment program.

---

## 10. Non-Goals

This project is explicitly **not**:
- An age-verification system.
- A moderation engine.
- A parental-monitoring tool.
- A compliance-certification system.
- A child-content logging system.
- A system that stores child identity or content by default.

---

## 11. Licensing

Leaning toward a split model, pending deliberate patent/licensing review rather than a default:
- **Spec/schema itself: CC0 / public-domain-style.** Given the ambition is a neutral interchange format, maximum-openness licensing on the schema definition removes any adoption friction tied to patent or attribution terms — closer to how OSCAL is published than to a typical Apache-licensed project.
- **Reference implementation (validator, examples): Apache 2.0.** Precedent-consistent with OCSF's reference tooling, and its explicit patent grant is worth keeping for the code specifically.

This split should be confirmed only after checking patent and licensing implications against the applicant's broader IP portfolio — not adopted by default.

---

## 12. Contribution Model

Recommended starting structure, modeled loosely on how OCSF and DTSP's Safe Framework organized early contribution before formalizing:
- Open GitHub repository, schema-first (changes proposed as PRs against the JSON Schema + examples).
- A lightweight working-group review step for breaking schema changes (new required fields, vocabulary changes to the Action/Trigger enums).
- Versioned releases (semver against the schema, not the charter).
- No formal membership tier at v0.1 — governance formalization deferred until there's real external adoption to govern.

---

*Naming: **EvidenceRail** is adopted as the working name — subject to final formal trademark clearance (USPTO/WIPO/IP India, ideally via a trademark professional) before any public launch, press, or commercial commitment. A first-pass sweep (GitHub, npm, PyPI, general web/company/trademark search) found it clean; a first-pass sweep is a signal to proceed, not a legal guarantee.*

*One explicit discipline going forward: "Rail" is chosen for its infrastructure feel — neutral, interoperable, standard-like — and nothing more. It should not be over-explained or extended into a literal transport/network metaphor in documentation, diagrams, or marketing. The canonical object this project standardizes remains, unambiguously, the **Child-Safety Control Evidence Record** — the name is a label for that object's home, not a redefinition of what the object is.*
