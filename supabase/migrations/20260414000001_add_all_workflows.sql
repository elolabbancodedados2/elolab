-- ✅ 1. RETORNOS AUTOMÁTICOS COM LEMBRETES
CREATE TABLE IF NOT EXISTS public.retornos_agendados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  data_retorno date NOT NULL,
  hora_retorno time,
  motivo text,
  medico_solicitante_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  status text DEFAULT 'agendado', -- agendado, confirmado, cancelado, realizado
  lembretes_enviados int DEFAULT 0,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.retornos_agendados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa retornos" ON public.retornos_agendados
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ 2. NOTIFICAÇÕES (WhatsApp/SMS/Email)
CREATE TABLE IF NOT EXISTS public.notificacoes_agendadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo text NOT NULL, -- whatsapp, sms, email
  conteudo text NOT NULL,
  data_envio timestamptz NOT NULL,
  status text DEFAULT 'pendente', -- pendente, enviado, falha, cancelado
  tentativas int DEFAULT 0,
  telefone_whatsapp text,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notificacoes_agendadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa notificacoes" ON public.notificacoes_agendadas
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ 3. NOTA FISCAL ELETRÔNICA
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nf text UNIQUE,
  serie_nf text,
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  valor numeric(10,2) NOT NULL,
  xml_nfe text,
  url_danfe text,
  status text DEFAULT 'pendente', -- pendente, enviada, autorizada, cancelada
  data_emissao timestamptz DEFAULT now(),
  data_autorizacao timestamptz,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa nfe" ON public.notas_fiscais
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ 4. AUTORIZAÇÃO CONVÊNIO
CREATE TABLE IF NOT EXISTS public.autorizacoes_convenio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  convenio_id uuid NOT NULL REFERENCES public.convenios(id) ON DELETE CASCADE,
  tipo_servico text NOT NULL, -- consulta, exame, procedimento
  descricao text,
  status text DEFAULT 'pendente', -- pendente, autorizada, negada, expirada
  numero_autorizacao text UNIQUE,
  data_solicitacao timestamptz DEFAULT now(),
  data_autorizacao timestamptz,
  data_expiracao date,
  observacoes text,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.autorizacoes_convenio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa autorizacoes" ON public.autorizacoes_convenio
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ 5. FEEDBACK / AVALIAÇÃO
CREATE TABLE IF NOT EXISTS public.avaliacoes_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fila_id uuid REFERENCES public.fila_atendimento(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  medico_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  nota_geral int CHECK (nota_geral >= 1 AND nota_geral <= 5),
  nota_atendimento int,
  nota_higiene int,
  nota_tempo_espera int,
  comentarios text,
  recomendaria boolean,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.avaliacoes_atendimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa avaliacoes" ON public.avaliacoes_atendimento
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ 6. VITAIS HISTÓRICO (Triagem)
CREATE TABLE IF NOT EXISTS public.vitais_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  pressao_sistolica int,
  pressao_diastolica int,
  frequencia_cardiaca int,
  temperatura numeric(4,1),
  peso numeric(5,2),
  altura numeric(4,2),
  imc numeric(4,2),
  oxigenacao int,
  glicemia int,
  notas text,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.vitais_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa vitais" ON public.vitais_historico
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ 7. ANÁLISE PREDITIVA (No-Show)
CREATE TABLE IF NOT EXISTS public.predicoes_no_show (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  probabilidade_no_show numeric(3,2), -- 0.00 a 1.00
  motivos_risco text[], -- array de possíveis motivos
  recomendacoes text, -- o que fazer
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.predicoes_no_show ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinica acessa predicoes" ON public.predicoes_no_show
  FOR ALL USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- ✅ ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_retornos_paciente ON public.retornos_agendados(paciente_id);
CREATE INDEX IF NOT EXISTS idx_retornos_data ON public.retornos_agendados(data_retorno);
CREATE INDEX IF NOT EXISTS idx_notificacoes_status ON public.notificacoes_agendadas(status);
CREATE INDEX IF NOT EXISTS idx_notificacoes_data ON public.notificacoes_agendadas(data_envio);
CREATE INDEX IF NOT EXISTS idx_nfe_numero ON public.notas_fiscais(numero_nf);
CREATE INDEX IF NOT EXISTS idx_nfe_status ON public.notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_autorizacoes_status ON public.autorizacoes_convenio(status);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_paciente ON public.avaliacoes_atendimento(paciente_id);
CREATE INDEX IF NOT EXISTS idx_vitais_paciente ON public.vitais_historico(paciente_id);
CREATE INDEX IF NOT EXISTS idx_vitais_data ON public.vitais_historico(created_at);
CREATE INDEX IF NOT EXISTS idx_predicoes_probabilidade ON public.predicoes_no_show(probabilidade_no_show);
