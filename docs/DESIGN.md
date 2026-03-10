# Design Decisions & Architecture

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

## Hook Payload (from Claude Code)

```json
{
  "session_id": "uuid",
  "transcript_path": "~/.claude/projects/.../session.jsonl",
  "cwd": "/home/user",
  "hook_event_name": "Stop",
  "notification_type": "idle_prompt",
  "last_assistant_message": "Done: ...",
  "stop_hook_active": false
}
```

- `hook_event_name`: "Stop" or "Notification"
- `notification_type`: only on Notification events — "idle_prompt", "permission_prompt", "elicitation_dialog"
- `last_assistant_message`: only on Stop events — full markdown text of last response
- `cwd`: Claude Code process working directory (used for project name and click URL)

## Why ntfy.sh (not OSC escape sequences)

OSC 777/9 sequences written to `/dev/pts/*` don't work reliably in VS Code Remote SSH.
The VS Code "Terminal Notification" extension intercepts OSC from the terminal's child
process stdout, but hook stdout goes to Claude Code's protocol (`{}`), not the terminal.
Writing to pts devices directly bypasses VS Code's terminal emulator layer.

## Why `code -r .` for window focus (not vscode:// URL)

The `vscode://vscode-remote/ssh-remote+host/path` URL scheme is unreliable with multiple
remote windows — VS Code picks the most recently focused window, not the one matching
the folder. The `code` CLI on the server communicates through `VSCODE_IPC_HOOK_CLI`
(a Unix socket unique to each VS Code window), which targets the exact window every time.

Detection logic:
- `VSCODE_IPC_HOOK_CLI` env var present → running in VS Code terminal → run `code -r .`
- Not present → plain SSH/tmux → skip window focus, ntfy notification only

Caveat: tmux sessions inherit env vars from when they were created. If created from a
VS Code terminal, `VSCODE_IPC_HOOK_CLI` persists even if the VS Code window closes.
The socket file may go stale. The hook catches the error silently.

## Why cwd (not a static workspace_root config)

Earlier versions stored `workspace_root` in config and used it for project name and
click URLs. This broke with multiple VS Code windows — each window has a different
workspace, but the config only held one value. Now the per-session `cwd` from the
hook payload is used directly. `cwd` reliably reflects where Claude Code is running
and correctly handles multi-window setups.

## Why pure JS (no shell script)

The original design had a Node.js hook → shell script → curl pipeline. Eliminated the
shell script for portability: Node.js `https` module replaces curl, bash array quoting
issues disappear, and the hook is a single file that works on any platform with Node 18+.

## Why JSON config (not shell-sourceable)

Originally used shell-sourceable `KEY=value` format. Switched to JSON for easier parsing
in Node.js and to support nested config in the future.

## Message Summarization

The `summarize()` function strips markdown formatting from Claude's last response:
- Code blocks, inline code, bold, links, headings, list markers
- Box-drawing characters and decorative lines (★ ─── etc.)
- Truncates at 300 chars on a word boundary

## Debounce Strategy

Per-session debounce using temp files (`/tmp/claude-notify-<session_id>.json`).
30-second window prevents notification storms when Claude produces rapid stop/start cycles.

## Click URL Modes

| Mode | URL | Use case |
|------|-----|----------|
| `workspace` | `vscode://vscode-remote/ssh-remote+host/path` | Single remote window |
| `app` | `vscode://` | Multiple windows (just brings VS Code to front) |
| `none` | (omitted) | Phone-only, no click action |

The Click URL is sent as the `click` field in the ntfy JSON body. On macOS, tapping the
notification opens the URL. On iOS, `vscode://` does nothing (no VS Code) — harmless.

## Why JSON body mode (not HTTP headers)

ntfy supports both HTTP-header and JSON-body modes for publishing. The initial
implementation used HTTP headers (`Title:`, `Click:`, etc.), but this caused unicode
corruption in notification titles — HTTP headers don't reliably transport non-ASCII
characters. Switched to JSON body mode with `Content-Type: application/json` which
handles unicode cleanly.

## References

- [ntfy.sh docs — publishing](https://docs.ntfy.sh/publish/)
- [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [kane.mx — OSC notification approach](https://kane.mx/posts/2025/claude-code-notification-hooks/)
- [felipeelias — Tailscale + ntfy setup](https://felipeelias.github.io/2026/02/25/claude-code-notifications.html)
