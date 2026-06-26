"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_MESSAGE_TYPES = exports.PROTOCOL_VERSION = void 0;
// spec §6: 协议版本
exports.PROTOCOL_VERSION = '1';
exports.ALL_MESSAGE_TYPES = [
    'hello', 'auth_ack', 'heartbeat', 'ping', 'pong',
    'task_assign', 'task_cancel', 'task_result', 'cookie_status', 'unregister',
];
