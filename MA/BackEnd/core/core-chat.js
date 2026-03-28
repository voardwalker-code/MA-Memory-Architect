// ── Core Chat ────────────────────────────────────────────────────────────────
//
// The main chat handler — this is where user messages get processed.
//
// HOW IT WORKS:
// When a user sends a message, it goes through several stages:
//
//   1. CLASSIFY — Figure out what the user wants (task, conversation, etc.)
//   2. FAST PATHS — Quick shortcuts for common patterns:
//      a. "The brief is ready" → Loads PROJECT-BRIEF.md and starts building
//      b. "Create new project" → Scaffolds a project folder + template
//   3. TASK PATH — If it's a task (coding, research, writing), hand it to
//      the task runner which can use tools and run multiple steps
//   4. CONVERSATION PATH — For normal chat, gather context, ask the AI,
//      execute any tool calls the AI makes, then get the final response
//
// Think of it like a mail sorting office:
//   - Some letters get special handling (fast paths)
//   - Some go to the task department (complex work)
//   - The rest get a direct reply (conversation)
//
// WHAT IT EXPORTS:
//   handleChat(chatOpts, state, deps) — Process a user message
//
// USED BY: MA-core.js (wraps this and exposes it as core.handleChat())
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CHAT_MODE_BLOCKED
//
// Tools that are NOT allowed when MA is in "Chat Mode" (read-only).
// In Chat Mode, MA can read files and search, but can't create, edit,
// delete, or run commands.  This keeps things safe for browsing.
// ─────────────────────────────────────────────────────────────────────────────
const CHAT_MODE_BLOCKED = new Set([
  'ws_write', 'ws_append', 'ws_delete', 'ws_mkdir', 'ws_move', 'cmd_run'
]);

// ─────────────────────────────────────────────────────────────────────────────
// handleChat(chatOpts, state, deps)
//
// The main entry point for processing a user chat message.
//
//   chatOpts — what the user sent:
//     .message      — the user's text message (required)
//     .history      — previous messages in this conversation [{role,content}]
//     .attachments  — files/images the user dragged in [{name,content,type}]
//     .autoPilot    — if true, remove timeout limits
//     .onStep       — callback for task progress steps (optional)
//     .onActivity   — callback for activity events (optional)
//
//   state — current MA state (from the orchestrator):
//     .config          — current LLM config
//     .memory          — memory store instance
//     .entity          — entity.json contents
//     .skills          — loaded skill contents [{name,content}]
//     .maMode          — 'work' or 'chat'
//     .WORKSPACE_DIR   — absolute path to workspace
//     .KNOWLEDGE_DIR   — absolute path to knowledge folder
//
//   deps — module dependencies (from the orchestrator):
//     .callLLM            — function to call the AI
//     .tasks              — MA-tasks module (classify, runTask, getBlueprint)
//     .wsTools            — MA-workspace-tools module
//     .modelRouter        — MA-model-router module
//     .worklog            — MA-worklog module
//     .projectArchive     — MA-project-archive module
//     .agentCatalog       — MA-agents module
//     .hasCapability      — function to check if model supports a feature
//     .buildToolSchemas   — function to build native tool schemas
//     .gatherContext      — from core-context.js
//     .buildSystemPrompt  — from core-context.js
//     .compressHistory    — from core-tokens.js
//     .estimateTokens     — from core-tokens.js
//     .estimateMessagesTokens — from core-tokens.js
//     .stripThinkingTags  — from core-tokens.js
//     .listKnowledge      — function to list knowledge docs
//     .loadKnowledge      — function to load a knowledge doc
//
//   Returns: { reply, taskType?, steps?, filesChanged?, routedModel?,
//              routeReason?, continuationPoint?, contextUsage? }
// ─────────────────────────────────────────────────────────────────────────────
async function handleChat(chatOpts, state, deps) {
  let { message, history = [], attachments = [], autoPilot = false, onStep, onActivity } = chatOpts;
  const { config, memory, entity, skills, maMode, WORKSPACE_DIR, KNOWLEDGE_DIR, MA_ROOT } = state;
  const {
    callLLM, tasks, wsTools, modelRouter, worklog, projectArchive, agentCatalog,
    hasCapability, buildToolSchemas, gatherContext, buildSystemPrompt,
    compressHistory, estimateTokens, estimateMessagesTokens, stripThinkingTags,
    listKnowledge, loadKnowledge
  } = deps;

  if (!config) throw new Error('No LLM configured. Run /config or POST /api/config first.');
  if (!message) throw new Error('No message');

  const entityName = entity?.name || 'MA';
  const isChatMode = maMode === 'chat';
  const intent = isChatMode ? { intent: 'conversation', taskType: null, confidence: 0 } : tasks.classify(message);
  const chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const integrationMode = (config && config.integrationMode) ? config.integrationMode : 'off';

  // ── Gather all context ──────────────────────────────────────────────
  const context = await gatherContext({
    message, attachments, config, memory, skills,
    workspacePath: WORKSPACE_DIR, knowledgeDir: KNOWLEDGE_DIR,
    projectArchive, worklog, listKnowledgeFn: listKnowledge,
    loadKnowledgeFn: loadKnowledge, onActivity
  });

  // ── Build the system prompt ─────────────────────────────────────────
  const { sysPrompt, responseReserve, contextBudget } = buildSystemPrompt({
    entityName, isChatMode, context, config, integrationMode
  });

  // ── FAST PATH: "Brief is ready" ────────────────────────────────────
  // If the user says something like "the brief is ready" or "start building",
  // find the most recent project with a PROJECT-BRIEF.md and start building.
  let briefLoaded = false;
  const briefReadyRe = /\b(?:brief\s+is\s+ready|start\s+building|build\s+(?:it|the\s+project|this)|ready\s+to\s+build)\b/i;
  if (briefReadyRe.test(message)) {
    try {
      const entries = fs.readdirSync(WORKSPACE_DIR).filter(f => {
        const bp = path.join(WORKSPACE_DIR, f, 'PROJECT-BRIEF.md');
        return fs.statSync(path.join(WORKSPACE_DIR, f)).isDirectory() && fs.existsSync(bp);
      });
      if (entries.length > 0) {
        // Pick the most recently modified brief
        entries.sort((a, b) => {
          const ta = fs.statSync(path.join(WORKSPACE_DIR, a, 'PROJECT-BRIEF.md')).mtimeMs;
          const tb = fs.statSync(path.join(WORKSPACE_DIR, b, 'PROJECT-BRIEF.md')).mtimeMs;
          return tb - ta;
        });
        const projSlug = entries[0];
        const briefContent = fs.readFileSync(path.join(WORKSPACE_DIR, projSlug, 'PROJECT-BRIEF.md'), 'utf8');
        message = `Build the project described in this brief. Project folder: ${projSlug}/\n\n---\n\n${briefContent}`;
        intent.intent = 'task';
        intent.taskType = 'project';
        intent.confidence = 1.0;
        if (onActivity) await onActivity('brief_loaded', `Loaded brief from ${projSlug}/PROJECT-BRIEF.md`);
        briefLoaded = true;
      }
    } catch { /* fall through to normal handling */ }
  }

  // ── FAST PATH: Project creation ─────────────────────────────────────
  // If the user wants to CREATE a new project, scaffold the folder + brief
  // template instead of using the full task runner.  Saves tokens!
  if (!briefLoaded && intent.intent === 'task' && intent.taskType === 'project' && intent.confidence >= 0.2) {
    const createRe = /(?:create|start|new|scaffold|setup|init|begin|make)\b.{0,40}\bproject/i;
    if (createRe.test(message)) {
      try {
        // Try to extract a project name from the message
        const nameMatch = message.match(/(?:called|named|for)\s+["']?([A-Za-z0-9][A-Za-z0-9 _-]{1,40})["']?/i)
          || message.match(/project\s+["']?([A-Za-z0-9][A-Za-z0-9 _-]{1,40})["']?/i);
        const rawName = nameMatch ? nameMatch[1].trim() : `project-${Date.now().toString(36)}`;
        const slug = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 40);

        // Create the project folder
        const projDir = path.join(WORKSPACE_DIR, slug);
        if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

        // Copy brief template into the project
        const templatePath = path.join(MA_ROOT, 'MA-blueprints', 'core', 'project-brief-template.md');
        const briefDest = path.join(projDir, 'PROJECT-BRIEF.md');
        if (fs.existsSync(templatePath) && !fs.existsSync(briefDest)) {
          fs.copyFileSync(templatePath, briefDest);
        }

        // Create project archive entry
        try { projectArchive.createProject(slug, { name: rawName, description: message.slice(0, 200) }); } catch { /* may already exist */ }

        if (onActivity) await onActivity('project_create', `Created project folder: ${slug}/`);
        if (memory) memory.store('episodic', `Created new project "${rawName}" (${slug}) — brief template placed at ${slug}/PROJECT-BRIEF.md`, { topics: ['project'], chainId });
        worklog.recordTask('project', `Create project: ${rawName}`, 1, 'complete');

        const reply = `I created **${rawName}** in your workspace:\n\n` +
          `📁 \`${slug}/\`\n📄 \`${slug}/PROJECT-BRIEF.md\`\n\n` +
          `Open the **PROJECT-BRIEF.md** file in the workspace explorer and fill out the sections — ` +
          `project name, description, tech stack, features, and any constraints.\n\n` +
          `When you're done, just tell me **"The brief is ready"** or **"Start building"** and I'll read it and get to work.`;

        return { reply, taskType: 'project', steps: 1, filesChanged: [briefDest] };
      } catch (e) {
        console.error('[CORE] Project template fast-path error:', e.message);
        // Fall through to normal task runner on error
      }
    }
  }

  // ── Task path ───────────────────────────────────────────────────────
  // If the message looks like a task (coding, research, writing, etc.),
  // hand it off to the task runner which can do multi-step work with tools.
  if (intent.intent === 'task' && intent.confidence >= 0.2) {
    const routed = modelRouter.routeModel(message, intent.taskType, null, config);
    const taskLLMConfig = routed.config;

    worklog.setActiveTask(message.slice(0, 100), null, null);
    if (onActivity) await onActivity('llm_call', `Starting ${intent.taskType} task...`);

    // Check if the model supports native function calling (tool use)
    const taskUseNativeTools = hasCapability(taskLLMConfig, 'nativeToolUse');
    const taskToolSchemas = taskUseNativeTools ? buildToolSchemas(taskLLMConfig.type) : null;

    // Clear pre-edit snapshots before task execution
    wsTools.clearPreEditSnapshots();

    const result = await tasks.runTask({
      taskType: intent.taskType,
      message,
      entityName,
      callLLM: (msgs, opts) => callLLM(taskLLMConfig, msgs, autoPilot ? { ...opts, timeout: 0 } : opts),
      execTools: wsTools.executeToolCalls,
      execNativeTools: taskUseNativeTools ? wsTools.executeNativeToolCalls : null,
      nativeToolSchemas: taskToolSchemas,
      formatResults: wsTools.formatToolResults,
      stripTools: wsTools.stripToolCalls,
      workspacePath: WORKSPACE_DIR,
      integrationMode,
      taskBudgetMultiplier: config.taskBudgetMultiplier || 1,
      memorySearch: memory ? (q, l) => memory.search(q, l) : null,
      onStep,
      onActivity,
      agentCatalog
    });

    // Record model performance for the router to learn from
    if (routed.routed && routed.modelId) {
      const grade = result.finalResponse ? 'B' : 'F';
      const lang = modelRouter.evaluateJob(message, intent.taskType).language;
      modelRouter.recordPerformance(routed.modelId, intent.taskType, lang, grade);
    }

    if (memory) memory.store('episodic', `Task (${intent.taskType}): ${message}\nResult: ${(result.finalResponse || '').slice(0, 500)}`, { topics: [intent.taskType], chainId });
    worklog.recordTask(intent.taskType, message.slice(0, 100), result.steps?.length || 0, 'complete');

    // Collect pre-edit snapshots for Keep/Reject UI
    const taskSnapshots = wsTools.getPreEditSnapshots();
    const taskFileSnaps = {};
    for (const fp of (result.filesChanged || [])) {
      const rel = fp.replace(/\\/g, '/');
      if (taskSnapshots[rel] !== undefined) taskFileSnaps[rel] = taskSnapshots[rel];
    }

    return {
      reply: result.finalResponse,
      taskType: intent.taskType,
      steps: result.steps?.length || 0,
      filesChanged: result.filesChanged || [],
      fileSnapshots: taskFileSnaps,
      ...(routed.routed ? { routedModel: routed.modelId, routeReason: routed.reason } : {})
    };
  }

  // ── Conversational path ─────────────────────────────────────────────
  // For normal chat — gather context, ask the AI, handle tool calls.

  let currentSysPrompt = sysPrompt;

  // Inject blueprint guidance if classify detected a task type (even at low confidence)
  if (intent.taskType) {
    const bp = tasks.getBlueprint(intent.taskType, 'execute');
    if (bp) currentSysPrompt += `\n\n[${intent.taskType} Guidelines — follow these when handling this kind of request]\n${bp}`;
  }

  // Prompt-based thinking fallback for non-Anthropic providers
  const wantsThinking = config.capabilities && config.capabilities.extendedThinking;
  const hasNativeThinking = config.type === 'anthropic' && hasCapability(config, 'extendedThinking');
  if (wantsThinking && !hasNativeThinking) {
    currentSysPrompt += '\n\nBefore responding, reason through your approach step by step inside <thinking>...</thinking> tags. Only text OUTSIDE these tags will be shown to the user and parsed for tool calls.';
  }

  // Compress history if it's too large for context budget
  const sysTokens = estimateTokens(currentSysPrompt);
  const msgTokens = estimateTokens(message);
  const historyBudget = Math.max(0, contextBudget - sysTokens - msgTokens - 100);
  const compressedHistory = await compressHistory(history.slice(-10), historyBudget, callLLM, config);

  // Assemble the full message array
  const messages = [
    { role: 'system', content: currentSysPrompt },
    ...compressedHistory,
    { role: 'user', content: message }
  ];

  // ── Vision: inject image blocks if model supports it ────────────────
  const hasVision = config.vision === true;
  if (context.imageAttachments.length && hasVision) {
    const userMsg = messages[messages.length - 1];
    const contentBlocks = [{ type: 'text', text: userMsg.content }];
    for (const img of context.imageAttachments) {
      contentBlocks.push({ type: 'image_url', image_url: { url: img.dataUrl } });
    }
    userMsg.content = contentBlocks;
  } else if (context.imageAttachments.length && !hasVision) {
    const userMsg = messages[messages.length - 1];
    userMsg.content += '\n\n(Note: ' + context.imageAttachments.length + ' image(s) were attached but your current model does not support vision. Set vision:true in your model config to enable image analysis.)';
  }

  // Log context usage
  const totalContextTokens = estimateMessagesTokens(messages);

  // Enable native thinking for Anthropic when capability is active
  const thinkingOpt = hasNativeThinking ? { thinking: true } : {};

  // ── Tool execution: native function calling vs text-based parsing ───
  const useNativeTools = hasCapability(config, 'nativeToolUse');
  let nativeToolSchemas = useNativeTools ? buildToolSchemas(config.type) : null;
  // In chat mode, filter out write/delete/execute tools
  if (nativeToolSchemas && isChatMode) {
    nativeToolSchemas = nativeToolSchemas.filter(t => {
      const name = t.name || (t.function && t.function.name);
      return !CHAT_MODE_BLOCKED.has(name);
    });
  }

  // ── First LLM call ─────────────────────────────────────────────────
  let reply = await callLLM(config, messages, {
    temperature: 0.7, maxTokens: responseReserve, ...thinkingOpt,
    ...(nativeToolSchemas ? { tools: nativeToolSchemas } : {}),
    ...(autoPilot ? { timeout: 0 } : {})
  });

  const toolOpts = {
    workspacePath: WORKSPACE_DIR, webFetchEnabled: true, cmdRunEnabled: !isChatMode,
    integrationMode,
    memorySearch: memory ? (q, l) => memory.search(q, l) : null,
    ...(isChatMode ? { blockedTools: CHAT_MODE_BLOCKED } : {})
  };

  let toolResults = [];
  let replyText;
  let thinkingContent = '';

  // Clear pre-edit snapshots before tool execution
  wsTools.clearPreEditSnapshots();

  // ── Parse tool calls from the response ──────────────────────────────
  if (reply && typeof reply === 'object' && reply.toolCalls && reply.toolCalls.length) {
    // Native tool use path — structured tool calls from API
    replyText = reply.content || '';
    thinkingContent = reply.thinking || '';
    toolResults = await wsTools.executeNativeToolCalls(reply.toolCalls, toolOpts);
  } else if (reply && typeof reply === 'object' && reply.thinking) {
    // Native thinking response without tool calls (Anthropic extended thinking)
    replyText = reply.content || '';
    thinkingContent = reply.thinking || '';
    toolResults = await wsTools.executeToolCalls(replyText, toolOpts);
  } else {
    // Text-based tool parsing path (Ollama, or native provider returned no tool calls)
    replyText = typeof reply === 'object' ? (reply.content || '') : (reply || '');
    // Extract prompt-based <thinking> tags for display, then strip from reply
    const thinkMatch = replyText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    if (thinkMatch) thinkingContent = thinkMatch[1].trim();
    replyText = stripThinkingTags(replyText);
    toolResults = await wsTools.executeToolCalls(replyText, toolOpts);
  }

  reply = replyText;

  // ── Process tool results and get final response ─────────────────────
  if (toolResults.length > 0) {
    if (onActivity) {
      for (const r of toolResults) await onActivity(r.ok ? 'tool_result' : 'error', `${r.tool}: ${r.result || (r.ok ? '' : 'FAILED')}`);
    }
    const clean = useNativeTools ? reply : wsTools.stripToolCalls(reply);
    const toolBlock = wsTools.formatToolResults(toolResults);

    // Auto-verify: if any files were written, read them back to check
    const writtenFiles = toolResults
      .filter(r => r.ok && (r.tool === 'ws_write' || r.tool === 'ws_append'))
      .map(r => {
        const m = r.result && r.result.match(/^Wrote\s+\d+\s+bytes?\s+to\s+(.+)$/i);
        if (m) return m[1].trim();
        const a = r.result && r.result.match(/^Appended\s+\d+\s+bytes?\s+to\s+(.+)$/i);
        if (a) return a[1].trim();
        return null;
      })
      .filter(Boolean);

    let verifyBlock = '';
    if (writtenFiles.length > 0) {
      const uniqueFiles = [...new Set(writtenFiles)];
      const verifyResults = [];
      for (const filePath of uniqueFiles.slice(0, 3)) {
        try {
          const relPath = path.relative(WORKSPACE_DIR, filePath);
          const verifyText = `[TOOL: ws_read; ${relPath}]`;
          const vr = await wsTools.executeToolCalls(verifyText, {
            workspacePath: WORKSPACE_DIR, webFetchEnabled: false, cmdRunEnabled: false, integrationMode
          });
          if (vr.length > 0) verifyResults.push(...vr);
        } catch { /* skip verify errors */ }
      }
      if (verifyResults.length > 0) {
        verifyBlock = '\n\n[Auto-Verify: Files read back after write]\n' + wsTools.formatToolResults(verifyResults);
      }
    }

    // ── Follow-up LLM call: incorporate tool results into the response
    reply = await callLLM(config, [
      { role: 'system', content: `You are ${entityName}. Incorporate tool results into your response. Be concise. Do NOT output [TOOL: ...] blocks — tools have already been executed.${writtenFiles.length ? '\n\nFiles were written and auto-verified. Check the verification results — if the file looks incomplete or has errors, tell the user what needs to be fixed and offer to continue.' : ''}` },
      { role: 'user', content: `${clean}\n\n${toolBlock}${verifyBlock}\n\nRespond naturally:` }
    ], { temperature: 0.6, maxTokens: responseReserve, ...(autoPilot ? { timeout: 0 } : {}) });

    // Follow-up reply may also be a structured object (thinking model)
    if (reply && typeof reply === 'object') {
      if (reply.thinking && !thinkingContent) thinkingContent = reply.thinking;
      reply = reply.content || '';
    }
  }

  // Normalize reply to string (thinking model may return object)
  if (reply && typeof reply === 'object') {
    if (reply.thinking && !thinkingContent) thinkingContent = reply.thinking;
    reply = reply.content || '';
  }

  // ── Check for continuation marker ──────────────────────────────────
  const continueMatch = reply && reply.match(/\[CONTINUE_FROM:\s*([^\]]+)\]/);
  const continuationPoint = continueMatch ? continueMatch[1].trim() : null;

  // ── Self-review: MA reads her own output and can improve it ────────
  let selfReviewNote = '';
  const replyLen = (reply || '').length;
  if (replyLen > 60 && !continueMatch) {
    try {
      if (onActivity) await onActivity('self_review', 'Reviewing my response...');
      const reviewReply = await callLLM(config, [
        { role: 'system', content: `You are ${entityName}. You just produced a response. Review it critically:\n- Is it complete and accurate?\n- Does it answer the user\'s question?\n- Are there errors, missing parts, or unclear sections?\nIf satisfied respond with ONLY the word: APPROVED\nIf you want to revise, respond with REVISED: followed by the full improved response.\nBe brief in your evaluation.` },
        { role: 'user', content: `The user asked: ${message}\n\nYour response was:\n${reply}` }
      ], { temperature: 0.3, maxTokens: Math.min(responseReserve, 4096), ...(autoPilot ? { timeout: 0 } : {}) });

      const reviewText = typeof reviewReply === 'object' ? (reviewReply.content || '') : (reviewReply || '');
      if (reviewText.trim().startsWith('REVISED:')) {
        const revised = reviewText.slice(8).trim();
        if (revised.length > 30) {
          selfReviewNote = 'Self-reviewed and improved.';
          reply = revised;
          if (onActivity) await onActivity('self_review', 'Revised my response after review.');
        }
      } else {
        selfReviewNote = '';
        if (onActivity) await onActivity('self_review', 'Response approved.');
      }
    } catch (e) {
      // Self-review is non-critical; log and continue
      console.log('  ⟐ MA: Self-review skipped:', e.message);
    }
  }

  // ── Store memory + return ──────────────────────────────────────────
  if (memory) memory.store('episodic', `Chat: ${message}\nReply: ${(reply || '').slice(0, 300)}`, { topics: ['conversation'], chainId });

  // Collect files changed during conversational tool use
  const filesChanged = toolResults
    .filter(r => r.ok && (r.tool === 'ws_write' || r.tool === 'ws_append'))
    .map(r => {
      const m = r.result && r.result.match(/^(?:Wrote|Appended)\s+\d+\s+bytes?\s+to\s+(.+)$/i);
      return m ? m[1].trim() : null;
    })
    .filter(Boolean);

  // Collect pre-edit snapshots for Keep/Reject UI
  const preEditSnapshots = wsTools.getPreEditSnapshots();
  const fileSnapshots = {};
  for (const fp of [...new Set(filesChanged)]) {
    const rel = fp.replace(/\\/g, '/');
    if (preEditSnapshots[rel] !== undefined) {
      fileSnapshots[rel] = preEditSnapshots[rel];
    }
  }

  return {
    reply,
    thinking: thinkingContent || undefined,
    selfReview: selfReviewNote || undefined,
    filesChanged: [...new Set(filesChanged)],
    fileSnapshots,
    ...(continuationPoint ? { continuationPoint } : {}),
    contextUsage: { contextTokens: totalContextTokens, contextBudget, responseReserve }
  };
}

module.exports = { handleChat };
