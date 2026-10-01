-- O EloLab não oferece teleconsulta: o tipo "telemedicina" existia só como
-- rótulo, sem sala de vídeo, e sugeria um recurso que o produto não tem.
-- Agendamentos antigos com esse tipo viram "consulta" (a observação registra
-- a origem) e o tipo deixa de ser aceito.

update public.agendamentos
set tipo = 'consulta',
    observacoes = concat_ws(E'\n', nullif(observacoes, ''), '[tipo original: telemedicina]')
where tipo = 'telemedicina';

alter table public.agendamentos drop constraint if exists agendamentos_tipo_check;

alter table public.agendamentos add constraint agendamentos_tipo_check check (tipo = any (array[
  'consulta'::text, 'retorno'::text, 'exame'::text, 'procedimento'::text,
  'checkup'::text, 'avaliacao'::text, 'cirurgia'::text, 'triagem'::text,
  'coleta'::text, 'enfermagem'::text, 'vacina'::text, 'curativo'::text
]));
