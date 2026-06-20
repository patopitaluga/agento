import { createFileTools } from '../../tools/file-tools.ts';
import { resolveWorkspaceDir } from '../../config/workspace.ts';

export const { fileTools } = createFileTools(resolveWorkspaceDir());
