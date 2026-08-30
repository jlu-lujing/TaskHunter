# TaskHunter VS Code Extension


[OpenCode](https://opencode.ai) AI coding agent, right inside your editor. No tab-switching, no context loss.

![VS Code Extension](extension.jpg)

**Like the extension? There's also a [desktop app and web version](https://github.com/openchamber/openchamber) with even more features.**

## What you get

- **Chat beside your code** — responsive layout that adapts to narrow and wide panels
- **Agent Manager** — run the same prompt across multiple models in parallel, compare results side by side
- **Right-click actions** — add context, explain selections, and improve code in-place
- **Click-to-open** — file paths in tool output open directly in your editor; edit-style results land in a focused diff view
- **Session editor panel** — keep chat sessions open alongside files
- **Theme-aware** — adapts to your VS Code light, dark, and high-contrast themes

Plus everything from the shared TaskHunter UI: branchable timeline, smart tool UIs, voice mode, Git workflows, and more.

## Commands

| Command | Description |
|---------|-------------|
| `TaskHunter: Focus Chat` | Focus the chat panel |
| `TaskHunter: New Session` | Start a new chat session |
| `TaskHunter: Open Sidebar` | Open the TaskHunter sidebar |
| `TaskHunter: Open Agent Manager` | Launch parallel multi-model runs |
| `TaskHunter: Open Session in Editor` | Open current or new session in an editor tab |
| `TaskHunter: Settings` | Open extension settings |
| `TaskHunter: Restart API Connection` | Restart the OpenCode API process |
| `TaskHunter: Show OpenCode Status` | Debug info for development or bug reports |

### Right-click menu

Select code in the editor, right-click, and find the **TaskHunter** submenu:

| Action | Description |
|--------|-------------|
| Add to Context | Attach selection to your next prompt |
| Explain | Ask the agent to explain the selected code |
| Improve Code | Ask the agent to improve the selection in-place |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `taskhunter.apiUrl` | _(empty)_ | URL of an external OpenCode API server. Leave empty to auto-start a local instance. |
| `taskhunter.opencodeBinary` | _(empty)_ | Absolute path to the `opencode` CLI binary. Useful when PATH lookup fails. Requires window reload to apply. |

## Requirements

- [OpenCode CLI](https://opencode.ai) installed and available in PATH (or set `OPENCODE_BINARY` env var)
- VS Code 1.85+

<details>
<summary>Development</summary>

```bash
bun install
bun run vscode:dev
```

`bun run vscode:dev` now starts watchers + opens an Extension Development Host automatically. Webview UI changes use Vite HMR automatically.

Optional overrides:

- `TASKHUNTER_VSCODE_BIN=cursor bun run vscode:dev`
- `TASKHUNTER_VSCODE_DEV_WORKSPACE=/path/to/workspace bun run vscode:dev`
- `bun run vscode:dev /path/to/workspace`

To package manually:

```bash
bun run --cwd packages/vscode build
cd packages/vscode && bunx vsce package --no-dependencies
```

Install locally: `code --install-extension packages/vscode/taskhunter-*.vsix`

</details>

## License

MIT
