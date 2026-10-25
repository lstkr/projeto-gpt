begin;

-- CNPJ alphanumeric support follows Receita Federal's ASCII-minus-48 mapping.
-- The two check digits remain numeric; existing numeric CNPJs keep the same DV.
create or replace function private.valid_supplier_cnpj(p_cnpj text)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 c text:=upper(regexp_replace(coalesce(p_cnpj,''),'[./[:space:]-]','','g'));
 total integer;
 digit integer;
 i integer;
 pass integer;
 weights integer[];
begin
 if c !~ '^[A-Z0-9]{12}[0-9]{2}$' or c=repeat(substr(c,1,1),14) then return false; end if;
 for pass in 1..2 loop
  weights:=case when pass=1 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;
  total:=0;
  for i in 1..array_length(weights,1) loop
   total:=total+(ascii(substr(c,i,1))-48)*weights[i];
  end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if digit<>substr(c,12+pass,1)::integer then return false; end if;
 end loop;
 return true;
end $$;

commit;
