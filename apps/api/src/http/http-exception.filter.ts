import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId: unknown = response.locals.requestId;
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;

    if (statusCode >= 500) {
      // Database error messages can contain SQL/parameters; keep only stack locations.
      this.logger.error({
        requestId,
        errorType: exception instanceof Error ? exception.name : 'UnknownError',
        stack: exception instanceof Error
          ? exception.stack?.split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
          : undefined,
      });
    }

    if (response.headersSent) return;
    const detail = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = statusCode >= 500
      ? { statusCode, message: 'Internal server error' }
      : typeof detail === 'string'
        ? { statusCode, message: detail }
        : detail;
    response.status(statusCode).json({ ...(body as object), requestId });
  }
}
