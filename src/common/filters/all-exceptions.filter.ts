import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const path = httpAdapter.getRequestUrl(request) as string;
    const method = httpAdapter.getRequestMethod(request) as string;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let errorDetails: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resObj = exception.getResponse();

      if (typeof resObj === 'string') {
        message = resObj;
        error = exception.name;
      } else if (typeof resObj === 'object' && resObj !== null) {
        const parsed = resObj as {
          message?: string | string[];
          error?: string;
        };
        message = parsed.message ?? message;
        error = parsed.error ?? exception.name;
      }
    } else {
      this.logger.error(
        `Unhandled Exception at ${method} ${path}`,
        exception instanceof Error ? exception.stack : exception,
      );

      if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
        message = exception.message;
        errorDetails = exception.stack;
      }
      error = STATUS_CODES[status] || 'Error';
    }

    const responseBody = {
      success: false,
      status,
      error,
      timestamp: new Date().toISOString(),
      path,
      method,
      message,
      errorDetails,
    };

    httpAdapter.reply(response, responseBody, status);
  }
}
