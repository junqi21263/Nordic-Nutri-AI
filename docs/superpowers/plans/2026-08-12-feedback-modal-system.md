# Feedback Modal System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Build a global Stitch-aligned Feedback Modal for success, limit, and error states, and route the confirmed feedback flows through it without showing a Toast at the same time.

**Architecture:** Extend the existing Zustand feedback store with a modal channel. `FeedbackHost` renders one fixed `FeedbackModal` overlay above the existing app layout; the existing Toast channel remains available for non-modal notices but is cleared whenever a modal opens. Business pages only call `showModal` with their own copy and callbacks.

**Tech Stack:** Taro React, Zustand, SCSS, Vitest, TypeScript, Taro WeChat build.

---

### Task 1: Add the modal state contract

**Files:**
- Modify: `mini-program/src/stores/feedback-store.ts`
- Test: `mini-program/tests/feedback-store.test.ts`

- [ ] Write a failing test proving `showModal` stores the options and clears an existing toast, and `closeModal` clears the modal.
- [ ] Run `npm --prefix mini-program run test:unit -- tests/feedback-store.test.ts`; expect failure because the modal channel does not exist.
- [ ] Add `FeedbackModalVariant`, `FeedbackModalOptions`, `FeedbackModalState`, `showModal`, and `closeModal`; keep `show`/`clear` compatible for non-modal Toasts.
- [ ] Run the focused test and confirm it passes.

### Task 2: Implement the Stitch-aligned FeedbackModal component

**Files:**
- Create: `mini-program/src/components/feedback-modal/index.tsx`
- Modify: `mini-program/src/styles/components.scss`
- Test: `mini-program/tests/feedback-modal.test.ts`

- [ ] Write contract tests for all three variants, fixed overlay class, shared modal structure, and success/limit/error-specific icon classes.
- [ ] Run the focused test and confirm it fails before implementation.
- [ ] Implement one component with shared geometry, variant-specific icon and animation classes, optional secondary action, controlled dismissibility, and no business copy.
- [ ] Add fixed overlay and Stitch timings: backdrop 300ms, success 340ms spring/check delay 150ms, limit 300ms, error 400ms with restrained horizontal feedback, and shared 300ms exit.
- [ ] Run the focused component contract test.

### Task 3: Render the modal globally and suppress Toast overlap

**Files:**
- Modify: `mini-program/src/components/feedback-host/index.tsx`
- Test: `mini-program/tests/feedback-host.test.ts`

- [ ] Add a failing source contract test proving the host renders `FeedbackModal` from store modal state and does not render Toast while a modal is present.
- [ ] Implement modal selection/close wiring in `FeedbackHost`; preserve current native/prominent Toast behavior when no modal exists.
- [ ] Run the host test and existing feedback tests.

### Task 4: Connect current-direction, profile, and feedback flows

**Files:**
- Modify: `mini-program/src/pages/profile-edit/index.tsx`
- Modify: `mini-program/src/pages/body-profile/index.tsx`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Test: `mini-program/tests/feedback-modal-flows.test.ts`

- [ ] Add failing source-contract tests for success/error modal calls and feedback success ordering.
- [ ] Replace the specified success/error Toast calls with `showModal` calls using page-owned Chinese copy.
- [ ] In feedback submit success, close the Bottom Sheet first, then show success after its exit delay; do not clear the draft on failure.
- [ ] Keep unrelated Toast calls unchanged.
- [ ] Run the focused flow tests.

### Task 5: Map AI quota errors to limit and other failures to error

**Files:**
- Modify: `mini-program/src/pages/food-scanner/index.tsx`
- Modify: `mini-program/src/pages/coach/index.tsx`
- Test: `mini-program/tests/feedback-quota-routing.test.ts`

- [ ] Add failing tests for explicit `VISION_DAILY_LIMIT_REACHED`, `COACH_DAILY_LIMIT_REACHED`, and generic errors.
- [ ] Add a small shared error-code predicate/mapper in `mini-program/src/features/feedback/feedback-error.ts` and route limit codes to `variant: "limit"`; route all other failures to `variant: "error"`.
- [ ] Keep requests and existing loading behavior unchanged; only replace presentation.
- [ ] Run focused quota tests.

### Task 6: Full validation and build

**Files:**
- No additional source changes unless a verification failure identifies a direct defect.

- [ ] Run all targeted feedback tests.
- [ ] Run `npm --prefix mini-program run typecheck`.
- [ ] Run `npm --prefix mini-program run lint`.
- [ ] Run `npm --prefix mini-program run build:weapp`.
- [ ] Run `npm --prefix mini-program run verify:weapp`.
- [ ] Review `git diff` and confirm no static page layout files were changed beyond the shared feedback component styles.
