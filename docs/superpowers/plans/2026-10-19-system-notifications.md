# DEV system announcements and feedback notifications

Goal: Add persistent user notifications, editable administrator announcements and feedback reply push on DEV only.

Architecture: PostgreSQL transactional triggers materialize announcement recipients and feedback messages. An outbox with leased claims feeds existing FCM transport and delivery receipts. Authenticated APIs enforce ownership; administrator routes use existing password-gated admin sessions. App notification settings and message detail reuse existing page components.

- [x] Add versioned migration: announcements, notifications/outbox, preferences, publish/retract RPC, feedback trigger, read synchronization, service-role-only access. Preview/apply/history/schema verify on test-dev-d4gyxnn0b5dfa2c8a.
- [x] Add service and focused tests for validation, authorization, publish/retry and ownership. Wire authenticated user/admin routes and existing signed reminder dispatcher.
- [x] Generalize existing FCM transport and Android native intent/channel handling while preserving meal reminders. Test routing and account guards.
- [x] Add administrator draft/edit/preview/publish/retract/re-notify controls, recipient selection and separate delivery statistics.
- [x] Add localized user message list/detail/settings and profile unread badge. Synchronize feedback read state and handle login/cold start.
- [x] Run focused/full relevant checks, build DEV H5/APK, deploy DEV function/admin, verify live health and migration. Report authenticated/real-device acceptance separately. No PROD deployment or merge until user acceptance.

Delivery evidence and remaining real-device acceptance: `2026-10-19-notifications-dev-handoff.md`. PROD remains untouched.
