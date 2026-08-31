# Board (agent pipeline) — server module

TaskHunter board redesigned around agent ownership: **every column names
who is working on a card right now**, and cards only wait on humans in
Planning-approval, Review, and Needs-attention. Storage is a single JSON
file (`version: 2`) in the TaskHunter data directory.

## Columns (status = current owner)

| Column | Owner | In | Out (automatic unless noted) |
|---|---|---|---|
| backlog | human | manual entry | move/drag to planning starts evaluation |
| planning | evaluator | entering triggers evaluation | plan done → queued (auto mode) or human `approve` |
| queued | scheduler | approved cards (FIFO by `queuedAt`) | free concurrency slot → running |
| running | worker session | claim (lease + forced worktree) | session idle past grace → checking |
| checking | delivery checker | deliverable produced | pass → review (human plans) or merging (green plans); needs_work → feedback to the worker session, back to running; budget out → blocked |
| review | human | human-plan cards after check | `merge` → merging; `accept` → done; `return` → running/queued with the note sent to the worker |
| merging | merge bot | queued merges, strictly serial | merged → done; conflict retries out → blocked |
| done / blocked | — | blocked = "needs attention" ledger | edit/move to revive |

v1 files migrate on load: `ready` → planning (or queued if a plan existed), `in_progress` → running with `sessionRef` recovered from the lease.

## Files

- `service.js` — statuses, migration, atomic `board.json`, CAS dispatch reservation, `taskAction` (approve / retryEvaluation / merge / accept / return), lease + reclaim (exhausted claims re-enter the queue, not `ready`).
- `evaluator.js` — Planning column: one structured `generateSmallModelText` call per card producing a launchPlan; `automationDefault: auto` also approves into queued inside `completeEvaluation`.
- `dispatcher.js` — `claimTask` (forced worktree, rework branches `-rN`), `dispatchPass` (fills free slots FIFO), `reclaimPass` + `startReclaimLoop` (lease watchdog).
- `checker.js` — Checking column: report cards judged from the worker's final answer; PR cards wait for CI (`mergeable_state`) then get an AI pre-review of the diff (`octokit pulls.listFiles`). `needs_work` within `checkRetries` sends feedback to the worker session (`prompt_async`) and returns the card to running — self-heal. Green plans that pass go straight to the merge queue.
- `reconciler.js` — the 30s live channel: dispatch → running heartbeat (lease is a watchdog) → idle→checking (judged in the same pass) → checking wake-up/rebase/judge → PR facts → serial merge queue (one merge in flight, oldest first, `mergeRetries` rebase ladder, merge-405 = race → rebase, transient errors retry).
- `prompts.js` / `prompts.d.ts` — the five board magic-prompt IDs and defaults.
- `routes.js` — REST; `routes.test.js` / `checker.test.js` / `reconciler.test.js` — vitest.

## Routes

| Route | Behavior |
|---|---|
| `GET /api/board` | `{ tasks, config }` |
| `POST /api/board/tasks` | create (status any column; `queued` kicks dispatch; `planning` kicks evaluation) |
| `PATCH /api/board/tasks/:taskId` | partial update; **editing title/description re-runs judgment** (running/checking/review cards fall back to planning) |
| `DELETE /api/board/tasks/:taskId` | remove |
| `PUT /api/board/config` | validated config incl. `checkRetries` |
| `POST /api/board/tasks/:taskId/evaluate` | planning cards without a live evaluation |
| `POST /api/board/tasks/:taskId/claim` | manual claim from the queue (dispatcher) |
| `POST /api/board/tasks/:taskId/action` | `{ action: approve\|retryEvaluation\|merge\|accept\|return, note? }`; `return` forwards the note to the worker session |

## Contract

- `board.json` v2 task: `{ id, projectId, title, description, status, labels, sessionIds, attempts, checkAttempts, lease, sessionRef, sessionDirectoryRef, branch, pr, queue, check, blockedReason, queuedAt, evaluation, createdAt, updatedAt }`. `pr`/`queue`/`check`/`blockedReason`/`sessionRef` are server-owned write-backs.
- Lease = watchdog: live sessions re-extend it every pass; expired leases recycle the card to the queue (`attempts`), past `maxAttempts` → blocked.
- GitHub facts come from `resolveGitHubPrStatus` (octokit, remote-aware); unreachable GitHub leaves facts stale — nothing advances on guessed state.
- The five magic prompts (`board.evaluate`, `board.dispatch.pr|report`, `board.check.report|pr`) are user-editable; empty/oversized overrides fall back to defaults, guarded equal by `packages/ui/src/lib/boardMagicPrompts.test.ts`.

## Roadmap hooks (not implemented)

- Card-level conflict advisory (soft/hard edges between in-flight cards); per-task model overrides; review-return note composer in the detail dialog (the API already accepts `note`).
