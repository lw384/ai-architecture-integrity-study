import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppExceptionPayload } from '../errors/app-exception';
import { BUSINESS_ERROR_CODES } from '../errors/error-codes';

type ExceptionResponsePayload = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

const isExceptionResponsePayload = (
  value: unknown,
): value is ExceptionResponsePayload => {
  return typeof value === 'object' && value !== null;
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Get the HTTP status code from the exception (e.g., 400, 404, 500)
    const status = exception.getStatus();

    // Get the detailed response content from the exception
    const exceptionResponse: unknown = exception.getResponse();
    const payload = isExceptionResponsePayload(exceptionResponse)
      ? exceptionResponse
      : undefined;

    // Extract error message
    const message = payload?.message ? payload.message : exception.message;
    const normalizedMessage = Array.isArray(message) ? message[0] : message;
    const code = payload?.code ?? defaultErrorCode(status);
    const details = payload?.details;

    response.status(status).json({
      success: false,
      statusCode: status,
      code,
      message: normalizedMessage,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

function defaultErrorCode(status: number): AppExceptionPayload['code'] {
  const errorCodeByStatus: Partial<
    Record<number, AppExceptionPayload['code']>
  > = {
    [HttpStatus.BAD_REQUEST]: BUSINESS_ERROR_CODES.VALIDATION_ERROR,
    [HttpStatus.NOT_FOUND]: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
    [HttpStatus.UNPROCESSABLE_ENTITY]: BUSINESS_ERROR_CODES.IMMUTABLE_FIELD,
    [HttpStatus.CONFLICT]: BUSINESS_ERROR_CODES.REFERENTIAL_INTEGRITY_VIOLATION,
  };

  return errorCodeByStatus[status] ?? BUSINESS_ERROR_CODES.VALIDATION_ERROR;
}
