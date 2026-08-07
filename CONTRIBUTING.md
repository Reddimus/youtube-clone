# Contributing

## Getting set up

```bash
nvm use          # Node 24.19.0
npm install      # one root lockfile covers every workspace
npm run dev      # demo mode; no cloud account needed
```

## Before you push

```bash
npm run check
```

That runs, across every workspace: Prettier in check mode, `tsc --noEmit`,
ESLint, Vitest with coverage thresholds, and a production build. CI runs the
same command plus a production-dependency audit and both container builds, so a
green `npm run check` locally is a good predictor of a green CI.

Useful subsets:

| Command                                     | What it does                   |
| ------------------------------------------- | ------------------------------ |
| `npm run format`                            | Rewrite formatting             |
| `npm run lint`                              | ESLint only                    |
| `npm run type-check`                        | Types only                     |
| `npm test`                                  | Tests without coverage         |
| `npm run test:coverage`                     | Tests with thresholds enforced |
| `npm run build`                             | Build every workspace          |
| `npm run check -w video-processing-service` | Everything, one workspace      |

## Repository conventions

**The contract is shared, not copied.** Anything all three services must agree
on — the upload size cap, the extension allowlist, the content-type map, the
rendition ladder, the object-name grammar — lives in `packages/contract` and is
imported. If you find yourself writing a second copy of one of those, put it in
the contract instead. That package holds the highest coverage bar in the repo
(95% statements) because every other service trusts it blindly.

`@yt/contract` must stay isomorphic — no `Buffer`, no `node:*` imports — because
the browser bundle imports it. Node-only helpers go in `@yt/contract/server`.

**Environment variables are read in one place.** Services read `process.env`
only in their entry point (`src/index.ts`) and inject the values downwards. No
module-scope `process.env` reads elsewhere; they make code untestable and create
two sources of truth for one setting.

Note that an unset Docker `ARG` arrives as an _empty string_, not `undefined`,
so use `?.trim() || fallback` rather than `?? fallback` for anything that can
come from a build arg.

**Tests are colocated** as `*.test.ts` next to the code they cover. Prefer
testing behaviour through the public entry point over testing internals. The
processor's `app.test.ts` is the model: the real Express app with every
dependency injected.

**No `any`.** It is an ESLint error. So is an unused `eslint-disable`.

## Adding a rendition

1. Add it to `videoRenditions` in `packages/contract/src/index.ts` with its
   height and bitrate cap.
2. Nothing else. The processor selects renditions by source height, names them
   through `processedVideoName`, and the player builds its switcher from
   whatever the document reports.

Existing documents are not migrated, and both the pre-ladder
`processed-<id>.mp4` name and the suffixed form stay valid — do not remove that
compatibility.

## Changing the object-name grammar

Don't, unless you also keep the old form parseable. `parseRawVideoName` accepts
both the current encoded form and the pre-2026 legacy form for exactly this
reason: there are live documents in both shapes.

## Front end

- Pages are server components; interactivity goes in a client island.
- Every colour, size, and spacing value comes from a token in `globals.css`.
  No new hardcoded hex values.
- Anything interactive needs a visible focus state (the global `:focus-visible`
  rule covers it — do not override it away), a ≥44px touch target, and an
  accessible name.
- New animation must respect `prefers-reduced-motion`.

## Commits

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
Keep each commit to one concern.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
