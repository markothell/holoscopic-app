import { io, Socket } from 'socket.io-client';

// Singleton live channel. Sockets are latency sugar only — every mutation
// goes through REST, and useOasGame re-fetches the snapshot on
// focus/reconnect.
const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001';

const GAME_EVENTS = [
  'oas_player_joined',
  'oas_phase_changed',
  'oas_nomination_upserted',
  'oas_nomination_staked',
  'oas_map_opened',
  'oas_map_stage',
  'oas_map_entry',
  'oas_map_ranked',
  'oas_stake_returned',
  'oas_proposal_added',
] as const;

class OasSocket {
  private socket: Socket | null = null;
  private gameId: string | null = null;
  private userId: string | null = null;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  connect(gameId: string, userId?: string | null) {
    if (this.socket && this.gameId === gameId && this.userId === (userId ?? null)) return;
    this.disconnect();
    this.gameId = gameId;
    this.userId = userId ?? null;
    this.socket = io(SOCKET_URL, { transports: ['websocket'], upgrade: false });
    this.socket.on('connect', () => {
      this.socket?.emit('oas:join', { gameId });
      // Personal room carries holon_update (the token balance push).
      if (this.userId) this.socket?.emit('join_user_room', { userId: this.userId });
      this.dispatch('__reconnect', {});
    });
    for (const event of [...GAME_EVENTS, 'holon_update']) {
      this.socket.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
  }

  disconnect() {
    if (this.socket) {
      if (this.gameId) this.socket.emit('oas:leave', { gameId: this.gameId });
      this.socket.disconnect();
    }
    this.socket = null;
    this.gameId = null;
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  private dispatch(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach(h => h(payload));
  }
}

export const oasSocket = new OasSocket();
