import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_DICTIONARY_FILE = 'dictionary.md';

/** Realtime API limit for input_audio_transcription.prompt */
export const TRANSCRIPTION_PROMPT_MAX_CHARS = 1024;

export function resolveDictionaryPath(): string {
  const configured = process.env.DICTIONARY_PATH?.trim();

  if (!configured) return path.join(projectRoot, DEFAULT_DICTIONARY_FILE);

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

export function loadDictionary(): string {
  const dictionaryPath = resolveDictionaryPath();

  if (!existsSync(dictionaryPath)) return '';

  return readFileSync(dictionaryPath, 'utf8').trim();
}

export function buildTranscriptionPrompt(dictionary = loadDictionary()): string | undefined {
  if (!dictionary) return undefined;

  if (dictionary.length <= TRANSCRIPTION_PROMPT_MAX_CHARS) return dictionary;

  const truncated = dictionary.slice(0, TRANSCRIPTION_PROMPT_MAX_CHARS);
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > TRANSCRIPTION_PROMPT_MAX_CHARS * 0.5) return truncated.slice(0, lastNewline).trimEnd();

  return truncated.trimEnd();
}
