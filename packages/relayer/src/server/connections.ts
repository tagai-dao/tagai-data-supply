import type { WebSocket } from 'ws';
import { logger } from '../utils/logger';

// 在线节点连接注册表：node_id -> ws
export class ConnectionRegistry {
  private conns = new Map<string, WebSocket>();

  register(node_id: string, ws: WebSocket): void {
    this.conns.set(node_id, ws);
  }

  unregister(node_id: string): void {
    this.conns.delete(node_id);
  }

  get(node_id: string): WebSocket | undefined {
    return this.conns.get(node_id);
  }

  isOnline(node_id: string): boolean {
    const ws = this.conns.get(node_id);
    return !!ws && ws.readyState === ws.OPEN;
  }

  send(node_id: string, msg: object): boolean {
    const ws = this.conns.get(node_id);
    if (!ws || ws.readyState !== ws.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  size(): number {
    return this.conns.size;
  }

  // 广播（管理/调试用）
  broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const ws of this.conns.values()) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }
}

export const registry = new ConnectionRegistry();

export function logConn(event: string, node_id?: string): void {
  logger.debug({ event, node_id, online: registry.size() }, 'ws connection');
}
