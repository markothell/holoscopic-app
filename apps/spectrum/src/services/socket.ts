import { io, Socket } from 'socket.io-client';

// Singleton live channel. Sockets are latency sugar only — every mutation
// goes through REST, and useGame re-fetches the snapshot on focus/reconnect.
const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001';

type Handler = (payload: never) => void;

class SpectrumSocket {
  private socket: Socket | null = null;
  private gameId: string | null = null;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  connect(gameId: string) {
    if (this.socket && this.gameId === gameId) return;
    this.disconnect();
    this.gameId = gameId;
    this.socket = io(SOCKET_URL, { transports: ['websocket'], upgrade: false });
    this.socket.on('connect', () => {
      this.socket?.emit('spectrum:join', { gameId });
      this.dispatch('__reconnect', {});
    });
    for (const event of [
      'player_joined', 'player_left', 'nomination_upserted', 'nomination_voted',
      'phase_changed', 'ranking_progress', 'rematch',
    ]) {
      this.socket.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
  }

  disconnect() {
    if (this.socket) {
      if (this.gameId) this.socket.emit('spectrum:leave', { gameId: this.gameId });
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

export const spectrumSocket = new SpectrumSocket();
export type { Handler };
