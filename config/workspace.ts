import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function resolveWorkspaceDir(): string {
  const configured = process.env.WORKSPACE_DIR?.trim();

  if (!configured) {
    return path.join(projectRoot, 'generated');
  }

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

export { projectRoot };
