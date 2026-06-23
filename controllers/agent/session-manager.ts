/**
 * Manages a persistent OpenAI Realtime session and orchestrates agent turns.
 *
 * A turn is one user request (voice, text, and/or image) through to the agent's
 * final text reply, including any file-tool calls along the way. Voice turns
 * stream PCM audio and commit the buffer when recording ends; text turns go
 * through `TurnSessionManager.processTextTurn`.
 *
 * **Exports** (1 class, 2 public methods):
 * - `TurnSessionManager` — session lifecycle and single-turn concurrency guard
 * - `TurnSessionManager.processTextTurn` — text/image turns (`POST /turn`)
 * - `TurnSessionManager.beginTurn` — start a turn; returns a `StreamingTurn`
 *   handle to stream audio (`appendAudio`), finish (`commit`), or abort (`cancel`)
 *
 * @module controllers/agent/session-manager
 */
import type { RealtimeSession } from '@openai/agents/realtime';
import { RealtimeSession as RealtimeSessionClass } from '@openai/agents/realtime';
import { buildTranscriptionPrompt, isEmptyOrDictionaryHallucination } from '../../config/dictionary.ts';
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
import type { AgentTool } from '../../config/tools.ts';
import type { StreamingTurn, TurnMetadata, TurnResult, TurnStreamEvent } from './types.ts';

const TURN_TIMEOUT_MS = 120_000;

/**
 * Keeps one Realtime WebSocket session alive and runs one turn at a time.
 *
 * Imported in:
 * - `controllers/agent/index.ts` — instantiated in `createAgentService`
 * - `controllers/realtime-ws.ts` — type for `attachRealtimeWebSocket` session param
 * - `controllers/turn-http.ts` — type for `createTurnPostHandler` session param
 *
 * @param agentTools - Tools loaded at startup (built-ins, plugins, profile filters)
 */
export class TurnSessionManager {
  private session: RealtimeSession | null = null;
  private connectPromise: Promise<RealtimeSession> | null = null;
  private busy = false;
  private activeTurn: StreamingTurn | null = null;

  private readonly agentTools: AgentTool[];

  constructor(agentTools: AgentTool[]) {
    this.agentTools = agentTools;
  }

  /**
   * Runs a text-only turn (optionally with an image) and waits for the result.
   *
   * Used in:
   * - `controllers/turn-http.ts` — `POST /turn` handler
   */
  async processTextTurn(metadata: TurnMetadata): Promise<TurnResult> {
    const turn = await this.beginTurn({ ...metadata, hasAudio: false });
    try {
      return await turn.commit();
    } catch (error) {
      turn.cancel();
      throw error;
    }
  }

  /**
   * Starts a turn and returns a handle to stream audio or commit/cancel it.
   *
   * Used in:
   * - `controllers/realtime-ws.ts` — WebSocket `turn.start` handler (voice turns)
   * - `controllers/agent/session-manager.ts` — `processTextTurn`
   */
  async beginTurn(
    metadata: TurnMetadata,
    onStream?: (event: TurnStreamEvent) => void,
  ): Promise<StreamingTurn> {
    if (this.busy) throw new Error('Already processing a turn');

    this.busy = true;
    const session = await this.getSession();
    let cleanedUp = false;
    let abortTurn: ((error: Error) => void) | null = null;
    let silentCancel: (() => void) | null = null;
    let commitStarted = false;
    let responseCycle = 0;
    let audioCommitSent = false;
    let transcriptionFinalized = false;
    let responseCreateSent = false;

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
        if (cleanedUp) return;
        cleanedUp = true;
        clearTimeout(timeout);
        session.off('transport_event', onTransportEvent);
        session.off('agent_tool_start', onAgentToolStart);
        session.off('agent_tool_end', onAgentToolEnd);
        session.off('error', onSessionError);
        this.busy = false;
        if (this.activeTurn === streamingTurn) this.activeTurn = null;
      };

      const skipTurn = () => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
        cleanup();
        logTurn('skipped empty transcript');
        resolve({ userPrompt: '', actions: [], response: '' });
      };

      const maybeCreateResponse = () => {
        if (responseCreateSent || !audioCommitSent || !metadata.hasAudio || !transcriptionFinalized) return;

        if (isEmptyOrDictionaryHallucination(transcript)) {
          skipTurn();
          return;
        }

        responseCreateSent = true;
        session.transport.sendEvent({
          type: 'response.create',
          response: { output_modalities: ['text'] },
        });
      };

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
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
        if (this.session === session) this.session = null;
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

        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          transcript = event.transcript ?? '';
          transcriptionFinalized = true;
          if (event.transcript) onStream?.({ type: 'transcript.completed', transcript: event.transcript });
          maybeCreateResponse();
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

      silentCancel = () => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
        cleanup();
        logTurn('cancelled');
      };

      const messageContent: Array<
        { type: 'input_image'; image: string } | { type: 'input_text'; text: string }
      > = [];

      if (metadata.imageDataUrl) messageContent.push({ type: 'input_image', image: metadata.imageDataUrl });
      if (metadata.question) messageContent.push({ type: 'input_text', text: metadata.question });

      if (messageContent.length > 0) session.transport.sendMessage(
          {
            type: 'message',
            role: 'user',
            content: messageContent,
          },
          {},
          { triggerResponse: !metadata.hasAudio },
        );
      
    });

    const streamingTurn: StreamingTurn = {
      appendAudio: (pcm: Buffer) => {
        const arrayBuffer = new Uint8Array(pcm).buffer;
        session.transport.sendAudio(arrayBuffer, { commit: false });
      },
      commit: async () => {
        commitStarted = true;
        if (metadata.hasAudio) {
          session.transport.sendEvent({ type: 'input_audio_buffer.commit' });
          audioCommitSent = true;
          maybeCreateResponse();
        }

        return turnPromise;
      },
      cancel: () => {
        if (commitStarted) {
          abortTurn?.(new Error('Turn cancelled'));
          return;
        }
        silentCancel?.();
      },
    };

    this.activeTurn = streamingTurn;
    return streamingTurn;
  }

  private async getSession(): Promise<RealtimeSession> {
    if (this.session?.transport.status === 'connected') return this.session;

    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connect();
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connect(): Promise<RealtimeSession> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const session = new RealtimeSessionClass(createAgent(this.agentTools), createSessionConfig());
    const transcriptionPrompt = buildTranscriptionPrompt();

    if (transcriptionPrompt) logTurn('session dictionary loaded', {
        promptLength: transcriptionPrompt.length,
      });
    

    session.on('error', ({ error }) => {
      console.error(error);
      if (this.session === session) this.session = null;
    });

    await session.connect({ apiKey });
    this.session = session;
    return session;
  }
}
