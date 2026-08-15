import { ValidationError } from '@nestjs/common';
import { BUSINESS_ERROR_CODES } from './error-codes';
import { createValidationException } from './validation-exception.factory';

describe('createValidationException', () => {
  it('returns VALIDATION_ERROR with flattened field paths', () => {
    // Verifies nested validation errors are flattened into field paths.
    const exception = createValidationException([
      {
        property: 'company',
        children: [
          {
            property: 'name',
            constraints: {
              isString: 'company.name must be a string',
            },
          } as ValidationError,
        ],
      } as ValidationError,
      {
        property: 'pageSize',
        constraints: {
          max: 'pageSize must not be greater than 100',
        },
      } as ValidationError,
    ]);

    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      code: BUSINESS_ERROR_CODES.VALIDATION_ERROR,
      message: 'company.name must be a string',
      details: {
        errors: [
          {
            field: 'company.name',
            messages: ['company.name must be a string'],
          },
          {
            field: 'pageSize',
            messages: ['pageSize must not be greater than 100'],
          },
        ],
      },
    });
  });

  it('falls back to the default message when no constraints exist', () => {
    // Verifies the default validation message when no constraints are present.
    const exception = createValidationException([
      {
        property: 'root',
        children: [],
      } as ValidationError,
    ]);

    expect(exception.getResponse()).toEqual({
      code: BUSINESS_ERROR_CODES.VALIDATION_ERROR,
      message: 'Request validation failed.',
      details: {
        errors: [],
      },
    });
  });
});
