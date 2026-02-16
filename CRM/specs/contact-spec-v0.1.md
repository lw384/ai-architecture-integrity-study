Contact Module Architecture Spec v0.1

Stack: Node.js + Express + TypeScript
Architecture Style: Strict Layered Architecture
Database: In-memory (Phase 1)
Auth: Simplified role-based (stub)


Module Scope

The Contact module is responsible for:
	•	Managing contact records
	•	Performing CRUD operations
	•	Enforcing validation rules
	•	Maintaining strict architectural separation

It must NOT:
	•	Directly access other domain modules
	•	Perform authentication logic inside controllers
	•	Contain business logic inside routes


Directory Structure (MANDATORY)

contact/
├── contact.entity.ts
├── contact.types.ts
├── contact.repository.ts
├── contact.service.ts
├── contact.controller.ts
├── contact.routes.ts
└── contact.validators.ts

Violation examples:
	•	Combining service + controller in one file ❌
	•	Direct DB access inside controller ❌
	•	Business logic inside routes ❌

⸻

Architectural Rules (STRICT)

Rule A — Layered Dependency Flow

Allowed:

Routes → Controller → Service → Repository

Forbidden:

Controller → Repository ❌
Service → Controller ❌
Routes → Service ❌


⸻

Rule B — Controller Responsibilities

Controller MUST:
	•	Parse request
	•	Call service
	•	Return response
	•	Handle HTTP status codes

Controller MUST NOT:
	•	Contain business logic
	•	Contain validation logic
	•	Access repository directly

⸻

Rule C — Service Responsibilities

Service MUST:
	•	Contain business logic
	•	Enforce domain constraints
	•	Handle cross-field rules

Service MUST NOT:
	•	Access Express req/res
	•	Return HTTP responses
	•	Perform validation schema parsing

⸻

Rule D — Repository Responsibilities

Repository MUST:
	•	Perform data persistence logic
	•	Abstract data layer
	•	Return pure domain objects

Repository MUST NOT:
	•	Contain business logic
	•	Return HTTP responses

⸻

Entity Definition

Contact Entity

Contact {
  id: string (UUID)
  firstName: string (required)
  lastName: string (required)
  email: string (required, unique)
  phone?: string
  companyId?: string
  status: "LEAD" | "CUSTOMER"
  createdAt: Date
  updatedAt: Date
}

Constraints:
	•	Email must be unique
	•	firstName + lastName required
	•	status default = “LEAD”

⸻

API Contract (STRICT)

POST /contacts

Create contact

Request:

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "123456789",
  "companyId": "optional-id"
}

Response 201:

{
  "id": "uuid",
  "firstName": "...",
  "lastName": "...",
  "email": "...",
  "status": "LEAD"
}

Errors:
	•	400 validation error
	•	409 duplicate email

⸻

GET /contacts

Query parameters:
	•	status?
	•	companyId?

Returns list.

⸻

GET /contacts/:id

Returns single contact.

⸻

PUT /contacts/:id

Updates:
	•	firstName
	•	lastName
	•	phone
	•	status

Cannot update:
	•	id
	•	createdAt

⸻

DELETE /contacts/:id

Soft delete:
	•	Add field deletedAt: Date | null
	•	Do NOT hard delete

⸻

Validation Rules

Validation layer must be separated.

Required:
	•	Email format validation
	•	Required field validation
	•	Enum validation
	•	No unknown properties

⸻

Permission Model (Stub)

Role types:

ADMIN
SALES

Rules:
	•	ADMIN: full CRUD
	•	SALES: cannot DELETE
	•	SALES: cannot update status to CUSTOMER

Permission must be enforced at Service layer.

⸻

Error Handling Rules

Must use centralized error class:

AppError extends Error {
  statusCode: number
  message: string
}

Controller must not throw raw errors.

⸻

Testing Requirements

Service layer must be testable without Express.

No business logic inside routes ensures testability.



