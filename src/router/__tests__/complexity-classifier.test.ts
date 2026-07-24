// =============================================================================
// Complexity classifier tests — routing decision matrix
// REQ-046: Automatic model routing based on task complexity
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  classifyComplexity,
  extractSignals,
  detectExplicitSignal,
  classifyMediaIntent,
} from '../complexity-classifier.js';
import type { ComplexitySignals } from '../../types.js';

function makeSignals(overrides: Partial<ComplexitySignals> = {}): ComplexitySignals {
  return {
    estimated_tokens: 10_000,
    file_count: 5,
    tool_call_count: 3,
    code_diff_lines: 100,
    requires_reasoning: false,
    task_classification: 'implementation',
    task_description: 'general task', // REQ-057: no explicit signal by default
    ...overrides,
  };
}

describe('classifyComplexity', () => {
  // Opus routing rules
  describe('routes to opus', () => {
    it('when requires_reasoning is true', () => {
      expect(classifyComplexity(makeSignals({ requires_reasoning: true }))).toBe('opus');
    });

    it('for architecture tasks', () => {
      expect(classifyComplexity(makeSignals({ task_classification: 'architecture' }))).toBe('opus');
    });

    it('for security review tasks', () => {
      expect(classifyComplexity(makeSignals({ task_classification: 'security_review' }))).toBe('opus');
    });

    it('does NOT route bare debugging tasks to opus (REQ-057: narrowed to avoid burning subscription capacity on routine work)', () => {
      // "complex_debugging" is classifyTask()'s label for plain "debug"/"investigate"
      // requests, which are routine, not automatically Opus-worthy. Opus is
      // reserved for architecture/security_review classifications, the
      // requires_reasoning narrow keyword set, or explicit/hard-threshold signals.
      expect(classifyComplexity(makeSignals({ task_classification: 'complex_debugging' }))).toBe('sonnet');
    });

    it('when estimated tokens > 32k', () => {
      expect(classifyComplexity(makeSignals({ estimated_tokens: 33_000 }))).toBe('opus');
    });

    it('when file count > 20', () => {
      expect(classifyComplexity(makeSignals({ file_count: 25 }))).toBe('opus');
    });

    it('when code diff > 1000 lines', () => {
      expect(classifyComplexity(makeSignals({ code_diff_lines: 1500 }))).toBe('opus');
    });
  });

  // Haiku routing rules
  describe('routes to haiku', () => {
    it('for low tokens + single file', () => {
      expect(
        classifyComplexity(makeSignals({ estimated_tokens: 3000, file_count: 1 })),
      ).toBe('haiku');
    });

    it('for formatting tasks', () => {
      expect(classifyComplexity(makeSignals({ task_classification: 'formatting' }))).toBe('haiku');
    });

    it('for linting tasks', () => {
      expect(classifyComplexity(makeSignals({ task_classification: 'linting' }))).toBe('haiku');
    });

    it('for docstring tasks', () => {
      expect(classifyComplexity(makeSignals({ task_classification: 'docstring' }))).toBe('haiku');
    });

    it('for boilerplate tasks', () => {
      expect(classifyComplexity(makeSignals({ task_classification: 'boilerplate' }))).toBe('haiku');
    });

    it('for zero tool calls + very low tokens', () => {
      expect(
        classifyComplexity(makeSignals({ tool_call_count: 0, estimated_tokens: 1500 })),
      ).toBe('haiku');
    });
  });

  // Sonnet routing rules
  describe('routes to sonnet', () => {
    it('for standard implementation tasks', () => {
      expect(classifyComplexity(makeSignals())).toBe('sonnet');
    });

    it('for moderate token counts with multiple files', () => {
      expect(
        classifyComplexity(
          makeSignals({ estimated_tokens: 15_000, file_count: 8 }),
        ),
      ).toBe('sonnet');
    });

    it('for bug fix tasks with moderate complexity', () => {
      expect(
        classifyComplexity(
          makeSignals({ task_classification: 'bug_fix', estimated_tokens: 8_000 }),
        ),
      ).toBe('sonnet');
    });
  });

  // Boundary cases
  describe('boundary cases', () => {
    it('32000 tokens routes to sonnet (boundary)', () => {
      expect(
        classifyComplexity(makeSignals({ estimated_tokens: 32_000 })),
      ).toBe('sonnet');
    });

    it('32001 tokens routes to opus', () => {
      expect(
        classifyComplexity(makeSignals({ estimated_tokens: 32_001 })),
      ).toBe('opus');
    });

    it('4000 tokens + 1 file routes to haiku', () => {
      expect(
        classifyComplexity(makeSignals({ estimated_tokens: 3_999, file_count: 1 })),
      ).toBe('haiku');
    });

    it('4000 tokens + 2 files routes to sonnet', () => {
      expect(
        classifyComplexity(makeSignals({ estimated_tokens: 3_999, file_count: 2 })),
      ).toBe('sonnet');
    });
  });
});

describe('extractSignals', () => {
  it('extracts signals from task description', () => {
    const signals = extractSignals({
      taskDescription: 'Refactor the authentication module',
      fileCount: 3,
    });
    // REQ-057: bare "refactor" no longer triggers requires_reasoning — only
    // "multi-file refactor"/"large-scale refactor" do. A single-module
    // refactor is routine work, correctly routed to sonnet, not opus.
    expect(signals.requires_reasoning).toBe(false);
    expect(signals.file_count).toBe(3);
    expect(signals.task_classification).toBe('refactoring');
  });

  it('DOES trigger requires_reasoning for explicitly large-scale refactors (REQ-057)', () => {
    const signals = extractSignals({
      taskDescription: 'Perform a multi-file refactor of the authentication module',
      fileCount: 12,
    });
    expect(signals.requires_reasoning).toBe(true);
  });

  it('classifies formatting tasks', () => {
    const signals = extractSignals({
      taskDescription: 'Format the file with prettier',
    });
    expect(signals.task_classification).toBe('formatting');
    expect(signals.requires_reasoning).toBe(false);
  });

  it('classifies security tasks', () => {
    const signals = extractSignals({
      taskDescription: 'Security audit of the API endpoints',
    });
    expect(signals.task_classification).toBe('security_review');
    expect(signals.requires_reasoning).toBe(true);
  });

  it('estimates token count from text length', () => {
    const signals = extractSignals({
      taskDescription: 'A'.repeat(4000), // 4000 chars ≈ 1000 tokens
    });
    expect(signals.estimated_tokens).toBe(1000);
  });

  it('uses provided token estimate when given', () => {
    const signals = extractSignals({
      taskDescription: 'test',
      estimatedTokens: 50_000,
    });
    expect(signals.estimated_tokens).toBe(50_000);
  });
});

// =============================================================================
// Explicit signal detection — REQ-057
// =============================================================================
describe('detectExplicitSignal', () => {
  it('detects +fable', () => {
    expect(detectExplicitSignal('please refactor this +fable')).toBe('fable');
  });

  it('detects +haiku', () => {
    expect(detectExplicitSignal('+haiku what is 2+2')).toBe('haiku');
  });

  it('detects +local', () => {
    expect(detectExplicitSignal('summarize this +local')).toBe('ollama-local');
  });

  it('detects +codex', () => {
    expect(detectExplicitSignal('+codex fix the bug')).toBe('codex');
  });

  it('detects +gemini', () => {
    expect(detectExplicitSignal('+gemini research this')).toBe('agy');
  });

  it('detects +deep as opus (v1 deep maps to opus, not fable — spec §4.2)', () => {
    expect(detectExplicitSignal('+deep design the auth system')).toBe('opus');
  });

  it('returns null when no explicit signal present', () => {
    expect(detectExplicitSignal('fix the typo in README')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectExplicitSignal('+FABLE do this')).toBe('fable');
  });

  it('does not false-match on prefix collisions (+deeply is not +deep)', () => {
    expect(detectExplicitSignal('think +deeply about this')).toBeNull();
  });

  it('does not false-match +localize as +local', () => {
    expect(detectExplicitSignal('please +localize the strings')).toBeNull();
  });

  it('explicit signal wins over keyword classification in classifyComplexity', () => {
    // "architecture" would normally route to opus, but +haiku overrides.
    expect(
      classifyComplexity(
        makeSignals({ task_classification: 'architecture', task_description: 'design the system +haiku' }),
      ),
    ).toBe('haiku');
  });
});

// =============================================================================
// Media-intent classification — REQ-057
// =============================================================================
describe('classifyMediaIntent', () => {
  it('detects image intent', () => {
    expect(classifyMediaIntent('generate an image of a mountain')).toEqual({
      modality: 'image',
      tier: 'nano-banana-pro',
    });
  });

  it('detects image intent via "logo"', () => {
    expect(classifyMediaIntent('create a logo for my startup')).toEqual({
      modality: 'image',
      tier: 'nano-banana-pro',
    });
  });

  it('detects video intent', () => {
    expect(classifyMediaIntent('make a video of the product demo')).toEqual({
      modality: 'video',
      tier: 'veo',
    });
  });

  it('detects tts intent via "narrate"', () => {
    expect(classifyMediaIntent('narrate this script')).toEqual({
      modality: 'tts',
      tier: 'elevenlabs',
    });
  });

  it('detects tts intent via "read aloud"', () => {
    expect(classifyMediaIntent('read this document aloud')).toEqual({
      modality: 'tts',
      tier: 'elevenlabs',
    });
  });

  it('returns null when no media intent present', () => {
    expect(classifyMediaIntent('fix the login bug')).toBeNull();
  });

  it('read-aloud match does not span unrelated sentences', () => {
    // "read" and "aloud" are in different clauses far apart — not a TTS request.
    expect(
      classifyMediaIntent('read the docs then implement the parser and log errors aloud somewhere much later in a totally different sentence'),
    ).toBeNull();
  });
});
