AI Project Guidelines

This document defines how the AI should operate when contributing to this repository.

It provides guidance for reasoning, architecture, coding standards, and development workflow.

This file works together with the Cursor rules and does not override them.
Cursor rules control agent behavior, while this document provides deeper reasoning and architectural context.

The goal is to produce clean, reliable, maintainable software quickly while supporting a fast hackathon-style development workflow.

The AI should prioritize:

clarity
correctness
incremental development
maintainable architecture
fast iteration

Core Development Philosophy

The AI should behave like a senior engineer building a real system under time constraints.

Primary goals:

build correct functionality
keep code easy to understand
avoid unnecessary complexity
ensure debugging remains easy
ship working features quickly

Speed matters, but not at the expense of maintainability.

Problem Solving Strategy

When solving tasks the AI should reason through the following steps.

Step 1 — Understand the Problem

Before writing code determine:

what feature or fix is required
which parts of the system it affects
what data flows through the system
which existing modules may already solve part of the problem

If something is unclear, ask questions instead of guessing.

Step 2 — Understand the Existing Codebase

Before implementing new functionality, examine the repository for:

existing services
existing Redux slices
existing utilities
existing component patterns

Prefer reusing existing modules rather than duplicating functionality.

Step 3 — Design Before Coding

Before generating code determine:

which files should be modified
whether new files are necessary
how state will flow through Redux
how the UI will consume the state
how APIs will be called from services

The solution should integrate cleanly with the current architecture.

Step 4 — Implement the Smallest Useful Change

Implement the smallest working solution.

Avoid implementing future features that are not required yet.

Avoid speculative abstractions.

Focus on solving the current problem cleanly.

Step 5 — Verify the Implementation

Before presenting code verify:

the solution follows project architecture
variable and function names are descriptive
logic is readable
error handling exists where required
edge cases are considered

Step 6 — Ensure Debuggability

The code should remain easy to debug.

Prefer:

clear control flow
small functions
explicit error handling
descriptive naming

Avoid deeply nested logic.

Development Workflow

Development will happen incrementally.

The AI should:

implement small pieces
check back frequently
avoid large speculative implementations

Large features should be built step-by-step with feedback between each step.

Human-Readable Code First

Always prioritize clarity over cleverness.

Use:

descriptive variable names
clear control flow
small functions

Avoid:

dense one-line logic
clever tricks that reduce readability

Example poor readability:

x = arr.reduce((a,b)=>a+b)

Better:

totalScore = scores.reduce((sum, score) => sum + score)

Comments should explain why the code exists, not simply what it does.

Abstraction and Reusability

If logic appears more than twice it should likely be extracted into a reusable module.

Preferred directories:

/utils
/services
/components
/hooks
/redux
/lib

Avoid duplicating logic across files.

Follow DRY principles.

Respect Existing Architecture

Always follow the patterns already present in the repository.

Do not introduce new frameworks or architectural patterns without approval.

Maintain consistency with existing folder structures and naming conventions.

Architecture Overview

The application architecture follows a layered structure.

UI Layer
Responsible for rendering components and handling user interaction.

Components should not contain API logic.

State Layer

Shared application state is managed with Redux.

Rules:

Use Redux slices for domain-specific state.

Use selectors to read state.

Avoid placing UI-only state inside Redux.

Avoid storing derived values in Redux if they can be computed.

Redux should remain predictable and minimal.

Service Layer

External integrations should be handled in services.

Examples include:

API calls
webhook calls
external integrations

Components should call service functions instead of directly performing network requests.

Utility Layer

Utilities contain reusable pure logic.

These functions should not depend on UI or external systems.

API Integration

All API logic must live in:

/services/api.ts

Rules:

Components must never call fetch or axios directly.

API functions should include:

error handling
clear return values
consistent naming
typed responses when possible

n8n Integration

When generating code that calls n8n webhooks:

Always reference the environment variable:

WEBHOOK_BASE_URL

Webhook URLs should never be hardcoded.

Workflow references should match structures defined in:

/n8n-workflows

Error Handling Philosophy

External operations must include meaningful error handling.

Examples include:

API requests
data parsing
external service calls

Errors should be descriptive and should not fail silently.

Testing Philosophy

Tests should validate meaningful behavior rather than exist solely for coverage.

Good tests validate:

core business logic
error conditions
edge cases
data transformations
state transitions

Avoid tests that only verify trivial implementation details.

Tests should increase confidence that the system actually works.

Tests should typically live in:

tests directories
or adjacent to modules.

Example:

/services/userService.ts
/services/tests/userService.test.ts

After implementing changes, suggest the appropriate test command such as:

npm test
pytest
go test

Code Quality Expectations

Generated code should:

compile successfully
pass linting
be readable by junior engineers
avoid deep nesting
avoid duplicated logic

Prefer simple maintainable solutions over clever or dense code.

Avoiding Overengineering

The AI should avoid unnecessary complexity.

Avoid:

large abstraction layers
deep inheritance structures
complex design patterns
premature optimization

Prefer simple solutions that can be extended later.

Repository Awareness

Before introducing new files always check whether existing modules can be extended.

Prefer modifying existing code when appropriate.

Avoid creating unnecessary modules.

Debugging Strategy

When diagnosing a bug:

identify the likely source of the issue
analyze the root cause
propose the smallest fix possible

Avoid rewriting large working sections of code.

Hackathon Efficiency Principles

This repository supports hackathon development.

The AI should aim to:

ship working functionality quickly
avoid unnecessary abstraction
prefer simple implementations
maintain code that can be extended later

The objective is to reach a working demo quickly while preserving code quality.

Behavior Rules for AI

The AI should always:

start with a plan before implementing complex work
ask questions if requirements are unclear
prefer modifying existing files over creating unnecessary ones
keep solutions minimal and understandable
explain major decisions when implementing features

Expected Output Style

When generating responses the AI should provide:

A short summary of the change

Implementation steps

Code modifications

Test instructions

This ensures development remains transparent and easy to review.