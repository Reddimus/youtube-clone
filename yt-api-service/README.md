# yt-api-service

Firebase Functions, Firestore rules, and Firestore indexes.

```bash
npm run build -w @yt/api-service
npm run serve -w @yt/api-service     # emulator on localhost:4000
```

Requires the Firebase CLI: `npm install -g firebase-tools && firebase login`.

## Functions

| Function            | Type            | Purpose                                                  |
| ------------------- | --------------- | -------------------------------------------------------- |
| `generateUploadUrl` | callable v2     | Authorizes an upload and returns a signed V4 POST policy |
| `getVideos`         | callable v2     | Paginated public feed                                    |
| `createUser`        | Auth trigger v1 | Writes the user document on first sign-in                |

### `generateUploadUrl`

Requires `request.auth`. Validates the extension against the shared allowlist,
the size against the 250 MiB cap, and the optional `title` (≤100 chars) and
`description` (≤5000 chars). Generates a server-side object name — the client
never chooses it — writes the `videos/{videoId}` document with
`status: "uploading"`, and returns a policy that expires in 15 minutes with
`content-length-range` and `eq $Content-Type` conditions that Cloud Storage
enforces itself.

### `getVideos`

Returns `{ videos, nextCursor }`. Orders by `updatedAt DESC, __name__ DESC`,
with a second document-ID-ordered phase for legacy documents that predate
`updatedAt` — Firestore omits documents missing an indexed field, so a single
query would silently drop them. `limit` defaults to 12 and is clamped to 1–50.
Cursors are opaque and validated strictly; a malformed one is rejected with
`invalid-argument` rather than trusted.

Every document goes through `toPublicVideo`, an allowlist, so `uid`,
`claimToken`, and `status` cannot reach a client.

## Rules and indexes

`firestore.rules` and `storage.rules` deny **all** client SDK access. The
collections are written only by the Admin SDK inside these functions and the
processor, and read only through `getVideos`. Both rule files and
`firestore.indexes.json` are version-controlled here rather than living only in
the Firebase console.

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

## Build

`npm run build` bundles with **esbuild** into a single `lib/index.js`, keeping
`firebase-admin`, `firebase-functions`, and `@google-cloud/storage` external.

This is deliberate. Firebase deploys only the `functions/` directory and runs
`npm install` in the cloud, where a workspace dependency like `@yt/contract`
cannot resolve. Bundling inlines the contract, so nothing at runtime depends on
a local workspace package — and cold starts improve as a side effect.
`tsc --noEmit` still does the type-checking.

## Runtime

`nodejs24`. Note that Google decommissions `nodejs20` on **2026-10-30**; any
deployment still on it needs to move.

`createUser` uses the v1 Auth trigger, which remains the supported path for
`onCreate` in `firebase-functions` v7. Identity Platform blocking functions are
the eventual migration target.
