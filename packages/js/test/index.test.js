"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateCER, validateROR, computeRecordHash, renderRecord } = require("../src/index.js");

// Reuses the repository's own example fixtures as the single source of
// truth for expected behavior, rather than restating test cases here —
// same principle as tests/validate.py and the reference-app's Node parity
// check earlier in the project.
const EXAMPLES = path.join(__dirname, "..", "..", "..", "examples");

function loadFixtures(dir) {
  return fs.readdirSync(path.join(EXAMPLES, dir)).sort().map((file) => ({
    file,
    fixture: JSON.parse(fs.readFileSync(path.join(EXAMPLES, dir, file), "utf8")),
  }));
}

test("all example fixtures validate as expected (positive, negative, flagship)", () => {
  for (const dir of ["positive", "negative", "flagship"]) {
    for (const { file, fixture } of loadFixtures(dir)) {
      const kind = fixture.record_kind || "cer";
      const result = kind === "ror" ? validateROR(fixture.record) : validateCER(fixture.record);
      const expectValid = fixture.expect === "valid";
      assert.equal(
        result.valid,
        expectValid,
        `${dir}/${file}: expected valid=${expectValid}, got ${result.valid} — ${result.errors.join("; ")}`
      );
    }
  }
});

test("computeRecordHash reproduces the flagship CER's stored hash", async () => {
  const { fixture } = loadFixtures("flagship").find((f) => f.file.startsWith("cer"));
  const record = fixture.record;
  const hash = await computeRecordHash(record);
  assert.equal(hash, record.evidence_metadata.record_hash);
});

test("computeRecordHash reproduces the flagship ROR's stored hash", async () => {
  const { fixture } = loadFixtures("flagship").find((f) => f.file.startsWith("ror"));
  const record = fixture.record;
  const hash = await computeRecordHash(record);
  assert.equal(hash, record.evidence_metadata.record_hash);
});

test("computeRecordHash matches every valid positive fixture's stored hash", async () => {
  for (const { file, fixture } of loadFixtures("positive")) {
    const record = fixture.record;
    const hash = await computeRecordHash(record);
    assert.equal(hash, record.evidence_metadata.record_hash, `${file}: hash mismatch`);
  }
});

test("renderRecord produces a readable summary for a CER", () => {
  const { fixture } = loadFixtures("flagship").find((f) => f.file.startsWith("cer"));
  const summary = renderRecord(fixture.record);
  assert.match(summary, /under_16/);
  assert.match(summary, /circumvention_attempt_detected/);
  assert.match(summary, /account_restricted/);
});

test("renderRecord produces a readable summary for a ROR", () => {
  const { fixture } = loadFixtures("flagship").find((f) => f.file.startsWith("ror"));
  const summary = renderRecord(fixture.record);
  assert.match(summary, /guardian/);
  assert.match(summary, /upheld/);
});

test("validateCER rejects a record with an unexpected top-level field", () => {
  const { fixture } = loadFixtures("positive").find((f) => f.file.startsWith("cer-01"));
  const tampered = { ...fixture.record, child_name: "Jane Doe" };
  const result = validateCER(tampered);
  assert.equal(result.valid, false);
});

test("validateROR rejects a record missing the linked-CER reference", () => {
  const { fixture } = loadFixtures("positive").find((f) => f.file.startsWith("ror-01"));
  const { linked_record_id, linked_record_hash, ...tampered } = fixture.record;
  const result = validateROR(tampered);
  assert.equal(result.valid, false);
});
