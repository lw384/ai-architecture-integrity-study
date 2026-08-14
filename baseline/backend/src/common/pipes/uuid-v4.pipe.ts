import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { AppException } from '../errors/app-exception';
import { BUSINESS_ERROR_CODES } from '../errors/error-codes';

export function createUuidV4Pipe() {
  return new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () =>
      new AppException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: BUSINESS_ERROR_CODES.INVALID_UUID,
        message: 'The provided id must be a valid UUID v4.',
      }),
  });
}
