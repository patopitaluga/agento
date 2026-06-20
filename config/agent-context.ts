import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_CONTEXT_FILE = 'agent-context.md';

export function resolveAgentContextPath(): string {
  const configured = process.env.AGENT_CONTEXT_PATH?.trim();

  if (!configured) {
    return path.join(projectRoot, DEFAULT_CONTEXT_FILE);
  }

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

export function loadAgentContext(): string {
  const contextPath = resolveAgentContextPath();

  if (!existsSync(contextPath)) {
    return '';
  }

  return readFileSync(contextPath, 'utf8').trim();
}
