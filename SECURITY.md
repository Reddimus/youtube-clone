# Security

## Reporting

Report vulnerabilities privately through
[GitHub security advisories](https://github.com/Reddimus/youtube-clone/security/advisories/new).
Please do not open a public issue.

## Deployment status

**Redd is not hosted publicly.** As of 2026-08-07 the Cloud Run web client has
been deleted and the remaining services in project `redd-2aa7b` have had their
`allUsers` invoker binding removed, so nothing in this project is reachable
without authentication. The repository runs entirely offline in demo mode.

Two issues were closed in the process, both caused by the deployed 2024 build
having drifted from this repository:

- **`getVideos` returned raw Firestore documents**, exposing the uploader's
  `uid` and internal `status` to any unauthenticated caller. The `toPublicVideo`
  allowlist in `packages/contract` fixes this at the source; it had never been
  deployed.
- **`video-processing-service` was invokable by `allUsers`**, contradicting its
  own documented requirement of `--no-allow-unauthenticated`. Anyone could have
  submitted transcode jobs.

## Design

**Uploads** never pass through application code. The browser receives a signed
V4 POST policy scoped to a server-generated object name, with a 15-minute
expiry, a `content-length-range` of 1 byte to 250 MiB, and an `eq $Content-Type`
condition. Cloud Storage enforces both conditions, so the limits do not depend
on the client.

**Object names** are generated server-side as
`u~<base64url uid>~<13-digit ms>~<uuidv4>.<ext>`. The uploader cannot choose the
name, so it cannot address another user's object, and the name is unguessable.
UID decoding round-trips through base64url and UTF-8 and compares bytes, so a
non-canonical encoding cannot smuggle a different byte sequence past validation.

**Every path that reaches the filesystem** is validated against
`safeLocalVideoNamePattern` and checked with `path.basename`, so no object name
can traverse out of the working directories.

**ffmpeg and ffprobe** are invoked with `execFile` and a fixed argument array —
never through a shell — with a wall-clock timeout and a bounded output buffer.

**Firestore and Storage rules deny all client SDK access.** The `videos` and
`users` collections are written only by the Admin SDK inside Cloud Functions and
the processor, and read only through the `getVideos` callable. Rules and indexes
are version-controlled in `yt-api-service/`, not console-only.

**The public feed is an allowlist.** `toPublicVideo` copies `filename`, `title`,
`description`, and `renditions` and nothing else, so `uid`, `claimToken`, and
`status` cannot leak even if new fields are added to the document later.

**The processing endpoint** expects a Pub/Sub push subscription authenticated
with an OIDC service account holding only `roles/run.invoker`. It must never be
deployed with `--allow-unauthenticated`.

**Pagination cursors** are validated strictly and rejected with
`invalid-argument` rather than trusted as query state.

## Secrets

No secrets are committed. Firebase _web_ configuration is public by design and
read from the environment. Service-account keys, `.env` files, and credential
JSON are gitignored at the root and excluded from both container build contexts.

## Dependency audit

CI fails on any production dependency advisory rated `high` or above
(`npm audit --omit=dev --audit-level=high`).

### Accepted exceptions

As of 2026-08-07 the repository carries 7 **moderate** advisories, all
transitive through `@google-cloud/storage` and `firebase-admin`, and none
reachable from code paths this project uses. They are below the CI threshold and
are accepted rather than force-fixed, because `npm audit fix --force` downgrades
`@google-cloud/storage` to a version whose signed-policy API this project
depends on.

This exception is re-evaluated whenever `@google-cloud/storage` or
`firebase-admin` is upgraded.
