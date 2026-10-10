# llm-router

One OpenAI-compatible endpoint in front of several model servers.

Register **providers** (OpenAI, OpenRouter, Ollama, llama.cpp, vLLM, anything
that speaks the OpenAI API), group them into **workspaces**, and point a client
at a workspace. The client sees one `/v1` that lists every model the
workspace's providers offer and routes each request to the right one.

It is the model-server counterpart of
[mcp-router](../mcp/mcp-router), and is built the same way.

## Quick start

```bash
npm install
npm run dev          # UI on http://localhost:3000
```

On first run the server generates a bearer token, writes it to
`data/config/settings.json` and prints it once. Paste it into the UI when asked.
Set `LLM_ROUTER_TOKEN` to choose the token yourself, or `SECURE_LOCAL_NET=true`
to run without one on a network you trust.

With Docker:

```bash
docker compose up --wait     # http://localhost:3000, config in ./data
```

Then, in the UI:

1. **Providers → Add provider.** Give it a name (`ollama`), its base URL
   **including the version path** (`http://localhost:11434/v1`,
   `https://api.openai.com/v1`) and, if it needs one, an API key.
2. **Workspaces → New workspace.** Switch on the providers it should serve. A
   member serves every model its provider lists unless you choose a subset.
3. Copy the connection details from the workspace page.

## Connecting a client

| | |
| --- | --- |
| Base URL | `http://<host>:3000/w/<slug>/v1` for a workspace, `http://<host>:3000/v1` for every enabled provider |
| API key | the router's token |
| Model | `<provider>/<model>`, e.g. `ollama/qwen3:32b` |

```bash
curl http://localhost:3000/w/research/v1/chat/completions \
  -H "Authorization: Bearer $LLM_ROUTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "ollama/qwen3:32b", "messages": [{"role": "user", "content": "Hello"}]}'
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3000/w/research/v1", api_key="<router token>")
client.chat.completions.create(model="ollama/qwen3:32b", messages=[{"role": "user", "content": "Hello"}])
```

## Endpoints

| Path | Does |
| --- | --- |
| `GET /healthz` | `{ ok, version }`, no token needed |
| `GET /v1/models`, `GET /v1/models/<id>` | the models of every enabled provider |
| `POST /v1/<anything>` | forwards a JSON request to the provider named in `model` |
| `/w/<slug>/v1/...` | the same, limited to one workspace's members and their allowed models |
| `/api/...` | the admin API the UI uses: `status`, `settings`, `reload`, `providers`, `workspaces` |

Any `POST` with a JSON body that carries a `model` is routed: `chat/completions`,
`completions`, `embeddings`, `responses` and whatever else the provider
supports. Streams (SSE) pass straight through.

## Configuration

Everything is a JSON file under `DATA_DIR/config` (`./data/config` by default),
written by the UI and safe to edit by hand. Edits are picked up as they are
saved; **Settings → Reload config** forces it.

```
config/
  settings.json              port, authToken, authEnabled, host, allowedOrigins, responseTimeoutMs
  providers/<name>.json      name, baseUrl, apiKey, headers, enabled, displayName, description
  workspaces/<slug>.json     name, slug, enabled, description, members
```

A workspace's `members` maps a provider name to `{ "enabled": true, "models": [...] }`.
Leave `models` out to serve everything the provider lists.

| Environment variable | Does |
| --- | --- |
| `LLM_ROUTER_TOKEN` | the bearer token; overrides the one in `settings.json` |
| `SECURE_LOCAL_NET` | `true` disables the token entirely |
| `DATA_DIR` | where `config/` lives |
| `PORT` | the port (default 3000) |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS`, `HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS` | idle-connection timeouts, see `.env.example` |

### Secrets

Provider API keys are stored in plaintext in `providers/<name>.json`; the files
are created with mode 0600. The admin API never returns a key, only whether one
is set, so the UI can replace or remove a key but not show it. **Extra headers
are not treated as secret**: they are returned by the API and shown in the UI,
so put credentials in the API key field.

## Design decisions

- **OpenAI-compatible upstreams only.** The router forwards the request body
  with `model` rewritten to the provider's own id and pipes the response back
  unchanged. It does not translate between API formats, so a provider with a
  different native API is reached through its OpenAI-compatible endpoint.
- **Model ids are `<provider>/<model>`,** split at the first `/`. Provider
  names cannot contain a `/`; upstream ids can. The prefix makes every id
  unique and tells the router where to send a request without a lookup table.
  Responses are not rewritten, so the `model` in a response is the provider's
  own id.
- **Workspaces choose, they do not configure.** A workspace is a set of
  providers and, per provider, an optional allowlist of models. Keys and URLs
  belong to the provider.
- **One operator token** guards `/api` and every `/v1`. There are no
  per-workspace keys, so a workspace limits what a client is offered, not what
  a holder of the token may reach.
- **A provider that cannot be listed is skipped,** not fatal: `/models` answers
  with what the others list, and the failure is logged and shown in the UI.
  Listings are cached for a minute.
- **Timeouts bound the wait for a response to start,** not its length
  (`responseTimeoutMs`, default ten minutes), so long streams are not cut off.
  A client that disconnects cancels the upstream request.
- **Errors under `/v1` use OpenAI's envelope** (`model_not_found` 404, an
  unreachable provider 502, a timeout 504), so client SDKs report them as
  they would the real API's. A provider's own error responses pass through.
- **Flat JSON files instead of a database,** as in mcp-router: the config is
  small, hand-editable and easy to back up.

Not in this version: multipart endpoints (audio, files), model aliases,
per-workspace keys, native non-OpenAI APIs, usage accounting.

## Development

```bash
npm run check     # biome + tsc
npm test          # server tests, then the UI stories in Chromium
npm run storybook
```

`AGENTS.md` has the layout and the repo-specific rules.
