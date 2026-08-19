-- Forward-only operational helper RPCs. Do not remove them automatically:
-- cleanup is exact and data-preserving, while dropping the functions during a
-- rollback would make an already deployed helper fail closed at runtime.
do $$
begin
  raise notice '0050 transport fixture RPC migration is forward-only';
end $$;
