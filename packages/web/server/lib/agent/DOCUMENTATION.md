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
  Go key plus per-provider keys (`provider-key-<id>`) in 0600 files under the
  agent data dir. Provider ids are restricted path segments
  (`isCustomProviderId` in `types.js`, one vocabulary shared with settings,
  the router, and the provider router); missing files read as unconfigured.
- `packages/web/server/lib/agent/sse.js`: `createAgentSseMultiplexer()` —
  upstream SSE passthrough multiplexed with builtin events on
  `GET /api/global/event` and `GET /api/event`. Upstream failure never closes
  the stream; only client disconnect does.
- `packages/web/server/lib/agent/routes.js`: `createAgentRouter()` — the
  interception table (session CRUD, prompt_async, abort, revert/unrevert/
  fork/summarize, permission list/reply, status/list merges, move-session,
  go-api-key management). Unknown sessions and disabled-feature traffic call
  `next()`; command/shell sends answer explicit 501. HTTP handlers marshal to
  the shared operations in `dispatch.js`, so HTTP and in-process callers see
  one behavior.
- `packages/web/server/lib/agent/dispatch.js`: `createAgentDispatch()` —
  in-process session operations shared by the router and server-side callers
  (board, scheduled tasks, TaskHunter control, session service): ownership by
  store membership, creation engine from settings, create/prompt/fork/patch/
  delete with the matching event emissions, message reads, and the busy map
  (global + directory-scoped) callers merge over the upstream status view.
  Errors carry `statusCode`/`code`; callers map without string matching.
- `packages/web/server/lib/agent/session-info.js`: the OpenCode-compatible
  session projection (strips the revert tail), shared by routes and dispatch.
- `packages/web/server/lib/agent/runtime.js`: `createAgentEngineRuntime()` —
  composition root plus turn registry (busy tracking, abort) and hub fan-out.
- Server wiring: `publishLocalEvent` on the global message-stream hub;
  `engine`/`engineModel` settings fields (defaults `opencode` and
  `opencode-go/deepseek-v4-flash`); router mounted in `registerOpenCodeProxy`
  before the readiness gate via `agentEngineRouter`.
- Engine-aware server callers (Phase 2). All reach the engine through the
  late-bound `getAgentDispatch` dependency (server boot builds the engine
  after these consumers):
  - `taskhunter-sessions` service: new-session creation consults the engine
    setting; requests needing opencode-only capabilities (goal, slash
    commands, providers the builtin engine cannot reach, non-build agents,
    variants) deliberately stay
    on opencode and the result carries an `engine` field. Sends/forks on
    existing sessions route by store membership; builtin sessions skip
    upstream selection validation and the prompt-landed poll (dispatch is
    synchronous).
  - Board (feature-routes-runtime): the checker/resume/reconciler readers
    resolve the session's engine per call — builtin reads come from the
    engine store, and `fetchSessionStatuses` merges the directory-scoped
    builtin busy map over the upstream view so a running builtin worker is
    never re-dispatched.
  - Scheduled tasks runtime: `runTaskWithWatchdog` picks the engine per run
    with the same capability rules; builtin runs create/prompt in-process.
  - TaskHunter control service: session status/messages/resolveSessionDirectory
    resolve builtin-owned sessions from the engine store; `wait: true` skips
    the opencode client entirely for builtin sessions.
  - Permission auto-accept: builtin pending permissions are answered through
    the engine registry in-process (an upstream reply would 404 and count as
    success, hanging the turn forever), and the builtin session store
    participates in the auto-accept parent-chain walk.
  - Compaction history: completed tool parts replay as assistant
    `tool-call` + a following user-role `tool-result` batch. Providers map
    tool outputs only from the user shape, so replaying outputs on the
    assistant message left orphan `function_call`s that upstream rejected
    (400) from the second tool turn on.
- Custom providers (Phase 3): user-configured OpenAI-compatible/Anthropic
  endpoints under `x-<id>` provider ids, configured through the Agent Engine
  settings page.
  - Settings carry only the non-secret map `engineProviders`
    (`{id: {endpoint, format}}`); the sanitizer rejects anything but absolute
    http(s) endpoints without embedded credentials, and PUT semantics are
    full-map replace (null/empty clears). API keys live only in credential
    files and never pass through settings responses.
  - `providers/index.js`: `resolveProviderTarget()` resolves `x-<id>` refs
    through the settings entry plus the provider key file (missing config →
    `unknown_provider`, missing key → `missing_credentials`, never a guessed
    protocol); `isProviderEligible()` answers whether a provider can run on
    builtin right now — Go needs a key, custom needs config + key. The three
    engine gates (session-create, run-existing, scheduled-task) consult
    `dispatch.providerEligible` instead of hardcoding `opencode-go`, so a
    fully configured custom provider runs builtin while a half-configured one
    falls back to opencode visibly.
  - `routes.js`: `GET /agent/providers` (definitions + per-provider key
    `configured` flag, never the key), `PUT /agent/providers/:id` (validate +
    write the definition through the settings pipeline so the same sanitizer
    governs this route and a direct settings PUT), `PUT /agent/providers/:id/key`
    (store/clear the key), `DELETE /agent/providers/:id` (remove definition
    and key — a removed provider must not leave its secret behind).
  - UI: custom providers section on the Agent Engine settings page (add form,
    per-row key management, remove); searchable via the `engine.providers`
    entry.
- Deferred: MCP/skills/LSP/subagents, prune pass,
  title generation via LLM, retry/backoff policy, question tool,
  goal/command-shaped sessions on builtin (they run on opencode).

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
