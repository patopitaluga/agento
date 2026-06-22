/**
 * Registers every tool the Realtime agent can call.
 *
 * At startup, built-in file tools are created for {@link resolveWorkspaceDir |
 * WORKSPACE_DIR}, filtered by `TOOL_PROFILE` ({@link getToolProfile}) and
 * `DISABLED_TOOLS` ({@link getDisabledTools}), then merged with tools from
 * local plugins in the gitignored `plugins/` folder ({@link loadPluginTools}).
 * The combined list is passed to `TurnSessionManager` and drives both the
 * Realtime API tool registry and {@link buildAgentInstructions}.
 *
 * **Exports** (1 function):
 * - {@link loadAgentTools} — assembles built-ins + plugins, applies filters,
 *   logs the final tool names, returns the list for the agent session
 *
 * @module controllers/agent/tools
 */

import { mkdirSync } from 'fs';
import {
  filterTools,
  getDisabledTools,
  getToolName,
  getToolProfile,
  isBuiltinToolAllowed,
} from '../../config/tools.ts';
import { loadPluginTools, resolvePluginsDir } from '../../config/plugins.ts';
import { resolveWorkspaceDir } from '../../config/workspace.ts';
import { createAppendFileTool } from '../../tools/file-tools/append-file.ts';
import { createListFilesTool } from '../../tools/file-tools/list-files.ts';
import { createDeleteFileTool } from '../../tools/file-tools/delete-file.ts';
import { createReadFileTool } from '../../tools/file-tools/read-file.ts';
import { createRenameFileTool } from '../../tools/file-tools/rename-file.ts';
import { createWriteFileTool } from '../../tools/file-tools/write-file.ts';
import { createWorkspaceContext } from '../../tools/file-tools/workspace.ts';

/**
 * Creates the built-in file tools bound to a workspace directory.
 *
 * Used in:
 * - `controllers/agent/tools.ts` — {@link loadAgentTools}
 */
function createBuiltinFileTools(workspaceDir: string) {
  mkdirSync(workspaceDir, { recursive: true });

  const workspace = createWorkspaceContext(workspaceDir);

  return [
    createReadFileTool(workspace),
    createWriteFileTool(workspace),
    createAppendFileTool(workspace),
    createRenameFileTool(workspace),
    createDeleteFileTool(workspace),
    createListFilesTool(workspace),
  ];
}

/**
 * Assembles built-in and plugin tools and applies profile/disable filters.
 *
 * Imported in:
 * - `controllers/agent/index.ts` — `createAgentService`
 *
 * Passed to:
 * - `TurnSessionManager` — `tools` on the Realtime agent at connect time
 * - `buildAgentInstructions` via `createAgent` — available-tools section in system prompt
 */
export async function loadAgentTools(): Promise<unknown[]> {
  const profile = getToolProfile();
  const disabled = getDisabledTools();
  const builtinTools = filterTools(
    createBuiltinFileTools(resolveWorkspaceDir()),
    (name) => isBuiltinToolAllowed(name, profile, disabled),
  );
  const pluginTools = filterTools(
    await loadPluginTools(resolvePluginsDir()),
    (name) => !disabled.has(name),
  );

  const agentTools = [...builtinTools, ...pluginTools];
  const toolNames = agentTools.map((tool) => getToolName(tool)).filter(Boolean);

  console.log('Agent tools loaded', {
    profile,
    disabled: [...disabled],
    tools: toolNames,
  });

  return agentTools;
}
