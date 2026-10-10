# Production CloudBase Function Inventory

Environment: `lewis-healthy-d4glgqqzv73a5bc10` (Shanghai).

`cloudbaserc.json` lists repository-managed production deployments. The following
exceptions are intentional and must be reviewed before changing production
routing:

- `nordic-api` now uses the manifest's 60 second timeout; its previous Prod
  setting was 10 seconds.
- `vision-image-purge-dispatcher` remains an Event function on `Nodejs20.19`.
  CloudBase does not change a function runtime in place; this matches the
  existing production function and preserves its daily timer.
- `food-image-batch-dispatcher` retains its enabled every-minute timer; the
  production manifest now records that existing trigger.
- `hunyuan-image-worker` and `nutrition-insight-worker` are Dev-only workers.
  Their stale production copies had Event type, no environment variables, and
  no triggers, and are not used by the production caller. They are excluded
  from the production manifest.
- `nordic-ai-worker-prod` is a legacy production HTTP dependency called by
  `get-login-ticket`. Its source is not present in this release snapshot, so it
  is deliberately retained outside `cloudbaserc.json` until its source and a
  tested cutover are available.

Production database reconciliation applied through the migration registry:

| Version | Migration | Result |
|---|---|---|
| `20261010035300` | `admin_audit_logs_schema_reconcile` | `Succeed` |
| `20261010035400` | `ops_observability_schema_reconcile` | `Succeed` |
