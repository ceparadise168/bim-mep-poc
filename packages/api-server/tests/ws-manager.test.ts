import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WsManager } from '../src/ws-manager.js';

function makeMockSocket(): any {
  const sent: string[] = [];
  return {
    readyState: 1, // OPEN
    send: (data: string) => sent.push(data),
    _sent: sent,
  };
}

let ws: WsManager;

beforeEach(() => {
  ws = new WsManager();
});

describe('WsManager', () => {
  it('should subscribe socket to channel', () => {
    const socket = makeMockSocket();
    ws.subscribe(socket, 'signals:AHU-01F-001');
    expect(ws.getSubscriptionCount('signals:AHU-01F-001')).toBe(1);
  });

  it('should unsubscribe socket from channel', () => {
    const socket = makeMockSocket();
    ws.subscribe(socket, 'signals:AHU-01F-001');
    ws.unsubscribe(socket, 'signals:AHU-01F-001');
    expect(ws.getSubscriptionCount('signals:AHU-01F-001')).toBe(0);
  });

  it('should remove socket from all channels', () => {
    const socket = makeMockSocket();
    ws.subscribe(socket, 'signals:AHU-01F-001');
    ws.subscribe(socket, 'anomalies');
    ws.removeSocket(socket);
    expect(ws.getSubscriptionCount('signals:AHU-01F-001')).toBe(0);
    expect(ws.getSubscriptionCount('anomalies')).toBe(0);
  });

  it('should broadcast message to subscribers', () => {
    const socket1 = makeMockSocket();
    const socket2 = makeMockSocket();
    ws.subscribe(socket1, 'anomalies');
    ws.subscribe(socket2, 'anomalies');

    ws.broadcast('anomalies', { type: 'test' });

    expect(socket1._sent.length).toBe(1);
    expect(socket2._sent.length).toBe(1);
    const parsed = JSON.parse(socket1._sent[0]);
    expect(parsed.channel).toBe('anomalies');
    expect(parsed.data.type).toBe('test');
  });

  it('should not broadcast to unsubscribed sockets', () => {
    const socket1 = makeMockSocket();
    const socket2 = makeMockSocket();
    ws.subscribe(socket1, 'anomalies');

    ws.broadcast('anomalies', { type: 'test' });

    expect(socket1._sent.length).toBe(1);
    expect(socket2._sent.length).toBe(0);
  });

  it('should not send to closed sockets', () => {
    const socket = makeMockSocket();
    socket.readyState = 3; // CLOSED
    ws.subscribe(socket, 'anomalies');
    ws.broadcast('anomalies', { type: 'test' });
    expect(socket._sent.length).toBe(0);
  });

  it('should track total connections', () => {
    const s1 = makeMockSocket();
    const s2 = makeMockSocket();
    ws.subscribe(s1, 'ch1');
    ws.subscribe(s2, 'ch2');
    expect(ws.getTotalConnections()).toBe(2);
  });

  it('should list channels', () => {
    const socket = makeMockSocket();
    ws.subscribe(socket, 'signals:AHU-01F-001');
    ws.subscribe(socket, 'anomalies');
    const channels = ws.getChannels();
    expect(channels).toContain('signals:AHU-01F-001');
    expect(channels).toContain('anomalies');
  });

  it('should support multiple subscribers per channel', () => {
    const sockets = Array.from({ length: 5 }, makeMockSocket);
    for (const s of sockets) ws.subscribe(s, 'dashboard');

    ws.broadcast('dashboard', { update: true });

    for (const s of sockets) {
      expect(s._sent.length).toBe(1);
    }
  });

  it('should broadcast to pattern matching channels', () => {
    const s1 = makeMockSocket();
    const s2 = makeMockSocket();
    ws.subscribe(s1, 'signals:AHU-01F-001');
    ws.subscribe(s2, 'signals:AHU-02F-001');

    ws.broadcastToPattern('signals:*', { update: true });

    expect(s1._sent.length).toBe(1);
    expect(s2._sent.length).toBe(1);
  });
});
