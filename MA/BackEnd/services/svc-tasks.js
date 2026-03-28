// ── Services · Task Engine ─────────────────────────────────────────────────
//
// HOW TASKS AND INTENTS WORK:
// When you send MA a message, it needs to figure out what KIND of thing
// you want.  Are you asking a question?  Requesting code?  Starting a
// research project?  This is called "intent classification".
//
// Each task type has defined limits:
//   • maxSteps     — how many tool-use rounds are allowed
//   • maxLLMCalls  — how many AI calls are allowed
//   • timeoutMs    — max time before the task is forced to stop
//
// TASK TYPES:
//   chat       — simple conversation (3 steps, 3 calls)
//   code       — write or modify code (20 steps, 25 calls)
//   research   — gather information (30 steps, 35 calls)
//   analysis   — analyze code/data (15 steps, 20 calls)
//   planning   — create plans/architecture (12 steps, 15 calls)
//   writing    — write documents/content (15 steps, 20 calls)
//   project    — multi-step project work (60 steps, 75 calls)
//
// BLUEPRINTS:
// Complex tasks can load a "blueprint" — a markdown template that tells
// the AI how to approach the task step by step.
//
// WHAT USES THIS:
//   core-chat.js — classifies intents and runs the task loop
//
// EXPORTS:
//   classify(message)         → {type, confidence, reasoning}
//   runTask(type, ctx, opts)  → task result
//   TASK_TYPES                — the task definitions
//   parsePlan(text)           → extracted plan steps
//   getBlueprint(type, root)  → blueprint markdown or null
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Task types (no planning/orchestration — MA is single-entity) ────────────
// These are the BASE limits (4x the original values).  Users can further
// scale them via the taskBudgetMultiplier setting in ma-config.json.
const TASK_TYPES = {
  architect:    { maxSteps: 40,  maxLLM: 200, timeout: 600000 },
  delegate:     { maxSteps: 32,  maxLLM: 120 },
  code:         { maxSteps: 32,  maxLLM: 100, timeout: 600000 },
  research:      { maxSteps: 24,  maxLLM: 80 },
  deep_research: { maxSteps: 40,  maxLLM: 160, timeout: 600000 },
  writing:       { maxSteps: 24,  maxLLM: 80 },
  analysis:     { maxSteps: 24,  maxLLM: 80 },
  project:      { maxSteps: 40,  maxLLM: 160, timeout: 600000 },
  memory_query: { maxSteps: 12,  maxLLM: 40 },
  entity_genesis: { maxSteps: 40,  maxLLM: 200, timeout: 600000 },
  book_ingestion: { maxSteps: 200, maxLLM: 1200, timeout: 3600000 },
  study_guide:    { maxSteps: 32,  maxLLM: 120, timeout: 600000 },
  dnd_create:     { maxSteps: 40,  maxLLM: 200, timeout: 600000 },
  tutor_entity:   { maxSteps: 40,  maxLLM: 200, timeout: 600000 },
  dnd_campaign:   { maxSteps: 48,  maxLLM: 240, timeout: 960000 },
  course_creator: { maxSteps: 48,  maxLLM: 240, timeout: 960000 },
  blueprint_builder: { maxSteps: 40,  maxLLM: 160, timeout: 600000 },
  prompt_engineering: { maxSteps: 32,  maxLLM: 120, timeout: 600000 },
  app_builder:        { maxSteps: 40,  maxLLM: 160, timeout: 600000 }
};

// Task types that benefit from extended thinking (complex reasoning required)
const COMPLEX_TASK_TYPES = new Set(['architect', 'code', 'deep_research', 'project', 'entity_genesis', 'book_ingestion', 'study_guide', 'dnd_create', 'tutor_entity', 'dnd_campaign', 'course_creator', 'blueprint_builder', 'prompt_engineering', 'app_builder']);

/** Strip <thinking>...</thinking> blocks from LLM output. */
function _stripThinkingTags(text) {
  if (!text) return text;
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}


// ── Blueprint cache ─────────────────────────────────────────────────────────
const _bpCache = new Map();
const BP_DIR = path.join(__dirname, '..', 'MA-blueprints');

function _loadBP(filePath) {
  if (_bpCache.has(filePath)) return _bpCache.get(filePath);
  try {
    if (fs.existsSync(filePath)) {
      const c = fs.readFileSync(filePath, 'utf8').trim();
      _bpCache.set(filePath, c);
      return c;
    }
  } catch (_) {}
  _bpCache.set(filePath, '');
  return '';
}

function getBlueprint(taskType, phase) {
  const parts = [];
  const coreDir = path.join(BP_DIR, 'core');
  const modDir  = path.join(BP_DIR, 'modules');

  if (phase === 'plan') {
    parts.push(_loadBP(path.join(coreDir, 'task-decomposition.md')));
    parts.push(_loadBP(path.join(modDir, `${taskType}.md`)));
  } else if (phase === 'execute') {
    parts.push(_loadBP(path.join(coreDir, 'tool-guide.md')));
    parts.push(_loadBP(path.join(coreDir, 'error-recovery.md')));
    parts.push(_loadBP(path.join(modDir, `${taskType}.md`)));
  } else if (phase === 'summarize') {
    parts.push(_loadBP(path.join(coreDir, 'quality-gate.md')));
    parts.push(_loadBP(path.join(coreDir, 'output-format.md')));
  }
  return parts.filter(Boolean).join('\n\n---\n\n');
}

// ── Intent classifier (rule-based, no LLM fallback) ────────────────────────
const RULES = {
  delegate: {
    kw: ['delegate','dispatch','assign','hire','agent','roster','catalog','team','who can','available agents','send to','hand off'],
    re: [/(?:delegate|dispatch|assign|send).{0,50}(?:to|agent|coder|engineer|researcher|reviewer|tester)/i, /(?:hire|create).{0,30}(?:agent|coder|engineer)/i, /(?:who|which|list|show).{0,30}(?:agent|roster|team|available)/i, /(?:check|scan).{0,30}(?:roster|catalog|agents)/i]
  },
  architect: {
    kw: ['architect','project plan','detailed plan','plan out','blueprint','specification','requirements gathering','design document','scaffold plan'],
    re: [/(?:plan|design|architect|spec).{0,50}(?:project|system|app|application)/i, /(?:create|generate|build|write).{0,50}(?:plan|blueprint|specification|architecture)/i, /generate the project plan/i]
  },
  code: {
    kw: ['code','write','develop','implement','create','build','function','script','program','debug','fix','refactor','test','error','bug','api','file','command','run','execute','compile','python','javascript','html','css','rust'],
    re: [/(?:write|create|build|implement).{0,50}(?:code|function|script|app)/i, /(?:fix|debug|refactor).{0,50}(?:code|bug|error)/i]
  },
  deep_research: {
    kw: ['deep dive','deep research','deep-dive','extensive research','comprehensive report','detailed report','research paper','white paper','full report','in-depth research','thorough research'],
    re: [/deep\s*dive\s*(?:research|into|on|about)/i, /(?:deep|extensive|exhaustive|thorough|comprehensive|in-depth).{0,30}(?:research|investigation|report|paper|study|analysis)/i, /(?:write|create|produce).{0,30}(?:detailed|comprehensive|extensive|full).{0,30}(?:report|paper|article|study)/i]
  },
  research: {
    kw: ['research','find','search','look up','investigate','explore','what is','how many','why is','web','source'],
    re: [/(?:find|search|research|investigate).{0,50}(?:about|for|on)/i, /\b(?:what|who|where|when|why|how)\b.{0,80}\b(?:is|are|was|were)\b/i]
  },
  writing: {
    kw: ['compose','draft','article','blog','document','essay','guide','tutorial','story','summarize','summary','email','outline'],
    re: [/(?:write|compose|draft).{0,80}(?:content|article|blog|guide|email|story)/i, /(?:summarize|summary).{0,80}(?:article|document|text)/i]
  },
  analysis: {
    kw: ['analyze','analysis','breakdown','compare','evaluate','assess','examine','pattern','trend','insight','data','pros','cons'],
    re: [/(?:analyze|break down|examine).{0,50}(?:data|information|results)/i, /(?:compare|evaluate|assess).{0,50}(?:options|approaches)/i]
  },
  project: {
    kw: ['project','scaffold','setup','generate','starter','template','boilerplate','full app'],
    re: [/(?:create|build|scaffold).{0,50}(?:project|app|application)/i]
  },
  memory_query: {
    kw: ['remember','recall','memory','what did','when did','past','previous','earlier','talked about','mentioned','history'],
    re: [/(?:remember|recall|do you remember).{0,50}(?:when|what|where)/i, /(?:what).{0,30}(?:did).{0,30}(?:talk|discuss)/i]
  },
  entity_genesis: {
    kw: ['entity','genesis','create entity','forge entity','new entity','character','backstory','persona','birth','evolve entity','spawn entity','generate entity','entity creation','build entity','bring to life'],
    re: [/(?:create|forge|birth|spawn|generate|build|make).{0,50}(?:entity|character|persona|being)/i, /entity.{0,30}(?:genesis|creation|evolution|backstory)/i, /(?:evolve|enrich|develop).{0,50}(?:entity|character|persona)/i]
  },
  book_ingestion: {
    kw: ['book','novel','ingest book','extract characters','story characters','character extraction','book characters','ingest novel','book to entity','literary characters','fiction characters'],
    re: [/(?:ingest|process|read|extract|import).{0,50}(?:book|novel|story|text|fiction)/i, /(?:book|novel|story).{0,50}(?:characters?|entities|cast)/i, /(?:extract|pull|get|find).{0,50}(?:characters?|cast).{0,50}(?:from|in|of)/i, /character.{0,30}(?:extraction|ingestion|import)/i]
  },
  study_guide: {
    kw: ['study guide','study','flashcards','flash cards','outline','timeline','review material','help me study','study for','create outline','build timeline','make flashcards','key concepts','study notes','revision','cram'],
    re: [/(?:create|build|make|generate).{0,30}(?:study guide|flashcards?|outline|timeline)/i, /(?:help me|I need to).{0,30}(?:study|review|learn|prepare)/i, /(?:study|review|revision).{0,30}(?:guide|notes|material|cards)/i, /(?:build|create).{0,30}(?:timeline|chronolog)/i]
  },
  dnd_create: {
    kw: ['DnD','D&D','dungeons and dragons','encounter','NPC','character sheet','roll character','stat block','monster','combat encounter','dungeon','tabletop','5e','pathfinder','TTRPG','hit points','armor class'],
    re: [/(?:create|build|design|generate|roll).{0,30}(?:encounter|NPC|character|stat block|dungeon)/i, /(?:DnD|D&D|dungeons?.{0,5}dragons?|5e|pathfinder|TTRPG)/i, /(?:combat|battle|fight).{0,30}(?:encounter|scenario|challenge)/i, /(?:populate|fill|stock).{0,30}(?:tavern|dungeon|town|village|guild|court)/i]
  },
  tutor_entity: {
    kw: ['tutor','teacher','teaching assistant','TA','teach me','I need a teacher','create tutor','subject tutor','private tutor','study helper','homework help','build a TA','course helper'],
    re: [/(?:create|build|make|I need).{0,30}(?:tutor|teacher|teaching assistant|TA)/i, /(?:tutor|teach).{0,30}(?:for|about|in|on).{0,30}(?:math|science|english|history|biology|chemistry|physics|calculus|spanish|french|music|programming|coding)/i, /(?:help me).{0,30}(?:learn|understand|study).{0,30}(?:with a|using a|through a)/i]
  },
  dnd_campaign: {
    kw: ['campaign','DnD campaign','D&D campaign','session prep','prepare session','session recap','journal session','world lore','faction lore','deity lore','campaign arc','adventure','quest line','story arc'],
    re: [/(?:build|create|design|plan|start).{0,30}(?:campaign|adventure|quest|story arc)/i, /(?:prep|prepare|plan).{0,30}(?:session|next session)/i, /(?:recap|journal|write up).{0,30}(?:session|last session|adventure)/i, /(?:build|create|expand).{0,30}(?:lore|faction|deity|region|world)/i]
  },
  course_creator: {
    kw: ['course','curriculum','syllabus','lesson plan','create a course','build a course','book to course','study course','exam prep','prepare for exam','study for test','mock exam','final exam','midterm','assessment'],
    re: [/(?:create|build|design|make).{0,30}(?:course|curriculum|syllabus|lesson plan)/i, /(?:turn|convert|transform).{0,30}(?:book|textbook|text).{0,30}(?:into|to|as).{0,30}(?:course|curriculum|study)/i, /(?:exam|test|midterm|final).{0,30}(?:prep|prepare|study|review|practice)/i, /(?:help me).{0,30}(?:prepare for|study for|get ready for).{0,30}(?:exam|test|assessment)/i]
  },
  blueprint_builder: {
    kw: ['blueprint','create a blueprint','build a blueprint','make a blueprint','new blueprint','design a blueprint','write a blueprint','blueprint for','no blueprint','missing blueprint','need a blueprint','task type','new task type','add a task type','workflow','create a workflow','build a workflow'],
    re: [/(?:create|build|make|write|design|draft).{0,30}(?:blueprint|workflow|task type|task template)/i, /(?:no|missing|need|there.{0,10}no).{0,30}(?:blueprint|workflow).{0,30}(?:for|to|that)/i, /blueprint.{0,30}(?:for|to|that).{0,30}(?:can|will|does|handles?)/i, /(?:teach|learn|know).{0,30}(?:how to).{0,30}(?:do|handle|process|create)/i]
  },
  prompt_engineering: {
    kw: ['prompt','system prompt','write a prompt','create a prompt','build a prompt','design a prompt','prompt engineering','prompt template','few-shot','few shot','chain of thought','refine prompt','improve prompt','fix prompt','prompt refinement','custom instructions','agent instructions','structured output','prompt for'],
    re: [/(?:create|write|build|design|draft|make).{0,30}(?:prompt|system prompt|instructions|few.?shot)/i, /(?:refine|improve|fix|rewrite|optimize).{0,30}(?:prompt|system prompt|instructions)/i, /(?:prompt|instructions).{0,30}(?:engineering|template|design|for)/i, /(?:few.?shot|chain.of.thought|structured.output).{0,30}(?:prompt|template|example)/i]
  },
  app_builder: {
    kw: ['app','application','build an app','create an app','make an app','new app','app builder','install app','nekocore app','app window','tab app','desktop app','windowed app','add an app','app for nekocore','gui app'],
    re: [/(?:create|build|make|design|develop).{0,30}(?:app|application|window|tab|gui)/i, /(?:install|add|register).{0,30}(?:app|application).{0,30}(?:nekocore|neko|desktop|os)/i, /(?:nekocore|neko).{0,30}(?:app|application|window)/i, /(?:app|application).{0,30}(?:builder|creator|installer|maker)/i]
  }
};

const CONVO_KW = ['hello','hi','hey','how are you','thanks','thank you','what do you think','your opinion','chat','talk'];

function _score(msg, kw, re) {
  const low = msg.toLowerCase();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let kwHits = kw.filter(k => new RegExp(`(^|\\W)${esc(k).replace(/\s+/g, '\\s+')}($|\\W)`, 'i').test(low)).length;
  let reHits = re.filter(r => r.test(msg)).length;
  return Math.min(kwHits * 0.2, 0.6) + Math.min(reHits * 0.35, 0.6);
}

/** Classify message → { intent: 'task'|'conversation', taskType, confidence } */
function classify(message) {
  if (!message || typeof message !== 'string') return { intent: 'conversation', taskType: null, confidence: 0 };

  let best = null, bestScore = 0;
  for (const [type, r] of Object.entries(RULES)) {
    const s = _score(message, r.kw, r.re);
    if (s > bestScore) { bestScore = s; best = type; }
  }

  const convoScore = _score(message, CONVO_KW, [/^(?:hello|hi|hey|what's up|how are you).{0,30}$/i]);
  if (bestScore >= 0.2 && bestScore >= convoScore + 0.05) {
    return { intent: 'task', taskType: best, confidence: bestScore };
  }
  return { intent: 'conversation', taskType: null, confidence: convoScore };
}

// ── Task runner ─────────────────────────────────────────────────────────────
const PLAN_RE = /\[TASK_PLAN\]([\s\S]*?)\[\/TASK_PLAN\]/;

function parsePlan(text, maxSteps = 6) {
  if (!text) return null;
  const m = PLAN_RE.exec(text);
  if (!m) return null;
  const steps = [];
  for (const line of m[1].split('\n').map(l => l.trim()).filter(Boolean)) {
    const sm = line.match(/^(?:[-*]|\d+[.)]\s*)(?:\[[ x]\]\s*)?(.+)$/);
    if (sm && sm[1].trim()) steps.push({ description: sm[1].trim(), done: false });
  }
  return steps.length ? { steps: steps.slice(0, maxSteps) } : null;
}

/**
 * Run a task: LLM generates plan → execute each step with tool calls.
 * @param {object} opts
 *   - taskType {string}
 *   - message {string}
 *   - entityName {string}
 *   - callLLM {Function} async (messages, opts) => string
 *   - execTools {Function} async (text, toolOpts) => [{tool, result, ok}]
 *   - formatResults {Function} (results) => string
 *   - stripTools {Function} (text) => string
 *   - workspacePath {string}
 *   - onStep {Function?} async (stepInfo) => void
 * @returns {Promise<{finalResponse, steps, llmCalls}>}
 */
async function runTask(opts) {
  const { taskType = 'code', message, entityName = 'MA', callLLM, execTools, execNativeTools,
          formatResults, stripTools, workspacePath = '', memorySearch, onStep, onActivity, agentCatalog,
          nativeToolSchemas, integrationMode = 'off', taskBudgetMultiplier = 1 } = opts;

  if (!callLLM) throw new Error('runTask: callLLM required');
  if (!message) throw new Error('runTask: message required');

  // Apply user-configurable budget multiplier to the base limits
  const baseLimits = TASK_TYPES[taskType] || { maxSteps: 24, maxLLM: 80 };
  const mult = Math.max(0.25, Math.min(10, taskBudgetMultiplier));
  const limits = {
    maxSteps: Math.round(baseLimits.maxSteps * mult),
    maxLLM:   Math.round(baseLimits.maxLLM * mult),
    timeout:  baseLimits.timeout ? Math.round(baseLimits.timeout * Math.max(mult, 1)) : undefined
  };
  const taskTimeout = limits.timeout || undefined;
  let llmCalls = 0;
  const allWrittenFiles = [];

  // ── Checkpoint resume: if a previous task was interrupted, inject context ──
  const cpPath = workspacePath ? path.join(workspacePath, '.ma-task-checkpoint.json') : null;
  let resumeContext = '';
  if (cpPath) {
    try {
      if (fs.existsSync(cpPath)) {
        const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
        if (cp.completedSteps && cp.completedSteps.length > 0) {
          resumeContext = '\n\n[RESUMING INTERRUPTED TASK]\n' +
            'Previously completed steps:\n' +
            cp.completedSteps.map(s => `  ✓ Step ${s.step}: ${s.description}`).join('\n') +
            '\nFiles already created: ' + (cp.filesCreated || []).join(', ') +
            '\nRemaining steps: ' + (cp.remainingSteps || []).join(', ') +
            '\n\nDo NOT redo completed steps. Continue from where you left off.';
          // Pre-load written files list from checkpoint
          for (const f of (cp.filesCreated || [])) {
            if (!allWrittenFiles.includes(f)) allWrittenFiles.push(f);
          }
        }
        fs.unlinkSync(cpPath);
      }
    } catch { /* ignore corrupt checkpoint */ }
  }

  // Phase 1: Generate plan
  const planBP = getBlueprint(taskType, 'plan');
  let planFolderHint = '';
  if (taskType === 'book_ingestion') {
    const pfm = message.match(/YOUR PROJECT FOLDER IS:\s*"([^"]+)"/);
    if (pfm) planFolderHint = `\nAll output files MUST be written inside "${pfm[1]}/". Never write to the workspace root.`;
  }
  const planSys = `You are ${entityName}. Create a step-by-step task plan using [TASK_PLAN]...[/TASK_PLAN] blocks.` +
    planFolderHint +
    resumeContext +
    (planBP ? `\n\n[Planning Instructions]\n${planBP}` : '');
  if (onActivity) await onActivity('llm_call', 'Generating task plan...');
  const planResp = await callLLM([
    { role: 'system', content: planSys },
    { role: 'user', content: `${message}\n\nCreate a concise task plan.` }
  ], { temperature: 0.7, ...(taskTimeout ? { timeout: taskTimeout } : {}) });
  llmCalls++;

  const plan = parsePlan(planResp, limits.maxSteps);
  if (!plan) {
    // Single-step direct response
    if (onStep) await onStep({ stepIndex: 0, stepTotal: 1, description: 'Execute task', output: planResp });
    if (onActivity) await onActivity('step_done', 'Single-step task completed');
    return { finalResponse: planResp, steps: [{ step: 1, description: 'Execute task', output: planResp }], llmCalls };
  }

  // Fire plan activity with step list for the activity monitor
  if (onActivity) await onActivity('plan', `Task plan: ${plan.steps.length} steps`, { steps: plan.steps.map(s => s.description) });

  // Phase 2: Execute steps
  const execBP = getBlueprint(taskType, 'execute');
  const stepOutputs = [];

  // Agent dispatch: find matching agent for this task type
  let dispatchedAgent = null;
  let agentCtx = '';
  if (agentCatalog) {
    const roleMap = { code: 'coder', research: 'researcher', writing: 'writer', architect: 'architect', analysis: 'researcher', project: 'architect', entity_genesis: 'architect' };
    const role = roleMap[taskType];
    if (role) {
      const agents = agentCatalog.findAgentsByRole(role);
      if (agents.length) {
        const seniorityOrder = { lead: 4, senior: 3, mid: 2, junior: 1 };
        dispatchedAgent = agents.sort((a, b) => (seniorityOrder[b.seniority] || 0) - (seniorityOrder[a.seniority] || 0))[0];
        agentCtx = `\n[Agent: ${dispatchedAgent.name} (${dispatchedAgent.role}, ${dispatchedAgent.seniority})]\n${dispatchedAgent.systemPrompt || ''}`;
        if (onActivity) await onActivity('agent_dispatch', `Assigned ${dispatchedAgent.name} (${dispatchedAgent.role}, ${dispatchedAgent.seniority})`, { agentId: dispatchedAgent.id, role: dispatchedAgent.role });
      }
    }
  }

  for (let i = 0; i < plan.steps.length && llmCalls < limits.maxLLM; i++) {
    const step = plan.steps[i];
    if (onActivity) await onActivity('step_start', `Step ${i + 1}: ${step.description}`);

    // Build step prompt
    let prompt = `ORIGINAL REQUEST: "${message}"\n\n`;
    prompt += `► Step ${i + 1} of ${plan.steps.length}: ${step.description}\n\n`;
    if (stepOutputs.length) {
      prompt += 'COMPLETED:\n' + stepOutputs.map(s => `  ✓ ${s.step}. ${s.description} — ${(s.output || '').slice(0, 150)}`).join('\n') + '\n\n';
    }

    // Entity-related tasks get entity-tool instructions; others get ws_write instructions
    const isEntityTask = taskType === 'book_ingestion' || taskType === 'entity_genesis';

    // Extract project folder from user message if present (injected by Book Ingest UI)
    let projectFolderRule = '';
    if (taskType === 'book_ingestion') {
      const pfMatch = message.match(/YOUR PROJECT FOLDER IS:\s*"([^"]+)"/);
      if (pfMatch) {
        projectFolderRule = `\nMANDATORY FILE ORGANIZATION: ALL output files (character registries, memory JSONs, reports, summaries, progress logs) MUST be written inside "${pfMatch[1]}". NEVER write files to the workspace root. Example: ws_write path should be "${pfMatch[1]}/character-registry.md", NOT "character-registry.md".`;
      }
    }

    if (isEntityTask) {
      prompt += `Execute step ${i + 1} now. Use [TOOL:entity_create {...}] to create entities and [TOOL:entity_inject_memory {...}] to add memories. Use [TOOL:ws_write {"path":"file"}]\\ncontent\\n[/TOOL] for non-entity files (reports, registries, etc).`;
    } else {
      prompt += `Execute step ${i + 1} now. Write files with [TOOL:ws_write {"path":"file"}]\ncontent\n[/TOOL]`;
    }

    let sysMsg;
    if (isEntityTask) {
      sysMsg = `You are ${entityName}. Executing step ${i + 1}/${plan.steps.length}.` +
        (agentCtx || '') +
        projectFolderRule +
        `\nCRITICAL: For creating entities, you MUST use [TOOL:entity_create {"name":"...","traits":[...],...}]. For adding memories to entities, you MUST use [TOOL:entity_inject_memory {"entityId":"...","content":"...","emotion":"...","topics":[...],...}]. NEVER use ws_mkdir or ws_write to create entity folders or memory files — only the dedicated tools produce valid NekoCore entities.` +
        `\nUse [TOOL:ws_write {"path":"file"}]\\ncontent\\n[/TOOL] ONLY for non-entity files like reports, registries, and summaries.` +
        `\nKeep your chat text to brief status updates — what you are doing and what was written.` +
        `\nAFTER writing any file, ALWAYS verify it with [TOOL:ws_read {"path":"file"}] to check completeness.` +
        (execBP ? `\n\n[Execution Instructions]\n${execBP}` : '');
    } else {
      sysMsg = `You are ${entityName}. Executing step ${i + 1}/${plan.steps.length}.` +
        (agentCtx || '') +
        `\nALWAYS write code to workspace files using [TOOL:ws_write {"path":"file"}]\ncontent\n[/TOOL]. NEVER paste raw code into the chat.` +
        `\nKeep your chat text to brief status updates — what you are doing and what was written. The code goes in files.` +
        `\nAFTER writing any file, ALWAYS verify it with [TOOL:ws_read {"path":"file"}] to check completeness.` +
        (execBP ? `\n\n[Execution Instructions]\n${execBP}` : '');
    }

    let stepMessages = [
      { role: 'system', content: sysMsg },
      { role: 'user', content: prompt }
    ];

    let resp = await callLLM(stepMessages, { temperature: 0.7, ...(COMPLEX_TASK_TYPES.has(taskType) ? { thinking: true } : {}), ...(taskTimeout ? { timeout: taskTimeout } : {}), ...(nativeToolSchemas ? { tools: nativeToolSchemas } : {}) });
    llmCalls++;

    // ── Native tool-use loop ────────────────────────────────────────
    // When the LLM returns native tool calls (Anthropic tool_use), we must
    // execute them and send results back so the LLM can continue (e.g. write
    // files after listing the workspace). Loop until the LLM stops requesting
    // tools or we hit a safety limit.
    const MAX_TOOL_ROUNDS = 5;
    let nativeToolResults = [];
    let toolRound = 0;

    while (resp && typeof resp === 'object' && resp.toolCalls && resp.toolCalls.length && toolRound < MAX_TOOL_ROUNDS && llmCalls < limits.maxLLM) {
      toolRound++;
      const respText = resp.content || '';
      const thinkingText = resp.thinking || '';

      // Execute the native tool calls
      let roundResults = [];
      if (execNativeTools) {
        roundResults = await execNativeTools(resp.toolCalls, { workspacePath, webFetchEnabled: true, cmdRunEnabled: true, memorySearch });
        nativeToolResults.push(...roundResults);
      }

      if (onActivity && roundResults.length) {
        for (const r of roundResults) await onActivity(r.ok ? 'tool_result' : 'error', `${r.tool}: ${(r.result || '').slice(0, 200)}`);
      }

      // Build the assistant message with tool_use blocks (what the LLM sent)
      const assistantContent = [];
      if (respText) assistantContent.push({ type: 'text', text: respText });
      for (const tc of resp.toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }

      // Build the user message with tool_result blocks (what we executed)
      const toolResultContent = roundResults.map(r => ({
        type: 'tool_result',
        tool_use_id: r.id || resp.toolCalls.find(tc => tc.name === r.tool)?.id || 'unknown',
        content: r.result || ''
      }));

      // Append to conversation and call LLM again
      stepMessages.push({ role: 'assistant', content: assistantContent });
      stepMessages.push({ role: 'user', content: toolResultContent });

      resp = await callLLM(stepMessages, { temperature: 0.7, ...(COMPLEX_TASK_TYPES.has(taskType) ? { thinking: true } : {}), ...(taskTimeout ? { timeout: taskTimeout } : {}), ...(nativeToolSchemas ? { tools: nativeToolSchemas } : {}) });
      llmCalls++;
    }

    // Extract final text from the response
    if (resp && typeof resp === 'object') {
      // If the LLM ended with one last batch of tool calls (hit the round limit),
      // execute them but don't loop again
      if (resp.toolCalls && resp.toolCalls.length && execNativeTools) {
        const finalRound = await execNativeTools(resp.toolCalls, { workspacePath, webFetchEnabled: true, cmdRunEnabled: true, memorySearch });
        nativeToolResults.push(...finalRound);
        if (onActivity && finalRound.length) {
          for (const r of finalRound) await onActivity(r.ok ? 'tool_result' : 'error', `${r.tool}: ${(r.result || '').slice(0, 200)}`);
        }
      }
      resp = resp.content || '';
    } else {
      resp = resp || '';
    }

    // Strip thinking tags before tool parsing (prompt-based fallback path)
    resp = _stripThinkingTags(resp);

    if (onActivity) await onActivity('llm_call', `LLM response for step ${i + 1}`);

    // Execute tool calls (text-based parsing for any [TOOL:...] in the text)
    if (execTools) {
      const textToolResults = await execTools(resp, { workspacePath, webFetchEnabled: true, cmdRunEnabled: true, memorySearch, integrationMode });
      const results = [...nativeToolResults, ...textToolResults];
      if (onActivity && textToolResults.length) {
        for (const r of textToolResults) await onActivity(r.ok ? 'tool_result' : 'error', `${r.tool}: ${r.result || (r.ok ? '' : 'FAILED')}`);
      }

      // Auto-verify written files
      const writtenFiles = results
        .filter(r => r.ok && (r.tool === 'ws_write' || r.tool === 'ws_append'))
        .map(r => {
          const m = r.result && r.result.match(/^(?:Wrote|Appended)\s+\d+\s+bytes?\s+to\s+(.+)$/i);
          if (m) return m[1].trim();
          const m2 = r.result && r.result.match(/^(?:Written|Appended):\s+(.+)$/i);
          return m2 ? m2[1].trim() : null;
        })
        .filter(Boolean);
      for (const f of writtenFiles) { if (!allWrittenFiles.includes(f)) allWrittenFiles.push(f); }

      if (writtenFiles.length > 0 && llmCalls < limits.maxLLM) {
        const uniqueFiles = [...new Set(writtenFiles)];
        for (const fp of uniqueFiles.slice(0, 3)) {
          try {
            const rel = path.relative(workspacePath, fp);
            const vr = await execTools(`[TOOL:ws_read ${JSON.stringify({path: rel})}]`, { workspacePath, webFetchEnabled: false, cmdRunEnabled: false, integrationMode });
            if (vr.length > 0) results.push(...vr);
          } catch { /* skip */ }
        }
      }

      if (results.length > 0 && formatResults && stripTools) {
        const cleanResp = stripTools(resp);
        const toolBlock = formatResults(results);

        if (llmCalls < limits.maxLLM) {
          resp = await callLLM([
            { role: 'system', content: `You are ${entityName}. Summarize what step ${i + 1} accomplished. Be brief. No [TOOL:] tags.${writtenFiles.length ? ' Files were auto-verified — if any look incomplete, note what needs continuation.' : ''}` },
            { role: 'user', content: `Step: ${step.description}\n\nAction:\n${cleanResp}\n\n${toolBlock}\n\nBrief summary:` }
          ], { temperature: 0.5 });
          llmCalls++;
        } else {
          resp = cleanResp;
        }
      }
    }

    stepOutputs.push({ step: i + 1, description: step.description, output: resp });
    step.done = true;
    if (onStep) await onStep({ stepIndex: i, stepTotal: plan.steps.length, description: step.description, output: resp });
    if (onActivity) await onActivity('step_done', `Step ${i + 1} complete: ${step.description}`);
    if (dispatchedAgent && agentCatalog) {
      try { agentCatalog.recordPrompt(dispatchedAgent.id, { task: step.description, prompt: prompt.slice(0, 500), result: (resp || '').slice(0, 500), success: true, tags: [taskType] }); } catch {}
    }
  }

  // ── Checkpoint: save progress if budget exhausted or steps remain ────────
  const incomplete = plan.steps.filter(s => !s.done);
  if (incomplete.length > 0 && cpPath) {
    const checkpoint = {
      taskType,
      message: message.slice(0, 2000),
      completedSteps: stepOutputs,
      remainingSteps: incomplete.map(s => s.description),
      filesCreated: allWrittenFiles,
      llmCallsUsed: llmCalls,
      timestamp: new Date().toISOString()
    };
    try { fs.writeFileSync(cpPath, JSON.stringify(checkpoint, null, 2)); } catch { /* skip */ }
    if (onActivity) await onActivity('checkpoint', `Checkpoint saved — ${incomplete.length} steps remaining. Say "continue" to resume.`);
  }

  // Phase 3: Final summary
  let finalResponse;
  const sumBP = getBlueprint(taskType, 'summarize');
  if (llmCalls < limits.maxLLM) {
    const stepsBlock = stepOutputs.map(s => `Step ${s.step} — ${s.description}:\n${s.output}`).join('\n\n');
    const resumeNote = incomplete.length > 0
      ? `\n\n⚠️ Budget reached — ${incomplete.length} steps remaining: ${incomplete.map(s => s.description).join(', ')}. Checkpoint saved. Say "continue" or "finish the task" to resume.`
      : '';
    finalResponse = await callLLM([
      { role: 'system', content: `You are ${entityName}. Summarize what you accomplished. Be brief and natural. List what files were created or modified — do NOT include code in the summary. The code is already in the workspace files.${incomplete.length > 0 ? ' IMPORTANT: Tell the user that the task is not complete and they can say "continue" to resume from where you stopped.' : ''}` + (sumBP ? `\n\n${sumBP}` : '') },
      { role: 'user', content: `Request: "${message}"\n\nCompleted ${stepOutputs.length} of ${plan.steps.length} steps:\n${stepsBlock}\n\nBrief summary:` }
    ], { temperature: 0.6, ...(taskTimeout ? { timeout: taskTimeout } : {}) });
    llmCalls++;
    finalResponse += resumeNote;
  } else {
    const resumeNote = incomplete.length > 0
      ? `\n\n⚠️ Budget reached — ${incomplete.length} steps remaining. Checkpoint saved. Say "continue" or "finish the task" to resume.`
      : '';
    finalResponse = stepOutputs.map(s => `**${s.description}**\n${s.output}`).join('\n\n') + resumeNote;
  }

  return { finalResponse, steps: stepOutputs, llmCalls, filesChanged: allWrittenFiles };
}

module.exports = { classify, runTask, TASK_TYPES, parsePlan, getBlueprint };
