import { HttpStatus, ValidationError } from '@nestjs/common';
import { AppException } from './app-exception';
import { BUSINESS_ERROR_CODES } from './error-codes';

type FormattedValidationError = {
  field: string;
  messages: string[];
};

export function createValidationException(errors: ValidationError[]) {
  const formattedErrors = flattenValidationErrors(errors);
  const firstMessage =
    formattedErrors[0]?.messages[0] ?? 'Request validation failed.';

  return new AppException({
    statusCode: HttpStatus.BAD_REQUEST,
    code: BUSINESS_ERROR_CODES.VALIDATION_ERROR,
    message: firstMessage,
    details: {
      errors: formattedErrors,
    },
  });
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath?: string,
): FormattedValidationError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const messages = error.constraints ? Object.values(error.constraints) : [];
    const currentError = messages.length > 0 ? [{ field, messages }] : [];
    const childErrors = error.children
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...currentError, ...childErrors];
  });
}
