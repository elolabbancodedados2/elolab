-- Dados mínimos para integração de prescrições digitais Memed.
-- As chaves de parceiro permanecem somente no ambiente das Edge Functions.

alter table public.medicos
  add column if not exists data_nascimento date;

create table if not exists public.memed_prescricoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete restrict,
  medico_id uuid not null references public.medicos(id) on delete restrict,
  memed_prescription_uuid text not null,
  memed_prescription_id text,
  data_prescricao date,
  payload jsonb not null default '{}'::jsonb,
  excluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memed_prescricoes_uuid_clinica_unica unique (clinica_id, memed_prescription_uuid)
);

create index if not exists memed_prescricoes_paciente_idx
  on public.memed_prescricoes (clinica_id, paciente_id, created_at desc);
create index if not exists memed_prescricoes_memed_id_idx
  on public.memed_prescricoes (clinica_id, memed_prescription_id)
  where memed_prescription_id is not null;

alter table public.memed_prescricoes enable row level security;
revoke all on public.memed_prescricoes from anon, authenticated;
grant all on public.memed_prescricoes to service_role;

comment on table public.memed_prescricoes is
  'Prescrições emitidas pela Memed. Payload clínico acessível somente pelo backend service role.';
