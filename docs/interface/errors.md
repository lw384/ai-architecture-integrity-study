# Error Handling

> **Scope**: current `baseline/backend` implementation
> 
> **Primary sources**:
> `src/common/errors/error-codes.ts`,
> `src/common/errors/app-exception.ts`,
> `src/common/errors/validation-exception.factory.ts`,
> `src/common/filter/http-exception.filter.ts`,
> `src/common/pipes/uuid-v4.pipe.ts`

---

## 1. Purpose

This document describes the **current backend error contract** used by the CRM
baseline.

The goal is to keep three things centralized and easy to change:

- the **business error code registry**
- the **HTTP error response envelope**
- the **framework integration points** for DTO validation and UUID parsing

If you need to add, rename, or audit a business error code, start with:

- `baseline/backend/src/common/errors/error-codes.ts`

---

## 2. Error Flow

The current request error flow is:

1. Controller parameter pipes and DTO validation run first.
2. Service-layer business rules may throw `AppException`.
3. The global `HttpExceptionFilter` converts all `HttpException` instances into
   a uniform JSON response.

This means the backend has **one wire-format** for validation errors, UUID
errors, not-found errors, immutable-field errors, and referential-integrity
conflicts.

---

## 3. Response Envelope

All handled API errors currently return this shape:

```json
{
  "success": false,
  "statusCode": 404,
  "code": "ENTITY_NOT_FOUND",
  "message": "Company with ID 8e2f... not found",
  "details": {
    "resource": "Company",
    "id": "8e2f..."
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "path": "/api/companies/8e2f..."
}
```

Field semantics:

- `success`: always `false` for error responses
- `statusCode`: numeric HTTP status code
- `code`: stable business error code string
- `message`: human-readable summary
- `details`: machine-usable structured context when available
- `timestamp`: server-side response timestamp
- `path`: request URL path

The response envelope is assembled in:

- `baseline/backend/src/common/filter/http-exception.filter.ts`

---

## 4. Central Error Code Registry

The project currently defines these business error codes:

| Code                              | Default HTTP status | Meaning                                        |
| --------------------------------- | ------------------- | ---------------------------------------------- |
| `VALIDATION_ERROR`                | `400`               | DTO body/query validation failed               |
| `INVALID_UUID`                    | `400`               | A route parameter is not a valid UUID v4       |
| `ENTITY_NOT_FOUND`                | `404`               | The requested entity does not exist            |
| `PARENT_NOT_FOUND`                | `404`               | A required parent entity does not exist        |
| `IMMUTABLE_FIELD`                 | `422`               | The request tries to change an immutable field |
| `REFERENTIAL_INTEGRITY_VIOLATION` | `409`               | The operation is blocked by related records    |

The canonical registry lives in:

- `baseline/backend/src/common/errors/error-codes.ts`

This file is the **single place** to review or modify the current backend error
code set.

---

## 5. Exception Building

Business-layer exceptions are normalized through `AppException`.

Implementation:

- `baseline/backend/src/common/errors/app-exception.ts`

Usage pattern:

```typescript
throw new AppException({
  statusCode: 404,
  code: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
  message: `Company with ID ${id} not found`,
  details: {
    resource: 'Company',
    id,
  },
});
```

This keeps error payload shape consistent and avoids scattering ad hoc
`HttpException` objects across services.

---

## 6. Validation Errors

DTO validation errors are produced by the global `ValidationPipe` configured in:

- `baseline/backend/src/main.ts`

The pipe uses a custom exception factory:

- `baseline/backend/src/common/errors/validation-exception.factory.ts`

Current behavior:

- HTTP status: `400`
- business code: `VALIDATION_ERROR`
- `message`: first validation message
- `details.errors`: flattened field-level validation output

Example:

```json
{
  "success": false,
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "companyId must be a valid UUID",
  "details": {
    "errors": [
      {
        "field": "companyId",
        "messages": ["companyId must be a valid UUID"]
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "path": "/api/contacts"
}
```

---

## 7. UUID Errors

Route-level UUID validation is centralized in:

- `baseline/backend/src/common/pipes/uuid-v4.pipe.ts`

Controllers use `createUuidV4Pipe()` instead of instantiating `ParseUUIDPipe`
directly when they want the error to flow through the shared error-code system.

Current behavior:

- HTTP status: `400`
- business code: `INVALID_UUID`
- message: `The provided id must be a valid UUID v4.`

This avoids mixing framework-default UUID errors with custom business errors.

---

## 8. Current Resource-Level Usage

### 8.1 Company

Current Company service uses:

- `ENTITY_NOT_FOUND` when a company does not exist
- `REFERENTIAL_INTEGRITY_VIOLATION` when deleting a company that still has
  contacts

Relevant implementation:

- `baseline/backend/src/module/company/company.service.ts`

### 8.2 Contact

Current Contact service uses:

- `PARENT_NOT_FOUND` when creating a contact for a missing company
- `ENTITY_NOT_FOUND` when a contact does not exist
- `IMMUTABLE_FIELD` when attempting to change `companyId`

Relevant implementation:

- `baseline/backend/src/module/contact/contact.service.ts`

---

## 9. Change Guide

### 9.1 Add a new business error code

1. Add the code to `baseline/backend/src/common/errors/error-codes.ts`.
2. Add its default status and description to the same file.
3. Throw it through `AppException` from the appropriate service.
4. If it can be a filter fallback, add it to the status mapping in
   `http-exception.filter.ts`.

### 9.2 Change response format

Update:

- `baseline/backend/src/common/filter/http-exception.filter.ts`

That file is the single response-envelope assembly point.

### 9.3 Change DTO validation output

Update:

- `baseline/backend/src/common/errors/validation-exception.factory.ts`

### 9.4 Change UUID validation behavior

Update:

- `baseline/backend/src/common/pipes/uuid-v4.pipe.ts`

---

## 10. Recommended Next Step

The current system centralizes API-layer and service-layer business errors, but
it does **not yet** normalize lower-level database exceptions such as unique-key
violations. If the project starts adding uniqueness constraints or more complex
write paths, the next extension point should be database-exception mapping into
the same business error code registry.