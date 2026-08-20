import { io, Socket } from 'socket.io-client';

// Singleton live channel for a joined community, mirroring apps/spectrum's
// oasSocket. Sockets are latency sugar only — every mutation goes through
// REST (routes/synthesis.js); this just gets the live push once it lands.
// sockets/synthesis.js is presence-only: `syn:join`/`syn:leave` subscribe
// this client to `syn:<instanceId>`, which broadcasts:
//   node_created { node }          — a node was written; it IS a post
//   node_deleted { nodeId }        — a node was removed from its author's map
//   reply_upserted { postId, reply } — a public reply landed/changed on a post
//   statement_upserted { statement, state } — a statement was put up, backed, or withdrawn
//   synthesis_changed { state } — the group crossed the bar, either way
const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001';

const COMMUNITY_EVENTS = [
  'node_created',
  'node_deleted',
  'reply_upserted',
  // The synthesis mechanism: a statement landed or changed, and (separately)
  // the group's measure crossed the bar in one direction or the other.
  'statement_upserted',
  'synthesis_changed',
] as const;
export type CommunityEvent = (typeof COMMUNITY_EVENTS)[number];

class SynthesisSocket {
  private socket: Socket | null = null;
  private instanceId: string | null = null;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  // Connects (or, if already connected to this same community, no-ops) and
  // joins its broadcast room. One connection per community — page.tsx owns
  // the connect/disconnect lifecycle; overlays only ever call .on().
  connect(instanceId: string) {
    if (this.socket && this.instanceId === instanceId) return;
    this.disconnect();
    this.instanceId = instanceId;
    this.socket = io(SOCKET_URL, { transports: ['websocket'], upgrade: false });
    this.socket.on('connect', () => {
      this.socket?.emit('syn:join', { instanceId });
    });
    for (const event of COMMUNITY_EVENTS) {
      this.socket.on(event, (payload: unknown) => this.dispatch(event, payload));
    }
  }

  disconnect() {
    if (this.socket) {
      if (this.instanceId) this.socket.emit('syn:leave', { instanceId: this.instanceId });
      this.socket.disconnect();
    }
    this.socket = null;
    this.instanceId = null;
  }

  on(event: CommunityEvent, handler: (payload: unknown) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  private dispatch(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach(h => h(payload));
  }
}

export const synthesisSocket = new SynthesisSocket();
