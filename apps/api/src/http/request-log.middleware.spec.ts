import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { requestLog } from './request-log.middleware.js';
import { httpResponse } from '../../test/photo-fixtures.js';

function request(): Request {
  return { method: 'GET', route: { path: '/projects/:projectId/photos' }, originalUrl: '/projects/secret/photos?token=PRIVATE_VALUE', headers: { 'x-request-id': 'client-value' } } as unknown as Request;
}
describe('requestLog', () => {
  it('generates its own ID, shares it with the response and calls next', () => {
    const { response, asExpress } = httpResponse();
    const next = jest.fn();
    requestLog(request(), asExpress, next);
    expect(response.locals.requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(response.locals.requestId).not.toBe('client-value');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', String(response.locals.requestId));
    expect(next).toHaveBeenCalledTimes(1);
  });
  it.each([[200, 'log'], [404, 'warn'], [500, 'error']] as const)
  ('logs completed %i responses at %s level without request secrets', (status, level) => {
    const { response, asExpress } = httpResponse();
    response.statusCode = status;
    const log = jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    requestLog(request(), asExpress, jest.fn());
    const finish = response.once.mock.calls[0]?.[1];
    expect(finish).toBeDefined();
    finish?.();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      requestId: response.locals.requestId, route: '/projects/:projectId/photos',
      method: 'GET', statusCode: status, durationMs: expect.any(Number),
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_VALUE');
  });
  it('marks requests without a route as unmatched', () => {
    const { response, asExpress } = httpResponse();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    requestLog({ method: 'GET' } as Request, asExpress, jest.fn());
    response.once.mock.calls[0][1]();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ route: 'unmatched' }));
  });
});
