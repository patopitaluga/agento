import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTools,
  getDisabledTools,
  getToolName,
  getToolProfile,
  isBuiltinToolAllowed,
} from '../config/tools.ts';

describe('getToolProfile', () => {
  const original = process.env.TOOL_PROFILE;

  beforeEach(() => {
    delete process.env.TOOL_PROFILE;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TOOL_PROFILE;
    } else {
      process.env.TOOL_PROFILE = original;
    }
  });

  it('defaults to full', () => {
    assert.equal(getToolProfile(), 'full');
  });

  it('supports readonly', () => {
    process.env.TOOL_PROFILE = 'readonly';
    assert.equal(getToolProfile(), 'readonly');
  });
});

describe('getDisabledTools', () => {
  const original = process.env.DISABLED_TOOLS;

  beforeEach(() => {
    delete process.env.DISABLED_TOOLS;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DISABLED_TOOLS;
    } else {
      process.env.DISABLED_TOOLS = original;
    }
  });

  it('returns an empty set by default', () => {
    assert.deepEqual(getDisabledTools(), new Set());
  });

  it('parses comma-separated tool names', () => {
    process.env.DISABLED_TOOLS = 'write_file, delete_file,echo';
    assert.deepEqual(getDisabledTools(), new Set(['write_file', 'delete_file', 'echo']));
  });
});

describe('isBuiltinToolAllowed', () => {
  it('allows all built-ins in full profile', () => {
    assert.equal(isBuiltinToolAllowed('write_file', 'full', new Set()), true);
    assert.equal(isBuiltinToolAllowed('delete_file', 'full', new Set()), true);
  });

  it('allows only read_file in readonly profile', () => {
    assert.equal(isBuiltinToolAllowed('read_file', 'readonly', new Set()), true);
    assert.equal(isBuiltinToolAllowed('write_file', 'readonly', new Set()), false);
  });

  it('respects disabled tools in any profile', () => {
    assert.equal(isBuiltinToolAllowed('read_file', 'full', new Set(['read_file'])), false);
    assert.equal(isBuiltinToolAllowed('write_file', 'full', new Set(['write_file'])), false);
  });
});

describe('filterTools', () => {
  it('removes tools without a name', () => {
    const filtered = filterTools([{ name: 'ok' }, {}, { name: '' }], () => true);
    assert.deepEqual(filtered, [{ name: 'ok' }]);
  });

  it('applies the allow predicate by tool name', () => {
    const tools = [{ name: 'read_file' }, { name: 'write_file' }];
    const filtered = filterTools(tools, (name) => name === 'read_file');
    assert.deepEqual(filtered, [{ name: 'read_file' }]);
  });
});

describe('getToolName', () => {
  it('reads the name from a tool object', () => {
    assert.equal(getToolName({ name: 'read_file' }), 'read_file');
    assert.equal(getToolName({ name: 1 }), undefined);
    assert.equal(getToolName(null), undefined);
  });
});
