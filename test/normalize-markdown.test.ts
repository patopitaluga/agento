import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMarkdownContent,
  prepareMarkdownForAppend,
  prepareMarkdownForWrite,
  shouldNormalizeMarkdown,
} from '../tools/file-tools/normalize-markdown.ts';

describe('normalizeMarkdownContent', () => {
  it('converts literal \\n in mermaid node labels to <br/>', () => {
    const input = '```mermaid\ngraph TD\n    A[Line one\\nLine two]\n```';
    const output = normalizeMarkdownContent(input);

    assert.match(output, /A\[Line one<br\/>Line two\]/);
    assert.doesNotMatch(output, /\\n/);
  });

  it('leaves non-mermaid markdown unchanged', () => {
    const input = '# Title\n\nPlain paragraph.';
    assert.equal(normalizeMarkdownContent(input), input);
  });
});

describe('shouldNormalizeMarkdown', () => {
  it('returns true for markdown files', () => {
    assert.equal(shouldNormalizeMarkdown('notes.md', 'hello'), true);
  });

  it('returns true when content contains a mermaid fence', () => {
    assert.equal(shouldNormalizeMarkdown('diagram.txt', '```mermaid\ngraph TD\n```'), true);
  });
});

describe('prepareMarkdownForWrite', () => {
  it('skips normalization for non-markdown files without mermaid', () => {
    const content = 'plain text';
    assert.equal(prepareMarkdownForWrite('notes.txt', content), content);
  });
});

describe('prepareMarkdownForAppend', () => {
  it('normalizes mermaid-like lines in markdown append chunks', () => {
    const line = '    A[Title\\n(subtitle)] --> B[Next]';
    const output = prepareMarkdownForAppend('diagram.md', line);

    assert.match(output, /Title<br\/>\(subtitle\)/);
  });
});
