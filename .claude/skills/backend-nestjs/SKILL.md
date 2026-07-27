---
name: backend-nestjs
description: This skill should be used when the user asks to "scaffold a NestJS module", "review NestJS architecture", "refactor a NestJS service", "implement a guard", "add dependency injection", "write a DTO", "validate request input", or asks about NestJS patterns, security, or testing best practices. Passive reference library - 12 rules across 7 categories for CRUD-focused NestJS applications.
license: MIT
metadata:
  author: Kadajett
  version: "2.0.0"
---

> **Tools used:** `Read` - loads rule files from `rules/` on demand.

# NestJS Best Practices (CRUD core)

A focused best-practices guide for building CRUD APIs with NestJS. Contains 12 rules
across 7 categories, prioritized by impact to guide code generation and review. This is
a trimmed, teaching-oriented subset of a larger library (see `README.md`).

## When to Apply

Reference these guidelines when:

- Writing new NestJS modules, controllers, or services
- Validating request input and shaping responses (DTOs)
- Adding authorization guards
- Handling errors consistently across the API
- Writing unit and e2e tests

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Dependency Injection | CRITICAL | `di-` |
| 3 | Error Handling | HIGH | `error-` |
| 4 | Security | HIGH | `security-` |
| 5 | Testing | MEDIUM-HIGH | `test-` |
| 6 | Database & ORM | MEDIUM-HIGH | `db-` |
| 7 | API Design | MEDIUM | `api-` |

## Quick Reference

### 1. Architecture (CRITICAL)

- `arch-feature-modules` - Organize by feature, not technical layer
- `arch-single-responsibility` - Focused services over "god services"

### 2. Dependency Injection (CRITICAL)

- `di-prefer-constructor-injection` - Constructor over property injection

### 3. Error Handling (HIGH)

- `error-use-exception-filters` - Centralized exception handling
- `error-throw-http-exceptions` - Use NestJS HTTP exceptions

### 4. Security (HIGH)

- `security-validate-all-input` - Validate with class-validator
- `security-use-guards` - Authentication and authorization guards

### 5. Testing (MEDIUM-HIGH)

- `test-use-testing-module` - Use NestJS testing utilities
- `test-e2e-supertest` - E2E testing with Supertest

### 6. Database & ORM (MEDIUM-HIGH)

- `db-use-transactions` - Transaction management

### 7. API Design (MEDIUM)

- `api-use-dto-serialization` - DTO and response serialization
- `api-use-pipes` - Input transformation and validation with pipes

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/arch-feature-modules.md
rules/security-validate-all-input.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references
