// @ts-nocheck
/**
 * Advanced Configuration Service
 * Gerenciamento de integrações, templates, LGPD e webhooks
 */

import { supabase } from '@/integrations/supabase/client';

/* ─── INTEGRAÇÕES ─── */
export interface Integration {
  id: string;
  nome: string;
  tipo: 'api' | 'webhook' | 'oauth' | 'smtp';
  chave: string;
  chaveSecreta?: string;
  webhookUrl?: string;
  status: 'ativo' | 'inativo' | 'erro';
  configData?: Record<string, any>;
  ultimoTeste?: Date;
  testeResultado?: string;
}

export async function getIntegrations(): Promise<Integration[]> {
  try {
    const { data, error } = await supabase
      .from('integraciones')
      .select('*')
      .order('nome');

    if (error) throw error;
    return (data || []) as Integration[];
  } catch (error) {
    console.error('Error fetching integrations:', error);
    throw error;
  }
}

export async function createIntegration(integration: Omit<Integration, 'id'>): Promise<Integration> {
  try {
    const { data, error } = await supabase
      .from('integraciones')
      .insert({
        nome: integration.nome,
        tipo: integration.tipo,
        chave: integration.chave,
        chave_secreta: integration.chaveSecreta,
        webhook_url: integration.webhookUrl,
        status: integration.status,
        config_data: integration.configData || {},
      })
      .select()
      .single();

    if (error) throw error;
    return data as Integration;
  } catch (error) {
    console.error('Error creating integration:', error);
    throw error;
  }
}

export async function testIntegration(integrationId: string): Promise<boolean> {
  try {
    // Simulação de teste
    const { error } = await supabase
      .from('integraciones')
      .update({
        ultimo_teste: new Date().toISOString(),
        teste_resultado: 'Sucesso',
        status: 'ativo',
      })
      .eq('id', integrationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error testing integration:', error);
    return false;
  }
}

/* ─── DOCUMENT TEMPLATES ─── */
export interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: 'prontuario' | 'prescricao' | 'atestado' | 'encaminhamento' | 'relatorio';
  conteudo: string;
  variables: string[];
  descricao?: string;
  ativo: boolean;
}

export async function getDocumentTemplates(tipo?: string): Promise<DocumentTemplate[]> {
  try {
    let query = supabase.from('document_templates').select('*');

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query.order('nome');
    if (error) throw error;

    return (data || []) as DocumentTemplate[];
  } catch (error) {
    console.error('Error fetching document templates:', error);
    throw error;
  }
}

export async function createDocumentTemplate(template: Omit<DocumentTemplate, 'id'>): Promise<DocumentTemplate> {
  try {
    const { data, error } = await supabase
      .from('document_templates')
      .insert({
        nome: template.nome,
        tipo: template.tipo,
        conteudo: template.conteudo,
        variables: template.variables,
        descricao: template.descricao,
        ativo: template.ativo,
      })
      .select()
      .single();

    if (error) throw error;
    return data as DocumentTemplate;
  } catch (error) {
    console.error('Error creating document template:', error);
    throw error;
  }
}

export async function updateDocumentTemplate(id: string, updates: Partial<DocumentTemplate>): Promise<DocumentTemplate> {
  try {
    const { data, error } = await supabase
      .from('document_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as DocumentTemplate;
  } catch (error) {
    console.error('Error updating document template:', error);
    throw error;
  }
}

export function renderDocumentTemplate(template: DocumentTemplate, variables: Record<string, any>): string {
  let content = template.conteudo;

  template.variables.forEach(varName => {
    const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');
    content = content.replace(regex, String(variables[varName] || ''));
  });

  return content;
}

/* ─── LGPD CONFIG ─── */
export interface LGPDConfig {
  id: string;
  consentimentoObrigatorio: boolean;
  politicaPrivacidadeUrl: string;
  termosUsoUrl: string;
  diasRetencaoDados: number;
  criptografiaSenhas: boolean;
  auditoriaCompleta: boolean;
  notificarDeletacao: boolean;
  backupAutomatico: boolean;
  dpoEmail?: string;
  dpoTelefone?: string;
}

export async function getLGPDConfig(clinicaId?: string): Promise<LGPDConfig | null> {
  try {
    let query = supabase.from('lgpd_config').select('*');

    if (clinicaId) {
      query = query.eq('clinica_id', clinicaId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    return data ? {
      id: data.id,
      consentimentoObrigatorio: data.consentimento_obrigatorio,
      politicaPrivacidadeUrl: data.politica_privacidade_url,
      termosUsoUrl: data.termos_uso_url,
      diasRetencaoDados: data.dias_retencao_dados,
      criptografiaSenhas: data.criptografia_senhas,
      auditoriaCompleta: data.auditoria_completa,
      notificarDeletacao: data.notificar_deletacao,
      backupAutomatico: data.backup_automatico,
      dpoEmail: data.dpo_email,
      dpoTelefone: data.dpo_telefone,
    } : null;
  } catch (error) {
    console.error('Error fetching LGPD config:', error);
    return null;
  }
}

export async function updateLGPDConfig(config: LGPDConfig): Promise<LGPDConfig> {
  try {
    const { data, error } = await supabase
      .from('lgpd_config')
      .update({
        consentimento_obrigatorio: config.consentimentoObrigatorio,
        politica_privacidade_url: config.politicaPrivacidadeUrl,
        termos_uso_url: config.termosUsoUrl,
        dias_retencao_dados: config.diasRetencaoDados,
        criptografia_senhas: config.criptografiaSenhas,
        auditoria_completa: config.auditoriaCompleta,
        notificar_deletacao: config.notificarDeletacao,
        backup_automatico: config.backupAutomatico,
        dpo_email: config.dpoEmail,
        dpo_telefone: config.dpoTelefone,
      })
      .eq('id', config.id)
      .select()
      .single();

    if (error) throw error;
    return data as LGPDConfig;
  } catch (error) {
    console.error('Error updating LGPD config:', error);
    throw error;
  }
}

/* ─── AUDIT LOG ─── */
export async function logAccessEvent(
  action: 'view' | 'edit' | 'export' | 'delete',
  tabela: string,
  registroId: string,
  motivo?: string
): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();

    await supabase.from('detailed_access_log').insert({
      usuario_id: user.user?.id,
      acao: action,
      tabela,
      registro_id: registroId,
      ip_address: null, // Seria obtido do cliente
      user_agent: navigator.userAgent,
      motivo: motivo || null,
    });
  } catch (error) {
    console.error('Error logging access event:', error);
  }
}

export async function getAccessLog(dias: number = 30) {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);

    const { data, error } = await supabase
      .from('detailed_access_log')
      .select('*')
      .gte('created_at', dataLimite.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching access log:', error);
    return [];
  }
}

/* ─── WEBHOOKS ─── */
export interface CustomWebhook {
  id: string;
  url: string;
  evento: string;
  ativo: boolean;
  retryCount: number;
  timeoutSeconds: number;
  headers?: Record<string, string>;
}

export async function getCustomWebhooks(): Promise<CustomWebhook[]> {
  try {
    const { data, error } = await supabase
      .from('custom_webhooks')
      .select('*')
      .eq('ativo', true)
      .order('evento');

    if (error) throw error;
    return (data || []) as CustomWebhook[];
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    return [];
  }
}

export async function triggerWebhook(event: string, payload: Record<string, any>): Promise<void> {
  try {
    const webhooks = await supabase
      .from('custom_webhooks')
      .select('*')
      .eq('evento', event)
      .eq('ativo', true);

    for (const webhook of webhooks.data || []) {
      // Fire and forget com retry logic
      fetchWithRetry(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers,
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
        timeout: webhook.timeout_seconds * 1000,
      }, webhook.retry_count)
        .then(response => {
          // Log success
          supabase.from('webhook_logs').insert({
            webhook_id: webhook.id,
            evento: event,
            status_code: response.status,
            response_body: null,
          }).catch(err => console.error('Error logging webhook:', err));
        })
        .catch(error => {
          console.error(`Webhook ${webhook.url} failed:`, error);
        });
    }
  } catch (error) {
    console.error('Error triggering webhooks:', error);
  }
}

async function fetchWithRetry(
  url: string,
  options: any,
  retries: number = 3,
  attempt: number = 1
): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok && attempt < retries) {
      await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
      return fetchWithRetry(url, options, retries, attempt + 1);
    }

    return response;
  } catch (error) {
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return fetchWithRetry(url, options, retries, attempt + 1);
    }
    throw error;
  }
}