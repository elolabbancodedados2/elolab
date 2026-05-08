-- Advanced Configuration Tables for Platform Management
-- Configurações avançadas, integrações, e templates

-- Tabela de Integrações (APIs, webhooks, etc)
CREATE TABLE IF NOT EXISTS integraciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('api', 'webhook', 'oauth', 'smtp')) NOT NULL,
  chave TEXT NOT NULL,
  chave_secreta TEXT,
  webhook_url TEXT,
  status TEXT CHECK (status IN ('ativo', 'inativo', 'erro')) DEFAULT 'inativo',
  config_data JSONB DEFAULT '{}',
  ultimo_teste TIMESTAMP WITH TIME ZONE,
  teste_resultado TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integraciones_tipo ON integraciones(tipo);
CREATE INDEX IF NOT EXISTS idx_integraciones_status ON integraciones(status);

-- Tabela de Templates de Documentos
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('prontuario', 'prescricao', 'atestado', 'encaminhamento', 'relatorio')) NOT NULL,
  conteudo TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}', -- {{var1}}, {{var2}}, etc
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  clinica_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_templates_tipo ON document_templates(tipo);
CREATE INDEX IF NOT EXISTS idx_document_templates_ativo ON document_templates(ativo);

-- Tabela de Configurações LGPD
CREATE TABLE IF NOT EXISTS lgpd_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID UNIQUE,
  consentimento_obrigatorio BOOLEAN DEFAULT true,
  politica_privacidade_url TEXT,
  termos_uso_url TEXT,
  dias_retencao_dados INTEGER DEFAULT 2555, -- 7 years
  criptografia_senhas BOOLEAN DEFAULT true,
  auditoria_completa BOOLEAN DEFAULT true,
  notificar_deletacao BOOLEAN DEFAULT true,
  backup_automatico BOOLEAN DEFAULT true,
  dpo_email TEXT,
  dpo_telefone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Espaços de Trabalho (Clínicas/Institutos)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  descricao TEXT,
  logo_url TEXT,
  website_url TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cnpj TEXT UNIQUE,
  cnes TEXT,
  estado TEXT,
  cidade TEXT,
  ativo BOOLEAN DEFAULT true,
  plano_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_ativo ON workspaces(ativo);

-- Tabela de Auditoria Detalhada de Acesso a Dados
CREATE TABLE IF NOT EXISTS detailed_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL, -- 'view', 'edit', 'export', 'delete'
  tabela TEXT NOT NULL,
  registro_id UUID,
  ip_address INET,
  user_agent TEXT,
  motivo TEXT,
  dados_anteriores JSONB,
  dados_novos JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detailed_access_log_usuario_id ON detailed_access_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_detailed_access_log_tabela ON detailed_access_log(tabela);
CREATE INDEX IF NOT EXISTS idx_detailed_access_log_created_at ON detailed_access_log(created_at DESC);

-- Tabela de Webhooks Personalizados
CREATE TABLE IF NOT EXISTS custom_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  evento TEXT NOT NULL, -- 'paciente.criado', 'prescricao.gerada', etc
  ativo BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  headers JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_webhooks_evento ON custom_webhooks(evento);
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_ativo ON custom_webhooks(ativo);

-- Tabela de Logs de Webhook
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES custom_webhooks(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  body_enviado JSONB,
  response_body JSONB,
  erro TEXT,
  tentativa INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- RLS Policies
ALTER TABLE integraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apenas admin pode ver integrações"
  ON integraciones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Templates disponíveis para médicos e admin"
  ON document_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'medico'))
    )
  );

-- Comments
COMMENT ON TABLE integraciones IS 'Integrações com APIs externas e webhooks';
COMMENT ON TABLE document_templates IS 'Templates reutilizáveis de documentos clínicos';
COMMENT ON TABLE lgpd_config IS 'Configurações de conformidade com LGPD';
COMMENT ON TABLE workspaces IS 'Espaços de trabalho (clínicas/institutos) para multi-tenancy';
COMMENT ON TABLE detailed_access_log IS 'Log detalhado de acesso a dados para auditoria';
COMMENT ON TABLE custom_webhooks IS 'Webhooks personalizados para eventos do sistema';
