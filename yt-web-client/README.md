# yt-web-client

The Next.js 16 front end. Server-rendered feed and watch pages with client
islands for the parts that genuinely need interactivity.

```bash
npm run dev        # from the repository root — demo mode, no setup needed
```

## Rendering model

`/` and `/watch/[id]` are **server components**. They fetch through the Firebase
callable HTTP protocol from `app/lib/videos.ts`, so markup arrives complete and
each route carries its own title, description, canonical URL, and `VideoObject`
JSON-LD. Every page in this app used to be `'use client'`, which made per-route
metadata impossible and pushed all rendering past two post-hydration round-trips.

Client islands, and why each one is a client component:

| Component       | Why                                                   |
| --------------- | ----------------------------------------------------- |
| `site-header`   | Subscribes to auth state                              |
| `upload-dialog` | File picker, drag/drop, XHR upload progress           |
| `video-player`  | Quality switching with playback-position preservation |
| `theme-toggle`  | Writes `localStorage` and `data-theme`                |
| `toast`         | Holds the notification queue                          |

The Firebase **auth** SDK is loaded with a dynamic `import()` inside
`app/firebase/firebase.ts`, so a visitor who only watches a video never
downloads it. Analytics is deferred to `requestIdleCallback` and never runs in
demo mode.

## Demo mode

With no `NEXT_PUBLIC_FIREBASE_PROJECT_ID` configured, `app/lib/runtime.ts`
switches the app into demo mode: the feed comes from `app/lib/demo-data.ts` and
the renditions come from `public/samples`, served by the app itself. Playback and
the quality switcher work for real. Sign-in and upload are hidden behind a
labelled **Demo mode** badge rather than shown as dead controls.

This is what makes `git clone && npm install && npm run dev` a complete
experience with no cloud account.

## Design system

`app/globals.css` holds every token: colour, type scale, spacing, radii, shadows,
and motion. Colour is assigned by job — `--brand`, `--signal` (in flight),
`--ready`, `--danger` — rather than used decoratively, and each has a light and a
dark value.

Themes: `prefers-color-scheme` by default, overridden by a `data-theme`
attribute that an inline script in `layout.tsx` applies before first paint, so
there is no flash of the wrong palette. The toggle itself holds no React state —
CSS picks the icon and label from the same attribute.

Accessibility is enforced structurally rather than per-component: one global
`:focus-visible` rule means nothing can ship without a visible keyboard
indicator, and a global `prefers-reduced-motion` block disables animation.

## Environment

Copy `.env.example` to `.env.local`. Every `NEXT_PUBLIC_*` value is public by
design; never put a service-account key in one.

`NEXT_PUBLIC_*` values are inlined at **build** time, so a container build must
receive them as `--build-arg` — do not copy `.env.local` into an image. Note
that an unset `ARG` arrives as an empty string, not `undefined`.

## Container

Builds from the **repository root**, because the app is an npm workspace:

```bash
docker build -f yt-web-client/Dockerfile .
```

Output is a Next standalone bundle. Because `outputFileTracingRoot` points at
the workspace root, the entry point lives at `yt-web-client/server.js` inside the
image. `@yt/contract` is bundled by the compiler, so it is not a runtime
dependency here.
