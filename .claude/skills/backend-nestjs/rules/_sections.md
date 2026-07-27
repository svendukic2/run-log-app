# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Architecture (arch)

**Impact:** CRITICAL
**Description:** Proper module organization and focused services are the foundation of maintainable NestJS applications. Organize by feature, and keep each service to a single responsibility.

## 2. Dependency Injection (di)

**Impact:** CRITICAL
**Description:** NestJS's IoC container is powerful but can be misused. Constructor injection keeps dependencies explicit and code testable.

## 3. Error Handling (error)

**Impact:** HIGH
**Description:** Consistent error handling improves debugging, user experience, and API reliability. Centralized exception filters ensure uniform error responses.

## 4. Security (security)

**Impact:** HIGH
**Description:** Security vulnerabilities can be catastrophic. Input validation and authorization guards are non-negotiable for any endpoint that accepts input or exposes data.

## 5. Testing (test)

**Impact:** MEDIUM-HIGH
**Description:** Well-tested applications are more reliable. NestJS testing utilities enable comprehensive unit and e2e coverage.

## 6. Database & ORM (db)

**Impact:** MEDIUM-HIGH
**Description:** Proper database access patterns and transaction management keep data consistent across multi-step operations.

## 7. API Design (api)

**Impact:** MEDIUM
**Description:** DTOs, input pipes, and consistent response serialization improve API usability and keep untyped data out of the application core.
