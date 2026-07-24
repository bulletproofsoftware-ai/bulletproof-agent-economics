// =============================================================================
// src/router/complexity-classifier.ts — Signal extraction + tier assignment
// REQ-046: Automatic model routing based on task complexity
// =============================================================================

import type { ComplexitySignals, ModelTier, MediaIntent } from '../types.js';

/**
 * Extract complexity signals from a task description and context.
 */
export function extractSignals(params: {
  taskDescription: string;
  estimatedTokens?: number;
  fileCount?: number;
  toolCallCount?: number;
  codeDiffLines?: number;
}): ComplexitySignals {
  const desc = params.taskDescription.toLowerCase();

  return {
    estimated_tokens: params.estimatedTokens ?? estimateTokenCount(params.taskDescription),
    file_count: params.fileCount ?? 1,
    tool_call_count: params.toolCallCount ?? 0,
    code_diff_lines: params.codeDiffLines ?? 0,
    requires_reasoning: detectReasoningRequired(desc),
    task_classification: classifyTask(desc),
    task_description: params.taskDescription, // REQ-057: preserve raw text for explicit-signal detection
  };
}

/**
 * Classify task complexity into a model tier based on signals.
 *
 * Rule priority (first match wins):
 * 1. Opus: architecture, security review, complex reasoning, >32k tokens
 * 2. Haiku: simple formatting, linting, docstrings, <4k tokens + 1 file
 * 3. Sonnet: everything else
 */
export function classifyComplexity(signals: ComplexitySignals): ModelTier {
  // REQ-057: Explicit signal always wins, checked first.
  const explicit = detectExplicitSignal(signals.task_description ?? '');
  if (explicit) return explicit;

  // Rule 1: Opus — complex tasks requiring deep reasoning
  if (signals.requires_reasoning) return 'opus';
  // REQ-057: 'complex_debugging' and 'design_review' dropped from this list —
  // classifyTask() below labels routine "debug"/"code review" requests with
  // these classifications too, which was auto-escalating everyday work to
  // Opus. 'architecture' and 'security_review' are kept: those classifyTask
  // keywords ('architecture', 'system design', 'high-level', 'security',
  // 'vulnerability', 'audit', 'cve') are reliably high-stakes.
  if (['architecture', 'security_review'].includes(signals.task_classification)) return 'opus';
  if (signals.estimated_tokens > 32_000) return 'opus';
  if (signals.file_count > 20) return 'opus';
  if (signals.code_diff_lines > 1000) return 'opus';

  // Rule 2: Haiku — simple, single-file, low-context tasks
  if (signals.estimated_tokens < 4_000 && signals.file_count <= 1) return 'haiku';
  if (
    ['formatting', 'linting', 'docstring', 'boilerplate', 'typo_fix', 'rename'].includes(
      signals.task_classification,
    )
  )
    return 'haiku';
  if (signals.tool_call_count === 0 && signals.estimated_tokens < 2_000) return 'haiku';

  // Rule 3: Sonnet — everything else
  return 'sonnet';
}

/**
 * Detect an explicit user routing signal (e.g. "+fable") in a task description.
 * REQ-057: explicit signals always bypass keyword classification.
 * Checked case-insensitively; first match wins if multiple are present.
 */
export function detectExplicitSignal(desc: string): ModelTier | null {
  const lower = desc.toLowerCase();
  const signalMap: Array<[string, ModelTier]> = [
    ['fable', 'fable'],
    ['haiku', 'haiku'],
    ['local', 'ollama-local'],
    ['codex', 'codex'],
    ['gemini', 'agy'],
    ['deep', 'opus'],
  ];
  // Require the "+<token>" to end on a word boundary so "+deep" does not match
  // "+deeply", "+local" does not match "+localize", etc. First match wins.
  for (const [token, tier] of signalMap) {
    if (new RegExp(`\\+${token}\\b`).test(lower)) return tier;
  }
  return null;
}

/**
 * Classify media intent (image/video/TTS) independently of text-tier routing.
 * REQ-057: a prompt can carry both a text tier AND a media intent
 * (e.g. "write a script and narrate it").
 */
export function classifyMediaIntent(desc: string): MediaIntent | null {
  const lower = desc.toLowerCase();

  const imageKeywords = ['generate an image', 'create an image', 'draw an image', 'generate a photo', 'create a photo', 'generate a logo', 'create a logo', 'generate a graphic', 'create a graphic'];
  if (imageKeywords.some((kw) => lower.includes(kw))) {
    return { modality: 'image', tier: 'nano-banana-pro' };
  }

  const videoKeywords = ['make a video', 'generate a video', 'create a video', 'make a clip', 'generate a clip'];
  if (videoKeywords.some((kw) => lower.includes(kw))) {
    return { modality: 'video', tier: 'veo' };
  }

  const ttsKeywords = ['read aloud', 'narrate', 'voiceover', 'voice over', 'text to speech'];
  // "read <something> aloud" (a few words between read and aloud) is the common
  // natural phrasing, e.g. "read this document aloud" — match it in addition to
  // the contiguous "read aloud" literal. Bounded to <=6 intervening words and no
  // sentence break so it can't span unrelated clauses.
  const readAloudPattern = /\bread\b(?:\s+\w+){0,6}\s+\baloud\b/;
  if (ttsKeywords.some((kw) => lower.includes(kw)) || readAloudPattern.test(lower)) {
    return { modality: 'tts', tier: 'elevenlabs' };
  }

  return null;
}

/**
 * Estimate token count from text length.
 * Rough approximation: ~4 characters per token for English.
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Detect whether the task requires deep reasoning.
 *
 * REQ-057 (2026-07-02): narrowed from a broad verb list ("analyze", "debug",
 * "optimize", "plan", "investigate", "compare", "evaluate" — all common in
 * routine, everyday requests) down to signals that reliably indicate
 * genuinely high-stakes or architecture-level work. Metered-usage plans have
 * no flat-rate API budget: auto-escalating to Opus on generic verbs was
 * quietly burning subscription capacity on routine tasks.
 * Sonnet is the correct default for most real work; Opus/Fable are reserved
 * for tasks that actually warrant them (explicit signal, or one of these
 * narrow high-stakes markers, or the existing hard thresholds below).
 */
function detectReasoningRequired(desc: string): boolean {
  const reasoningKeywords = [
    'architect',
    'system design',
    'trade-off',
    'tradeoff',
    'security review',
    'security audit',
    'threat model',
    'multi-file refactor',
    'large-scale refactor',
    'root cause',
  ];
  return reasoningKeywords.some((kw) => desc.includes(kw));
}

/**
 * Classify the task type from its description.
 */
function classifyTask(desc: string): string {
  const classificationMap: Array<[string[], string]> = [
    [['format', 'lint', 'prettier', 'eslint'], 'formatting'],
    [['docstring', 'jsdoc', 'comment', 'documentation'], 'docstring'],
    [['boilerplate', 'scaffold', 'template', 'stub'], 'boilerplate'],
    [['rename', 'typo', 'spelling'], 'rename'],
    [['architecture', 'system design', 'high-level'], 'architecture'],
    [['security', 'vulnerability', 'audit', 'cve'], 'security_review'],
    [['debug', 'investigate', 'root cause', 'bisect'], 'complex_debugging'],
    [['design review', 'code review', 'pr review'], 'design_review'],
    [['implement', 'build', 'create', 'add feature'], 'implementation'],
    [['fix', 'bug', 'patch', 'repair'], 'bug_fix'],
    [['test', 'spec', 'assertion'], 'testing'],
    [['deploy', 'ci', 'cd', 'pipeline'], 'devops'],
    [['refactor', 'restructure', 'clean up'], 'refactoring'],
  ];

  for (const [keywords, classification] of classificationMap) {
    if (keywords.some((kw) => desc.includes(kw))) {
      return classification;
    }
  }

  return 'general';
}
