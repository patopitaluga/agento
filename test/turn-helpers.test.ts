import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserPrompt,
  formatToolAction,
  parseToolArguments,
  responseHasToolCalls,
  toError,
} from '../controllers/agent/turn-helpers.ts';

describe('parseToolArguments', () => {
  it('returns empty object for missing input', () => {
    assert.deepEqual(parseToolArguments(undefined), {});
  });

  it('parses valid JSON', () => {
    assert.deepEqual(parseToolArguments('{"filePath":"README.md"}'), {
      filePath: 'README.md',
    });
  });

  it('returns empty object for invalid JSON', () => {
    assert.deepEqual(parseToolArguments('{bad'), {});
  });
});

describe('formatToolAction', () => {
  it('formats successful write_file result', () => {
    assert.equal(
      formatToolAction('write_file', { filePath: 'README.md' }, 'Updated README.md (42 bytes)'),
      'write_file: Updated README.md (42 bytes)',
    );
  });

  it('formats read_file with byte count, not full content', () => {
    const content = '# Hello\n\nWorld';
    assert.equal(
      formatToolAction('read_file', { filePath: 'README.md' }, content),
      `read_file: read README.md (${content.length} bytes)`,
    );
  });

  it('formats tool errors with target path', () => {
    assert.equal(
      formatToolAction('write_file', { filePath: 'README.md' }, 'Error: invalid file path'),
      'write_file failed on README.md: Error: invalid file path',
    );
  });
});

describe('buildUserPrompt', () => {
  it('uses spoken transcript for audio turns', () => {
    assert.equal(buildUserPrompt({ hasAudio: true }, 'spoken'), 'spoken');
  });

  it('combines spoken and typed text when they differ', () => {
    assert.equal(
      buildUserPrompt({ question: 'typed', hasAudio: true }, 'spoken'),
      'spoken (typed)',
    );
  });

  it('falls back to voice command label for audio-only turns', () => {
    assert.equal(buildUserPrompt({ hasAudio: true }), 'Voice command');
  });

  it('includes image marker when an image is attached', () => {
    assert.equal(
      buildUserPrompt({ question: 'describe this', imageDataUrl: 'data:image/png;base64,abc' }),
      '[Image attached] describe this',
    );
  });
});

describe('responseHasToolCalls', () => {
  it('detects function_call output items', () => {
    assert.equal(
      responseHasToolCalls({
        type: 'response.done',
        response: { output: [{ type: 'function_call' }] },
      }),
      true,
    );
  });

  it('returns false when there are no tool calls', () => {
    assert.equal(
      responseHasToolCalls({
        type: 'response.done',
        response: { output: [{ type: 'message' }] },
      }),
      false,
    );
  });
});

describe('toError', () => {
  it('passes through Error instances', () => {
    const error = new Error('boom');
    assert.equal(toError(error), error);
  });

  it('extracts nested API error messages', () => {
    assert.equal(toError({ error: { message: 'rate limited' } }).message, 'rate limited');
  });
});
