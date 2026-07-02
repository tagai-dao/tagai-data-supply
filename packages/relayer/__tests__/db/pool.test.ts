jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({
    end: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn(),
    query: jest.fn(),
    getConnection: jest.fn(),
  })),
}));

describe('db pool', () => {
  beforeEach(() => {
    jest.resetModules();
    Object.assign(process.env, {
      TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
      TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 't',
    });
  });

  it('creates pool with supportBigNumbers for snowflake safety (spec §5.3)', () => {
    require('../../src/db/pool');
    const mysql = require('mysql2/promise');
    const opts = (mysql.createPool as jest.Mock).mock.calls[0][0];
    expect(opts.supportBigNumbers).toBe(true);
    expect(opts.bigNumberStrings).toBe(true);
  });

  it('uses independent db user (spec §5.6)', () => {
    require('../../src/db/pool');
    const mysql = require('mysql2/promise');
    const opts = (mysql.createPool as jest.Mock).mock.calls[0][0];
    expect(opts.user).toBe('u');
    expect(opts.host).toBe('h');
  });

  it('enables tcp keepalive for remote mysql idle disconnects', () => {
    require('../../src/db/pool');
    const mysql = require('mysql2/promise');
    const opts = (mysql.createPool as jest.Mock).mock.calls[0][0];
    expect(opts.enableKeepAlive).toBe(true);
    expect(opts.keepAliveInitialDelay).toBe(10_000);
  });

  it('retries execute on PROTOCOL_CONNECTION_LOST and recreates pool', async () => {
    const mysql = require('mysql2/promise');
    const firstPool = {
      end: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST', fatal: true }))
        .mockResolvedValueOnce([{ ok: 1 }, []]),
      query: jest.fn(),
      getConnection: jest.fn(),
    };
    const secondPool = {
      end: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValueOnce([{ ok: 1 }, []]),
      query: jest.fn(),
      getConnection: jest.fn(),
    };
    (mysql.createPool as jest.Mock)
      .mockReturnValueOnce(firstPool)
      .mockReturnValueOnce(secondPool);

    const { pool } = require('../../src/db/pool');
    const [rows] = await pool.execute('SELECT 1');
    expect(rows).toEqual({ ok: 1 });
    expect(firstPool.execute).toHaveBeenCalledTimes(1);
    expect(secondPool.execute).toHaveBeenCalledTimes(1);
    expect(firstPool.end).toHaveBeenCalled();
    expect(mysql.createPool).toHaveBeenCalledTimes(2);
  });
});
