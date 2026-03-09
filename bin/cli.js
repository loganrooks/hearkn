#!/usr/bin/env node

const { install, uninstall, status } = require('../lib/install');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

const command = process.argv[2] || '';

async function test() {
  const configPath = path.join(os.homedir(), '.claude-notify.conf');
  if (!fs.existsSync(configPath)) {
    console.log('\n  Not installed yet. Run: npx claude-notify\n');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.ntfy_topic) {
    console.log('\n  No ntfy topic configured. Run: npx claude-notify\n');
    process.exit(1);
  }

  const clickUrl = config.click_scheme !== 'none'
    ? `${config.click_scheme || 'vscode'}://vscode-remote/ssh-remote+${config.hostname || os.hostname()}${process.cwd()}`
    : '';

  const headers = {
    'Title': 'Claude Code · test',
    'Priority': '3',
    'Tags': 'robot',
  };
  if (clickUrl) headers['Click'] = clickUrl;

  const url = `${config.ntfy_server || 'https://ntfy.sh'}/${config.ntfy_topic}`;
  const parsed = new URL(url);

  const req = https.request({
    hostname: parsed.hostname,
    path: parsed.pathname,
    method: 'POST',
    headers,
    timeout: 5000,
  }, (res) => {
    if (res.statusCode === 200) {
      console.log(`\n  ✓ Test notification sent to topic: ${config.ntfy_topic}\n`);
    } else {
      console.log(`\n  ⚠ Server returned ${res.statusCode}\n`);
    }
  });

  req.on('error', (e) => console.log(`\n  ⚠ Failed: ${e.message}\n`));
  req.write('Test notification from claude-notify');
  req.end();
}

function help() {
  console.log(`
  claude-notify — Push notifications for Claude Code

  Usage:
    npx claude-notify          Install or update
    npx claude-notify test     Send a test notification
    npx claude-notify status   Show current configuration
    npx claude-notify uninstall Remove hooks and config
    npx claude-notify help     Show this message
`);
}

async function main() {
  switch (command) {
    case 'test':
      await test();
      break;
    case 'uninstall':
      uninstall();
      break;
    case 'status':
      status();
      break;
    case 'help':
    case '--help':
    case '-h':
      help();
      break;
    default:
      await install();
      break;
  }
}

main().catch((e) => {
  console.error(`  Error: ${e.message}`);
  process.exit(1);
});
