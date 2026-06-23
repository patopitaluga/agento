import { loadAgentContext } from '../../config/agent-context.ts';
import { loadDictionary } from '../../config/dictionary.ts';
import { getToolName, type AgentTool } from '../../config/tools.ts';

const INTRO = `You are a hands-free agent. The user speaks or types commands and may attach photos of handwritten sketches or diagrams.`;

const SHARED_GUIDANCE = [
  'Use simple relative paths such as "README.md" or "docs/notes.txt".',
  'When writing Mermaid diagrams in markdown, use <br/> for line breaks inside node labels. Never use \\n in labels — it will not render.',
];

function buildFileToolGuidance(available: Set<string>): string[] {
  const lines: string[] = [];
  const canWrite = available.has('write_file') || available.has('append_file');
  const canMutate = canWrite || available.has('rename_file') || available.has('delete_file');

  if (available.has('write_file')) lines.push('When the user asks to create a file, use write_file with the exact filename casing they requested.');

  if (available.has('read_file') && canWrite) lines.push('When the user asks to change or update a file, read it first with read_file if needed, then use write_file with the full updated content.');

  if (available.has('write_file') && available.has('append_file')) lines.push('For file content longer than 32000 characters, write the first chunk with write_file, then use append_file for each remaining chunk.');

  if (available.has('rename_file')) lines.push('When the user asks to rename or move a file, use rename_file.');

  if (available.has('delete_file')) lines.push('When the user asks to delete a file, use delete_file.');

  if (available.has('list_files')) lines.push('When the user asks about files in a folder—how many, which names, or whether one exists—use list_files with the directory path (use "." for the workspace root).');

  if (canWrite) lines.push('When the user shares an image—often a handwritten sketch or diagram—read it carefully and create or update files to match what it describes, unless they ask for something else.');

  if (canMutate) {
    lines.push('Always perform the requested file operations before replying.');
    lines.push('Confirm what you changed briefly after completing the work.');
  }

  if (available.has('read_file') && !canMutate && !available.has('list_files')) lines.push('You can read files only. If the user asks to create, modify, rename, or delete files, explain that those tools are not available.');

  if (available.has('read_file') && !canMutate && available.has('list_files')) lines.push('You can read and inspect files only. Use list_files to see which files are in a directory. If the user asks to create, modify, rename, or delete files, explain that those tools are not available.');

  return lines;
}

function buildAvailableToolsSection(toolNames: string[]): string {
  const sorted = [...toolNames].sort();

  return [
    `Available tools: ${sorted.join(', ')}.`,
    'Do not use tools that are not in this list.',
  ].join('\n');
}

export function buildAgentInstructions(tools: AgentTool[]): string {
  const toolNames = tools
    .map((tool) => getToolName(tool))
    .filter((name): name is string => Boolean(name));
  const available = new Set(toolNames);

  let instructions = INTRO;

  const fileGuidance = buildFileToolGuidance(available);
  if (fileGuidance.length > 0) instructions += `\n\n${fileGuidance.join('\n')}`;

  instructions += `\n\n${SHARED_GUIDANCE.join('\n')}`;
  instructions += `\n\n${buildAvailableToolsSection(toolNames)}`;

  const dictionary = loadDictionary();
  const context = loadAgentContext();

  if (dictionary) {
    instructions += '\n\n## Speech dictionary\n'
      + 'Use these spellings and disambiguations when interpreting voice, images, and other multimodal input. '
      + 'They are internal reference only — never quote, list, or repeat this dictionary to the user.\n'
      + dictionary;
  }

  if (context) instructions += `\n\n## User and project context\n${context}`;

  return instructions;
}
