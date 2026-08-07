# `@yt/contract`

The single definition of everything the three services must agree on.

Before this package existed, the 250 MiB upload cap was declared independently in
three files, the allowed-extension set in four (two `Set`s and two regexes), and
the object-name grammar in four more. Changing the size cap meant four
coordinated edits across three independently-deployed services, with nothing to
catch a missed one.

## Entry points

| Import                | Runtime    | Contents                                                                                       |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `@yt/contract`        | isomorphic | Constants, extension and size validation, name patterns, the rendition ladder, `toPublicVideo` |
| `@yt/contract/server` | Node only  | `encodeUserId` / `decodeUserId`, `buildRawVideoName`, `parseRawVideoName`                      |

The split exists because the browser bundle imports this package. The isomorphic
entry point must never reference `Buffer`, `node:*`, or any other Node global —
anything that needs them belongs in `/server`.

## What it owns

- `maxUploadBytes` — 250 MiB
- `allowedVideoExtensions` and `contentTypesByExtension`
- `videoRenditions` — the ladder, ordered smallest first, each with a height and
  a bitrate cap
- The object-name grammar, in both directions:
  `u~<base64url uid>~<13-digit ms>~<uuidv4>.<ext>` for raw uploads and
  `processed-<videoId>[-<rendition>].mp4` for outputs
- `PublicVideo` and `toPublicVideo`, the allowlist that decides what the feed is
  allowed to expose

## Backward compatibility

Two legacy shapes are still accepted and must stay that way — there are live
documents in both:

- Raw objects named `<uid>-<13-digit ms>.<ext>` (pre-2026).
- Processed objects named `processed-<videoId>.mp4` with no rendition suffix,
  from before the ladder existed.

## Consumption

The web client and the API service **bundle** this package — Next's compiler and
esbuild respectively — so neither ships a runtime dependency on a workspace
package, and `firebase deploy` does not need to resolve it in the cloud.

The processor consumes it as a real runtime dependency, which is why its
container image copies `packages/contract/dist` alongside the service.

Because both bundlers read `dist/`, the contract must be built before either
consumer: `npm run build:contract`. The root `check`, `build`, and `type-check`
scripts all do this first.

## Bar

Every other service trusts this package blindly, so it holds the highest coverage
threshold in the repository: 95% statements, functions, and lines; 90% branches.
It currently sits at 100% statements across 94 tests.
