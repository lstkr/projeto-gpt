-- This helper exists in some deployed schemas, but not in every historical
-- bootstrap. When present, it only references application functions by schema
-- qualified name, so an empty path prevents caller-controlled name resolution.
do $$
begin
 if to_regprocedure('private.count_guard()') is not null then
  execute format('alter function %s set search_path = %L',
   'private.count_guard()'::regprocedure,'');
 end if;
end $$;

