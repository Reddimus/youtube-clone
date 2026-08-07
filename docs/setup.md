# Setup

There are two ways to run Redd. Start with the first one.

## 1. Demo mode — no accounts, no configuration

```bash
nvm use          # Node 24.19.0, pinned in .nvmrc
npm install
npm run dev      # http://localhost:3000
```

This is the default when no Firebase project is configured. The feed is seeded
from `yt-web-client/app/lib/demo-data.ts`, and the renditions in
`yt-web-client/public/samples` are served by the app itself, so browsing,
playback, and the quality switcher all work. Sign-in and uploading are disabled
and the header shows a **Demo mode** badge.

Everything else in the repository still runs: the full test suite, both
container builds, lint, and type-checking all work without any cloud access.

### Prerequisites

| Tool             | Version                      | Needed for                           |
| ---------------- | ---------------------------- | ------------------------------------ |
| Node             | 24.x (`.nvmrc` pins 24.19.0) | everything                           |
| npm              | 10+ (ships with Node 24)     | everything                           |
| Docker           | any recent                   | container builds only                |
| ffmpeg + ffprobe | 6+                           | running the processor outside Docker |
| Java             | 17+                          | Firebase emulators only              |

`nvm install` in the repository root picks up `.nvmrc` automatically.

## 2. Connected to a real Firebase project

Only needed if you want to exercise real auth, real uploads, and the real
transcoding pipeline.

### Create the project

1. Create a Firebase project and enable **Google** sign-in under
   Authentication → Sign-in method.
2. Create a Firestore database.
3. Create two Cloud Storage buckets, e.g. `<project>-raw-videos` and
   `<project>-processed-videos`.
4. Register a Web app and copy its config.

### Configure the web client

```bash
cp yt-web-client/.env.example yt-web-client/.env.local
```

Fill in the values from `firebase apps:sdkconfig WEB --project <project-id>`.

Every `NEXT_PUBLIC_*` value is **public by design** — Firebase web config is
meant to be shipped to browsers, and access is controlled by security rules, not
by hiding these strings. Never put a service-account key in a `NEXT_PUBLIC_`
variable.

Setting `NEXT_PUBLIC_FIREBASE_PROJECT_ID` automatically leaves demo mode. To
force one or the other, set `NEXT_PUBLIC_DEMO_MODE=true|false`.

### Configure the services

```bash
cp yt-api-service/functions/.env.example yt-api-service/functions/.env
cp video-processing-service/.env.example video-processing-service/.env
```

### Bucket policies

```bash
gsutil cors set utils/gcs-cors.json gs://<project>-raw-videos
gsutil lifecycle set utils/raw-video-lifecycle.json gs://<project>-raw-videos
```

The CORS file lists the origins allowed to POST an upload; add your own before
applying it. The lifecycle rule deletes raw uploads after one day — the
processed renditions are what get kept.

### Deploy rules, indexes, and functions

```bash
cd yt-api-service
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
firebase deploy --only functions
```

Functions run on the `nodejs24` runtime. Firestore and Storage rules deny all
client SDK access — the collections are reachable only through the Admin SDK
inside the functions and the processor.

### Deploy the processor

```bash
# Cloud Run needs linux/amd64; build for it explicitly if you are on Apple silicon.
docker build --platform linux/amd64 \
  --file video-processing-service/Dockerfile \
  --tag us-central1-docker.pkg.dev/<project>/video-processor/service:latest .
docker push us-central1-docker.pkg.dev/<project>/video-processor/service:latest

gcloud run deploy video-processing-service \
  --project=<project> --region=us-central1 \
  --image=us-central1-docker.pkg.dev/<project>/video-processor/service:latest \
  --no-allow-unauthenticated \
  --timeout=3600 --memory=2Gi --cpu=1 \
  --min-instances=0 --max-instances=1 \
  --set-env-vars=RAW_VIDEO_BUCKET=<project>-raw-videos,PROCESSED_VIDEO_BUCKET=<project>-processed-videos
```

**`--no-allow-unauthenticated` is not optional.** The processing endpoint must be
reachable only by the Pub/Sub push subscription, using an OIDC service account
that holds `roles/run.invoker` on this service and nothing else. A publicly
invokable processor lets anyone submit transcode jobs against your project.

Then wire storage notifications to a Pub/Sub topic and point a push subscription
at `https://<service-url>/process-video` with that service account.

### Deploy the web client

```bash
docker build --platform linux/amd64 \
  --file yt-web-client/Dockerfile \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=... \
  --build-arg NEXT_PUBLIC_PROCESSED_VIDEO_BUCKET=<project>-processed-videos \
  --tag us-central1-docker.pkg.dev/<project>/web/client:latest .
```

`NEXT_PUBLIC_*` values are inlined at build time, so they must be passed as
`--build-arg`. Do not copy `.env.local` into the image.

## Troubleshooting

**`npm run dev` shows an empty feed.** You are in connected mode with no
processed videos, or the API is unreachable. Unset
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` to fall back to demo mode.

**Docker build fails with "Can't resolve '../lib/format'".** The images build
from the **repository root**, not from the service directory:
`docker build -f yt-web-client/Dockerfile .`

**Uploads fail with a CORS error.** `utils/gcs-cors.json` does not list your
origin. Add it and re-run `gsutil cors set`.

**Videos upload but never appear.** They are stuck before `status: "processed"`.
Check the processor's logs — the usual causes are the Pub/Sub push subscription
not being authorized to invoke Cloud Run, or the processor lacking write access
to the processed bucket.
