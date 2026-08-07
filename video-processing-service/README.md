# video-processing-service

The Cloud Run worker. Receives a Pub/Sub push when a raw upload lands, claims
the video, transcodes it into a rendition ladder, uploads the outputs, and
releases the claim.

```bash
npm run build -w video-processing-service
npm run serve -w video-processing-service   # needs ffmpeg + ffprobe on PATH
```

## Endpoints

| Method | Path             | Behaviour             |
| ------ | ---------------- | --------------------- |
| `GET`  | `/healthz`       | `200 {"status":"ok"}` |
| `POST` | `/process-video` | Pub/Sub push handler  |

### Response codes and why

| Code                      | When                                                         | Reasoning                                                                                                      |
| ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `204`                     | Success, or already processed, or the message is unparseable | Acknowledge. A malformed message can never become valid, so retrying it forever would starve the subscription. |
| `503` + `Retry-After: 30` | Another worker holds a live claim                            | Ask Pub/Sub to come back rather than duplicating the work.                                                     |
| `500`                     | Transient failure — ffmpeg crashed, storage unreachable      | Genuinely worth retrying.                                                                                      |

## Exactly-once processing

Pub/Sub redelivers a push that is not acknowledged within the ack deadline, and a
transcode routinely outlives that deadline. `claimVideo` resolves the race in a
Firestore transaction by issuing a claim token with a **65-minute lease** —
deliberately longer than the 55-minute ffmpeg timeout, so a worker cannot lose
its claim while still legitimately working.

Completion is a compare-and-set on that token: a worker whose lease expired
mid-transcode cannot overwrite the result of the worker that replaced it.

Temporary files are cleaned up in a `finally` block that is awaited **before**
the response is written, because Cloud Run may freeze the instance immediately
after a response and cleanup scheduled afterwards would simply never run. There
is a test asserting that ordering.

## Transcoding

`ffprobe` reads the source height first, and only renditions at or below it are
produced — a 360p source is never upscaled. The selected renditions come out of a
single `ffmpeg` invocation using `-filter_complex` with `split`, so the source is
decoded once and encoded N times rather than decoded N times.

`ffmpeg` is always invoked through `execFile` with a fixed argument array, never
a shell, with a bounded output buffer and a wall-clock timeout.

## Configuration

See `.env.example`. `PORT`, `RAW_VIDEO_BUCKET`, and `PROCESSED_VIDEO_BUCKET` are
read **only** in `src/index.ts` and injected downward — `src/storage.ts` exposes
a factory rather than reading the environment at module scope, which is what
makes it testable and keeps one source of truth per setting.

Credentials come from Application Default Credentials.

## Container

Builds from the **repository root**:

```bash
docker build -f video-processing-service/Dockerfile .
```

The image installs `ffmpeg` (which provides `ffprobe`), runs as uid 1000, and
carries `packages/contract/dist` — unlike the web client, this service consumes
the contract as a real runtime dependency rather than bundling it.

## Deployment

`--no-allow-unauthenticated` is mandatory. The endpoint must be reachable only
by the Pub/Sub push subscription, using an OIDC service account holding
`roles/run.invoker` on this service and nothing else. Full command in
[`docs/setup.md`](../docs/setup.md).
