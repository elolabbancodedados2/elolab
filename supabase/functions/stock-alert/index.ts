import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronOrUserOk, cronForbidden, clinicaDoChamador } from '../_shared/cronAuth.ts'
import { corsPadrao } from '../_shared/cors.ts';
import { sendBrandedBrevoRequest } from '../_shared/brevoEmail.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

interface EstoqueItem {
  id: string
  clinica_id: string | null
  nome: string
  quantidade: number
  quantidade_minima: number | null
  categoria: string
  localizacao: string | null
}

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // O agendador OU um usuário logado. Com `cronSecretOk` o botão "Executar
  // agora" da tela de Automações recebia 403 e a automação parecia quebrada.
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders)

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    if (!brevoApiKey) throw new Error('BREVO_API_KEY nao configurada')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: settings, error: settingsError } = await supabase
      .from('automation_settings')
      .select('valor, ativo, clinica_id')
      .eq('chave', 'alerta_estoque_critico')
    if (settingsError) throw new Error(`Erro ao carregar as configurações da automação: ${settingsError.message}`)

    // Disparo manual só alcança a clínica de quem clicou; o cron segue global.
    const clinicaAlvo = await clinicaDoChamador(req, supabase)

    const limiteItens = 20_000
    const tamanhoPagina = 1_000
    const itensEstoque: EstoqueItem[] = []
    while (itensEstoque.length < limiteItens) {
      const inicio = itensEstoque.length
      const fim = Math.min(inicio + tamanhoPagina, limiteItens) - 1
      let consulta = supabase
        .from('estoque')
        .select('id, clinica_id, nome, quantidade, quantidade_minima, categoria, localizacao')
        .not('quantidade_minima', 'is', null)
        .order('clinica_id', { ascending: true })
        .order('id', { ascending: true })
        .range(inicio, fim)
      if (clinicaAlvo) consulta = consulta.eq('clinica_id', clinicaAlvo)

      const { data, error } = await consulta
      if (error) throw new Error(`Erro ao buscar estoque: ${error.message}`)
      const pagina = (data || []) as EstoqueItem[]
      itensEstoque.push(...pagina)
      if (pagina.length < fim - inicio + 1) break
    }

    if (itensEstoque.length === limiteItens) {
      let consultaExtra = supabase.from('estoque').select('id')
        .not('quantidade_minima', 'is', null)
        .order('clinica_id', { ascending: true }).order('id', { ascending: true })
        .range(limiteItens, limiteItens)
      if (clinicaAlvo) consultaExtra = consultaExtra.eq('clinica_id', clinicaAlvo)
      const { data: extra, error: extraError } = await consultaExtra
      if (extraError) throw new Error(`Erro ao verificar o limite de estoque: ${extraError.message}`)
      if (extra?.length) throw new Error(`A consulta de estoque excedeu o limite de ${limiteItens} itens. Use uma execução segmentada para evitar alertas incompletos.`)
    }

    const itensAlerta = itensEstoque.filter((item) => (
      Boolean(item.clinica_id)
      && isAutomationActive(settings || [], item.clinica_id)
      && item.quantidade <= (item.quantidade_minima || 0)
    ))

    if (itensAlerta.length === 0) {
      return json({ success: true, message: 'Nenhum item critico', itens: 0 })
    }

    const { data: adminRoles, error: adminRolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
    if (adminRolesError) throw new Error(`Erro ao consultar administradores: ${adminRolesError.message}`)
    const adminIds = (adminRoles || []).map((role) => role.user_id)

    const { data: admins, error: adminsError } = adminIds.length > 0
      ? await supabase
        .from('profiles')
        .select('id, email, nome, clinica_id')
        .eq('ativo', true)
        .in('id', adminIds)
      : { data: [], error: null }
    if (adminsError) throw new Error(`Erro ao consultar contatos administrativos: ${adminsError.message}`)

    const clinicItems = groupByClinic(itensAlerta)
    let successCount = 0
    let errorCount = 0
    let recipientCount = 0

    for (const [clinicId, items] of clinicItems) {
      const clinicAdmins = (admins || []).filter((admin) => admin.clinica_id === clinicId && admin.email)
      recipientCount += clinicAdmins.length
      if (clinicAdmins.length === 0) {
        errorCount++
        console.error(`Clínica ${clinicId} tem itens críticos, mas nenhum administrador ativo com e-mail.`)
        continue
      }

      const rows = items.map((item) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(item.nome)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #dc2626; font-weight: bold;">${item.quantidade}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantidade_minima}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(item.categoria)}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(item.localizacao || '-')}</td>
        </tr>
      `).join('')
      const htmlContent = buildStockAlertHtml(rows, items.length)

      for (const admin of clinicAdmins) {
        try {
          const emailRes = await sendBrandedBrevoRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'EloLab Clinica', email: 'noreply@elolab.com.br' },
              to: [{ email: admin.email, name: admin.nome }],
              subject: `Alerta: ${items.length} item(ns) com estoque critico`,
              htmlContent,
            }),
          })

          if (emailRes.ok) {
            successCount++
          } else {
            errorCount++
            console.error('Falha ao enviar alerta por e-mail.', { status: emailRes.status })
          }
        } catch (error) {
          errorCount++
          console.error(`Excecao ao enviar alerta para ${admin.email}:`, error)
        }
      }
    }

    const duration = Date.now() - startTime
    await supabase.from('automation_logs').insert({
      tipo: 'estoque',
      nome: 'Alerta de Estoque Critico',
      status: successCount === 0 && errorCount > 0 ? 'erro' : errorCount > 0 ? 'parcial' : 'sucesso',
      registros_processados: itensAlerta.length,
      registros_sucesso: successCount,
      registros_erro: errorCount,
      detalhes: {
        itens_criticos: itensAlerta.map((item) => ({ id: item.id, clinica_id: item.clinica_id, nome: item.nome, quantidade: item.quantidade })),
        destinatarios: recipientCount,
      },
      duracao_ms: duration,
      executado_por: 'cron',
    })

    return json({
      success: true,
      message: 'Alertas de estoque processados',
      stats: { itens_criticos: itensAlerta.length, emails_enviados: successCount, emails_erro: errorCount, duracao_ms: duration },
    })
  } catch (error) {
    console.error('Erro na funcao stock-alert:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return json({ success: false, error: errorMessage }, 500)
  }
})

function isAutomationActive(settings: any[], clinicId: string | null): boolean {
  const scoped = settings.find((setting) => setting.clinica_id === clinicId)
  const legacy = settings.find((setting) => setting.clinica_id == null)
  return (scoped || legacy)?.ativo !== false
}

function groupByClinic(items: EstoqueItem[]): Map<string, EstoqueItem[]> {
  const groups = new Map<string, EstoqueItem[]>()
  for (const item of items) {
    if (!item.clinica_id) continue
    const current = groups.get(item.clinica_id) || []
    current.push(item)
    groups.set(item.clinica_id, current)
  }
  return groups
}

function buildStockAlertHtml(rows: string, count: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Alerta de Estoque Critico</h2>
      <p>Os seguintes itens estao abaixo do minimo e precisam de reposicao:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead><tr style="background-color: #f3f4f6;">
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Qtd. Atual</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Qtd. Minima</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Categoria</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Localizacao</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Total de itens criticos: <strong>${count}</strong></p>
      <p style="color: #666; font-size: 12px;">E-mail automatico do sistema EloLab.</p>
    </div>
  `
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
