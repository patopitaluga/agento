import type { RealtimeSession } from '@openai/agents/realtime';
import { RealtimeSession as RealtimeSessionClass } from '@openai/agents/realtime';
import { buildTranscriptionPrompt } from '../../config/dictionary.ts';
import {
  logResponseDone,
  logToolEnd,
  logToolStart,
  logTurn,
  logTurnError,
} from '../../utils/turn-log.ts';
import { createAgent, createSessionConfig } from './session-config.ts';
import {
  buildUserPrompt,
  formatToolAction,
  parseToolArguments,
  responseHasToolCalls,
  toError,
} from './turn-helpers.ts';
import type { StreamingTurn, TurnMetadata, TurnResult, TurnStreamEvent } from './types.ts';

const TURN_TIMEOUT_MS = 120_000;

export class TurnSessionManager {
  private session: RealtimeSession | null = null;
  private connectPromise: Promise<RealtimeSession> | null = null;
  private busy = false;
  private activeTurn: StreamingTurn | null = null;

  async processTextTurn(metadata: TurnMetadata): Promise<TurnResult> {
    const turn = await this.beginTurn({ ...metadata, hasAudio: false });
    try {
      return await turn.commit();
    } catch (error) {
      turn.cancel();
      throw error;
    }
  }

  async beginTurn(
    metadata: TurnMetadata,
    onStream?: (event: TurnStreamEvent) => void,
  ): Promise<StreamingTurn> {
    if (this.busy) {
      throw new Error('Already processing a turn');
    }

    this.busy = true;
    const session = await this.getSession();
    let cleanedUp = false;
    let abortTurn: ((error: Error) => void) | null = null;
    let responseCycle = 0;

    logTurn('started', {
      hasAudio: metadata.hasAudio ?? false,
      hasImage: Boolean(metadata.imageDataUrl),
      hasQuestion: Boolean(metadata.question?.trim()),
    });

    const turnPromise = new Promise<TurnResult>((resolve, reject) => {
      let response = '';
      let transcript = '';
      const actions: string[] = [];
      let settled = false;

      const timeout = setTimeout(() => {
        finish(new Error('Turn request timed out'));
      }, TURN_TIMEOUT_MS);

      const cleanup = () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        clearTimeout(timeout);
        session.off('transport_event', onTransportEvent);
        session.off('agent_tool_start', onAgentToolStart);
        session.off('agent_tool_end', onAgentToolEnd);
        session.off('error', onSessionError);
        this.busy = false;
        if (this.activeTurn === streamingTurn) {
          this.activeTurn = null;
        }
      };

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        abortTurn = null;
        cleanup();
        if (error) {
          logTurnError('failed', error, {
            responseCycle,
            actionCount: actions.length,
            transcriptLength: transcript.length,
            responseLength: response.length,
          });
          reject(error);
          return;
        }

        logTurn('completed', {
          responseCycle,
          actionCount: actions.length,
          transcriptLength: transcript.length,
          responseLength: response.length,
        });

        resolve({
          userPrompt: buildUserPrompt(metadata, transcript),
          actions,
          response,
        });
      };

      const onSessionError = ({ error }: { error: unknown }) => {
        if (this.session === session) {
          this.session = null;
        }
        logTurnError('session error', error, { responseCycle, actionCount: actions.length });
        finish(toError(error));
      };

      const onAgentToolStart = (...handlerArgs: unknown[]) => {
        const tool = handlerArgs[2] as { name: string };
        const details = handlerArgs[3] as { toolCall: { arguments?: string; callId?: string } };
        const args = parseToolArguments(details.toolCall.arguments);
        logToolStart(tool.name, args, details.toolCall.callId);
      };

      const onAgentToolEnd = (...handlerArgs: unknown[]) => {
        const tool = handlerArgs[2] as { name: string };
        const result = typeof handlerArgs[3] === 'string' ? handlerArgs[3] : String(handlerArgs[3] ?? '');
        const details = handlerArgs[4] as { toolCall: { arguments?: string; callId?: string } };
        const args = parseToolArguments(details.toolCall.arguments);
        logToolEnd(tool.name, args, result, details.toolCall.callId);
        actions.push(formatToolAction(tool.name, args, result));
      };

      const onTransportEvent = (event: {
        type: string;
        delta?: string;
        transcript?: string;
        response?: { status: string; output?: Array<{ type: string }> };
      }) => {
        if (event.type === 'conversation.item.input_audio_transcription.delta' && event.delta) {
          transcript += event.delta;
          onStream?.({ type: 'transcript.delta', delta: event.delta, transcript });
        }

        if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
          transcript = event.transcript;
          onStream?.({ type: 'transcript.completed', transcript: event.transcript });
        }

        if (event.type === 'response.output_text.delta' && event.delta) {
          response += event.delta;
          onStream?.({ type: 'response.delta', delta: event.delta, response });
        }

        if (event.type === 'response.done') {
          responseCycle += 1;
          const status = event.response?.status;
          const outputTypes = event.response?.output?.map((item) => item.type) ?? [];
          const hasToolCalls = responseHasToolCalls(event);

          logResponseDone(status, {
            responseCycle,
            outputTypes,
            hasToolCalls,
            statusDetails: (event.response as { status_details?: unknown } | undefined)?.status_details,
          });

          if (status !== 'completed') {
            finish(new Error(`Response status: ${status ?? 'unknown'}`));
            return;
          }

          if (hasToolCalls) {
            response = '';
            return;
          }

          finish();
        }
      };

      session.on('transport_event', onTransportEvent);
      session.on('agent_tool_start', onAgentToolStart);
      session.on('agent_tool_end', onAgentToolEnd);
      session.on('error', onSessionError);

      abortTurn = (error: Error) => finish(error);

      const messageContent: Array<
        { type: 'input_image'; image: string } | { type: 'input_text'; text: string }
      > = [];

      if (metadata.imageDataUrl) {
        messageContent.push({ type: 'input_image', image: metadata.imageDataUrl });
      }
      if (metadata.question) {
        messageContent.push({ type: 'input_text', text: metadata.question });
      }

      if (messageContent.length > 0) {
        session.transport.sendMessage(
          {
            type: 'message',
            role: 'user',
            content: messageContent,
          },
          {},
          { triggerResponse: !metadata.hasAudio },
        );
      }
    });

    const streamingTurn: StreamingTurn = {
      appendAudio: (pcm: Buffer) => {
        const arrayBuffer = new Uint8Array(pcm).buffer;
        session.transport.sendAudio(arrayBuffer, { commit: false });
      },
      commit: async () => {
        if (metadata.hasAudio) {
          session.transport.sendEvent({ type: 'input_audio_buffer.commit' });
          session.transport.sendEvent({
            type: 'response.create',
            response: { output_modalities: ['text'] },
          });
        }

        return turnPromise;
      },
      cancel: () => {
        abortTurn?.(new Error('Turn cancelled'));
      },
    };

    this.activeTurn = streamingTurn;
    return streamingTurn;
  }

  private async getSession(): Promise<RealtimeSession> {
    if (this.session?.transport.status === 'connected') {
      return this.session;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connect();
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connect(): Promise<RealtimeSession> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const session = new RealtimeSessionClass(createAgent(), createSessionConfig());
    const transcriptionPrompt = buildTranscriptionPrompt();

    if (transcriptionPrompt) {
      logTurn('session dictionary loaded', {
        promptLength: transcriptionPrompt.length,
      });
    }

    session.on('error', ({ error }) => {
      console.error(error);
      if (this.session === session) {
        this.session = null;
      }
    });

    await session.connect({ apiKey });
    this.session = session;
    return session;
  }
}
