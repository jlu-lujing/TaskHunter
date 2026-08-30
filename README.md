# <picture><source media="(prefers-color-scheme: dark)" srcset="docs/references/badges/taskhunter-logo-dark.svg"><img src="docs/references/badges/taskhunter-logo-light.svg" width="32" height="32" align="absmiddle" /></picture> TaskHunter

[![GitHub stars](https://img.shields.io/github/stars/jlu-lujing/TaskHunter?style=flat&labelColor=100F0F&color=66800B)](https://github.com/jlu-lujing/TaskHunter/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/jlu-lujing/TaskHunter?style=flat&labelColor=100F0F&color=205EA6)](https://github.com/jlu-lujing/TaskHunter/releases/latest)

> [!NOTE]
> Built on [OpenChamber](https://github.com/openchamber/openchamber) (personal fork, maintained independently) and [OpenCode](https://opencode.ai). This fork does not publish to npm or the VS Code Marketplace. Some optional features still call upstream OpenChamber services unless self-hosted (`TASKHUNTER_RELAY_URL`, `TASKHUNTER_LINEAR_BROKER_URL`, `TASKHUNTER_UPDATE_API_URL`).

## What this is

TaskHunter is an agent that runs your task board for you. Tasks sit on a board, and when one moves to "ready", TaskHunter picks it up, opens a coding agent session for it, does the work in an isolated workspace, and brings it back to you as a reviewable result.

The loop it is built around:

```
board task (ready) -> claim -> agent session (OpenCode) -> code + tests -> PR / review request -> board updated
```

You stay in the loop where you want to be. Approve plans, review diffs, answer the agent's questions from desktop, browser, or phone. Everything else it handles on its own.

## Where things stand

This project is under active development, so here is the honest split.

**Ready today** (inherited from the OpenChamber execution layer):

- Agent sessions powered by OpenCode, with terminal, diffs, file editing, and previews
- Session goals: the agent keeps working a session until a finish condition is met
- Scheduled tasks (cron / daily / once), so recurring work runs without you
- Worktree isolation per session, so parallel tasks do not step on each other
- GitHub integration: start a session from an issue/PR, post results back
- Desktop app, web/PWA, VS Code extension, and mobile clients to watch and steer work

**Being built** (the TaskHunter layer itself):

- Board connectors: watch a board (Linear, GitHub Projects, local files) for tasks entering "ready"
- The dispatcher: claim a task, spawn a session with the task context attached, respect per-project concurrency limits
- Result routing: open a PR, link it back to the task, move the board card, retry or escalate on failure
- Guardrails: token budgets per task, allowlists for what an agent may touch, quiet hours

## Quick start

Requires Node.js 22+ and the [OpenCode CLI](https://opencode.ai). Run from a checkout:

```bash
bun install
node packages/web/bin/cli.js serve --ui-password be-creative-here
```

Common operations:

```bash
taskhunter status
taskhunter logs
taskhunter stop
taskhunter update
```

TaskHunter binds to localhost by default. Use `--lan` only on a trusted network and protect browser access with `--ui-password`.

To build the desktop app or the VS Code extension from source, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Configuration

State lives in `~/.config/taskhunter`. Environment overrides use the `TASKHUNTER_*` prefix. The upstream documentation set in [`packages/docs`](packages/docs/README.md) still describes the OpenChamber feature set accurately for the layers listed as ready above. The board dispatcher will get its own docs when it lands.

## Roadmap, roughly

1. Board file connector (a local markdown/JSON task file), manual claim, session spawn
2. Auto claim on state change, GitHub Projects connector
3. Result routing and board write-back, Linear connector
4. Guardrails, cost reporting, quiet hours

Priorities will move as real usage finds them.

## Why OpenCode?

TaskHunter drives coding agents through [OpenCode](https://opencode.ai). It is the best open-source option for this job right away: real terminal access, model-agnostic, and built to be driven programmatically. TaskHunter is an independent project and is not affiliated with the OpenCode team.

## Acknowledgments

- [OpenChamber](https://github.com/openchamber/openchamber) and its contributors, whose workspace this fork builds on
- [OpenCode](https://opencode.ai) for the agent runtime
- [Pierre](https://pierrejs-docs.vercel.app/) for its diff viewer and syntax highlighting
- [Ghostty-web](https://github.com/coder/ghostty-web) for its Ghostty web renderer

## License

MIT
