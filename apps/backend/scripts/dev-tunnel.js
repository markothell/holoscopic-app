#!/usr/bin/env node
// Local transcription plumbing for Chorus.
//
//   npm run dev:tunnel
//
// Deepgram fetches a memory's audio from Vercel Blob and POSTs the transcript
// back to this backend, so in development it needs a publicly reachable URL for
// a server running on your laptop. This opens a cloudflared quick tunnel,
// writes the resulting URL into apps/backend/.env.local as PUBLIC_API_URL, and
// nudges nodemon to restart so the running server picks it up.
//
// PRODUCTION NEEDS NONE OF THIS. Render already has a permanent public URL —
// set PUBLIC_API_URL there once and it never changes. This script exists purely
// so the local loop matches production instead of silently skipping.
//
// On exit it REMOVES PUBLIC_API_URL again, which matters more than it looks:
//   • with no PUBLIC_API_URL, utils/memorialTranscribe.js deliberately skips
//     the enqueue and transcripts stay 'skipped' — visibly honest.
//   • with a STALE one, jobs are enqueued against a dead callback URL, so the
//     transcripts simply never arrive and nothing reports a problem.
// The second failure is the one that wastes an afternoon.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
const ENV_FILE = path.join(BACKEND, '.env.local');
const ENTRY = path.join(BACKEND, 'websocket-server.js');
const PORT = process.env.PORT || 4001;

function setEnvVar(key, value) {
  let text = '';
  try { text = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* create it */ }
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text)
    ? text.replace(pattern, line)
    : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_FILE, text);
}

function clearEnvVar(key) {
  let text = '';
  try { text = fs.readFileSync(ENV_FILE, 'utf8'); } catch { return; }
  fs.writeFileSync(ENV_FILE, text.replace(new RegExp(`^${key}=.*\\n?`, 'm'), ''));
}

// nodemon watches .js files, not .env — so changing the env alone leaves the
// running process on its old (empty) value.
function restartBackend() {
  const now = new Date();
  try { fs.utimesSync(ENTRY, now, now); } catch { /* backend may not be running */ }
}

console.log(`▲ Opening a tunnel to http://localhost:${PORT} …`);

const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

tunnel.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('✗ cloudflared is not installed.  brew install cloudflared');
    process.exit(1);
  }
  throw err;
});

let claimed = false;

function watchForUrl(chunk) {
  const text = String(chunk);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match || claimed) return;
  claimed = true;

  const apiUrl = `${match[0]}/api`;
  setEnvVar('PUBLIC_API_URL', apiUrl);
  restartBackend();

  console.log(`✓ PUBLIC_API_URL=${apiUrl}`);
  console.log('✓ Wrote it to apps/backend/.env.local and restarted the backend.');
  console.log('  Recorded memories will now come back with transcripts.');
  console.log('  Leave this running; Ctrl-C clears the variable again.\n');
}

tunnel.stdout.on('data', watchForUrl);
tunnel.stderr.on('data', watchForUrl);   // cloudflared prints the URL to stderr

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  clearEnvVar('PUBLIC_API_URL');
  restartBackend();
  console.log('\n✓ Cleared PUBLIC_API_URL. Transcription is off until the next tunnel.');
  tunnel.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
tunnel.on('exit', (code) => {
  if (!closing) {
    console.error(`✗ cloudflared exited (${code}).`);
    shutdown();
  }
});
