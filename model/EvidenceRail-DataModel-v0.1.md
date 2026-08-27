# EvidenceRail — v0.1 Formal Data Model

**Status:** Draft for review
**Working name:** EvidenceRail (subject to final trademark clearance)
**Companion to:** Charter v0.1 (`EvidenceRail-Charter-v0.1.md`)
**Scope of this document:** Field-level definitions only. Serialization format (JSON Schema, canonicalization method) and reference implementation are separate, later artifacts — this document fixes *what fields exist, what they mean, and what closes off ambiguity*, per the charter's instruction to design the object before the code.

Two record types, per Charter §2/§4:

1. **Control Evidence Record (CER)** — the immutable base event.
2. **Review/Outcome Record (ROR)** — the separate, linked record for anything that happens after the base event.

> **Design filter for every field in this document:** the object being standardized is *evidence of the downstream safety-control action taken because of an age-state* — not age-verification evidence itself. If a candidate field doesn't help reconstruct "what control fired, on what age-state, under what policy, with what outcome," it doesn't belong in v0.1, regardless of how useful it might seem for some adjacent purpose.

---

## 1. Control Evidence Record — Field Groups

### 1.1 Envelope

| Field | Type | Required | Notes |
|---|---|---|---|
| `record_id` | opaque unique ID (UUIDv4 or ULID) | Yes | Identity of this record. Never reused. |
| `record_type` | fixed enum: `control_evidence_record` | Yes | Discriminator for consumers handling mixed streams. |
| `schema_version` | semver string | Yes | e.g. `0.1.0`. Enables safe evolution. |
| `timestamp` | ISO 8601, UTC, millisecond precision | Yes | When the control evaluated/fired — not when the record was persisted (see `evidence_metadata.recorded_at` for that). |

### 1.2 Age-state

| Field | Type | Required | Notes |
|---|---|---|---|
| `age_band` | enum (see below) | Yes | The age category the control evaluated against. |
| `age_assurance_confidence` | enum (see below) | Yes | Confidence tier behind the age-band — deliberately aligned to the confidence-tier *concept* used in ISO/IEC 27566-1 so the two standards compose rather than compete. |
| `age_assurance_reference` | opaque string ID | No | Pointer to the upstream age-assurance credential/result (e.g., an AgeAware-style token ID). Never the credential itself, never a raw date of birth. |
| `age_assurance_method_hint` | enum: `self_declaration` \| `estimation` \| `verification` \| `platform_signal` \| `unknown` | No | Coarse hint only, for triage — not a substitute for resolving the actual method via `age_assurance_reference`. |

`age_band` enum (v0.1, closed set — extension requires a schema version bump):
`under_13` · `13_15` · `under_16` · `16_17` · `adult` · `unknown`

**Resolution — universal core + jurisdiction extension.** `age_band` is a deliberately coarse, jurisdiction-neutral vocabulary. It is *not* an attempt to encode any single country's legal age-of-consent taxonomy. Local legal meaning is resolved by pairing `age_band` with `control_context.jurisdiction` and `control_context.policy_version` (§1.3): the same `age_band: under_16` value means something legally specific in AU vs. a different specific thing in another jurisdiction, but the *band itself* stays stable and comparable across records. The spec does not hardcode any country's exact age thresholds — that logic lives in the policy layer the record references, not in the schema.

`age_assurance_confidence` enum (v0.1):
`unassured` (no check performed) · `self_declared` · `standard` · `enhanced` · `high_confidence`

### 1.3 Control context

| Field | Type | Required | Notes |
|---|---|---|---|
| `control_id` | string | Yes | Stable identifier for the control mechanism (e.g., `account_access_restriction`). |
| `control_version` | semver string | Yes | Version of the control's logic at evaluation time. |
| `policy_id` | string | Yes | Identifier for the governing policy. |
| `policy_version` | semver string | Yes | Policy version in force at evaluation time. |
| `jurisdiction` | ISO 3166-1/2 code | Yes | Jurisdiction the policy version was scoped to. |
| `policy_document_reference` | URI or opaque ID | No | Optional pointer to the human-readable policy text — resolvable separately, not embedded. |

### 1.4 Trigger

| Field | Type | Required | Notes |
|---|---|---|---|
| `trigger_type` | enum (see vocabulary below) | Yes | Closed vocabulary — see §3. |
| `trigger_context` | structured object (key-value, closed key-set per `trigger_type` recommended, not free text) | No | Machine-readable qualifier for the trigger — e.g. the threshold that was crossed, or the signal state observed. **Must never contain child identity or content**; values are limited to policy-level states, thresholds, and signal categories. |

**Resolution — structured `trigger_context`, not free text.** A bounded string invites drift into a narrative escape hatch over time. `trigger_context` is instead a structured object whose keys are drawn from a recommended, per-`trigger_type` key vocabulary (extensible in later versions), never arbitrary prose. Example:

```json
{
  "trigger_type": "age_signal_threshold",
  "trigger_context": {
    "threshold": "under_16",
    "signal_state": "high_confidence_minor"
  }
}
```

This keeps the record machine-aggregable (a regulator or auditor can query on `trigger_context.threshold` across records) without exploding the closed `trigger_type` vocabulary into an ever-growing enum, and without opening a field where identifying detail could accidentally leak in.

### 1.5 Action

| Field | Type | Required | Notes |
|---|---|---|---|
| `action_type` | enum (see vocabulary below) | Yes | Closed vocabulary — see §4. |
| `action_scope` | enum: `account` \| `feature` \| `session` \| `access_path` | Yes | What layer the action applied to. |

### 1.6 Review availability

| Field | Type | Required | Notes |
|---|---|---|---|
| `review_available` | boolean | Yes | Whether a review/appeal mechanism existed at the time of the action. |
| `review_mechanism_reference` | opaque string ID | No | Pointer to the mechanism definition (not to any specific review — that's what a ROR is for). |

### 1.7 Evidence metadata (integrity block)

| Field | Type | Required | Notes |
|---|---|---|---|
| `source_system_id` | string | Yes | Identifier of the system that generated the record. |
| `verifier_id` | opaque string ID | No | Entity/system attesting to the record's correctness, if distinct from the source system. |
| `recorded_at` | ISO 8601, UTC | Yes | When the record was persisted (distinct from `timestamp`, which is when the control fired). |
| `record_hash` | string, `<algorithm>:<digest>` (e.g. `sha256:...`) | Yes | Hash of the canonicalized record content, excluding this field itself. **Note:** schema validation checks only that this string has the right *shape* (`algorithm:hex-digest`) — it does not recompute or verify the digest. Cryptographic correctness is an implementation-level check performed by consumers, not something the schema itself can enforce. |
| `hash_canonicalization_method` | string, versioned reference | Yes | e.g. `JCS-1.0` (JSON Canonicalization Scheme). Fixes ambiguity in how the hash is computed. |
| `signing_key_reference` | opaque string ID | No | Reference to the key used to sign the record, if signed. Never the key material itself. |
| `signature` | string (detached signature over `record_hash`) | No | Optional; enables non-repudiation beyond tamper-evidence. |
| `previous_record_hash` | string | No — see profile note | Not part of core v0.1 conformance. Belongs to an optional **Sequential Integrity Profile**: a deployment may opt into hash-chaining records within an account/session lineage for stronger sequence-integrity guarantees, but the core schema does not assume centralized or ordered persistence. A conforming implementation may emit records from multiple independent, unordered systems and still be fully valid without this field. |

**Resolution — mandatory per-record hashing, optional chaining.** `record_hash` (individual, per-record integrity) is mandatory for every CER and ROR. Sequential hash-chaining via `previous_record_hash` is an explicitly optional profile, not a baseline requirement — baking chaining into core conformance would implicitly assume a single ordered, centralized store, which conflicts with the project's cross-platform portability goal. Deployments that want ledger-style sequence guarantees can adopt the Sequential Integrity Profile; deployments that don't need it stay fully conformant without it.

### 1.8 Reference (external cross-links)

| Field | Type | Required | Notes |
|---|---|---|---|
| `external_references` | array of `{ reference_type, reference_id }` | No | Typed pointers to related records in *other* schemas — e.g. a DSA Statement-of-Reason ID, per Charter §7: linked, never merged. |

`reference_type` values (v0.1, open-ended but recommended set): `dsa_statement_of_reason` · `age_assurance_credential` · `platform_age_signal` · `external_audit_reference`

---

## 2. Review/Outcome Record — Field Groups

A ROR always references exactly one CER. It never edits the CER; it only adds a linked event.

### 2.1 Envelope

| Field | Type | Required | Notes |
|---|---|---|---|
| `record_id` | opaque unique ID | Yes | This record's own identity. |
| `record_type` | fixed enum: `review_outcome_record` | Yes | Discriminator. |
| `schema_version` | semver string | Yes | |
| `timestamp` | ISO 8601, UTC | Yes | When the review outcome was reached. |

### 2.2 Linkage

| Field | Type | Required | Notes |
|---|---|---|---|
| `linked_record_id` | matches a CER `record_id` | Yes | The base event this review pertains to. |
| `linked_record_hash` | string, `<algorithm>:<digest>` | Yes | The CER's `record_hash` *at the time this ROR was created* — lets a verifier confirm the base record hasn't drifted between the original action and the review. |

### 2.3 Review detail

| Field | Type | Required | Notes |
|---|---|---|---|
| `review_initiator` | enum: `user` \| `guardian` \| `platform` \| `regulator` | Yes | Who initiated the review. |
| `review_status` | enum: `pending` \| `upheld` \| `overturned` \| `partially_overturned` \| `withdrawn` | Yes | |
| `outcome_action` | enum, drawn from the same Action vocabulary (§4) | No | Populated only if the review changed the account/feature state — e.g. `access_reinstated`. |

### 2.4 Evidence metadata

Same field structure as CER §1.7 (`source_system_id`, `verifier_id`, `recorded_at`, `record_hash`, `hash_canonicalization_method`, `signing_key_reference`, `signature`). A ROR is independently tamper-evident, same as a CER — it is a first-class record, not a patch.

---

## 3. Trigger Vocabulary (v0.1, closed set)

Scoped per Charter §7 — access/account/age-state/jurisdiction/consent/circumvention only. Content-classification triggers are explicitly out of scope; a content-related incident cross-references a `dsa_statement_of_reason` via §1.8 instead of adding a trigger type here.

| Value | Meaning |
|---|---|
| `age_signal_threshold` | Age-state crossed a policy-defined threshold. |
| `age_assurance_state_change` | Confidence tier changed (e.g., upgraded from self-declared to verified, or downgraded on new signal). |
| `parental_consent_required` | A control point requiring parental consent was reached. |
| `parental_consent_revoked` | Previously-granted parental consent was withdrawn. |
| `jurisdiction_change_detected` | User's applicable jurisdiction changed, altering the governing policy. |
| `circumvention_attempt_detected` | Signals consistent with an attempt to bypass age controls (e.g., repeated re-attempts, known-bypass pattern). |
| `cross_platform_age_signal_received` | An external age signal arrived (e.g., an OS- or app-store-level age API). |
| `age_reassessment_triggered` | A scheduled or policy-triggered re-check of age-state, independent of new evidence. |
| `account_reinstatement_request` | A request to restore a previously restricted account was received. |
| `manual_flag` | A human (guardian, moderator, or regulator) manually flagged the account for evaluation. |

---

## 4. Action Vocabulary (v0.1, closed set)

| Value | Meaning |
|---|---|
| `account_restricted` | Account access partially limited. |
| `account_suspended` | Account access fully suspended, reversible. |
| `account_removed` | Account removed/terminated. |
| `feature_gated` | A specific feature was made unavailable. |
| `feature_unlocked` | A specific feature was made available. |
| `consent_requested` | Parental/guardian consent flow was initiated. |
| `consent_confirmed` | Parental/guardian consent was confirmed. |
| `access_denied` | A specific access attempt was denied. |
| `access_reinstated` | Previously denied/restricted access was restored. |
| `escalated_for_manual_review` | Automated evaluation deferred to human review. |
| `no_action_policy_permitted` | Control evaluated and explicitly permitted the existing state — recorded for completeness, not just denials. |

Both vocabularies are intentionally closed rather than free-text/extensible-by-default: a bounded set is what makes cross-platform aggregation and regulator tooling possible. Extension is a schema-version event, not a per-deployment one.

---

## 5. Decisions Log (v0.1)

The three questions flagged when this document was first drafted are now resolved — logged here rather than silently folded into the field tables, so the reasoning stays visible:

| Question | Resolution | Where it lives |
|---|---|---|
| Jurisdiction-specific vs. universal age bands | Universal core `age_band` + `jurisdiction`/`policy_version` extension. Spec never hardcodes a country's legal age taxonomy. | §1.2 |
| Mandatory vs. optional hash chaining | Per-record `record_hash` mandatory. Sequential `previous_record_hash` chaining is an optional **Sequential Integrity Profile**, not baseline conformance — keeps the schema portable across unordered, multi-source deployments. | §1.7 |
| Free-text vs. structured trigger detail | Replaced `trigger_detail` (bounded string) with `trigger_context` (structured, closed-key object, no PII/content). | §1.4 |

No open v0.1 questions remain at this point. Future ambiguities surfaced during JSON Schema formalization or synthetic-record generation get logged here as new rows, not resolved silently in code.

| Question | Resolution | Where it lives |
|---|---|---|
| Flat fields (this document's tables) vs. nested wire format | The field-group headers in this document (Age-state, Control context, Trigger, Action, Review) are realized as nested JSON objects in the formal schema — e.g. `trigger: { type, context }` rather than flat `trigger_type`/`trigger_context` keys — applied consistently across all field groups. Envelope fields (`record_id`, `record_type`, `schema_version`, `timestamp`) stay flat at the record root. The JSON Schema files are now the authoritative wire format; this document remains the authoritative *field-meaning* reference. | `schema/cer.schema.json`, `schema/ror.schema.json` |
| `"other"` as a closed enum value in trigger-context sub-schemas | Allowed in v0.1, with an explicit discipline attached: `other` is a fixed enum member, not a free-text escape hatch — it never accepts an arbitrary deployment string. If real-world usage shows `other` being hit repeatedly for the same underlying case, that's a signal to add an explicit enum value via a schema version bump, not to loosen the field into open text. |
| `record_id` / `record_hash` strictness | Deliberately permissive shape patterns for v0.1 (accepts both UUIDv4- and ULID-shaped IDs; hash pattern checks `algorithm:hex-digest` shape only). This validates that a value has the right *shape*, not that an ID scheme is cryptographically fixed or that a hash digest is actually correct for its record — those are implementation-level guarantees, not schema-level ones. Locking a specific ID scheme or hash algorithm is premature at v0.1 and deferred. |
| Working name | **EvidenceRail** adopted, subject to final trademark clearance. Schema `$id` namespace updated to `https://michvi.com/open-source/evidence-rail/schema/v0.1/...` accordingly. This is a label change only — the canonical object (`Child-Safety Control Evidence Record`) and its field semantics are unaffected; nothing in this document's meaning changed. |
