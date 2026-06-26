jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({ end: jest.fn(), execute: jest.fn() })),
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
});
