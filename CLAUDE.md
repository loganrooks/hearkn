# claude-notify

Push notifications for Claude Code via ntfy.sh with click-to-focus VS Code window support.

## Project Status: v0.1.0 — Working prototype, needs polish before npm publish

**What works now:**
- Notification hook (pure JS, zero deps) fires on Stop + Notification events
- ntfy.sh push notifications with message summarization
- Click-to-focus via `code -r .` (uses VSCODE_IPC_HOOK_CLI to target exact window)
- Click URL in ntfy notification (vscode:// scheme, configurable)
- 30-second debounce per session
- Interactive CLI installer (`npx claude-notify`)

**Deployed on dionysus (dev machine):**
- Live hook: `~/.claude/hooks/claude-notify.js` (copy of `lib/hook.js`)
- Config: `~/.claude-notify.conf` (JSON)
- Settings: `~/.claude/settings.json` has Notification + Stop hooks registered
- ntfy topic: `claude-dionysus` (public — should be randomized for other users)

## Architecture

```
User runs Claude Code in VS Code terminal (Remote SSH)
  └─ Claude Code fires hook on Stop/Notification events
       └─ hook.js (stdin: JSON payload from Claude Code)
            ├─ Debounce check (30s per session, /tmp files)
            ├─ Build notification (title, message, priority)
            ├─ Focus VS Code window: `code -r .` via VSCODE_IPC_HOOK_CLI
            ├─ Send ntfy.sh notification (Node.js https module, no curl)
            └─ stdout: `{}` (hook protocol response)
```

## Key Design Decisions

### Why ntfy.sh (not OSC escape sequences)
OSC 777/9 sequences written to `/dev/pts/*` don't work reliably in VS Code Remote SSH.
The VS Code "Terminal Notification" extension intercepts OSC from the terminal's child
process stdout, but hook stdout goes to Claude Code's protocol (`{}`), not the terminal.
Writing to pts devices directly bypasses VS Code's terminal emulator layer.

### Why `code -r .` for window focus (not vscode:// URL)
The `vscode://vscode-remote/ssh-remote+host/path` URL scheme is unreliable with multiple
remote windows — VS Code picks the most recently focused window, not the one matching
the folder. The `code` CLI on the server communicates through `VSCODE_IPC_HOOK_CLI`
(a Unix socket unique to each VS Code window), which targets the exact window every time.

### Why workspace_root in config (not cwd detection)
Claude Code's `cwd` drifts (GSD framework, subprocesses). The VS Code extensionHost
process cwd also drifts. The workspace root is managed by the VS Code client (Mac side),
invisible to the server. Storing it in config during install is the only reliable approach.

### Why pure JS (no shell script)
The original design had a Node.js hook → shell script → curl pipeline. Eliminated the
shell script for portability: Node.js `https` module replaces curl, bash array quoting
issues disappear, and the hook is a single file that works on any platform with Node 18+.

### Config format: JSON (not shell-sourceable)
Originally used shell-sourceable key=value format. Switched to JSON for easier parsing
in Node.js and to support nested config in the future.

## Files

| File | Purpose |
|------|---------|
| `bin/cli.js` | CLI entry point — `npx claude-notify [test\|status\|uninstall]` |
| `lib/hook.js` | The hook itself — reads stdin JSON, sends ntfy, focuses window |
| `lib/install.js` | Interactive installer — prompts, patches settings.json, tests |
| `package.json` | npm package config |

## Config Schema (`~/.claude-notify.conf`)

```json
{
  "ntfy_enabled": true,
  "ntfy_topic": "claude-dionysus",       // Unique topic name
  "ntfy_server": "https://ntfy.sh",      // Or self-hosted
  "hostname": "dionysus",                 // SSH hostname for vscode:// URLs
  "click_scheme": "vscode",              // vscode | vscode-insiders | cursor | none
  "click_mode": "workspace",             // workspace | app | none
  "workspace_root": "/home/rookslog"     // VS Code workspace root folder
}
```

## Hook Payload (from Claude Code)

```json
{
  "session_id": "uuid",
  "transcript_path": "~/.claude/projects/.../session.jsonl",
  "cwd": "/home/user",
  "hook_event_name": "Stop",             // or "Notification"
  "notification_type": "idle_prompt",     // Stop events don't have this
  "last_assistant_message": "Done: ...",  // Stop events only
  "stop_hook_active": false
}
```

## What's Left Before npm Publish

### Must-have
- [ ] README.md with install instructions, screenshots, config reference
- [ ] Handle non-VS-Code environments (plain SSH, tmux without VS Code)
  - Skip `code -r .` when VSCODE_IPC_HOOK_CLI is absent or stale
  - Maybe detect stale sockets (check if file exists)
- [ ] Installer: detect if `~/.claude/settings.json` exists (Claude Code installed?)
- [ ] Installer: validate ntfy topic is reachable before finishing
- [ ] Test the `npx claude-notify` install flow end-to-end on a clean machine
- [ ] Uninstaller: test that it cleanly removes hooks without breaking other hooks

### Nice-to-have
- [ ] Self-hosted ntfy support (non-HTTPS servers)
- [ ] Rate limiting beyond debounce (e.g., max 10 notifications per hour)
- [ ] Notification sound/vibration config via ntfy priority levels
- [ ] Support for other notification backends (Pushover, Slack webhook, desktop-notify)
- [ ] Detect Cursor vs VS Code automatically from environment
- [ ] `npx claude-notify update` — update hook without re-running full installer
- [ ] GitHub Actions CI for the package itself

## Development

```bash
cd ~/workspace/projects/claude-notify

# Test hook locally (simulates Claude Code Stop event)
echo '{"session_id":"test","cwd":"/home/rookslog","hook_event_name":"Stop","last_assistant_message":"Hello world."}' | node lib/hook.js

# Test CLI
node bin/cli.js status
node bin/cli.js test

# Deploy to live hook (dev workflow)
cp lib/hook.js ~/.claude/hooks/claude-notify.js

# Clear debounce (for repeated testing)
rm -f /tmp/claude-notify-*.json
```

## References

- [ntfy.sh docs — publishing](https://docs.ntfy.sh/publish/)
- [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [kane.mx — OSC notification approach](https://kane.mx/posts/2025/claude-code-notification-hooks/)
- [felipeelias — Tailscale + ntfy setup](https://felipeelias.github.io/2026/02/25/claude-code-notifications.html)
