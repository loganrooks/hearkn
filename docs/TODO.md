# TODO — Before npm Publish

## Must-have

- [ ] README.md with install instructions, usage, config reference
- [ ] Handle stale VSCODE_IPC_HOOK_CLI sockets (check if socket file exists before `code -r .`)
- [ ] Installer: detect if Claude Code / `~/.claude/settings.json` exists
- [ ] Installer: validate ntfy topic is reachable before finishing
- [ ] Test `npx claude-notify` install flow end-to-end on a clean machine
- [ ] Uninstaller: verify it cleanly removes hooks without breaking other hooks
- [ ] GitHub repo creation + first push

## Nice-to-have

- [ ] Self-hosted ntfy support (non-HTTPS servers, auth tokens)
- [ ] Rate limiting beyond debounce (e.g., max N notifications per hour)
- [ ] Notification sound/vibration config via ntfy priority levels
- [ ] Other notification backends (Pushover, Slack webhook, desktop-notify)
- [ ] Detect Cursor vs VS Code automatically from TERM_PROGRAM / env vars
- [ ] `npx claude-notify update` — update hook without re-running full installer
- [ ] GitHub Actions CI
- [ ] `install.sh` curl-based alternative installer for non-npm users
