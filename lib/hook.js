#!/usr/bin/env node
// Claude Code Notification Hook
// Pure JS — no shell dependencies. Installed by `npx claude-notify`.
//
// Fires on Notification and Stop events. Sends push notifications
// via ntfy.sh so you know when Claude Code needs your attention.
//
// Debounce: max 1 notification per 30 seconds per session.
// Silent fail: never blocks or breaks Claude Code sessions.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

const DEBOUNCE_MS = 30000;
const HOME = os.homedir();
const CONFIG_PATH = path.join(HOME, '.claude-notify.conf');

// --- Config loading ---

function loadConfig() {
  const defaults = {
    ntfy_enabled: true,
    ntfy_topic: '',
    ntfy_server: 'https://ntfy.sh',
    hostname: os.hostname(),
    click_scheme: 'vscode',  // vscode, vscode-insiders, cursor, none
  };

  if (!fs.existsSync(CONFIG_PATH)) return defaults;

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    return { ...defaults, ...config };
  } catch (e) {
    return defaults;
  }
}

// --- Message formatting ---

function summarize(text, maxLen = 200) {
  if (!text) return '';
  let clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[#>*\-]+\s*/gm, '')
    .replace(/[─━═╌╍┄┅┈┉▔▁★☆●○◆◇■□▪▫]{3,}/g, '')
    .replace(/[-=~_]{5,}/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLen) return clean;
  const truncated = clean.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

function getProjectName(config, cwd) {
  // Use workspace_root from config (matches the VS Code window)
  const root = config.workspace_root || cwd || '';
  if (!root || root === HOME) return '';
  return path.basename(root);
}

function buildNotification(data, config) {
  const type = (data.notification_type || data.hook_event_name || 'attention_needed').toLowerCase();
  const project = getProjectName(config, data.cwd);
  const title = project ? `Claude Code · ${project}` : 'Claude Code';

  let message = '';
  switch (type) {
    case 'stop': {
      const summary = summarize(data.last_assistant_message);
      message = summary ? `Done: ${summary}` : 'Task completed';
      break;
    }
    case 'idle_prompt':
      message = 'Waiting for your input';
      break;
    case 'permission_prompt':
      message = 'Permission needed to continue';
      break;
    case 'elicitation_dialog':
      message = 'Question — needs your answer';
      break;
    default:
      message = 'Needs your attention';
  }

  const priority = type === 'permission_prompt' ? 4 : 3;

  return { type, title, message, priority, cwd: data.cwd || '' };
}

// --- Click URL ---

// Strategy:
//   "workspace" — vscode://vscode-remote/ssh-remote+host/workspace_root
//                 Focuses VS Code window with matching folder. Works best
//                 with one remote window; unreliable with multiple.
//   "app"       — vscode:// (just brings VS Code to front, no folder targeting)
//   "none"      — no click action
//
// Config: click_scheme (vscode/cursor/none), click_mode (workspace/app/none)
function buildClickUrl(config, cwd) {
  const mode = config.click_mode || 'workspace';
  const scheme = config.click_scheme || 'vscode';

  if (mode === 'none' || scheme === 'none') return '';

  if (mode === 'app') {
    // Just bring the editor to front — no folder matching, no window confusion
    return `${scheme}://`;
  }

  // workspace mode: target a specific folder
  const folder = config.workspace_root || cwd;
  if (!folder) return `${scheme}://`;
  const host = config.hostname || os.hostname();
  return `${scheme}://vscode-remote/ssh-remote+${host}${folder}`;
}

// --- ntfy.sh sender (pure Node.js, no curl) ---

function sendNtfy(config, notification) {
  return new Promise((resolve) => {
    if (!config.ntfy_enabled || !config.ntfy_topic) {
      resolve();
      return;
    }

    const serverUrl = config.ntfy_server || 'https://ntfy.sh';
    const url = `${serverUrl}/${config.ntfy_topic}`;
    const clickUrl = buildClickUrl(config, notification.cwd);

    const headers = {
      'Title': notification.title,
      'Priority': String(notification.priority),
      'Tags': 'robot',
    };
    if (clickUrl) {
      headers['Click'] = clickUrl;
    }

    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers,
      timeout: 5000,
    }, () => resolve());

    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(notification.message);
    req.end();
  });
}

// --- Debounce ---

function shouldDebounce(sessionId) {
  const tmpDir = os.tmpdir();
  const debounceFile = path.join(tmpDir, `claude-notify-${sessionId}.json`);

  if (fs.existsSync(debounceFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(debounceFile, 'utf8'));
      if (Date.now() - (state.lastNotify || 0) < DEBOUNCE_MS) return true;
    } catch (e) {
      // Corrupted — continue
    }
  }

  fs.writeFileSync(debounceFile, JSON.stringify({ lastNotify: Date.now() }));
  return false;
}

// --- Main ---

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    if (!data.session_id || shouldDebounce(data.session_id)) {
      process.stdout.write('{}');
      process.exit(0);
    }

    const config = loadConfig();
    const notification = buildNotification(data, config);

    // Focus the VS Code window if running in a VS Code terminal.
    // The code CLI uses VSCODE_IPC_HOOK_CLI to target the exact window.
    if (process.env.VSCODE_IPC_HOOK_CLI) {
      try {
        require('child_process').execSync('code -r .', {
          timeout: 3000,
          stdio: 'ignore',
          env: { ...process.env },
        });
      } catch (e) {
        // Stale IPC socket or code CLI unavailable — skip
      }
    }

    sendNtfy(config, notification).then(() => {
      process.stdout.write('{}');
      process.exit(0);
    });
  } catch (e) {
    process.stdout.write('{}');
    process.exit(0);
  }
});
