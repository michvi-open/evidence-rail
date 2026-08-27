#!/usr/bin/env python3
"""
Validator harness for the Child-Safety Control Evidence Schema.

Two phases, run in order:

  1. Schema integrity — every *.schema.json file under schema/ is loaded and
     checked against its own JSON Schema meta-schema (Draft 2020-12). This
     catches a broken schema *before* it can masquerade as a fixture failure.

  2. Fixtures — every *.json file under examples/{positive,negative}/ is
     loaded, validated against the schema selected by its `record_kind`
     (cer|ror), and checked against its own `expect: valid|invalid` field.

Exit codes (CI-friendly):
  0 = everything passed
  1 = schema integrity passed, but one or more fixtures did not behave
      as expected (a genuine behavior mismatch)
  2 = schema integrity failure, or a $ref could not be resolved while
      validating a fixture (a harness/schema problem, not a fixture
      behavior problem — kept distinct so it isn't misread as case 1)

Usage:
  python3 tests/validate.py
"""

import json
import sys
from pathlib import Path

from referencing import Registry, Resource
from referencing.exceptions import Unresolvable
from referencing.jsonschema import DRAFT202012
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schema"
EXAMPLES_DIR = ROOT / "examples"


def load_json(path: Path):
    with path.open() as f:
        return json.load(f)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


# ---------------------------------------------------------------------------
# Phase 1 — Schema integrity
# ---------------------------------------------------------------------------

def check_schema_integrity():
    """Load + meta-schema-validate every schema file. Also builds the
    Registry used later for $ref resolution, so a malformed $id or a
    resource that can't even be registered is caught here too."""
    schema_paths = sorted(SCHEMA_DIR.glob("*.schema.json")) + \
        sorted((SCHEMA_DIR / "trigger-context").glob("*.schema.json"))

    results = []       # (path, ok, message)
    resources = []      # for Registry
    fatal = False

    for path in schema_paths:
        try:
            doc = load_json(path)
        except json.JSONDecodeError as e:
            results.append((path, False, f"invalid JSON: {e}"))
            fatal = True
            continue

        try:
            Draft202012Validator.check_schema(doc)
        except SchemaError as e:
            results.append((path, False, f"fails Draft 2020-12 meta-schema: {e.message}"))
            fatal = True
            continue

        try:
            resource = Resource.from_contents(doc, default_specification=DRAFT202012)
            resources.append((doc["$id"], resource))
        except Exception as e:  # malformed $id, etc.
            results.append((path, False, f"could not register as a resource: {e}"))
            fatal = True
            continue

        results.append((path, True, None))

    registry = Registry().with_resources(resources) if not fatal else None
    return results, registry, fatal


def print_schema_integrity(results):
    print("Schema integrity")

    top_level = [r for r in results if r[0].parent == SCHEMA_DIR]
    trigger_ctx = [r for r in results if r[0].parent == SCHEMA_DIR / "trigger-context"]

    for path, ok, message in top_level:
        status = "PASS" if ok else "FAIL"
        print(f"  {status} {path.name}")
        if not ok:
            print(f"       -> {message}")

    if trigger_ctx:
        if all(ok for _, ok, _ in trigger_ctx):
            print(f"  PASS trigger-context/* ({len(trigger_ctx)}/{len(trigger_ctx)})")
        else:
            # Expand on failure so the broken file is identifiable —
            # a deliberate deviation from the collapsed success-case
            # format: compact when clean, verbose when it matters.
            for path, ok, message in trigger_ctx:
                status = "PASS" if ok else "FAIL"
                print(f"  {status} trigger-context/{path.name}")
                if not ok:
                    print(f"       -> {message}")
    print()


# ---------------------------------------------------------------------------
# Phase 2 — Fixtures
# ---------------------------------------------------------------------------

def check_fixtures(registry):
    cer_schema = load_json(SCHEMA_DIR / "cer.schema.json")
    ror_schema = load_json(SCHEMA_DIR / "ror.schema.json")
    cer_validator = Draft202012Validator(cer_schema, registry=registry)
    ror_validator = Draft202012Validator(ror_schema, registry=registry)

    fixture_paths = sorted((EXAMPLES_DIR / "positive").glob("*.json")) + \
        sorted((EXAMPLES_DIR / "negative").glob("*.json")) + \
        sorted((EXAMPLES_DIR / "flagship").glob("*.json"))

    outcomes = []       # (name, passed)
    ref_failure = False

    print("Fixtures")
    for path in fixture_paths:
        fixture = load_json(path)
        record = fixture["record"]
        expect_valid = fixture["expect"] == "valid"
        kind = fixture.get("record_kind", "cer")
        validator = ror_validator if kind == "ror" else cer_validator
        hint = fixture.get("expect_error_hint")
        name = path.stem

        try:
            errors = list(validator.iter_errors(record))
        except Unresolvable as e:
            print(f"  ERROR {name}")
            print(f"       -> unresolved $ref while validating: {e}")
            ref_failure = True
            outcomes.append((name, False))
            continue

        got_valid = len(errors) == 0

        # Explicit, not just implied: an "invalid" fixture must produce
        # at least one concrete validation error, not merely "not valid".
        if not expect_valid and got_valid:
            passed = False
        elif not expect_valid and not got_valid:
            passed = len(errors) >= 1
        else:
            passed = got_valid == expect_valid

        status = "PASS" if passed else "FAIL"
        print(f"  {status} {name}")
        if not passed:
            print(f"       expected: {'VALID' if expect_valid else 'INVALID'}, "
                  f"got: {'VALID' if got_valid else 'INVALID'}")
            if errors:
                print(f"       schema error : {errors[0].message}")
            if hint:
                print(f"       fixture hint : {hint}  (informational only, not asserted)")

        outcomes.append((name, passed))

    print()
    return outcomes, ref_failure


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    integrity_results, registry, integrity_fatal = check_schema_integrity()
    print_schema_integrity(integrity_results)

    if integrity_fatal:
        print("Schema integrity check failed — stopping before fixture validation.")
        print("(A broken schema is a harness/schema problem, not a fixture problem —")
        print(" fixtures are not run so a downstream failure can't be misread as one.)")
        return 2

    outcomes, ref_failure = check_fixtures(registry)

    passed_count = sum(1 for _, ok in outcomes if ok)
    total = len(outcomes)
    print(f"{passed_count}/{total} fixtures behaved as expected.")

    if ref_failure:
        return 2
    if passed_count != total:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
