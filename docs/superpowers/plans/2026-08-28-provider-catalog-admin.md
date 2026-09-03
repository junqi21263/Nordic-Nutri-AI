# Provider Catalog Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the DEV admin choose a supported AI provider, store one provider key securely, synchronize its current model catalog, and assign active models to every AI feature without exposing technical transport settings or secrets.

**Architecture:** Keep the existing admin shell and AI Router contracts. Add a trusted provider registry plus server-only encrypted provider credential and catalog tables. The admin HTTP function exposes redacted provider, catalog, route, quota, and audit data; the static admin page renders a model-first catalog and a separate feature-routing work area.

**Tech Stack:** CloudBase HTTP Function (Node.js), CloudBase PostgreSQL, static Admin Hosting (HTML/CSS/JavaScript), Node built-in test runner.

---

## Scope and safety

- DEV-only design and local implementation; no CloudBase deployment in this task.
- Never return, render, log, or persist plaintext provider keys outside encrypted server storage.
- Do not alter `ai_feature_routes` RLS, policy, schema, or grant client database access.
- Preserve the current admin shell and use existing audit logging.
- System defaults are read-only: 30s timeout, 2048 max output tokens, 0.2 temperature.

## Work items

- [ ] Add failing unit tests for a provider registry, encrypted credential redaction, catalog lifecycle transitions, and static admin UI contracts.
- [ ] Implement a key/value provider registry and a server-only provider catalog service.
- [ ] Add a migration for encrypted credentials and current/deprecated provider models, with RLS enabled and server-only policy.
- [ ] Add authenticated admin routes for providers, credential updates, catalog synchronization, catalog listing, model routes, quota and audit history.
- [ ] Refactor the AI management work area into provider account, model catalog, and complete feature application configuration sections.
- [ ] Replace native model selects with custom picker controls; make feedback centered and accessible.
- [ ] Run focused backend/UI/migration tests and a CloudBase security review. Do not deploy.
