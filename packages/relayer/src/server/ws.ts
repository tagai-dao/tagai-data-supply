import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { registry } from './connections';
import {
  findNodeByToken,
  setNodeStatus,
  updateHeartbeat,
  syncNodeProfile,
  type NodeRow,
} from '../db/client';
import { getAssignmentById, setAssignmentStatus } from '../db/tasks';
import { gateTaskResult } from '../assignment/gate';
import { ingestTaskResult } from '../ingestion';
import { applyCookieEvent, reclaimNodeAssignments } from '../health/db';
import { redispatchSubtask } from '../scheduler/redispatch';
import { PROTOCOL_VERSION } from '@tds/shared';
import { isNodeMajorAllowed, nodeReleaseConfig } from '../config/nodeRelease';
import {
  HEARTBEAT_PING_INTERVAL_SEC,
  NODE_OFFLINE_TIMEOUT_SEC,
} from '../config/constants';

// spec §6: WS 鉴权与心跳依赖（可注入便于测试）
export interface WsDeps {
  findNodeByToken: (token: string) => Promise<NodeRow | null>;
  setNodeStatus: (node_id: string, status: NodeRow['status']) => Promise<void>;
  updateHeartbeat: (node_id: string, cookie_status?: string) => Promise<void>;
  syncNodeProfile: (node_id: string, patch: { tagai_username?: string | null; label?: string | null }) => Promise<void>;
}

const defaultDeps: WsDeps = { findNodeByToken, setNodeStatus, updateHeartbeat, syncNodeProfile };

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
      const nr = nodeReleaseConfig();
      if (!isNodeMajorAllowed(msg.node_version, nr.minMajor)) {
        ws.send(JSON.stringify({
          type: 'auth_ack',
          ok: false,
          error: `node version too old: require major >= ${nr.minMajor}`,
        }));
        ws.close(4008, 'node version too old');
        return;
      }
      authed = true;
      nodeId = node.node_id;
      registry.register(nodeId, ws);
      await deps.setNodeStatus(nodeId, 'online');
      await deps.updateHeartbeat(nodeId, msg.cookie_status);
      await deps.syncNodeProfile(nodeId, {
        tagai_username: msg.tagai_username,
        label: msg.label,
      }).catch(() => {});
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
        await handleTaskResult(nodeId!, msg);
        break;
      case 'task_decline':
        await handleTaskDecline(nodeId!, msg);
        break;
      case 'cookie_status':
        // P5 cookie 健康处理
        logger.debug({ node_id: nodeId, cookie_status: msg.cookie_status }, 'cookie_status');
        break;
      case 'unregister':
        logger.info({ node_id: nodeId }, 'node unregister');
        ws.close(1000, 'unregister');
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
      // spec §5/§8: 离线标记
      try {
        await deps.setNodeStatus(nodeId, 'offline');
      } catch (e) {
        logger.error(e, 'setNodeStatus offline failed');
      }
      // spec §10.2/§8.5: 回收该节点 active assignment（grace period 由调度器重派时限次保证）
      try {
        await reclaimNodeAssignments(nodeId);
      } catch (e) {
        logger.error(e, 'reclaim failed');
      }
      logger.info({ node_id: nodeId }, 'ws closed, node offline, assignments reclaimed');
    }
  });

  ws.on('error', (err) => {
    logger.warn({ err: err.message }, 'ws error');
  });
}

// spec §4: 处理节点拒绝 task_assign → 静默回收并重派（不扣 health）
async function handleTaskDecline(nodeId: string, msg: any): Promise<void> {
  const assignmentId = msg.assignment_id;
  const subtaskId = msg.subtask_id;
  const reason = msg.reason ?? 'policy';
  if (!assignmentId || !subtaskId) {
    logger.debug({ node_id: nodeId }, 'task_decline ignored: missing ids');
    return;
  }
  const asg = await getAssignmentById(String(assignmentId));
  if (!asg || asg.node_id !== nodeId || asg.status !== 'assigned') {
    return;
  }
  await setAssignmentStatus(String(assignmentId), 'declined', { decline_reason: reason });
  logger.debug({ node_id: nodeId, assignment_id: assignmentId, subtask_id: subtaskId, reason }, 'task_decline');
  await redispatchSubtask(String(subtaskId), [nodeId]).catch((e) => {
    logger.warn(e, 'redispatch after decline failed');
  });
}

// spec §4: 处理节点回传 task_result → ingestion（须带 assignment_id，仅派发节点可交）
async function handleTaskResult(nodeId: string, msg: any): Promise<void> {
  try {
    const assignmentId = msg.assignment_id;
    const subtaskId = msg.subtask_id;
    const status = msg.status === 'done' ? 'done' : 'failed';
    const tweets: any[] | undefined = msg.tweets;

    if (!assignmentId) {
      logger.warn({ node_id: nodeId, subtask_id: subtaskId }, 'task_result rejected: missing assignment_id');
      return;
    }
    if (!subtaskId) {
      logger.warn({ node_id: nodeId, assignment_id: assignmentId }, 'task_result rejected: missing subtask_id');
      return;
    }

    const asg = await getAssignmentById(String(assignmentId));
    const gate = gateTaskResult(asg, nodeId, String(subtaskId), tweets?.length ?? 0, status);
    if (!gate.ok) {
      logger.warn({
        node_id: nodeId,
        assignment_id: assignmentId,
        subtask_id: subtaskId,
        reason: gate.reason,
      }, 'task_result rejected');
      return;
    }

    if (asg!.status === 'assigned') {
      await setAssignmentStatus(assignmentId, 'running');
    }

    let batchTweets = tweets;
    if (batchTweets && gate.maxTweets !== undefined && batchTweets.length > gate.maxTweets) {
      batchTweets = batchTweets.slice(0, gate.maxTweets);
    }

    await ingestTaskResult({
      subtask_id: subtaskId,
      node_id: nodeId,
      assignment_id: assignmentId,
      status,
      tweets: batchTweets,
      error: msg.error,
      cookie_status: msg.cookie_status,
    });
    // spec §5.4: 根据 cookie_status 更新健康分
    if (msg.cookie_status && msg.cookie_status !== 'ok' && msg.cookie_status !== 'unknown') {
      await applyCookieEvent(nodeId, msg.cookie_status, `task_result ${subtaskId}`);
    } else if (msg.status === 'done') {
      await applyCookieEvent(nodeId, 'ok');
    }
  } catch (e) {
    logger.error(e, 'handleTaskResult failed');
  }
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
