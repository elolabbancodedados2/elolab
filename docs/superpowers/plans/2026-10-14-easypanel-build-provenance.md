# Easypanel Build Provenance Implementation Plan

> **For agentic workers:** execute each task in order, validating the result before continuing.

**Goal:** Make the published frontend report the source revision Easypanel built.

**Architecture:** Resolve the source ID from explicit build configuration first, then Easypanel's `GIT_SHA`, then the existing Git/local fallback. Pass `GIT_SHA` into the Docker build both from Easypanel and from the CI image validation workflow.

**Tech Stack:** Node.js build scripts, Vitest, Dockerfile, GitHub Actions.

**Spec:** Production `/version.json` currently reports `local-…`; `.dockerignore` excludes `.git`. Easypanel's Docker builder documents `GIT_SHA` as a build argument.

## Global Constraints

- Preserve `APP_BUILD_ID` and `VITE_APP_BUILD_ID` overrides.
- Do not add or expose secrets in build arguments.
- Do not deploy or apply migrations as part of this change.
- Keep the image build in CI and avoid local Docker.

## Review Focus

- An explicit release ID continues to override platform metadata.
- A build with `GIT_SHA` and no `.git` reports that exact revision.
- A build without either value retains the existing Git/local fallback.
- The SHA is present in `/version.json` and the client bundle through the existing build consistency check.
- The CI Docker build passes the same GitHub revision it validated.

---

### Task 1: Resolve Easypanel build revision

**Files:**
- Create: `scripts/resolve-build-id.mjs`
- Create: `scripts/__tests__/resolve-build-id.test.ts`
- Modify: `scripts/build-app.mjs`
- Modify: `Dockerfile`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/EASYPANEL-VPS.md`

**Interfaces:**
- `resolveBuildId(options?) -> string`, taking optional environment, Git metadata reader, and clock dependencies for deterministic tests.
- Priority: `APP_BUILD_ID`, `VITE_APP_BUILD_ID`, `GIT_SHA`, Git revision (with dirty suffix), then timestamp fallback.

- [x] Write tests for explicit override priority, `GIT_SHA` in a source archive without Git metadata, and the timestamp fallback.
- [x] Run the focused test and confirm the missing behavior returns the local timestamp ID.
- [x] Extract the resolver and wire it into the existing build script.
- [x] Pass `GIT_SHA` through the Dockerfile and GitHub Actions Docker build.
- [x] Run focused tests (3/3), full unit suite (234 files, 1,236 tests), TypeScript, static checks, ESLint, and a production build with a known synthetic `GIT_SHA`; `dist/version.json` and the bundle contained the same ID.
- [x] Review the diff; `git diff --check` passed. The subsequent program audit will carry the improvement count and additional findings.
