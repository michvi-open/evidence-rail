"use strict";
/**
 * EvidenceRail v0.1 reference validator + hashing helpers.
 *
 * Ported directly from reference-app/index.html's core logic — same vocab,
 * same canonicalization, same validation rules encoded in schema/*.schema.json.
 * Deliberately dependency-free: no JSON Schema engine, no network calls.
 *
 * @see https://github.com/michvi-open/evidence-rail
 */


// ---------------------------------------------------------------------------
// Vocabularies — mirror schema/common.schema.json and schema/trigger-context/*
// exactly. This is a purpose-built validator for EvidenceRail's own bounded
// schema, not a generic JSON Schema engine — deliberate, to keep this
// reference tool dependency-free and auditable in one file.
// ---------------------------------------------------------------------------
const AGE_BAND = ["under_13","13_15","under_16","16_17","adult","unknown"];
const AGE_CONF = ["unassured","self_declared","standard","enhanced","high_confidence"];
const AGE_METHOD_HINT = ["self_declaration","estimation","verification","platform_signal","unknown"];
const TRIGGER_TYPES = [
  "age_signal_threshold","age_assurance_state_change","parental_consent_required",
  "parental_consent_revoked","jurisdiction_change_detected","circumvention_attempt_detected",
  "cross_platform_age_signal_received","age_reassessment_triggered",
  "account_reinstatement_request","manual_flag"
];
const ACTION_TYPES = [
  "account_restricted","account_suspended","account_removed","feature_gated","feature_unlocked",
  "consent_requested","consent_confirmed","access_denied","access_reinstated",
  "escalated_for_manual_review","no_action_policy_permitted"
];
const ACTION_SCOPE = ["account","feature","session","access_path"];
const REVIEW_INITIATOR = ["user","guardian","platform","regulator"];
const REVIEW_STATUS = ["pending","upheld","overturned","partially_overturned","withdrawn"];

// trigger.type -> which trigger-context field group applies
const TRIGGER_CONTEXT_GROUP = {
  age_signal_threshold: "age-threshold",
  age_assurance_state_change: "age-threshold",
  cross_platform_age_signal_received: "age-threshold",
  age_reassessment_triggered: "age-threshold",
  parental_consent_required: "parental-consent",
  parental_consent_revoked: "parental-consent",
  jurisdiction_change_detected: "jurisdiction",
  circumvention_attempt_detected: "circumvention",
  account_reinstatement_request: "account-state",
  manual_flag: "account-state",
};

const CONTEXT_FIELDS = {
  "age-threshold": [
    {key:"threshold", label:"Threshold", type:"select", options:AGE_BAND},
    {key:"signal_state", label:"Signal state", type:"select", options:AGE_CONF},
    {key:"previous_signal_state", label:"Previous signal state", type:"select", options:AGE_CONF},
    {key:"signal_source", label:"Signal source", type:"select",
      options:["platform_internal","os_level_signal","app_store_signal","third_party_provider","unspecified"]},
  ],
  "parental-consent": [
    {key:"consent_mechanism", label:"Consent mechanism", type:"select",
      options:["email","qr_code","otp","id_verification","other"]},
    {key:"consent_scope", label:"Consent scope", type:"select", options:["account","feature","unspecified"]},
    {key:"revocation_reason_category", label:"Revocation reason category", type:"select",
      options:["guardian_request","policy_expiry","platform_initiated","unspecified"]},
  ],
  "jurisdiction": [
    {key:"previous_jurisdiction", label:"Previous jurisdiction", type:"text", placeholder:"US"},
    {key:"new_jurisdiction", label:"New jurisdiction", type:"text", placeholder:"AU"},
    {key:"detection_method", label:"Detection method", type:"select",
      options:["ip_signal","account_setting","platform_signal","unspecified"]},
  ],
  "circumvention": [
    {key:"pattern_category", label:"Pattern category", type:"select",
      options:["repeated_reattempt","proxy_vpn_signal","falsified_input_pattern","device_signal_mismatch","other"]},
    {key:"attempt_count", label:"Attempt count", type:"number", placeholder:"7"},
    {key:"detection_confidence", label:"Detection confidence", type:"select", options:["low","medium","high"]},
  ],
  "account-state": [
    {key:"request_source", label:"Request source", type:"select",
      options:["user","guardian","platform_support","regulator"]},
    {key:"flag_reason_category", label:"Flag reason category", type:"select",
      options:["manual_review_request","regulator_inquiry","guardian_escalation","other"]},
  ],
};

// ---------------------------------------------------------------------------
// Canonicalization + real SHA-256 (Web Crypto) — matches the Python fixture
// generator: sorted keys, no whitespace. record_hash covers the full record
// EXCLUDING only evidence_metadata.record_hash itself (not the whole
// evidence_metadata block) — the spec-correct rule.
// ---------------------------------------------------------------------------
function canonicalize(value){
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}
function getSubtle(){
  // Browser (and Node >=19 with the global exposed): use it directly.
  if (typeof crypto !== "undefined" && crypto.subtle) return crypto.subtle;
  // Node without the global: fall back to node:crypto's webcrypto implementation.
  // Same algorithm either way — this is what keeps hashes identical between
  // the browser reference-app and this package.
  // eslint-disable-next-line global-require
  const nodeCrypto = require("node:crypto");
  return nodeCrypto.webcrypto.subtle;
}
async function sha256Hex(str){
  const subtle = getSubtle();
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}
async function computeRecordHash(record){
  const clone = JSON.parse(JSON.stringify(record));
  if (clone.evidence_metadata) delete clone.evidence_metadata.record_hash;
  return "sha256:" + await sha256Hex(canonicalize(clone));
}
function genId(prefix){
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2,8).toUpperCase();
  return `${prefix}-${t}-${r}`;
}
function nowISO(){ return new Date().toISOString().replace(/\.\d+Z$/, m => m); }

// ---------------------------------------------------------------------------
// Validators — mirror schema/cer.schema.json and schema/ror.schema.json.
// additionalProperties:false is simulated by checking Object.keys() against
// an explicit allow-list at every level, same enforcement principle as the
// JSON Schema files, expressed directly in JS.
// ---------------------------------------------------------------------------
function isPlainObject(v){ return v !== null && typeof v === "object" && !Array.isArray(v); }
function checkAllowedKeys(obj, allowed, path, errors){
  Object.keys(obj).forEach(k => { if (!allowed.includes(k)) errors.push(`${path}: unexpected field "${k}"`); });
}
function checkRequired(obj, required, path, errors){
  required.forEach(k => { if (!(k in obj)) errors.push(`${path}: missing required field "${k}"`); });
}
function checkEnum(obj, key, allowed, path, errors){
  if (key in obj && !allowed.includes(obj[key])) errors.push(`${path}.${key}: "${obj[key]}" is not an allowed value`);
}
const RE_RECORD_ID = /^[A-Za-z0-9_-]{8,64}$/;
const RE_SEMVER = /^\d+\.\d+\.\d+$/;
const RE_HASH = /^[a-z0-9-]+:[a-f0-9]+$/;
const RE_JURISDICTION = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

function validateEvidenceMetadata(obj, path, errors){
  if (!isPlainObject(obj)){ errors.push(`${path}: evidence_metadata must be an object`); return; }
  checkRequired(obj, ["source_system_id","recorded_at","record_hash","hash_canonicalization_method"], `${path}.evidence_metadata`, errors);
  checkAllowedKeys(obj, ["source_system_id","verifier_id","recorded_at","record_hash",
    "hash_canonicalization_method","signing_key_reference","signature","previous_record_hash"],
    `${path}.evidence_metadata`, errors);
  if (obj.record_hash && !RE_HASH.test(obj.record_hash))
    errors.push(`${path}.evidence_metadata.record_hash: does not match "<algorithm>:<digest>" shape`);
  if (obj.previous_record_hash && !RE_HASH.test(obj.previous_record_hash))
    errors.push(`${path}.evidence_metadata.previous_record_hash: does not match "<algorithm>:<digest>" shape`);
}

function validateCER(record){
  const errors = [];
  if (!isPlainObject(record)){ return {valid:false, errors:["record must be a JSON object"]}; }
  checkRequired(record, ["record_id","record_type","schema_version","timestamp","age_state",
    "control_context","trigger","action","review","evidence_metadata"], "CER", errors);
  checkAllowedKeys(record, ["record_id","record_type","schema_version","timestamp","age_state",
    "control_context","trigger","action","review","evidence_metadata","external_references"], "CER", errors);

  if (record.record_type !== undefined && record.record_type !== "control_evidence_record")
    errors.push(`CER.record_type: must be "control_evidence_record"`);
  if (record.record_id && !RE_RECORD_ID.test(record.record_id)) errors.push("CER.record_id: invalid shape");
  if (record.schema_version && !RE_SEMVER.test(record.schema_version)) errors.push("CER.schema_version: invalid shape");

  if (isPlainObject(record.age_state)){
    checkRequired(record.age_state, ["age_band","age_assurance_confidence"], "CER.age_state", errors);
    checkAllowedKeys(record.age_state, ["age_band","age_assurance_confidence","age_assurance_reference",
      "age_assurance_method_hint"], "CER.age_state", errors);
    checkEnum(record.age_state, "age_band", AGE_BAND, "CER.age_state", errors);
    checkEnum(record.age_state, "age_assurance_confidence", AGE_CONF, "CER.age_state", errors);
    checkEnum(record.age_state, "age_assurance_method_hint", AGE_METHOD_HINT, "CER.age_state", errors);
  } else if (record.age_state !== undefined) errors.push("CER.age_state: must be an object");

  if (isPlainObject(record.control_context)){
    checkRequired(record.control_context, ["control_id","control_version","policy_id","policy_version","jurisdiction"],
      "CER.control_context", errors);
    checkAllowedKeys(record.control_context, ["control_id","control_version","policy_id","policy_version",
      "jurisdiction","policy_document_reference"], "CER.control_context", errors);
    if (record.control_context.control_version && !RE_SEMVER.test(record.control_context.control_version))
      errors.push("CER.control_context.control_version: invalid shape");
    if (record.control_context.policy_version && !RE_SEMVER.test(record.control_context.policy_version))
      errors.push("CER.control_context.policy_version: invalid shape");
    if (record.control_context.jurisdiction && !RE_JURISDICTION.test(record.control_context.jurisdiction))
      errors.push("CER.control_context.jurisdiction: invalid shape");
  } else if (record.control_context !== undefined) errors.push("CER.control_context: must be an object");

  if (isPlainObject(record.trigger)){
    checkRequired(record.trigger, ["type"], "CER.trigger", errors);
    checkAllowedKeys(record.trigger, ["type","context"], "CER.trigger", errors);
    if (record.trigger.type && !TRIGGER_TYPES.includes(record.trigger.type))
      errors.push(`CER.trigger.type: "${record.trigger.type}" is outside the closed v0.1 vocabulary`);
    if (record.trigger.context !== undefined){
      const group = TRIGGER_CONTEXT_GROUP[record.trigger.type];
      if (!group){
        errors.push("CER.trigger.context: cannot validate context — trigger.type is unknown/missing");
      } else if (!isPlainObject(record.trigger.context)){
        errors.push("CER.trigger.context: must be an object");
      } else {
        const allowedKeys = CONTEXT_FIELDS[group].map(f => f.key);
        checkAllowedKeys(record.trigger.context, allowedKeys,
          `CER.trigger.context (as ${record.trigger.type})`, errors);
      }
    }
  } else errors.push("CER.trigger: must be an object");

  if (isPlainObject(record.action)){
    checkRequired(record.action, ["action_type","action_scope"], "CER.action", errors);
    checkAllowedKeys(record.action, ["action_type","action_scope"], "CER.action", errors);
    checkEnum(record.action, "action_type", ACTION_TYPES, "CER.action", errors);
    checkEnum(record.action, "action_scope", ACTION_SCOPE, "CER.action", errors);
  } else errors.push("CER.action: must be an object");

  if (isPlainObject(record.review)){
    checkRequired(record.review, ["review_available"], "CER.review", errors);
    checkAllowedKeys(record.review, ["review_available","review_mechanism_reference"], "CER.review", errors);
    if (record.review.review_available !== undefined && typeof record.review.review_available !== "boolean")
      errors.push("CER.review.review_available: must be a boolean");
  } else errors.push("CER.review: must be an object");

  validateEvidenceMetadata(record.evidence_metadata, "CER", errors);

  if (record.external_references !== undefined){
    if (!Array.isArray(record.external_references)) errors.push("CER.external_references: must be an array");
    else record.external_references.forEach((ref,i) => {
      checkRequired(ref, ["reference_type","reference_id"], `CER.external_references[${i}]`, errors);
      checkAllowedKeys(ref, ["reference_type","reference_id"], `CER.external_references[${i}]`, errors);
    });
  }

  return {valid: errors.length === 0, errors};
}

function validateROR(record){
  const errors = [];
  if (!isPlainObject(record)){ return {valid:false, errors:["record must be a JSON object"]}; }
  checkRequired(record, ["record_id","record_type","schema_version","timestamp","linked_record_id",
    "linked_record_hash","review_initiator","review_status","evidence_metadata"], "ROR", errors);
  checkAllowedKeys(record, ["record_id","record_type","schema_version","timestamp","linked_record_id",
    "linked_record_hash","review_initiator","review_status","outcome_action","evidence_metadata"], "ROR", errors);

  if (record.record_type !== undefined && record.record_type !== "review_outcome_record")
    errors.push(`ROR.record_type: must be "review_outcome_record"`);
  if (record.record_id && !RE_RECORD_ID.test(record.record_id)) errors.push("ROR.record_id: invalid shape");
  if (record.linked_record_id && !RE_RECORD_ID.test(record.linked_record_id)) errors.push("ROR.linked_record_id: invalid shape");
  if (record.linked_record_hash && !RE_HASH.test(record.linked_record_hash)) errors.push("ROR.linked_record_hash: invalid shape");
  checkEnum(record, "review_initiator", REVIEW_INITIATOR, "ROR", errors);
  checkEnum(record, "review_status", REVIEW_STATUS, "ROR", errors);
  if (record.outcome_action !== undefined) checkEnum(record, "outcome_action", ACTION_TYPES, "ROR", errors);

  validateEvidenceMetadata(record.evidence_metadata, "ROR", errors);
  return {valid: errors.length === 0, errors};
}

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// renderRecord — a plain-text, environment-agnostic summary. Not a UI
// component (that's reference-app/'s job) — just enough for a CLI, a log
// line, or a quick sanity check without building a renderer yourself.
// ---------------------------------------------------------------------------
function renderRecord(record){
  if (!record || typeof record !== "object") return "Not a record object.";
  if (record.record_type === "control_evidence_record"){
    const a = record.age_state || {}, cc = record.control_context || {},
          tr = record.trigger || {}, ac = record.action || {}, rv = record.review || {};
    return [
      `Control Evidence Record ${record.record_id || "(no id)"}`,
      `  Age state : ${a.age_band || "?"} (${a.age_assurance_confidence || "?"})`,
      `  Control   : ${cc.control_id || "?"} v${cc.control_version || "?"} [${cc.jurisdiction || "?"}]`,
      `  Trigger   : ${tr.type || "?"}`,
      `  Action    : ${ac.action_type || "?"} (scope: ${ac.action_scope || "?"})`,
      `  Review    : ${rv.review_available ? "available" : "not available"}`,
    ].join("\n");
  }
  if (record.record_type === "review_outcome_record"){
    const lines = [
      `Review/Outcome Record ${record.record_id || "(no id)"}`,
      `  Linked to : ${record.linked_record_id || "?"}`,
      `  Initiator : ${record.review_initiator || "?"}`,
      `  Status    : ${record.review_status || "?"}`,
    ];
    if (record.outcome_action) lines.push(`  Outcome   : ${record.outcome_action}`);
    return lines.join("\n");
  }
  return `Unrecognized record_type: ${record.record_type}`;
}


module.exports = {
  validateCER,
  validateROR,
  computeRecordHash,
  renderRecord,
  canonicalize,
  sha256Hex,
  // vocabularies, exported for consumers who want to build their own forms/UI
  AGE_BAND, AGE_CONF, AGE_METHOD_HINT, TRIGGER_TYPES, ACTION_TYPES, ACTION_SCOPE,
  REVIEW_INITIATOR, REVIEW_STATUS, TRIGGER_CONTEXT_GROUP, CONTEXT_FIELDS,
};
