# Architecture

This document explains _why_ the system is shaped the way it is. Each section
names the failure mode the design addresses, because most of the complexity here
exists to survive a specific way things go wrong.

![System design](system-design.jpg)

## The upload path

```
browser                 generateUploadUrl              Cloud Storage
   │                    (Cloud Function v2)            (redd-raw-videos)
   │                           │                              │
   ├── 1. { extension, size, title? } ──────▶                 │
   │                           │                              │
   │   ◀── 2. signed V4 POST policy + object name ──          │
   │                                                          │
   └── 3. multipart POST, browser ──▶ bucket ─────────────────▶
```

**Why a signed policy instead of proxying the upload.** A 250 MiB upload through
a Cloud Function would occupy an instance for the duration of the transfer, cost
memory proportional to the file, and hit the function's request size limit.
Handing the browser a short-lived credential moves the bytes directly to storage
and keeps the function's job to authorization and naming.

**What the policy enforces.** The policy is generated with
`generateSignedPostPolicyV4` and carries:

- `content-length-range [1, 262144000]` — Cloud Storage rejects an oversized or
  empty body itself, so the limit does not depend on the client honouring it.
- `eq $Content-Type <derived from extension>` — the declared extension and the
  actual content type are bound together at the storage layer.
- A 15-minute expiry.

**Why the object name is generated server-side.** The name is
`u~<base64url uid>~<13-digit ms>~<uuidv4>.<ext>`, built in
`packages/contract/src/server.ts`. The uploader never chooses it. That gives
three properties: the owner is recoverable from the name without a lookup, the
name is unguessable (so possession of a URL is not possession of a capability
over someone else's object), and two uploads from the same user in the same
millisecond cannot collide.

The UID is base64url-encoded rather than interpolated raw because Firebase UIDs
are opaque strings; encoding makes the name grammar closed and reversible.
Decoding round-trips through base64url _and_ UTF-8 and compares bytes, so a
non-canonical encoding cannot smuggle a different byte sequence past validation.

## The processing path

```
object.finalize ──▶ Pub/Sub topic ──▶ push (OIDC) ──▶ Cloud Run
                                                         │
                    ┌────────────────────────────────────┤
                    ▼                                    │
              claimVideo (Firestore transaction)         │
                    │                                    │
       ┌────────────┼─────────────┐                      │
       ▼            ▼             ▼                      │
  "processed"   "leased"      "claimed"                  │
    → 204      → 503 +          │                        │
               Retry-After      ▼                        │
                          ffprobe → ffmpeg → upload      │
                                   │                     │
                                   ▼                     │
                          completeVideo (CAS on token) ──┘
```

### Exactly-once processing over an at-least-once transport

Pub/Sub guarantees _at least_ once delivery and redelivers a push message that
has not been acknowledged within the subscription's ack deadline. Cloud Run
allows a request to run for up to 3600s; the ack deadline is far shorter. So a
long transcode **will** be redelivered while it is still running. Without
coordination, two workers would transcode the same video simultaneously and race
to write the result.

`claimVideo` resolves this inside a Firestore transaction:

| Document state                        | Result      | HTTP                    | Reasoning                                                |
| ------------------------------------- | ----------- | ----------------------- | -------------------------------------------------------- |
| `status: "processed"`                 | `processed` | 204                     | Already done. Acknowledge so it stops being redelivered. |
| `status: "processing"`, lease live    | `leased`    | 503 + `Retry-After: 30` | Another worker holds it. Ask Pub/Sub to come back later. |
| `status: "processing"`, lease expired | `claimed`   | continues               | The previous worker died. Take over.                     |
| absent or `failed`                    | `claimed`   | continues               | Fresh work.                                              |

The lease is 65 minutes — deliberately longer than the 55-minute ffmpeg timeout,
so a worker cannot have its claim stolen while it is still legitimately working.

For documents written before `claimedAt` existed, the lease age falls back to the
timestamp embedded in the video ID. That is why the ID grammar carries a
timestamp at all.

### Why completion is a compare-and-set

`completeVideo` only writes if the document still carries _this_ worker's claim
token and is still `processing`. Consider: worker A's lease expires, worker B
takes over and finishes, then worker A's ffmpeg finally returns. Without the CAS,
A would overwrite B's result — plausibly with an older or partial rendition set.
With it, A's write is refused, A reports failure, and B's result stands.

### Why a bad message returns 204

A push message with malformed base64, a bucket that does not match, or an object
name that fails the grammar cannot become valid on retry. Returning 4xx/5xx would
make Pub/Sub redeliver it forever — a poison message that starves the
subscription. The handler logs it and acknowledges. Only _transient_ failures
(ffmpeg crashed, storage was unreachable) return 500 and get retried.

### Cleanup ordering

Temporary files are removed in a `finally` block that is awaited **before** the
response is written. Cloud Run may freeze or reclaim an instance immediately
after a response, so cleanup scheduled after the response can simply never run,
leaking disk on a container with a fixed filesystem. There is a test that asserts
this ordering specifically.

## The rendition ladder

`ffprobe` reads the source height first, and only renditions at or below it are
produced — a 360p upload is never upscaled to 720p, which would cost CPU and
produce a larger file with no additional detail. At least the smallest rendition
is always emitted.

The selected renditions come out of **one** `ffmpeg` invocation:

```
-filter_complex "[0:v]split=2[a][b];[a]scale=-2:360[v360];[b]scale=-2:720[v720]"
-map "[v360]" ... out-360p.mp4
-map "[v720]" ... out-720p.mp4
```

The source is decoded once and encoded N times, rather than decoded N times. On a
single-vCPU Cloud Run instance with `--max-instances=1` this matters: decode is a
meaningful fraction of the work.

Audio is mapped with `-map 0:a?` so a silent source does not fail the job.
`ffmpeg` is always invoked through `execFile` with a fixed argument array, never
through a shell, so no filename can be interpreted as an argument or a command.

## Backward compatibility

Firestore contains documents from before the rendition ladder existed. They have
a `filename` of `processed-<videoId>.mp4` with no rendition suffix and no
`renditions` array. Both name shapes are accepted by
`processedVideoNamePattern`, and the client falls back to the single stored
filename when `renditions` is absent. Old videos keep playing; nothing was
migrated.

The same applies to object names: the pre-2026 `<uid>-<ms>.<ext>` form is still
parsed alongside the current encoded form.

## Pagination

`getVideos` orders by `updatedAt DESC, __name__ DESC` and pages with an opaque
cursor that is strictly validated on the way back in. Legacy documents lacking
`updatedAt` are served in a second, document-ID-ordered phase, because Firestore
omits documents that are missing an indexed field. Both composite indexes are
declared in `yt-api-service/firestore.indexes.json`.

## The shared contract

`packages/contract` is the single definition of everything the three services
must agree on: the size cap, the extension allowlist, the content-type map, the
rendition ladder, and the object-name grammar in both directions.

It is split into two entry points:

- `@yt/contract` — isomorphic. No Node globals, so the browser bundle can import
  it.
- `@yt/contract/server` — UID encoding and name construction/parsing, which need
  `Buffer` and `node:crypto`.

The web client and the API service bundle it (Next's compiler and esbuild
respectively), so neither ships a runtime dependency on a workspace package. The
processor consumes it as a real runtime dependency, which is why its container
copies `packages/contract/dist`.

## Front-end rendering

The feed and watch pages are **server components**. They call the `getVideos` /
`getVideo` callables over the documented Firebase callable HTTP protocol, which
means:

- HTML arrives complete rather than after two post-hydration round-trips.
- Each route has its own title, description, canonical URL, and `VideoObject`
  JSON-LD — impossible when every page was `'use client'`.
- The Firebase SDK is not on the critical path.

Interactivity is isolated to client islands: the header (auth state), the upload
dialog, the theme toggle, the toast host, and the player's quality switcher. The
auth SDK is loaded with a dynamic `import()` inside those helpers, so a visitor
who only watches a video never downloads it.

## What is deliberately not here

- **No CDN in front of processed video.** Objects are served directly from
  `storage.googleapis.com`. A real deployment would put Cloud CDN in front.
- **No HLS/DASH.** The ladder produces discrete MP4s and the player switches
  between them explicitly. Adaptive bitrate would need a segmenter and a manifest.
- **No content moderation, virus scanning, or quota per user.**
- **No thumbnail extraction.** The feed shows a placeholder frame; extracting a
  poster frame is an obvious next `ffmpeg` output.
- **No retry budget or dead-letter topic** on the Pub/Sub subscription.
