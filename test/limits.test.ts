import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILE_TOOL_CHARS,
  contentTooLargeError,
} from '../tools/file-tools/limits.ts';

describe('contentTooLargeError', () => {
  it('includes the actual and maximum character counts', () => {
    const message = contentTooLargeError(MAX_FILE_TOOL_CHARS + 1);

    assert.match(message, /^Error:/);
    assert.match(message, /32769/);
    assert.match(message, /32768/);
    assert.match(message, /append_file/);
  });
});
