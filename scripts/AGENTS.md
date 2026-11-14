# Local scripts

## Purpose

Own local automation and command-line scripts used to build, validate, and operate the repository.

## Ownership

This directory contains the JavaScript test harness and any future repository-maintenance scripts. Product logic belongs in its application layer, not in one-off scripts.

## Local Contracts

- Keep scripts repeatable and explicit about their inputs, outputs, and side effects.
- Do not print, upload, or persist secrets or private account data. Use synthetic data in local automation.
- Avoid destructive filesystem or remote-service actions unless they are required by an explicit user request and their target is clear.
- Keep generated outputs under `.tmp/` or another clearly designated generated path; do not commit them.

## Work Guidance

- Preserve the existing `scripts/test.mjs` role as the Node test entry point unless an intentional test-tooling change is requested.
- Prefer repository package scripts for common commands so local and CI behavior stay aligned.

## Verification

- `npm test` invokes `scripts/test.mjs` and runs the configured Node test suite.
- Verify script changes with the narrowest applicable command; inspect outputs and side effects before reporting success.

## Child DOX Index

None.
