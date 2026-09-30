import type { NextFunction, Request, Response } from 'express';

export interface RateLimitRequestHandler {
  apply(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createRateLimitMiddleware(service: RateLimitRequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void service.apply(req, res, next);
  };
}
