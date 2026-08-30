# <picture><source media="(prefers-color-scheme: dark)" srcset="../../docs/references/badges/taskhunter-logo-dark.svg"><img src="../../docs/references/badges/taskhunter-logo-light.svg" width="32" height="32" align="absmiddle" /></picture> @taskhunter/web


Run [OpenCode](https://opencode.ai) in your browser. Install the CLI, open `localhost:3000`, done. Works on desktop browsers, tablets, and phones as a PWA.

Full project overview, screenshots, and all features: [github.com/openchamber/openchamber](https://github.com/openchamber/openchamber)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/openchamber/openchamber/main/scripts/install.sh | bash
```

Or install manually: `bun add -g @taskhunter/web` (or npm, pnpm, yarn).

> **Prerequisites:** [OpenCode CLI](https://opencode.ai) installed, Node.js 22+.

## Usage

```bash
taskhunter                          # Start on port 3000
taskhunter --port 8080              # Custom port
taskhunter --lan --port 3000        # Listen on LAN (0.0.0.0)
taskhunter --ui-password secret     # Password-protect UI
taskhunter startup enable           # Start at login as a native service
TASKHUNTER_UI_PASSWORD=secret taskhunter startup enable # Save service password env
taskhunter startup status           # Show startup service status
taskhunter startup disable          # Remove startup service
taskhunter tunnel help              # Tunnel lifecycle commands
taskhunter tunnel providers         # Show provider capabilities
taskhunter tunnel profile add --provider cloudflare --mode managed-remote --name prod-main --hostname app.example.com --token <token>
taskhunter tunnel start --profile prod-main
taskhunter tunnel start --provider cloudflare --mode quick --qr
taskhunter tunnel start --provider cloudflare --mode managed-local --config ~/.cloudflared/config.yml
taskhunter tunnel status --all      # Show tunnel state across instances
taskhunter tunnel stop --port 3000  # Stop tunnel only (server stays running)
taskhunter connect-url --port 3000  # Add this server to TaskHunter Desktop
taskhunter connect-url --server http://host:3000 --qr
taskhunter connect-url --port 3000 --qr
taskhunter logs                     # Follow latest instance logs
OPENCODE_PORT=4096 OPENCODE_SKIP_START=true taskhunter                    # Connect to external OpenCode server
OPENCODE_HOST=https://myhost:4096 OPENCODE_SKIP_START=true taskhunter  # Connect via custom host/HTTPS
taskhunter stop                     # Stop server
taskhunter update                   # Update to latest version
```

`startup enable` snapshots your current environment into the native service so startup behaves like you launched `taskhunter` from the same shell. This preserves provider tokens, PATH, SSH agent settings, and other CLI auth/config env vars. Use `--no-env-snapshot` for a minimal service env.

When TaskHunter launches the local OpenCode server, it also registers a native
`taskhunter` agent tool for project, session, and scheduled-task orchestration.
The tool is not injected when connecting to an external OpenCode server.
Behavior settings can optionally inject a managed system-prompt optimizer on
the next OpenCode restart. It is disabled by default and is not available for
external OpenCode servers.

### Tunnel behavior notes

- One active tunnel per running TaskHunter instance (port).
- Starting a different tunnel mode/provider on the same instance replaces the active tunnel.
- Replacing or stopping a tunnel revokes existing connect links and invalidates remote tunnel sessions.
- Connect links are one-time tokens; generating a new link revokes the previous unused link.

### Connect other TaskHunter apps

Use `connect-url` when a web/API server should be added to TaskHunter Desktop or another TaskHunter app. If no server is running on the selected port, TaskHunter starts one first.

```bash
taskhunter connect-url --port 3000
taskhunter connect-url --port 3000 --qr
taskhunter connect-url --port 3000 --json
taskhunter connect-url --port 3000 --name "Workstation"
taskhunter connect-url --port 3000 --lan --server http://workstation.local:3000 --qr
```

### Headless/API-only server for Desktop

Use this on a remote machine when you want TaskHunter running as a web/API server, then connect to it from TaskHunter Desktop on another machine:

```bash
taskhunter connect-url --port 3000 --api-only --lan --server http://workstation.local:3000 --qr --ui-password your-password
```

`--api-only` starts API routes without serving browser UI assets. `--lan` binds the server so other machines can reach it. `--server` is the address saved into the Desktop connection link. `--ui-password` protects browser access if UI routes are enabled elsewhere; the generated client token is what Desktop uses for API access.

This creates a remote client token and prints an `taskhunter://connect?...` link. The link contains the server URL, token, label, and payload version. In TaskHunter Desktop, paste it in **Settings -> Remote Instances -> Direct Instances -> Import Link** to add that server as an Instance.

If the server was started with `--lan` or `--host 0.0.0.0`, `connect-url` automatically advertises a detected LAN IP instead of `127.0.0.1`. Use `--server <url>` when you want to advertise a specific DNS name, Tailscale address, reverse proxy URL, or HTTPS endpoint.

If you are exposing the server beyond localhost, start it with a password:

```bash
taskhunter serve --lan --port 3000 --ui-password your-password
```

Generating a client token does not automatically password-protect the hosted browser UI. `--ui-password` protects browser access; the client token lets another TaskHunter app connect to this server.

<details>
<summary>Connect to external OpenCode server</summary>

```bash
OPENCODE_PORT=4096 OPENCODE_SKIP_START=true taskhunter
OPENCODE_HOST=https://myhost:4096 OPENCODE_SKIP_START=true taskhunter
```

| Variable | Description |
|----------|-------------|
| `OPENCODE_HOST` | Full base URL of external server (overrides `OPENCODE_PORT`) |
| `OPENCODE_PORT` | Port of external server |
| `OPENCODE_SKIP_START` | Skip starting embedded OpenCode server |
| `TASKHUNTER_OPENCODE_HOSTNAME` | Bind hostname for managed OpenCode server (default: `127.0.0.1`, use `0.0.0.0` for LAN/remote access — trusted networks only). Invalid values are rejected with an error and fall back to loopback |
| `TASKHUNTER_HOST` | Bind hostname for the TaskHunter web server (default: `127.0.0.1`; use `0.0.0.0` for LAN/remote access — trusted networks only) |
| `TASKHUNTER_VERBOSE_REQUEST_LOGS` | Set to `true` to log every HTTP request; disabled by default to keep user logs small |
| `TASKHUNTER_SKIP_API_COMPRESSION` | Set to `true` to disable gzip compression for `/api/*` responses |
| `TASKHUNTER_COMPRESS_API` | Set to `true` to force `/api/*` compression, or `false` to disable it. Desktop runtime disables API compression by default to reduce local sidecar CPU use |
| `TASKHUNTER_FS_UPLOAD_MAX_BYTES` | Maximum file upload size in bytes (default: 100 MiB) |
| `TASKHUNTER_TERMINAL_SHELL` | Preferred terminal shell executable used by the `Auto` setting before platform defaults |

</details>

<details>
<summary>Bind managed OpenCode to LAN / Tailscale</summary>

```bash
TASKHUNTER_OPENCODE_HOSTNAME=0.0.0.0 taskhunter --port 3000
```

**Security note:** binding to `0.0.0.0` exposes the server on all network interfaces — use only on trusted networks and protect with firewall rules or `--ui-password`.

</details>

**Optional env vars:**
```yaml
environment:
  UI_PASSWORD: your_secure_password
  TASKHUNTER_TUNNEL_MODE: quick # quick | managed-remote | managed-local
  TASKHUNTER_TUNNEL_PROVIDER: cloudflare
```

For `managed-remote` mode, also set:

```yaml
environment:
  TASKHUNTER_TUNNEL_MODE: managed-remote
  TASKHUNTER_TUNNEL_HOSTNAME: app.example.com
  TASKHUNTER_TUNNEL_TOKEN: <token>
```

For `managed-local` mode, you can set:

```yaml
environment:
  TASKHUNTER_TUNNEL_MODE: managed-local
  TASKHUNTER_TUNNEL_CONFIG: /home/taskhunter/.cloudflared/config.yml
```

Managed-local path note: `TASKHUNTER_TUNNEL_CONFIG` must use a container path under `/home/taskhunter/...`. If the config file references `credentials-file`, ensure that JSON path is also mounted and reachable inside the container.

**Data directory:** mount `data/` for persistent storage. Ensure permissions:
```bash
mkdir -p data/taskhunter data/opencode/share data/opencode/config data/ssh
chown -R 1000:1000 data/
```

</details>

<details>
<summary>Background & daemon mode</summary>

```bash
taskhunter             # Runs in background by default
taskhunter stop        # Stop background server
```

</details>

<details>
<summary>systemd service (VPN / LAN access)</summary>

Use `--foreground` to keep the CLI process alive so systemd (or any other process manager) can track and restart it. Combine with `OPENCODE_HOST` to connect to an OpenCode instance running as a separate service.

**`~/.config/systemd/user/opencode.service`**
```ini
[Unit]
Description=OpenCode Server

[Service]
Type=simple
ExecStart=opencode serve --port 4095
Environment="PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/home/YOU/.local/bin:/home/YOU/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
Environment=SSH_AUTH_SOCK=%t/ssh-agent.socket
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

> **Why set `PATH` and `SSH_AUTH_SOCK`?**
> systemd user services start with a minimal environment — no shell profile is sourced.
> Without an explicit `PATH`, OpenCode won't find tools installed via Homebrew, npm, or `~/.local/bin`.
> Without `SSH_AUTH_SOCK`, git operations over SSH (push, pull, clone) will fail.
> `%t` expands to `$XDG_RUNTIME_DIR` (e.g. `/run/user/1000`), where most SSH agents write their socket.

**`~/.config/systemd/user/taskhunter.service`**
```ini
[Unit]
Description=TaskHunter Web Server
After=opencode.service

[Service]
Type=simple
ExecStart=taskhunter serve --port 3000 --host 0.0.0.0 --ui-password your-password --foreground
Environment="OPENCODE_HOST=http://localhost:4095"
Environment="OPENCODE_SKIP_START=true"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now opencode taskhunter
```

`--host 0.0.0.0` is required to listen on all interfaces (the default is `127.0.0.1`). Use `--host <ip>` or `TASKHUNTER_HOST=<ip>` to bind to a specific interface instead.

</details>

## What makes the web version special

- **Remote access** - Cloudflare tunnel with QR onboarding. Scan from your phone, start coding.
- **Mobile-first PWA** - optimized chat controls, keyboard-safe layouts, drag-to-reorder projects
- **Background notifications** - know when your agent finishes, even from another tab
- **Self-update** - update and restart from the UI, server settings stay intact
- **Cross-tab tracking** - session activity stays in sync across browser tabs

- Cloudflare tunnel access with quick, managed-remote, and managed-local modes
- One-scan onboarding with tunnel QR + password URL helpers
- Mobile-first experience: optimized chat controls, keyboard-safe layouts, and attachment-friendly UI
- Background notifications plus reliable cross-tab session activity tracking
- Built-in self-update + restart flow that keeps your server settings intact

## License

MIT
