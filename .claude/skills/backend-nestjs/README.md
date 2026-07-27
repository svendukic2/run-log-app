# NestJS Best Practices

A structured reference library of NestJS best practices, optimized for agents and LLMs.
Each rule lives in its own file under `rules/`.

> **Vendored skill.** This skill is adapted from the open-source
> [`Kadajett/agent-nestjs-skills`](https://github.com/Kadajett/agent-nestjs-skills)
> project and trimmed to a CRUD-focused core for this teaching repo. It is used here as
> an example of a *reference-library* skill: a passive knowledge base the agent consults
> while writing or reviewing backend code, rather than a procedure it runs. See
> `SKILL.md` for how it is triggered.

## Structure

- `rules/` - Individual rule files (one per rule)
  - `_sections.md` - Section metadata (titles, impacts, descriptions)
  - `_template.md` - Template for creating new rules
  - `{area}-{description}.md` - Individual rule files
- `metadata.json` - Document metadata (version, abstract)
- `SKILL.md` - How Claude triggers and uses this reference library

## Creating a New Rule

1. Copy `rules/_template.md` to `rules/{area}-{description}.md`
2. Choose the appropriate area prefix:
   - `arch-` for Architecture (Section 1)
   - `di-` for Dependency Injection (Section 2)
   - `error-` for Error Handling (Section 3)
   - `security-` for Security (Section 4)
   - `test-` for Testing (Section 5)
   - `db-` for Database & ORM (Section 6)
   - `api-` for API Design (Section 7)
3. Fill in the frontmatter and content
4. Ensure you have clear incorrect/correct examples with explanations
5. Add the rule to the Quick Reference in `SKILL.md`

## Rule File Structure

Each rule file should follow this structure:

```markdown
---
title: Rule Title Here
impact: MEDIUM
impactDescription: Optional description
tags: tag1, tag2, tag3
---

## Rule Title Here

Brief explanation of the rule and why it matters.

**Incorrect (description of what's wrong):**

```typescript
// Bad code example
```

**Correct (description of what's right):**

```typescript
// Good code example
```

Optional explanatory text after examples.

Reference: [NestJS Documentation](https://docs.nestjs.com)
```

## File Naming Convention

- Files starting with `_` are special (`_sections.md`, `_template.md`)
- Rule files: `{area}-{description}.md` (e.g., `arch-feature-modules.md`)
- Section is inferred from the filename prefix

## Impact Levels

| Level | Description |
|-------|-------------|
| CRITICAL | Violations cause runtime errors, security vulnerabilities, or architectural breakdown |
| HIGH | Significant impact on reliability, security, or maintainability |
| MEDIUM-HIGH | Notable impact on quality and developer experience |
| MEDIUM | Moderate impact on code quality and best practices |

## Acknowledgments

- Source project: [`Kadajett/agent-nestjs-skills`](https://github.com/Kadajett/agent-nestjs-skills) (MIT)
- Rule/file structure inspired by the [Vercel agent skills](https://github.com/vercel-labs/agent-skills) format
