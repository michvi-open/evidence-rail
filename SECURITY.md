# Security Policy

## Supported version

Security fixes are currently maintained for the latest v0.1 release-candidate line.

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.

Use GitHub's private Security Advisory workflow for the `michvi-open/evidence-rail` repository.

Include, where possible:

- affected file, component, or version;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- potential impact;
- any suggested mitigation.

The maintainers will coordinate review and remediation through the private advisory thread.

## Scope

EvidenceRail is a schema and reference implementation. The reference app is intentionally static and client-side.

Security issues relating to downstream deployments, hosting environments, third-party integrations, or platform-specific implementations should be reported to the relevant operator.

## Important boundary

A valid EvidenceRail record, a passing schema validation, or a matching integrity hash does not certify legal compliance, child-safety effectiveness, identity assurance, or operational security.
