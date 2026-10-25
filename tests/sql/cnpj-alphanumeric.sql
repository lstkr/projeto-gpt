do $tests$
begin
 assert private.valid_supplier_cnpj('12ABC34501DE35'), 'synthetic alphanumeric CNPJ should pass the official DV algorithm';
 assert not private.valid_supplier_cnpj('12ABC34501DE34'), 'wrong alphanumeric CNPJ check digit should fail';
 assert private.valid_supplier_cnpj('11.222.333/0001-81'), 'existing numeric CNPJ should remain valid';
 assert not private.valid_supplier_cnpj('11.222.333/0001-80'), 'wrong numeric CNPJ check digit should fail';
 assert not private.valid_supplier_cnpj('11111111111111'), 'repeated numeric CNPJ should fail';
end $tests$;
