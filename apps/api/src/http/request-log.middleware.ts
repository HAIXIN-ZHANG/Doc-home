import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

const logger = new Logger('HTTP');

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  // Generate our own ID rather than accepting untrusted client log identifiers.
  const requestId = randomUUID();
  const startedAt = performance.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.once('finish', () => {
    // Route templates avoid logging user filenames, query strings or arbitrary paths.
    const route = req.route as { path?: unknown } | undefined;
    const entry = {
      requestId,
      method: req.method,
      route: typeof route?.path === 'string' ? route.path : 'unmatched',
      statusCode: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    };
    if (res.statusCode >= 500) logger.error(entry);
    else if (res.statusCode >= 400) logger.warn(entry);
    else logger.log(entry);
  });
  next();
}
