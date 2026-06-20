import { mkdirSync } from 'fs';
import { createAppendFileTool } from './file-tools/append-file.ts';
import { createDeleteFileTool } from './file-tools/delete-file.ts';
import { createReadFileTool } from './file-tools/read-file.ts';
import { createRenameFileTool } from './file-tools/rename-file.ts';
import { createWriteFileTool } from './file-tools/write-file.ts';
import { createWorkspaceContext } from './file-tools/workspace.ts';

/**
 * Workspace file tools for OpenAI agents.
 *
 * Available tools (5):
 * | Tool          | Factory                 | Purpose                                      |
 * |---------------|-------------------------|----------------------------------------------|
 * | `read_file`   | `createReadFileTool`    | Read a file's UTF-8 contents                 |
 * | `write_file`  | `createWriteFileTool`   | Create or overwrite a file (max 32k per call) |
 * | `append_file` | `createAppendFileTool`  | Append to a file in chunks                   |
 * | `rename_file` | `createRenameFileTool`  | Rename, move, or fix filename casing         |
 * | `delete_file` | `createDeleteFileTool`  | Delete a file                                |
 *
 * Shared helpers live in `./file-tools/workspace.ts`:
 * - `createWorkspaceContext` — binds all tools to one workspace directory
 * - `normalizeToolPath`      — sanitizes paths supplied by the model
 *
 * @example
 * const { fileTools } = createFileTools('/path/to/workspace');
 * const agent = new RealtimeAgent({ tools: fileTools, ... });
 */
export function createFileTools(workspaceDir: string) {
  mkdirSync(workspaceDir, { recursive: true });

  const workspace = createWorkspaceContext(workspaceDir);

  const readFileTool = createReadFileTool(workspace);
  const writeFileTool = createWriteFileTool(workspace);
  const appendFileTool = createAppendFileTool(workspace);
  const renameFileTool = createRenameFileTool(workspace);
  const deleteFileTool = createDeleteFileTool(workspace);

  const fileTools = [readFileTool, writeFileTool, appendFileTool, renameFileTool, deleteFileTool];

  return {
    readFileTool,
    writeFileTool,
    appendFileTool,
    renameFileTool,
    deleteFileTool,
    fileTools,
  };
}

export { createAppendFileTool } from './file-tools/append-file.ts';

export { createDeleteFileTool } from './file-tools/delete-file.ts';
export { createReadFileTool } from './file-tools/read-file.ts';
export { createRenameFileTool } from './file-tools/rename-file.ts';
export { createWriteFileTool } from './file-tools/write-file.ts';
export { createWorkspaceContext, normalizeToolPath } from './file-tools/workspace.ts';
export type { WorkspaceContext } from './file-tools/workspace.ts';
