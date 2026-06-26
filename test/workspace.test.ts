import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createWorkspaceContext,
  formatWorkspacePath,
  normalizeToolPath,
} from '../tools/file-tools/workspace.ts';

describe('normalizeToolPath', () => {
  it('strips leading parent-directory traversal', () => {
    assert.equal(normalizeToolPath('../../etc/passwd'), 'etc/passwd');
  });

  it('strips an accidental workspace folder prefix', () => {
    assert.equal(normalizeToolPath('generated/README.md', 'generated'), 'README.md');
  });
});

describe('formatWorkspacePath', () => {
  it('prefixes relative targets with the workspace folder name', () => {
    assert.equal(formatWorkspacePath('/tmp/generated', 'README.md'), 'generated/README.md');
  });
});

describe('createWorkspaceContext', () => {
  it('rejects absolute paths outside the workspace', () => {
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'pacheco-workspace-'));
    const workspace = createWorkspaceContext(workspaceDir);

    assert.equal(workspace.resolveWorkspacePath('/etc/passwd'), null);
  });

  it('finds files case-insensitively on case-insensitive filesystems', () => {
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'pacheco-workspace-'));
    writeFileSync(path.join(workspaceDir, 'README.md'), '# Hello', 'utf8');

    const workspace = createWorkspaceContext(workspaceDir);
    const resolved = workspace.findActualRelativePath('readme.md');

    assert.equal(resolved, 'README.md');
  });
});
