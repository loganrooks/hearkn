# claude-notify

Push notifications for Claude Code via ntfy.sh with click-to-focus VS Code window support.

## Project Structure

| File | Purpose |
|------|---------|
| `bin/cli.js` | CLI entry point — `npx claude-notify [test\|status\|uninstall]` |
| `lib/hook.js` | The hook — reads stdin JSON, sends ntfy, focuses VS Code window |
| `lib/install.js` | Interactive installer — prompts, patches settings.json, sends test |
| `package.json` | npm package config |

## Conventions

- **Zero dependencies** — only Node.js built-ins (fs, os, path, https, http, readline)
- **Silent fail** — hooks must never block or crash Claude Code; all errors → `{}` + exit
- **Pure JS** — no shell scripts, no curl; everything in Node.js for cross-platform portability
- **Config lives at** `~/.claude-notify.conf` (JSON)
- **Hook installs to** `~/.claude/hooks/claude-notify.js`
- **Deploy during dev**: `cp lib/hook.js ~/.claude/hooks/claude-notify.js`
- **Clear debounce for testing**: `rm -f /tmp/claude-notify-*.json`

## Hook Protocol

Claude Code sends JSON on stdin, expects `{}` on stdout. The hook must:
1. Read all stdin (JSON payload)
2. Do its work (send notification, focus window)
3. Write `{}` to stdout
4. Exit

Never write anything else to stdout. Never throw uncaught exceptions.

## Config Schema (`~/.claude-notify.conf`)

```json
{
  "ntfy_enabled": true,
  "ntfy_topic": "claude-xyz123",           // Unique, hard to guess (public topics)
  "ntfy_server": "https://ntfy.sh",        // Or self-hosted
  "hostname": "myhost",                    // SSH hostname for vscode:// URLs
  "click_scheme": "vscode",               // vscode | vscode-insiders | cursor | none
  "click_mode": "workspace"               // workspace | app | none
}
```

## Testing

```bash
# Simulate a Stop event
echo '{"session_id":"test","cwd":"/home/user","hook_event_name":"Stop","last_assistant_message":"Hello world."}' | node lib/hook.js

# CLI commands
node bin/cli.js status
node bin/cli.js test
```
