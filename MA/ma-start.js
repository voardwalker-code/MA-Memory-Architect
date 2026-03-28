#!/usr/bin/env node
// ── ma-start.js ─────────────────────────────────────────────────────────────
// Lifecycle launcher for MA-Server-standalone.js.
// Commands: start | stop | restart | status
// Writes a PID file to MA-logs/ma-server.pid so the process can be managed
// across shell sessions without needing a process manager.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MA_ROOT = __dirname;
const SERVER_SCRIPT = path.join(MA_ROOT, 'MA-Server-standalone.js');
const PID_FILE = path.join(MA_ROOT, 'MA-logs', 'ma-server.pid');

function ensureLogsDir() {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writePid(pid) {
  ensureLogsDir();
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
}

function clearPid() {
  if (fs.existsSync(PID_FILE)) fs.rmSync(PID_FILE, { force: true });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function status() {
  const pid = readPid();
  if (!pid) {
    console.log('MA background server: stopped (no PID file).');
    return;
  }
  if (!isProcessAlive(pid)) {
    clearPid();
    console.log(`MA background server: stopped (stale PID ${pid} removed).`);
    return;
  }
  console.log(`MA background server: running (PID ${pid}).`);
}

function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('MA background server: nothing to stop.');
    return;
  }
  if (!isProcessAlive(pid)) {
    clearPid();
    console.log(`MA background server: stale PID ${pid} removed.`);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    clearPid();
    console.log(`MA background server stopped (PID ${pid}).`);
  } catch (err) {
    console.error(`Failed to stop PID ${pid}: ${err.message}`);
    process.exitCode = 1;
  }
}

function start() {
  if (!fs.existsSync(SERVER_SCRIPT)) {
    console.error(`Server script not found: ${SERVER_SCRIPT}`);
    process.exit(1);
  }

  const existingPid = readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`MA background server already running (PID ${existingPid}).`);
    return;
  }
  if (existingPid) clearPid();

  ensureLogsDir();
  const outPath = path.join(MA_ROOT, 'MA-logs', 'ma-start.log');
  const outFd = fs.openSync(outPath, 'a');

  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: MA_ROOT,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: { ...process.env, MA_NO_OPEN_BROWSER: '1' }
  });

  child.unref();
  writePid(child.pid);
  console.log(`MA background server started (PID ${child.pid}).`);
  console.log(`Log file: ${path.relative(MA_ROOT, outPath)}`);
}

const arg = process.argv[2] || '';
if (arg === '--status') {
  status();
} else if (arg === '--stop') {
  stop();
} else if (arg === '--help' || arg === '-h') {
  console.log('Usage: node ma-start.js [--status|--stop]');
} else {
  start();
}
