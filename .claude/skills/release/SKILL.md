---
name: release
description: Release the extension — choose the version (from the argument, or from the commits and merged PRs since the last tag), bump it, build and zip both browser bundles, draft the release notes, then push and publish the GitHub release once the user approves. Use when asked to cut, prepare, or ship a release, or to bump the version.
---

# Prepare a release

Everything through step 5 stays on the machine. Only the push and the GitHub
release leave it, and only after the user has said yes to a summary of what's
about to go out. Store uploads and issue comments are never yours to make.

Argument (optional): an exact version (`0.2.0`), a bump level (`patch` /
`minor` / `major`), or nothing, in which case you work the version out yourself.

## 1. Preflight

Stop and report if any of these fail; don't try to fix them silently.

```bash
git rev-parse --abbrev-ref HEAD          # must be main
git fetch origin && git status -sb       # must be clean and level with origin/main
npm test                                 # all green
npm run typecheck
gh run list --branch main --limit 1      # last CI run on main should be green
```

`npm version` refuses to run on a dirty tree, so a clean tree is not optional.
`dist/`, `dist-firefox/`, `tmp/`, `*.crx` and `*.pem` are gitignored, so
building and zipping won't dirty it.

## 2. Decide the version

If the user gave one, use it. Otherwise read what's actually in the release:

```bash
git describe --tags --abbrev=0                    # e.g. v0.1.2
git log $(git describe --tags --abbrev=0)..HEAD --oneline
gh pr list --state merged --base main --limit 20 --json number,title,body,mergedAt
```

Match merged PRs to the commits (squash merges land as `... (#N)`) and read
their bodies for `Fixes #N` links — those are the user-facing story and belong
in the notes.

Pick with judgement, not just commit prefixes:

- Anything breaking (a `!` prefix, a `BREAKING CHANGE` trailer, a permission
  change users must re-accept) → **major**.
- A `feat:` that gives working setups something new → **minor**.
- Fixes, chores, docs — and `feat:` commits that only exist to repair a
  reported break, where nothing changes for channels that already worked →
  **patch**.

This project is pre-1.0 and ships fixes far more often than features, so patch
is the common answer. State the version and the one-line reason for it before
bumping.

## 3. Bump

```bash
npm run bump:patch     # or bump:minor / bump:major
npm version 0.2.0      # for an exact version
```

Either one runs the `version` lifecycle hook (`scripts/sync-manifest-version.js`),
which mirrors the new version into `public/manifest.json` and stages it, then
commits as `X.Y.Z` and creates the annotated tag `vX.Y.Z`. Confirm both:

```bash
git show --stat HEAD          # package.json, package-lock.json, public/manifest.json
git tag --points-at HEAD
```

Wrong version? Nothing has left the machine yet:
`git tag -d vX.Y.Z && git reset --hard HEAD~1`.

## 4. Build and package

```bash
npm run build                 # Chrome → dist/, Firefox → dist-firefox/
mkdir -p tmp
cd dist         && zip -r ../tmp/popular-by-date-chrome-X.Y.Z.zip  . -x '.*' && cd ..
cd dist-firefox && zip -r ../tmp/popular-by-date-firefox-X.Y.Z.zip . -x '.*' && cd ..
```

Zip from *inside* each folder: both stores reject an archive whose
`manifest.json` isn't at the root. Verify that, and the version, before moving on:

```bash
unzip -l tmp/popular-by-date-chrome-X.Y.Z.zip | head
unzip -p tmp/popular-by-date-chrome-X.Y.Z.zip manifest.json | grep '"version"'
unzip -p tmp/popular-by-date-firefox-X.Y.Z.zip manifest.json | grep '"version"'
```

## 5. Draft the notes

Write them to `tmp/release-notes-vX.Y.Z.md` (gitignored, and ready for
`--notes-file`). Written for someone using the extension, not for someone
reading the diff:

- Open with what's fixed or new in a sentence, referencing the issue (`#2`) when
  there is one — that's what the reporter gets notified about.
- A short bullet per user-visible change. Skip refactors, tests and tooling.
- Call out any new limitation the change introduces.
- Say what's unchanged if the release touches only one kind of page.
- End with the load-unpacked instructions, since store review takes days:
  `chrome://extensions` → Developer mode → Load unpacked, or `about:debugging`
  → This Firefox → Load Temporary Add-on.

## 6. Summarise, then ask

Report in a few lines — no more than that:

- the version, and the one-line reason for it
- what's in the release, as the notes put it
- where the zips and the notes file are

Then ask whether to push and publish, and wait for the answer. Never assume it:
in bypass-permissions sessions nothing else will stop you.

On a yes:

```bash
git push --follow-tags

gh release create vX.Y.Z --verify-tag \
  --title "vX.Y.Z — <short subject>" \
  --notes-file tmp/release-notes-vX.Y.Z.md \
  tmp/popular-by-date-chrome-X.Y.Z.zip tmp/popular-by-date-firefox-X.Y.Z.zip
```

`--verify-tag` makes it fail rather than invent a tag if the push didn't land.
Report the release URL when it's done.

On a no, leave the bump commit and tag alone and say plainly what's sitting
there unpushed; the undo in step 3 still applies.

Either way, these stay the user's to do:

- Chrome Web Store dashboard → new package → the Chrome zip.
- Firefox AMO → new version → the Firefox zip.
- Any issue this release fixes: comment with the release link once it's
  published (the issue is usually already closed by the PR's `Fixes #N`).
