# OpenChamber VS Code Extension


[OpenCode](https://opencode.ai) AI coding agent, right inside your editor. No tab-switching, no context loss.

![VS Code Extension](extension.jpg)

**Like the extension? There's also a [desktop app and web version](https://github.com/jlu-lujing/OpenChamber) with even more features.**

## What you get

- **Chat beside your code** — responsive layout that adapts to narrow and wide panels
- **Run on several models** — send one prompt to several models at once, compare the answers side by side, keep the best or fuse them
- **Right-click actions** — add context, explain selections, and improve code in-place
- **Click-to-open** — file paths in tool output open directly in your editor; edit-style results land in a focused diff view
- **Session editor panel** — keep chat sessions open alongside files
- **Theme-aware** — adapts to your VS Code light, dark, and high-contrast themes

Plus everything from the shared OpenChamber UI: branchable timeline, smart tool UIs, voice mode, Git workflows, and more.

## Commands

| Command | Description |
|---------|-------------|
| `OpenChamber: Focus Chat` | Focus the chat panel |
| `OpenChamber: New Session` | Start a new chat session |
| `OpenChamber: Open Sidebar` | Open the OpenChamber sidebar |
| `OpenChamber: Run on Several Models` | Open a new tab set up to run one prompt on several models |
| `OpenChamber: Open Session in Editor` | Open current or new session in an editor tab |
| `OpenChamber: Settings` | Open extension settings |
| `OpenChamber: Restart API Connection` | Restart the OpenCode API process |
| `OpenChamber: Show OpenCode Status` | Debug info for development or bug reports |

### Right-click menu

Select code in the editor, right-click, and find the **OpenChamber** submenu:

| Action | Description |
|--------|-------------|
| Add to Context | Attach selection to your next prompt |
| Add Comment | Open a comment thread on the selected lines. The comment stays anchored in the editor and goes out with your next message as a context card. The gutter `+` does the same once the extension is active |
| Explain | Ask the agent to explain the selected code |
| Improve Code | Ask the agent to improve the selection in-place |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `openchamber.apiUrl` | _(empty)_ | URL of an external OpenCode API server. Leave empty to auto-start a local instance. Authenticates with `OPENCODE_PASSWORD` (or the legacy `OPENCODE_SERVER_PASSWORD`); when both are unset and the URL points at OpenCode's background service (`opencode service start`), the service's own password is used. |
| `openchamber.opencodeBinary` | _(empty)_ | Absolute path to the `opencode` CLI binary. Useful when PATH lookup fails. Requires window reload to apply. |

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

- `OPENCHAMBER_VSCODE_BIN=cursor bun run vscode:dev`
- `OPENCHAMBER_VSCODE_DEV_WORKSPACE=/path/to/workspace bun run vscode:dev`
- `bun run vscode:dev /path/to/workspace`

To package manually:

```bash
bun run --cwd packages/vscode build
cd packages/vscode && bunx vsce package --no-dependencies
```

Install locally: `code --install-extension packages/vscode/openchamber-*.vsix`

</details>

## License

MIT
