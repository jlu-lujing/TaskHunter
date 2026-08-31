# Board (Kanban) — server module

Global TaskHunter Kanban board: one set of columns shared by all projects;
tasks carry a `projectId` (settings project id or `null` = unassigned).
Storage is a single JSON file in the TaskHunter data directory, independent
of OpenCode state. The board is also the dispatch queue: ready cards can be
judged by the evaluator and claimed by the dispatcher into real sessions.

## Files

- `service.js` — `createBoardService({ dataDir, readSettingsFromDiskMigrated, sanitizeProjects, randomUUID })`; load/validate/atomic-save `board.json` (tmp file + rename). Corrupt file surfaces as a 500 — never reported as an empty board. Owns the dispatch reservation primitives (`claim`/`abortClaim`/`linkSession`/`activeCount`/`releaseStaleClaims`) and the evaluation lifecycle (`startEvaluation`/`completeEvaluation`/`failEvaluation`).
- `evaluator.js` — `createBoardEvaluator({ service, generate })`; one structured `generateSmallModelText` call per card producing a launchPlan (`goalDefinition`, `deliverable: pr|report`, `review: human|green`, `rationale`). No session is created for evaluation. On the board `defaultModel` when set, else small-model resolution.
- `dispatcher.js` — `createBoardDispatcher({ service, sessionService, readSettingsFromDiskMigrated, sanitizeProjects })`; capacity-gated server-side claim with reserve-first semantics, forced worktree (`board-<id8>` + `taskhunter/board-<id8>` branch), prompt built from card + launchPlan (`report` plans dispatch as audited `goal` sessions), and a periodic lease-reclaim loop (`startReclaimLoop`, unref'd timer).
- `routes.js` — `registerBoardRoutes(app, deps)` with optional `dispatcher`/`evaluator` deps; registered by the opencode feature-routes runtime before the generic OpenCode proxy. Cards entering `ready` (create or move) are evaluated in the background; with `automationDefault: auto` a finished evaluation auto-claims.
- `routes.test.js` — vitest + supertest coverage (CRUD, config, claim, reclaim, evaluation lifecycle, plan consumption, auto mode).

## Routes

| Route | Behavior |
|---|---|
| `GET /api/board` | `{ tasks: BoardTask[], config: BoardConfig }` |
| `POST /api/board/tasks` | create; body `{ title, description?, status?, projectId?, labels?, sessionIds? }` → 201 `{ task }`; entering `ready` triggers background evaluation |
| `PATCH /api/board/tasks/:taskId` | partial update; `addSessionId` links one session with dedupe → `{ task }`; editing title/description clears `evaluation`; moving to `ready` triggers background evaluation |
| `DELETE /api/board/tasks/:taskId` | remove → `{ task }` |
| `PUT /api/board/config` | validated partial config update → `{ config }` |
| `POST /api/board/tasks/:taskId/evaluate` | judge a ready, unevaluated (or previously failed) card → `{ task }`; 409 while running/done |
| `POST /api/board/tasks/:taskId/claim` | dispatcher claim → `{ task, sessionId, sessionDirectory, worktree? }`; 409 not-ready / no project / capacity, 5xx rolls back + `attempts + 1` |

## Contract

- Statuses: `backlog | ready | in_progress | review | done | blocked` (default `backlog`). `blocked` is dispatcher-owned: a card past `maxAttempts` dead leases lands there and only leaves via edit.
- Config: `{ defaultModel: "provider/model"|null, maxConcurrent: 1..8 (2), automationDefault: plan|auto, mergeRetries: 0..5 (2), maxAttempts: 0..5 (2) }`. `plan` waits for a human to press approve/claim; `auto` claims right after a successful evaluation.
- Task shape: `{ id: "t_<uuid>", projectId, title, description, status, labels, sessionIds, attempts, lease, evaluation, createdAt, updatedAt }`.
- Lease: `{ sessionId, claimedAt, expiresAt }` written at claim (TTL 30 min). `claim` flips `ready → in_progress` before the session exists (reserve-first), so concurrent claims cannot double-spawn; session-create failure calls `abortClaim` (back to `ready`, `attempts + 1`). A process that dies mid-task is recycled by `releaseStaleClaims`: lease expired → `ready`, past `maxAttempts` → `blocked`.
- Evaluation: `{ status: running|done|failed, plan, error, model, startedAt, finishedAt }`. Strict schema output; malformed provider answers fail the evaluation (retryable), never corrupt the card. Editing title/description invalidates the plan.
- Writes are single-process read-modify-write on `board.json`; all UI claims/evaluations go through these routes only.

## Roadmap hooks (not implemented)

- Session/PR write-back: live session state moves `in_progress → review`; Phase 2 merge queue consumes `plan.review` (human → approve-then-merge; green → auto-merge when CI passes), serializes merges onto the default branch, auto-rebases conflicts up to `mergeRetries`, then `blocked`.
