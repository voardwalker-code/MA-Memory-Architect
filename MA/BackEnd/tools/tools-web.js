// ── Tool Web & Command ───────────────────────────────────────────────────────
//
// Web search, web fetch, command execution, and integration-mode checks.
//
// HOW IT WORKS:
// These tools let the AI interact with the outside world:
//   - web_search — search the internet for information
//   - web_fetch  — download and read a web page
//   - cmd_run    — run a terminal command (whitelisted for safety)
//
// The integration-mode check prevents the AI from accessing NekoCore OS
// endpoints (localhost:3847) unless the user has explicitly enabled
// integration mode.  This is a safety feature.
//
// WHAT IT EXPORTS:
//   webSearch(query)                      — Search the web
//   webFetch(url)                         — Fetch and extract web page content
//   cmdRun(wp, cmd)                       — Run a whitelisted terminal command
//   isIntegrationBlocked(url, mode)       — Check if a URL is blocked
//
// USED BY: MA-workspace-tools.js (the orchestrator's executeToolCalls)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const webFetchModule = require('../infra/infra-web-fetch');
const cmdExecModule  = require('../infra/infra-cmd-executor');

// ─────────────────────────────────────────────────────────────────────────────
// webSearch(query)
//
// Searches the internet using the web fetch module's search function.
// Returns formatted search results.
//
//   query — what to search for
//   Returns: formatted string of search results
// ─────────────────────────────────────────────────────────────────────────────
async function webSearch(query) {
  const results = await webFetchModule.webSearch(query);
  return webFetchModule.formatSearchResults(results, query);
}

// ─────────────────────────────────────────────────────────────────────────────
// webFetch(url)
//
// Downloads a web page, extracts the main text content, and returns it
// wrapped in [WEB CONTENT] tags so the AI knows where the content came from.
//
//   url — the web page URL to fetch
//   Returns: the page's text content wrapped in markers
// ─────────────────────────────────────────────────────────────────────────────
async function webFetch(url) {
  const result = await webFetchModule.fetchAndExtract(url);
  return `[WEB CONTENT: ${result.url}]\n${result.text}\n[/WEB CONTENT]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// cmdRun(wp, cmd)
//
// Runs a terminal command inside the workspace directory.
// The command must be on the whitelist (enforced by MA-cmd-executor).
// Returns stdout, stderr, exit code, and any error info.
//
//   wp  — workspace path (used as the working directory)
//   cmd — the command string to execute
//   Returns: formatted string with stdout/stderr/exit code
// ─────────────────────────────────────────────────────────────────────────────
async function cmdRun(wp, cmd) {
  const result = await cmdExecModule.execCommand(cmd, wp);
  let out = '';
  if (result.stdout) out += `STDOUT:\n${result.stdout}\n`;
  if (result.stderr) out += `STDERR:\n${result.stderr}\n`;
  out += `Exit: ${result.exitCode ?? 'N/A'}`;
  if (result.timedOut) out += ' (TIMED OUT)';
  if (result.error) out += `\nError: ${result.error}`;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// isIntegrationBlocked(url, integrationMode)
//
// Checks if a URL should be blocked because it points to a NekoCore OS
// endpoint (localhost:3847) and integration mode is turned off.
//
// When integration mode is 'nekocore', localhost:3847 is allowed.
// When integration mode is 'off' (default), it's blocked.
// All other URLs are always allowed.
//
//   url             — the URL to check
//   integrationMode — 'nekocore' or 'off'
//   Returns: true if blocked, false if allowed
// ─────────────────────────────────────────────────────────────────────────────
function isIntegrationBlocked(url, integrationMode) {
  if (integrationMode === 'nekocore') return false;
  let host;
  let port;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = parsed.port;
  } catch (_) {
    // If URL parsing fails, don't block — let downstream fetch show errors
    return false;
  }
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  return isLocalhost && port === '3847';
}

module.exports = { webSearch, webFetch, cmdRun, isIntegrationBlocked };
