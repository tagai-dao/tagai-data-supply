import { Hello } from '../generated/hello';
import { AuthAck } from '../generated/auth_ack';
import { RegisterRequest } from '../generated/register_request';
import { TaskAssign } from '../generated/task_assign';
import { TaskResult } from '../generated/task_result';

// spec §6: 协议版本
export const PROTOCOL_VERSION = '1';

export type { Hello, AuthAck, RegisterRequest, TaskAssign, TaskResult };

// spec §6: 所有 WS 消息类型
export type MessageType =
  | 'hello'
  | 'auth_ack'
  | 'heartbeat'
  | 'ping'
  | 'pong'
  | 'task_assign'
  | 'task_cancel'
  | 'task_result'
  | 'cookie_status'
  | 'unregister';

export interface Envelope {
  type: MessageType;
}

export const ALL_MESSAGE_TYPES: MessageType[] = [
  'hello', 'auth_ack', 'heartbeat', 'ping', 'pong',
  'task_assign', 'task_cancel', 'task_result', 'cookie_status', 'unregister',
];
