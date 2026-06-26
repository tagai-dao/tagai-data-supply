import { Request, Response, NextFunction } from 'express';

// 动态 require 以控制 env 在 config 加载前的值
function loadMiddleware(token: string) {
  process.env = {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: token,
  };
  jest.resetModules();
  return require('../../../src/server/middleware/adminAuth').adminAuth as typeof import('../../../src/server/middleware/adminAuth').adminAuth;
}

describe('adminAuth middleware (spec §12)', () => {
  function mkReq(auth?: string): Request {
    return { header: () => auth } as any as Request;
  }

  it('rejects missing token with 401', () => {
    const adminAuth = loadMiddleware('secret-admin');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any as Response;
    adminAuth(mkReq(), res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects wrong token with 401', () => {
    const adminAuth = loadMiddleware('secret-admin');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any as Response;
    adminAuth(mkReq('Bearer wrong'), res, jest.fn() as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts correct bearer token', () => {
    const adminAuth = loadMiddleware('secret-admin');
    const next = jest.fn() as unknown as NextFunction;
    const res = { status: jest.fn(), json: jest.fn() } as any as Response;
    adminAuth(mkReq('Bearer secret-admin'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
