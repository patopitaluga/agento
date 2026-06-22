/**
 * Loads personal agent context from a gitignored markdown file.
 *
 * The file (default: `agent-context.md` in the project root) describes the
 * user, their project, and how the agent should behave. Its contents are
 * appended to the system instructions when a Realtime session connects via
 * {@link buildAgentInstructions}.
 *
 * Override the path with `AGENT_CONTEXT_PATH` in `.env`.
 *
 * **Exports** (2 functions):
 * - {@link resolveAgentContextPath} — resolves the context file path from env
 * - {@link loadAgentContext} — reads and trims the file, or returns `''` if missing
 *
 * @module config/agent-context
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_CONTEXT_FILE = 'agent-context.md';

/**
 * Resolves the path to the agent context markdown file.
 *
 * Uses `AGENT_CONTEXT_PATH` when set; otherwise `agent-context.md` under
 * {@link projectRoot}.
 *
 * Used in:
 * - `config/agent-context.ts` — {@link loadAgentContext}
 */
export function resolveAgentContextPath(): string {
  const configured = process.env.AGENT_CONTEXT_PATH?.trim();

  if (!configured) {
    return path.join(projectRoot, DEFAULT_CONTEXT_FILE);
  }

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

/**
 * Returns the agent context file contents, or an empty string if the file
 * does not exist.
 *
 * Imported in:
 * - `controllers/agent/instructions.ts` — `buildAgentInstructions`
 */
export function loadAgentContext(): string {
  const contextPath = resolveAgentContextPath();

  if (!existsSync(contextPath)) {
    return '';
  }

  return readFileSync(contextPath, 'utf8').trim();
}
