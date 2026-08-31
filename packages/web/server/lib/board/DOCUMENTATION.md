# Board (Kanban) — server module

Global TaskHunter Kanban board: one set of columns shared by all projects;
tasks carry a `projectId` (settings project id or `null` = unassigned).
Storage is a single JSON file in the TaskHunter data directory, independent
of OpenCode state.

## Files

- `service.js` — `createBoardService({ dataDir, readSettingsFromDiskMigrated, sanitizeProjects, randomUUID })`; load/validate/atomic-save `board.json` (tmp file + rename). Corrupt file surfaces as a 500 — never reported as an empty board.
- `routes.js` — `registerBoardRoutes(app, deps)`; registered by the opencode feature-routes runtime before the generic OpenCode proxy.
- `routes.test.js` — vitest + supertest coverage.

## Routes

| Route | Behavior |
|---|---|
| `GET /api/board` | `{ tasks: BoardTask[] }` |
| `POST /api/board/tasks` | create; body `{ title, description?, status?, projectId?, labels?, sessionIds? }` → 201 `{ task }` |
| `PATCH /api/board/tasks/:taskId` | partial update; `addSessionId` links one session with dedupe → `{ task }` |
| `DELETE /api/board/tasks/:taskId` | remove → `{ task }` |

## Contract

- Statuses: `backlog | ready | in_progress | review | done` (default `backlog`).
- Validation: non-empty title ≤ 300 chars; description ≤ 20k; labels ≤ 20 unique non-empty ≤ 50 chars each; `projectId` must exist in the settings projects (`null` allowed = unassigned); unknown task → 404.
- Task shape: `{ id: "t_<uuid>", projectId, title, description, status, labels, sessionIds, createdAt, updatedAt }`.
- Writes are single-process read-modify-write on `board.json`; the UI claims happen through this API only.

## Roadmap hooks (not implemented)

- v2 claim flow will `addSessionId` + move to `in_progress` when a session is
  started from a card; PR-based write-back will move `review`/`done`.
