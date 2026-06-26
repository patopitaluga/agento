import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  formatFileListResult,
  listFilesInDirectory,
} from '../tools/file-tools/list-files.ts';

describe('listFilesInDirectory', () => {
  it('lists visible and hidden files, not subdirectories', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacheco-list-'));
    writeFileSync(path.join(dir, 'b.txt'), 'b');
    writeFileSync(path.join(dir, 'a.txt'), 'a');
    writeFileSync(path.join(dir, '.hidden'), 'hidden');
    mkdirSync(path.join(dir, 'nested'));
    writeFileSync(path.join(dir, 'nested', 'inside.txt'), 'inside');

    assert.deepEqual(listFilesInDirectory(dir), ['.hidden', 'a.txt', 'b.txt']);
  });

  it('returns an empty array for an empty directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacheco-list-empty-'));
    assert.deepEqual(listFilesInDirectory(dir), []);
  });
});

describe('formatFileListResult', () => {
  it('includes the count and file names', () => {
    assert.equal(
      formatFileListResult('.', ['.env', 'README.md']),
      '2 files in .:\n.env\nREADME.md',
    );
  });

  it('handles an empty directory', () => {
    assert.equal(formatFileListResult('docs', []), '0 files in docs:');
  });
});
