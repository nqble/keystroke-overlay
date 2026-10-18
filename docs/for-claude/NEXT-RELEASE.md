# What is next: v1.4 (in progress, not released)

v1.3.0 (free key placement) was released on 2026-10-16. This page tracks the work towards the next version. Nothing here is
released until Jordan says so.

## What is on the `v1.4.0-dev` branch
Everything for v1.4.0. The release notes live in one place, the v1.4.0 entry of [CHANGELOG.md](../../CHANGELOG.md) (in the
format the release check requires, docs/RELEASING.md); this page does not repeat them. The numbers in its Performance section come
from `tests/bench/run.mjs` (clean run of 2026-10-18).

## State of the v1.4 release (prepared, waiting for Jordan's go)

Prepared on `v1.4.0-dev` (2026-10-18): the five version files are at 1.4.0, `CHANGELOG.md` has the v1.4.0 entry (the draft notes plus the
advisor's merged fixes and the measured numbers from `tests/bench/run.mjs`), and the install and upgrade test, the quiet update
test, the benchmark and the full test suites have passed. **Nothing is released**: merge into `main` and run the Release workflow only
when Jordan says so. Before the release: confirm the update key and the deployment approval on GitHub, and decide whether code
signing (SignPath, off until its variables are set) is on for this release.

## How a release is made
See [RELEASING.md](../RELEASING.md): the one place for the steps.
