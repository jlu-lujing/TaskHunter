# Release

This fork releases by pushing a semver tag. `.github/workflows/release.yml:4` watches `v*` tags; tagging is the only trigger that exercises the full pipeline with publishing.

## Pipeline overview

```
tag vX.Y.Z  →  create-release (draft)  ─┬─ publish-npm (.tgz)
                                         ├─ build-desktop-electron-macos (aarch64)
                                         ├─ build-desktop-electron-windows (x64 + arm64)
                                         ├─ build-desktop-electron-linux (x64 + arm64)
                                         ├─ combine-electron-manifests (latest.yml / latest-mac.yml)
                                         └─ mobile-release (Android, iOS disabled)
              →  publish-electron-linux → finalize-release (verify assets → draft=false → Discord + website dispatch)
```

* `create-release` (`release.yml:27`) extracts the changelog section `## [X.Y.Z]` from `CHANGELOG.md:54` and creates a **draft** GitHub Release `vX.Y.Z` (`release.yml:72`).
* Parallel build jobs attach artifacts to the same tag via `softprops/action-gh-release` (`release.yml:112`, `306`, `403`, `548`).
* `finalize-release` (`release.yml:609`) verifies the four Linux assets, then publishes the draft (`draft: false`, `release.yml:653`). All jobs are required before a release is considered `Latest`.

`workflow_dispatch` with `inputs.version` / `dry_run` exists for manual dry-runs (`release.yml:7`), but fork releases use `push tag`.

## Prerequisites

1. `origin` points to `jlu-lujing/TaskHunter`. `upstream` (openchamber) is fetch-only; releases are cut only from the fork.
2. `CHANGELOG.md` contains a dated section for the new version. The workflow fails if it is missing (`release.yml:64`):

   ```md
   ## [1.25.9] - 2026-09-03
   - **Git:** ...
   ```

   Use `.agents/skills/changelog-authoring/SKILL.md` to draft `[Unreleased]` bullets, then promote them to a dated header on release. `packages/vscode/CHANGELOG.md` only gets a header when the change reaches `VSCodeApp` (`packages/ui/src/apps/VSCodeApp.tsx:42`) — see that skill's reachability check.

## Cutting a release (maintainer)

From `main` after merging upstream / features:

```bash
# 1. Ensure CHANGELOG.md has ## [X.Y.Z] - YYYY-MM-DD above the previous version
#    (move [Unreleased] bullets, keep a new empty ## [Unreleased] on top)

# 2. Bump every package in lockstep — package.json:2, packages/ui, web, electron, vscode
node scripts/bump-version.mjs 1.25.9
# scripts/bump-version.mjs:9 lists the five package.json files

# 3. Commit, tag, push — use an annotated tag; push only this tag
git add CHANGELOG.md package.json packages/*/package.json packages/vscode/CHANGELOG.md
git commit -m "chore(release): v1.25.9"
git tag -a v1.25.9 -m "v1.25.9"
git push origin main
git push origin v1.25.9          # do NOT use --follow-tags if you have stale local tags

# 4. Watch the workflow
gh run watch --repo jlu-lujing/TaskHunter   # or: gh run list --limit 5
gh release view v1.25.9 --repo jlu-lujing/TaskHunter --json isDraft,tagName
```

The workflow auto-creates the draft Release within seconds; `finalize-release` flips it to `Latest` after all builders succeed. The npm `.tgz` (`packages/web`) and desktop artifacts (`packages/electron/dist/*.dmg|*.zip|*.exe|*.AppImage` + `latest.yml` manifests) appear on the same Release.

## Verification

```bash
gh release list --repo jlu-lujing/TaskHunter --limit 5
gh run list --repo jlu-lujing/TaskHunter --limit 5 --json name,status,conclusion,headBranch
# In-progress runs show the v1.25.9 Release job with create-release ✓ and builds ⏳
```

Auto-update manifests (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`, `latest-linux-arm64.yml`) are merged in `combine-electron-manifests` (`release.yml:559`) and `publish-electron-linux` (`release.yml:514`). Linux `AppImage` builds are re-validated before publish (`verify-update-manifest.mjs:498`).

## Dry run / local build test

* Workflow dry-run: `gh workflow run release.yml --repo jlu-lujing/TaskHunter -f version=0.0.0-test -f dry_run=true` — skips uploads but still builds.
* Native desktop smoke test (no signing): `./scripts/test-release-build.sh --no-bundle` — mirrors `release.yml` locally (`scripts/test-release-build.sh:139`).

## Common pitfalls

* **Missing changelog section** → `create-release` fails with `Changelog section [X.Y.Z] not found`. Add the dated header; do not publish with only `[Unreleased]`.
* **`--follow-tags` pushes stale tags** → a stray `v1.8.x` tag triggered a second `Release v1.8.3` workflow. Push only `vX.Y.Z` explicitly, and prune local stale tags (`git tag -d v1.8.3`).
* **Manually publishing the draft early** → the Release appears `Latest` before desktop/mobile assets are attached. Leave `draft: true` until `finalize-release` publishes it (`release.yml:653`).
* **Version skew** → `scripts/bump-version.mjs` must be used; editing a single `package.json` leaves the five packages out of sync and breaks `dist` naming (`packages/electron/scripts/verify-update-manifest.mjs`).

## Rollback

```bash
gh release delete vX.Y.Z --repo jlu-lujing/TaskHunter --cleanup-tag --yes
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# Fix CHANGELOG.md / package.json, re-commit, re-tag, push again
```
