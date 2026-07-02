import { WebSocket, WebSocketServer } from 'ws';
import { handleConnection, WsDeps } from '../../src/server/ws';
import { registry } from '../../src/server/connections';

beforeAll(() => {
  Object.assign(process.env, {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 't', TDS_PROTOCOL_VERSION: '1',
  });
});

// 用真实 WS server + 客户端测试 handleConnection（注入 mock deps）
function startTestServer(deps: WsDeps): Promise<{ wss: WebSocketServer; port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, () => {
      const port = (wss.address() as any).port;
      wss.on('connection', (ws, req) => {
        const ip = (req.socket.remoteAddress || 'x').replace(/^::ffff:/, '');
        handleConnection(ws, ip, deps);
      });
      resolve({
        wss,
        port,
        close: () => new Promise((r) => wss.close(() => r())),
      });
    });
  });
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function recv(ws: WebSocket, timeoutMs = 1000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('recv timeout')), timeoutMs);
    ws.once('message', (raw) => {
      clearTimeout(t);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

function makeDeps(overrides: Partial<WsDeps> = {}): WsDeps {
  return {
    findNodeByToken: jest.fn(),
    setNodeStatus: jest.fn(),
    updateHeartbeat: jest.fn(),
    syncNodeProfile: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WS handshake & heartbeat (spec §6)', () => {
  it('closes if hello not sent within timeout', async () => {
    const deps = makeDeps();
    const { port, close } = await startTestServer(deps);
    const ws = await connect(port);
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4001); // hello timeout
    await close();
  }, 15000);

  it('auths on valid hello and sends auth_ack', async () => {
    const findNodeByToken = jest.fn().mockResolvedValue({
      node_id: 'node_1', token_hash: 'h', status: 'offline', timezone: 'UTC',
    });
    const setNodeStatus = jest.fn().mockResolvedValue(undefined);
    const updateHeartbeat = jest.fn().mockResolvedValue(undefined);
    const syncNodeProfile = jest.fn().mockResolvedValue(undefined);
    const { port, close } = await startTestServer({
      findNodeByToken, setNodeStatus, updateHeartbeat, syncNodeProfile,
    });

    const ws = await connect(port);
    ws.send(JSON.stringify({
      type: 'hello', node_token: 'tok_1', protocol_version: '1',
      timezone: 'UTC', cookie_status: 'ok',
    }));
    const ack = await recv(ws);
    expect(ack.type).toBe('auth_ack');
    expect(ack.ok).toBe(true);
    expect(ack.node_id).toBe('node_1');
    expect(findNodeByToken).toHaveBeenCalledWith('tok_1');
    expect(setNodeStatus).toHaveBeenCalledWith('node_1', 'online');
    expect(registry.isOnline('node_1')).toBe(true);

    ws.close();
    await close();
  });

  it('syncs node profile from hello', async () => {
    const findNodeByToken = jest.fn().mockResolvedValue({
      node_id: 'node_1', token_hash: 'h', status: 'offline', timezone: 'UTC',
    });
    const syncNodeProfile = jest.fn().mockResolvedValue(undefined);
    const { port, close } = await startTestServer(makeDeps({ findNodeByToken, syncNodeProfile }));

    const ws = await connect(port);
    ws.send(JSON.stringify({
      type: 'hello', node_token: 'tok_1', protocol_version: '1',
      timezone: 'UTC', cookie_status: 'ok', tagai_username: 'alice', label: 'lab1',
    }));
    await recv(ws);
    expect(syncNodeProfile).toHaveBeenCalledWith('node_1', {
      tagai_username: 'alice',
      label: 'lab1',
    });
    ws.close();
    await close();
  });

  it('closes on invalid node_token', async () => {
    const deps = makeDeps({ findNodeByToken: jest.fn().mockResolvedValue(null) });
    const { port, close } = await startTestServer(deps);
    const ws = await connect(port);
    ws.send(JSON.stringify({
      type: 'hello', node_token: 'bad', protocol_version: '1',
      timezone: 'UTC', cookie_status: 'ok',
    }));
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4005);
    await close();
  });

  it('closes on protocol version mismatch', async () => {
    const deps = makeDeps({
      findNodeByToken: jest.fn().mockResolvedValue({ node_id: 'n', status: 'offline' }),
    });
    const { port, close } = await startTestServer(deps);
    const ws = await connect(port);
    ws.send(JSON.stringify({
      type: 'hello', node_token: 'tok', protocol_version: '99',
      timezone: 'UTC', cookie_status: 'ok',
    }));
    const ack = await recv(ws);
    expect(ack.ok).toBe(false);
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4007);
    await close();
  });

  it('marks node offline on disconnect', async () => {
    const setNodeStatus = jest.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      findNodeByToken: jest.fn().mockResolvedValue({ node_id: 'node_x', status: 'offline' }),
      setNodeStatus,
    });
    const { port, close } = await startTestServer(deps);
    const ws = await connect(port);
    ws.send(JSON.stringify({
      type: 'hello', node_token: 'tok', protocol_version: '1',
      timezone: 'UTC', cookie_status: 'ok',
    }));
    await recv(ws); // auth_ack
    ws.close();
    // 等待 close 事件处理
    await new Promise((r) => setTimeout(r, 200));
    expect(setNodeStatus).toHaveBeenCalledWith('node_x', 'offline');
    expect(registry.isOnline('node_x')).toBe(false);
    await close();
  });
});
