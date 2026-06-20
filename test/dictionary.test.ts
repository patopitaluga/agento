import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSCRIPTION_PROMPT_MAX_CHARS,
  buildTranscriptionPrompt,
} from '../config/dictionary.ts';

describe('buildTranscriptionPrompt', () => {
  it('returns undefined for empty dictionary', () => {
    assert.equal(buildTranscriptionPrompt(''), undefined);
  });

  it('returns the full dictionary when it fits the prompt limit', () => {
    const dictionary = 'MCP, Agento, README.md';
    assert.equal(buildTranscriptionPrompt(dictionary), dictionary);
  });

  it('truncates long dictionaries at a line boundary when possible', () => {
    const lines = Array.from({ length: 200 }, (_, index) => `term-${index}`).join('\n');
    const prompt = buildTranscriptionPrompt(lines);

    assert.ok(prompt);
    assert.ok(prompt!.length <= TRANSCRIPTION_PROMPT_MAX_CHARS);
    assert.doesNotMatch(prompt!, /term-199$/);
  });
});
