# Agent Module Documentation

## Purpose

Builtin agent engine: TaskHunter-owned alternative to the managed/external
OpenCode process for running interactive chat sessions. It speaks the same
OpenCode-compatible REST/SSE subset the UI already consumes, so no shared UI
changes are needed to run a session on either engine.

Status: fully implemented behind the `engine` settings flag (default
`opencode`). The router mounts inside `registerOpenCodeProxy` before the
OpenCode readiness gate; with no builtin sessions and the default setting,
every handler falls through and proxy behavior is unchanged.

## Entrypoints and structure

- `packages/web/server/lib/agent/types.js`: engine values, ID prefixes,
  event/part/chunk constants, Go endpoint table. No dependencies, no IO.
- `packages/web/server/lib/agent/store.js`: `createAgentStore()` — JSON-file
  session storage (`<dataDir>/sessions/<id>.json`, atomic tmp+rename writes),
  write-through in-memory index. CRUD only; emits no events.
- `packages/web/server/lib/agent/events.js`: `createAgentEventBus()` —
  in-process pub/sub plus a bounded replay ring. Published envelopes match the
  global message-stream hub shape (`{envelope: {directory, eventId}, payload:
  {type, properties}}`) so builtin payloads can fan out through the same hub.
- `packages/web/server/lib/agent/permissions.js`:
  `createPermissionRegistry()` — blocking ask/reply registry with
  session-scoped `always` allowlists. Backs `POST /permission/:id/reply` for
  builtin sessions.
- `packages/web/server/lib/agent/providers/openai-chat.js`: OpenAI
  `/chat/completions` SSE → normalized chunks.
- `packages/web/server/lib/agent/providers/anthropic-messages.js`: Anthropic
  `/messages` SSE → normalized chunks.
- `packages/web/server/lib/agent/providers/openai-responses.js`: OpenAI
  `/responses` SSE → normalized chunks.
- `packages/web/server/lib/agent/providers/go-catalog.js`: `createGoCatalog()`
  — cached `GET /zen/go/v1/models` for existence checks. The endpoint
  returns ids only, so endpoint/format resolution uses a static table
  mirroring the Go docs; catalog-known models missing from the table are an
  explicit error, and an unreachable catalog falls back to the table.
- `packages/web/server/lib/agent/providers/index.js`: `resolveProviderTarget()`
  (model ref → endpoint/format/credentials) and `streamProvider()` dispatch.

## Implemented (round 2)

- `packages/web/server/lib/agent/tools.js`: `createAgentTools()` —
  read/write/edit/glob/grep/bash on Node builtins. Paths resolve inside the
  session directory; edit requires a unique match; bash truncates to the
  output tail and honors abort/timeout.
- `packages/web/server/lib/agent/loop.js`: `createAgentLoop()` — turn loop
  over normalized provider chunks with permission gating, sequential tool
  execution, abort/blocked/error terminal paths, and session token
  accounting. Usage `length` triggers compaction; `content-filter` becomes a
  message error.
- `packages/web/server/lib/agent/compaction.js`: `createCompactionRuntime()`
  — trailing two-turn window plus an LLM summary prepended as a system
  message. Pending tool results travel in memory, never persisted.
- `packages/web/server/lib/agent/credentials.js`: `createCredentialStore()` —
  Go API key in a 0600 file under the agent data dir.
- `packages/web/server/lib/agent/sse.js`: `createAgentSseMultiplexer()` —
  upstream SSE passthrough multiplexed with builtin events on
  `GET /api/global/event` and `GET /api/event`. Upstream failure never closes
  the stream; only client disconnect does.
- `packages/web/server/lib/agent/routes.js`: `createAgentRouter()` — the
  interception table (session CRUD, prompt_async, abort, revert/unrevert/
  fork/summarize, permission list/reply, status/list merges, move-session,
  go-api-key management). Unknown sessions and disabled-feature traffic call
  `next()`; command/shell sends answer explicit 501.
- `packages/web/server/lib/agent/runtime.js`: `createAgentEngineRuntime()` —
  composition root plus turn registry (busy tracking, abort) and hub fan-out.
- Server wiring: `publishLocalEvent` on the global message-stream hub;
  `engine`/`engineModel` settings fields (defaults `opencode` and
  `opencode-go/deepseek-v4-flash`); router mounted in `registerOpenCodeProxy`
  before the readiness gate via `agentEngineRouter`.
- Deferred: custom (non-Go) providers, MCP/skills/LSP/subagents, prune pass,
  title generation via LLM, retry/backoff policy, question tool.

## Public contracts (implemented)

### Normalized provider protocol

Providers receive unified messages
(`{role, content: [{type: text|tool-call|tool-result, ...}]}`) and tools
(`{name, description, parameters}`), and yield chunk objects:

- `{type: 'text-delta', text}`, `{type: 'reasoning-delta', text}`
- `{type: 'tool-start', id, name}`, `{type: 'tool-input-delta', id, text}`,
  `{type: 'tool-end', id}`
- `{type: 'done', finish: 'stop|tool-calls|length|content-filter', usage:
  {input, output}}`

The loop accumulates `tool-input-delta` fragments and JSON-parses once per
completed tool call. `length` signals compaction; `content-filter` becomes a
message error.

### Store record shape

```json
{
  "version": 1,
  "session": {
    "id": "bse_…", "directory": "/path", "title": "…",
    "agent": "build", "model": {"providerID": "opencode-go", "modelID": "…"},
    "time": {"created": 0, "updated": 0},
    "tokens": {"input": 0, "output": 0, "reasoning": 0},
    "cost": 0, "revert": null, "revertedTail": null
  },
  "messages": [{"info": {…}, "parts": [{…}]}]
}
```

A stored file that fails shape validation throws; callers treat that as
failure, never as empty success. `store.get()` returns `null` for unknown
IDs so the engine router can fall through to the OpenCode proxy.

### Event compatibility

Emitted `{type, properties}` payloads use OpenCode type strings and field
names (`session.created/updated/deleted/status/idle/error/compacted`,
`message.updated`, `message.part.updated/delta`, `permission.asked/replied`).
Part objects carry `id`, `sessionID`, `messageID`, `type`, plus per-type
fields the UI reads (`text`; tool `state.{status,input,output,error,title,
time}`).

## Notes for contributors

- No new npm dependencies: providers use global `fetch`, tools use
  `node:fs`/`node:child_process`. Dependency injection (fetch/fs) keeps
  everything testable without module mocking.
- Token counts are estimates (`ESTIMATED_CHARS_PER_TOKEN`); they drive
  compaction timing only.
- Go requests send `Authorization: Bearer`, `User-Agent: TaskHunter-agent`,
  and `x-opencode-session: <sessionID>` per the Go anti-abuse contract.
