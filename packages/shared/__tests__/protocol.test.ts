import { PROTOCOL_VERSION, ALL_MESSAGE_TYPES, MessageType } from '../src';

describe('shared protocol', () => {
  it('exports a numeric protocol version', () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+$/);
  });

  it('envelope type covers all 10 WS message types', () => {
    const types: MessageType[] = ALL_MESSAGE_TYPES;
    expect(types).toHaveLength(10);
    expect(new Set(types).size).toBe(10);
  });

  it('includes hello/auth_ack/task_assign/task_result', () => {
    expect(ALL_MESSAGE_TYPES).toContain('hello');
    expect(ALL_MESSAGE_TYPES).toContain('auth_ack');
    expect(ALL_MESSAGE_TYPES).toContain('task_assign');
    expect(ALL_MESSAGE_TYPES).toContain('task_result');
  });
});
