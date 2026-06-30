import type { Request, Response, NextFunction, RequestHandler } from 'express';

// 包装 async 路由，把 rejection 交给 Express 错误中间件（避免崩进程）
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
