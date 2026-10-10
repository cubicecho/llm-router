# AGENTS.md — llm-router

llm-router is a thin router in front of OpenAI-compatible model servers. The
operator registers **providers** (a base URL, an optional API key, extra
headers), groups them into **workspaces**, and each workspace serves one
OpenAI-compatible `/v1` at `/w/<slug>/v1` that lists and routes to every model
its members offer. `/v1` is the same over every enabled provider. Model ids are
`<provider>/<upstream id>`. Requests are forwarded as bytes: nothing is
translated between API formats.

It mirrors its sibling [mcp-router](https://github.com/cubicecho/mcp-router) in layout and tooling. Design
decisions and their reasons are in [`README.md`](README.md).

Monorepo (npm workspaces): `shared/` (zod schemas and types, the contract),
`server/` (Express 5), `app/` (React, Vite, cubeui).

`server/src/` holds only `index.ts` (the entry) at its root:

| Folder | Holds |
| --- | --- |
| `core/` | what every other folder reads: defaults, errors, version |
| `config/` | env flags and the config store (the JSON files under `DATA_DIR/config`) |
| `http/` | the Express app (`createApp`), server timeouts, graceful shutdown |
| `auth/` | bearer-token and origin guards |
| `api/` | the admin REST routes under `/api` and their error middleware |
| `gateway/` | the `/v1` endpoints: model naming, scopes, model listing, the proxy |

## Commands

All from the repo root.

```bash
npm run dev              # server (watch, port 3001) + Vite (port 3000, proxies /api, /v1, /w)
npm run check            # biome check --write + tsc --noEmit for all three packages
npm test                 # vitest: server (node), app (jsdom), then the stories in Chromium
npm run storybook        # Storybook dev server (port 6006)
npx playwright install chromium-headless-shell   # once per machine, for the stories project
npm run build            # shared, server (tsc), app (vite build)
npm run start            # node server/dist/index.js, serving app/dist on port 3000
docker compose up        # the container, with ./data mounted at /data
```

A single story file: `cd app && npx vitest run -c vitest.stories.config.ts src/routes/index.stories.tsx`.

## Things that are easy to get wrong

- **A provider's `apiKey` never leaves the server.** `/api` answers with
  `apiKeySet: boolean`. A `PATCH` without `apiKey` keeps the stored key, and
  `apiKey: null` removes it. A test asserts the key appears in no `/api`
  response; keep it passing. `headers` are not secret and are returned.
- **Two error envelopes.** `/api` answers `{ error, code, detail? }`
  (`shared/src/wire.ts`). Everything under `/v1` answers OpenAI's
  `{ error: { message, type, code } }` (`gateway/openai-error.ts`), including
  the auth and origin refusals, so client SDKs report them properly.
- **A model id splits at its first `/`.** Provider names cannot contain `/`
  (`providerNameSchema`), upstream ids can (`openrouter/anthropic/claude-opus-5-5`).
- **One handler serves both `/v1` and `/w/:slug/v1`.** The difference is the
  scope from `gateway/endpoint-scope.ts`; do not fork the handlers.
- **A provider's `baseUrl` includes its version path** (`https://api.openai.com/v1`,
  `http://localhost:11434/v1`). The router appends only the rest (`/models`,
  `/chat/completions`).
- **Model listings are cached** per provider for
  `GATEWAY_DEFAULTS.modelListCacheSeconds` and dropped when the config changes.
  `GET /api/providers/:name/models?refresh=true` skips the cache.
- **Deleting a provider prunes it from every workspace.** A workspace `PATCH`
  replaces `members` whole, so the UI always sends the full map.
- **Config writes are atomic and 0600** (temp file, `chmod`, `rename`), and
  files are parsed with `.loose()` so hand-added keys survive a round trip.
  The store watches the files (chokidar); `POST /api/reload` forces a reload.
- **`app/src/routeTree.gen.ts` is committed.** CI type-checks before it builds,
  so the tree has to be there. Regenerate it with `npx vite build` in `app/`
  after adding or renaming a route (`tsr generate` crashes under Node 26).
- **`app/src/components/ui/`, `app/src/components/*.tsx` and the listed
  `app/src/lib` files are vendored cubeui**, installed with
  `npx shadcn@latest add @cubeui/<item>`. Do not edit them or write stories for
  them; the linter is off for them in `biome.json`.
- **Storybook merges a story's `parameters` into the meta's key by key.** An
  object or array answer in `parameters.api` that must replace the meta's is
  given as a function (`() => workspace({ members: {} })`).
- **Submit buttons stay on the default variant.** The `positive` variant fails
  axe's contrast check while hovered.

## Git

- Conventional Commits; semantic-release derives versions and image tags from
  them on `main`.
- No `Co-Authored-By` trailers or other AI attribution.
- `npm run check && npm test` before every commit.

## CI / Release

- `.github/workflows/ci.yml`: check, test and build on every push and PR to `main`.
- `.github/workflows/release.yml`: after CI passes on `main`, semantic-release
  cuts a release and pushes the Docker image to `ghcr.io/<repo>` and Docker Hub.
  Needs the repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.
