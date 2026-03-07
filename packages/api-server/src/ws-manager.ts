import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';

export interface WsSubscription {
  channel: string;
  socket: WebSocket;
}

export class WsManager extends EventEmitter {
  private subscriptions = new Map<string, Set<WebSocket>>();
  private socketChannels = new Map<WebSocket, Set<string>>();

  subscribe(socket: WebSocket, channel: string): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(socket);

    if (!this.socketChannels.has(socket)) {
      this.socketChannels.set(socket, new Set());
    }
    this.socketChannels.get(socket)!.add(channel);
  }

  unsubscribe(socket: WebSocket, channel: string): void {
    this.subscriptions.get(channel)?.delete(socket);
    this.socketChannels.get(socket)?.delete(channel);
  }

  removeSocket(socket: WebSocket): void {
    const channels = this.socketChannels.get(socket);
    if (channels) {
      for (const channel of channels) {
        this.subscriptions.get(channel)?.delete(socket);
      }
    }
    this.socketChannels.delete(socket);
  }

  broadcast(channel: string, data: unknown): void {
    const sockets = this.subscriptions.get(channel);
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify({ channel, data, timestamp: Date.now() });
    for (const socket of sockets) {
      if (socket.readyState === 1) { // WebSocket.OPEN
        socket.send(message);
      }
    }
  }

  broadcastToPattern(pattern: string, data: unknown): void {
    for (const [channel] of this.subscriptions) {
      if (this.matchPattern(channel, pattern)) {
        this.broadcast(channel, data);
      }
    }
  }

  private matchPattern(channel: string, pattern: string): boolean {
    if (pattern === channel) return true;
    if (pattern.endsWith('*')) {
      return channel.startsWith(pattern.slice(0, -1));
    }
    return false;
  }

  getSubscriptionCount(channel: string): number {
    return this.subscriptions.get(channel)?.size ?? 0;
  }

  getChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  getTotalConnections(): number {
    return this.socketChannels.size;
  }
}
