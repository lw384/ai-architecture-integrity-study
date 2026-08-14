import { HttpException } from '@nestjs/common';
import { BusinessErrorCode } from './error-codes';

export type AppExceptionOptions = {
  statusCode: number;
  code: BusinessErrorCode;
  message: string;
  details?: unknown;
};

export type AppExceptionPayload = {
  code: BusinessErrorCode;
  message: string;
  details?: unknown;
};

export class AppException extends HttpException {
  constructor(options: AppExceptionOptions) {
    const { statusCode, code, message, details } = options;

    super(
      {
        code,
        message,
        details,
      },
      statusCode,
    );
  }
}
