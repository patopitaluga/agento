import path from 'path';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import multer from 'multer';
import { RealtimeAgent, RealtimeSession, tool } from '@openai/agents/realtime';
import { z } from 'zod';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const uploadsDir = path.join(projectRoot, 'temp-uploads');
const workspaceDir = path.join(projectRoot, 'generated');

mkdirSync(uploadsDir, { recursive: true });
mkdirSync(workspaceDir, { recursive: true });

const AGENT_INSTRUCTIONS = `You are a voice-controlled file assistant. The user speaks commands to create or modify files.

When the user asks to create a file, use write_file with the requested path and content.
When the user asks to change or update a file, read it first with read_file if needed, then use write_file with the updated content.
Always perform the requested file operations before replying.
Confirm what you changed briefly after completing the work.
Use simple relative paths such as "notes.txt" or "docs/readme.md".`;

function normalizeToolPath(filePath: string): string {
  let normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  normalized = normalized.replace(/^(\.\/|\.\\)?generated(?:\/|\\|$)/i, '');

  return normalized || '.';
}

function resolveWorkspacePath(filePath: string): string | null {
  const normalized = normalizeToolPath(filePath);
  const fullPath = path.resolve(workspaceDir, normalized);

  if (!fullPath.startsWith(workspaceDir + path.sep) && fullPath !== workspaceDir) {
    return null;
  }

  return fullPath;
}

const readFileTool = tool({
  name: 'read_file',
  description: 'Read a file by path.',
  parameters: z.object({
    filePath: z.string().describe('Relative file path, e.g. "notes.txt"'),
  }),
  async execute({ filePath }) {
    const fullPath = resolveWorkspacePath(filePath);
    if (!fullPath) {
      return 'Error: invalid file path';
    }

    try {
      const content = readFileSync(fullPath, 'utf8');
      return content;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to read file';
    }
  },
});

const writeFileTool = tool({
  name: 'write_file',
  description: 'Create or overwrite a file by path.',
  parameters: z.object({
    filePath: z.string().describe('Relative file path, e.g. "notes.txt"'),
    content: z.string().describe('Full file content to write'),
  }),
  async execute({ filePath, content }) {
    const fullPath = resolveWorkspacePath(filePath);
    if (!fullPath) {
      return 'Error: invalid file path';
    }

    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');

    const relativePath = path.relative(workspaceDir, fullPath);
    return `Wrote ${content.length} bytes to ${relativePath}`;
  },
});

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname + '.webm');
  }
});

const upload = multer({ storage });
const uploadAudioMddlware = upload.single('audio');

function webmToPcm16(filePath: string): Buffer {
  const result = spawnSync('ffmpeg', [
    '-i', filePath,
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ac', '1',
    '-ar', '24000',
    'pipe:1',
  ], { encoding: 'buffer' });

  if (result.error) {
    throw new Error(`ffmpeg failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    throw new Error(`ffmpeg exited with code ${result.status}: ${stderr}`);
  }
  if (!result.stdout?.length) {
    throw new Error('ffmpeg produced no audio output');
  }
  return result.stdout;
}

function responseHasToolCalls(event: { type: string; response?: { output?: Array<{ type: string }> } }): boolean {
  return event.response?.output?.some((item) => item.type === 'function_call') ?? false;
}

async function processVoiceCommand(pcmBuffer: Buffer): Promise<string> {
  const agent = new RealtimeAgent({
    name: 'File assistant',
    instructions: AGENT_INSTRUCTIONS,
    tools: [readFileTool, writeFileTool],
  });

  const session = new RealtimeSession(agent, {
    transport: 'websocket',
    model: 'gpt-realtime-2',
    config: {
      outputModalities: ['text'],
      reasoning: { effort: 'low' },
      audio: {
        input: {
          format: 'pcm16',
          turnDetection: null,
        },
      },
    },
  });

  return new Promise((resolve, reject) => {
    let response = '';

    const timeout = setTimeout(() => {
      session.close();
      reject(new Error('Voice command request timed out'));
    }, 120_000);

    const finish = (error?: Error) => {
      clearTimeout(timeout);
      session.close();
      if (error) reject(error);
      else resolve(response);
    };

    session.on('error', ({ error }) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });

    session.on('transport_event', (event) => {
      if (event.type === 'response.output_text.delta') {
        response += event.delta;
      }

      if (event.type === 'response.done') {
        if (event.response.status !== 'completed') {
          finish(new Error(`Response status: ${event.response.status}`));
          return;
        }

        if (!responseHasToolCalls(event)) {
          finish();
        }
      }
    });

    void (async () => {
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY is not set');
        }

        await session.connect({ apiKey });

        session.transport.sendEvent({
          type: 'input_audio_buffer.append',
          audio: pcmBuffer.toString('base64'),
        });
        session.transport.sendEvent({ type: 'input_audio_buffer.commit' });
        session.transport.sendEvent({
          type: 'response.create',
          response: { output_modalities: ['text'] },
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}

export const audioService = {
  init: () => {
    return {
      handleAudioPostController: (req: Request, res: Response) => {
        uploadAudioMddlware(req, res, async () => {
          if (!req.file) {
            res.status(400).send({ error: 'No audio file uploaded' });
            return;
          }

          const filePath = req.file.path;

          try {
            const pcmBuffer = webmToPcm16(filePath);
            const response = await processVoiceCommand(pcmBuffer);

            console.log(response);
            res.send({ response });
          } catch (error) {
            console.error(error);
            res.status(500).send({
              error: error instanceof Error ? error.message : 'Failed to process voice command',
            });
          } finally {
            unlinkSync(filePath);
          }
        });
      }
    };
  }
};
