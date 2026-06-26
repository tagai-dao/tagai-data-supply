import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { registry } from './connections';
import {
  findNodeByToken,
  setNodeStatus,
  updateHeartbeat,
  type NodeRow,
} from '../db/client';
import { PROTOCOL_VERSION } from '@tds/shared';
import {
  HEARTBEAT_PING_INTERVAL_SEC,
  NODE_OFFLINE_TIMEOUT_SEC,
} from '../config/constants';

// spec §6: WS 鉴权与心跳依赖（可注入便于测试）
export interface WsDeps {
  findNodeByToken: (token: string) => Promise<NodeRow | null>;
  setNodeStatus: (node_id: string, status: NodeRow['status']) => Promise<void>;
  updateHeartbeat: (node_id: string, cookie_status?: string) => Promise<void>;
}

const defaultDeps: WsDeps = { findNodeByToken, setNodeStatus, updateHeartbeat };

export interface WsHandlers {
  onAuthed?: (node_id: string, ws: WebSocket) => void;
}

const HELLO_TIMEOUT_MS = 10_000;

// spec §6 / §8.5: 处理单条 WS 连接的生命周期
export function handleConnection(ws: WebSocket, ip: string, deps: WsDeps = defaultDeps, handlers: WsHandlers = {}): void {
  let authed = false;
  let nodeId: string | null = null;
  let lastActivity = Date.now();

  const helloTimer = setTimeout(() => {
    if (!authed) {
      logger.warn({ ip }, 'ws hello timeout, closing');
      ws.close(4001, 'hello timeout');
    }
  }, HELLO_TIMEOUT_MS);

  const activityTimer = setInterval(() => {
    if (!authed) return;
    const idleSec = (Date.now() - lastActivity) / 1000;
    if (idleSec > NODE_OFFLINE_TIMEOUT_SEC) {
      logger.warn({ node_id: nodeId, idleSec }, 'ws offline timeout, closing');
      ws.close(4002, 'offline timeout');
    }
  }, HEARTBEAT_PING_INTERVAL_SEC * 1000);

  const pingTimer = setInterval(() => {
    if (authed && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, HEARTBEAT_PING_INTERVAL_SEC * 1000);

  ws.on('message', async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.close(4003, 'invalid json');
      return;
    }
    lastActivity = Date.now();

    // spec §6: 首条必须是 hello
    if (!authed) {
      if (msg.type !== 'hello') {
        ws.close(4004, 'expected hello first');
        return;
      }
      const node = await deps.findNodeByToken(msg.node_token);
      if (!node) {
        ws.close(4005, 'invalid node_token');
        return;
      }
      if (node.status === 'disabled') {
        ws.close(4006, 'node disabled');
        return;
      }
      // spec §6: 协议版本协商
      if (msg.protocol_version !== config.protocolVersion) {
        ws.send(JSON.stringify({
          type: 'auth_ack',
          ok: false,
          error: `protocol mismatch: server=${config.protocolVersion}`,
        }));
        ws.close(4007, 'protocol mismatch');
        return;
      }
      authed = true;
      nodeId = node.node_id;
      registry.register(nodeId, ws);
      await deps.setNodeStatus(nodeId, 'online');
      await deps.updateHeartbeat(nodeId, msg.cookie_status);
      clearTimeout(helloTimer);
      ws.send(JSON.stringify({
        type: 'auth_ack',
        ok: true,
        node_id: nodeId,
        protocol_version: PROTOCOL_VERSION,
      }));
      logger.info({ node_id: nodeId, ip }, 'ws authed');
      handlers.onAuthed?.(nodeId, ws);
      return;
    }

    // 已鉴权后的消息
    switch (msg.type) {
      case 'heartbeat':
        await deps.updateHeartbeat(nodeId!, msg.cookie_status);
        break;
      case 'pong':
        // lastActivity 已更新
        break;
      case 'task_result':
      case 'cookie_status':
      case 'unregister':
        // P3/P4/P5 处理；此处仅记录活动
        logger.debug({ node_id: nodeId, type: msg.type }, 'ws message (handler pending)');
        break;
      default:
        logger.warn({ node_id: nodeId, type: msg.type }, 'ws unknown message type');
    }
  });

  ws.on('close', async () => {
    clearTimeout(helloTimer);
    clearInterval(activityTimer);
    clearInterval(pingTimer);
    if (nodeId) {
      registry.unregister(nodeId);
      // spec §5/§8: 离线标记（回收 grace period 在 P5）
      try {
        await deps.setNodeStatus(nodeId, 'offline');
      } catch (e) {
        logger.error(e, 'setNodeStatus offline failed');
      }
      logger.info({ node_id: nodeId }, 'ws closed, node offline');
    }
  });

  ws.on('error', (err) => {
    logger.warn({ err: err.message }, 'ws error');
  });
}

export function createWsServer(server?: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, port: server ? undefined : config.wsPort });
  wss.on('connection', (ws, req) => {
    const ip = (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    handleConnection(ws, ip);
  });
  logger.info({ port: config.wsPort }, 'ws server listening');
  return wss;
}
