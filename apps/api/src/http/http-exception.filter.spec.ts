import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { httpResponse } from '../../test/photo-fixtures.js';

function host(response: Response): ArgumentsHost {
  // Only the HTTP response is used by this filter; other host transports are irrelevant.
  return { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost;
}
let filter: HttpExceptionFilter;
beforeEach(() => { filter = new HttpExceptionFilter(); });

describe('HttpExceptionFilter', () => {
  it.each([new BadRequestException('Bad input'), new NotFoundException('Photo not found')])
  ('preserves an expected HTTP error and adds requestId: %p', (error) => {
    const { response, asExpress } = httpResponse();
    response.locals.requestId = 'request-1';
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(error, host(asExpress));
    expect(response.status).toHaveBeenCalledWith(error.getStatus());
    expect(response.json).toHaveBeenCalledWith({ ...(error.getResponse() as object), requestId: 'request-1' });
    expect(log).not.toHaveBeenCalled();
  });
  it('handles string HTTP exception responses', () => {
    const { response, asExpress } = httpResponse();
    filter.catch(new HttpException('Bad input', 400), host(asExpress));
    expect(response.json).toHaveBeenCalledWith({ statusCode: 400, message: 'Bad input', requestId: undefined });
  });
  it('sanitizes internal errors and logs only type/stack locations with request ID', () => {
    const { response, asExpress } = httpResponse();
    response.locals.requestId = 'request-2';
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const error = new Error('PRIVATE_SQL_PARAMETERS');
    filter.catch(error, host(asExpress));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error', requestId: 'request-2' });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-2', errorType: 'Error' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SQL_PARAMETERS');
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('PRIVATE_SQL_PARAMETERS');
  });
  it('also sanitizes explicit HTTP 5xx responses', () => {
    const { response, asExpress } = httpResponse();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new HttpException('PRIVATE_DATABASE_DETAILS', 503), host(asExpress));
    expect(response.json).toHaveBeenCalledWith({ statusCode: 503, message: 'Internal server error', requestId: undefined });
  });
  it('handles a thrown non-Error value', () => {
    const { response, asExpress } = httpResponse();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch('PRIVATE_VALUE', host(asExpress));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ errorType: 'UnknownError' }));
  });
  it('does not send a second response after headers have been sent', () => {
    const { response, asExpress } = httpResponse();
    response.headersSent = true;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('failed'), host(asExpress));
    expect(response.json).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});
