import { TurnSessionManager } from './session-manager.ts';

export type {
  StreamingTurn,
  TurnMetadata,
  TurnResult,
  TurnStreamEvent,
} from './types.ts';
export { TurnSessionManager } from './session-manager.ts';

export function createAgentService() {
  const sessionManager = new TurnSessionManager();
  return { sessionManager };
}
