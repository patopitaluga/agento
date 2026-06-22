export const BUILTIN_FILE_TOOL_NAMES = [
  'read_file',
  'write_file',
  'append_file',
  'rename_file',
  'delete_file',
] as const;

export type BuiltinFileToolName = (typeof BUILTIN_FILE_TOOL_NAMES)[number];
export type ToolProfile = 'full' | 'readonly';

const READONLY_BUILTIN_TOOLS = new Set<BuiltinFileToolName>(['read_file']);

export function getToolProfile(): ToolProfile {
  const value = process.env.TOOL_PROFILE?.trim().toLowerCase();

  if (value === 'readonly') {
    return 'readonly';
  }

  return 'full';
}

export function getDisabledTools(): Set<string> {
  const raw = process.env.DISABLED_TOOLS?.trim();

  if (!raw) {
    return new Set();
  }

  return new Set(raw.split(',').map((name) => name.trim()).filter(Boolean));
}

export function isBuiltinFileTool(name: string): name is BuiltinFileToolName {
  return (BUILTIN_FILE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isBuiltinToolAllowed(
  name: string,
  profile: ToolProfile,
  disabled: Set<string>,
): boolean {
  if (disabled.has(name)) {
    return false;
  }

  if (!isBuiltinFileTool(name)) {
    return true;
  }

  if (profile === 'readonly') {
    return READONLY_BUILTIN_TOOLS.has(name);
  }

  return true;
}

export function getToolName(tool: unknown): string | undefined {
  if (typeof tool === 'object' && tool !== null && 'name' in tool) {
    const { name } = tool as { name: unknown };

    if (typeof name === 'string' && name.trim()) {
      return name;
    }
  }

  return undefined;
}

export function filterTools<T>(
  tools: T[],
  isAllowed: (name: string) => boolean,
): T[] {
  return tools.filter((tool) => {
    const name = getToolName(tool);

    if (!name) {
      console.warn('Skipping tool without a name');
      return false;
    }

    return isAllowed(name);
  });
}
