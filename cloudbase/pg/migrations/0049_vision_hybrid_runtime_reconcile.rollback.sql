-- Forward-fix migration: do not restore the known-broken 0048 RPCs and do not
-- remove shared async columns or indexes. Rollback is intentionally a no-op.
do $$
begin
  raise notice '0049 is forward-only; no destructive rollback is defined';
end $$;
