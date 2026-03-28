#!/usr/bin/env node
// Boots MA-Server-standalone briefly, hits /api/health, then stops (for CI / local sanity).
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const MA_ROOT = path.join(__dirname, '..');
const START_TIMEOUT_MS = 25000;
const HEALTH_PATH = '/api/health';

let finished = false;

function done(code) {
  if (finished) return;
  finished = true;
  process.exit(code);
}

const child = spawn(process.execPath, ['MA-Server-standalone.js'], {
  cwd: MA_ROOT,
  env: { ...process.env, MA_NO_OPEN_BROWSER: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let buf = '';
function onChunk(chunk) {
  buf += chunk.toString();
  const m = buf.match(/Running at (http:\/\/127\.0\.0\.1:(\d+))/);
  if (!m || child._healthRequested) return;
  child._healthRequested = true;
  const base = m[1];
  const u = new URL(HEALTH_PATH, base + '/');
  http.get(u, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      clearTimeout(timer);
      if (res.statusCode !== 200) {
        console.error('[smoke] expected HTTP 200 from', u.href, 'got', res.statusCode);
        child.kill('SIGTERM');
        done(1);
        return;
      }
      try {
        JSON.parse(body);
      } catch (_) {
        console.error('[smoke] /api/health body is not valid JSON');
        child.kill('SIGTERM');
        done(1);
        return;
      }
      console.log('[smoke] OK —', base, HEALTH_PATH);
      child._smokeOk = true;
      child.kill('SIGTERM');
      setTimeout(() => done(0), 400);
    });
  }).on('error', (e) => {
    clearTimeout(timer);
    console.error('[smoke] request error:', e.message);
    child.kill('SIGTERM');
    done(1);
  });
}

child.stdout.on('data', onChunk);
child.stderr.on('data', onChunk);

const timer = setTimeout(() => {
  console.error('[smoke] timeout waiting for server (no "Running at" banner)');
  child.kill('SIGTERM');
  done(1);
}, START_TIMEOUT_MS);

child.on('exit', (code, sig) => {
  if (finished || child._smokeOk) return;
  clearTimeout(timer);
  console.error('[smoke] server exited early code=', code, 'sig=', sig);
  console.error(buf.slice(-2000));
  done(1);
});
