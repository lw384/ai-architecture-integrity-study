import { HttpStatus } from '@nestjs/common';

export const BUSINESS_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_UUID: 'INVALID_UUID',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  PARENT_NOT_FOUND: 'PARENT_NOT_FOUND',
  IMMUTABLE_FIELD: 'IMMUTABLE_FIELD',
  REFERENTIAL_INTEGRITY_VIOLATION: 'REFERENTIAL_INTEGRITY_VIOLATION',
} as const;

export type BusinessErrorCode =
  (typeof BUSINESS_ERROR_CODES)[keyof typeof BUSINESS_ERROR_CODES];

export const BUSINESS_ERROR_CATALOG: Record<
  BusinessErrorCode,
  {
    defaultStatusCode: number;
    description: string;
  }
> = {
  VALIDATION_ERROR: {
    defaultStatusCode: HttpStatus.BAD_REQUEST,
    description: 'Request payload or query validation failed.',
  },
  INVALID_UUID: {
    defaultStatusCode: HttpStatus.BAD_REQUEST,
    description: 'A route parameter is not a valid UUID v4.',
  },
  ENTITY_NOT_FOUND: {
    defaultStatusCode: HttpStatus.NOT_FOUND,
    description: 'The requested entity does not exist.',
  },
  PARENT_NOT_FOUND: {
    defaultStatusCode: HttpStatus.NOT_FOUND,
    description: 'The required parent entity does not exist.',
  },
  IMMUTABLE_FIELD: {
    defaultStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The request attempts to modify an immutable field.',
  },
  REFERENTIAL_INTEGRITY_VIOLATION: {
    defaultStatusCode: HttpStatus.CONFLICT,
    description: 'The operation is blocked by related records.',
  },
};
