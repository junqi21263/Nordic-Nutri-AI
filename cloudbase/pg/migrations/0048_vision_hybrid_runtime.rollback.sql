-- Phase 2 local rollback authoring only. Execute only after a separate
-- production rollback approval and after all async jobs are drained.
drop function if exists public.fail_vision_analysis(uuid,bigint,text,text);
drop function if exists public.complete_vision_analysis(uuid,bigint,jsonb);
drop function if exists public.checkpoint_vision_analysis(uuid,bigint,jsonb,integer);
drop function if exists public.queue_vision_analysis(uuid,bigint,text,text,integer);
