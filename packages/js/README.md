# evidencerail

*Release status: v0.1.*

Reference validator and hashing helpers for the EvidenceRail Child-Safety Control Evidence Schema.
Same rules as `schema/*.schema.json`, same canonicalization as `tests/validate.py` and
`reference-app/index.html` — this package exists so a Node project can use those rules without
building its own copy.

Zero runtime dependencies. Uses Node's built-in `node:crypto` (via WebCrypto) for hashing and
`node:test` for its own test suite.

## Install

```bash
npm install evidencerail
```

This package is not published to the public npm registry in v0.1. Until then, install from a local tarball; see "Local testing" below.

## Usage

```js
const { validateCER, validateROR, computeRecordHash, renderRecord } = require("evidencerail");

const cer = {
  record_id: "ER-CER-EXAMPLE-0001",
  record_type: "control_evidence_record",
  schema_version: "0.1.0",
  timestamp: new Date().toISOString(),
  age_state: { age_band: "under_16", age_assurance_confidence: "self_declared" },
  control_context: {
    control_id: "account_access_restriction", control_version: "3.2.0",
    policy_id: "au-smma-policy", policy_version: "1.4.0", jurisdiction: "AU",
  },
  trigger: { type: "age_signal_threshold", context: { threshold: "under_16", signal_state: "self_declared" } },
  action: { action_type: "account_restricted", action_scope: "account" },
  review: { review_available: true },
  evidence_metadata: {
    source_system_id: "my-platform-svc",
    recorded_at: new Date().toISOString(),
    hash_canonicalization_method: "JCS-1.0",
  },
};

(async () => {
  cer.evidence_metadata.record_hash = await computeRecordHash(cer);

  const result = validateCER(cer);
  console.log(result.valid, result.errors);

  console.log(renderRecord(cer));
})();
```

## What's exported

| Export | What it does |
|---|---|
| `validateCER(record)` / `validateROR(record)` | Returns `{ valid, errors }`. Mirrors the JSON Schema files' rules — required fields, closed vocabularies, trigger→context routing, field shapes. |
| `computeRecordHash(record)` | Real SHA-256 over the canonicalized record (sorted keys, no whitespace), excluding only `evidence_metadata.record_hash` itself. Async — uses WebCrypto. |
| `renderRecord(record)` | Plain-text summary, for a CLI or a log line — not a UI component. |
| `canonicalize(value)` / `sha256Hex(str)` | The lower-level pieces `computeRecordHash` is built from, exported in case you need them directly. |
| Vocabulary constants | `AGE_BAND`, `TRIGGER_TYPES`, `ACTION_TYPES`, etc. — for building your own forms without hardcoding the enums a second time. |

## What this package does not do

It doesn't call any network endpoint, doesn't store anything, and doesn't know about your platform's
data model beyond the CER/ROR shape. It's a validator and a hasher, not a client SDK.

## Local testing

This package isn't published yet. To try it against a real, external `npm install` (not a symlink,
not running from inside the repo):

```bash
# from packages/js/
npm install
npm test
npm pack                              # produces evidencerail-0.1.0.tgz

# then, in a completely separate directory:
mkdir /tmp/evidencerail-test && cd /tmp/evidencerail-test
npm init -y
npm install /path/to/packages/js/evidencerail-0.1.0.tgz
node -e "console.log(Object.keys(require('evidencerail')))"
```

## License

Apache License 2.0 — see `LICENSE`.
