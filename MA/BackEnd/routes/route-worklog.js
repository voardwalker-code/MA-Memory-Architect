// ── Route Module: Worklog ────────────────────────────────────────────────────
//
// This module manages MA's "worklog" — a small file that tracks what the AI
// is currently working on.  It's like a sticky note on the server's desk:
//   • Which project is active right now?
//   • What's the current task?
//   • What steps are planned, and which are done?
//   • What was the last thing we worked on?
//
// The worklog helps MA pick up where it left off if the server restarts,
// and it lets the browser UI show progress to the user.
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/worklog — Read the current work state
//   POST /api/worklog — Update the work state (partial updates OK)
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core — MA-core (core.worklog for reading and writing the state file)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createWorklogRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createWorklogRoutes(deps) {
  const { core } = deps;

  return async function handle(url, method, req, res) {

    // ── Read the worklog ─────────────────────────────────────────────
    // Returns the full work state: activeProject, currentTask,
    // taskPlan (array of steps), recentWork, resumePoint, etc.
    if (url.pathname === '/api/worklog' && method === 'GET') {
      json(res, 200, core.worklog.getState());
      return true;
    }

    // ── Update the worklog ───────────────────────────────────────────
    // You only need to send the fields you want to change.
    // Fields you don't send keep their current values.
    //
    // Example body:
    //   { currentTask: "Fix the login bug", taskPlan: [
    //       { done: true,  description: "Found the bug" },
    //       { done: false, description: "Write the fix" }
    //   ]}
    if (url.pathname === '/api/worklog' && method === 'POST') {
      const body    = JSON.parse(await readBody(req));
      const current = core.worklog.getState();

      // Merge the incoming fields with the current state
      const next = {
        ...current,
        activeProject:       body.activeProject       ?? current.activeProject,
        activeProjectStatus: body.activeProjectStatus ?? current.activeProjectStatus,
        currentTask:         body.currentTask         ?? current.currentTask,

        // If a new taskPlan array was sent, clean it up:
        //   • Each step must have { done: bool, description: string }
        //   • Skip any steps with blank descriptions
        taskPlan: Array.isArray(body.taskPlan)
          ? body.taskPlan
              .map(step => ({
                done:        !!step.done,
                description: String(step.description || '').trim()
              }))
              .filter(step => step.description)
          : current.taskPlan,

        recentWork:   Array.isArray(body.recentWork) ? body.recentWork : current.recentWork,
        resumePoint:  body.resumePoint ?? current.resumePoint,
        lastActivity: new Date().toISOString()
      };

      core.worklog.write(next);
      json(res, 200, { ok: true, state: core.worklog.getState() });
      return true;
    }

    // None of our routes matched
    return false;
  };
};
