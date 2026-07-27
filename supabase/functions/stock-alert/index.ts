import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface EstoqueItem {
  id: string
  nome: string
  quantidade: number
  quantidade_minima: number | null
  categoria: string
  localizacao: string | null
  fornecedor: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Só o agendador (pg_cron) pode disparar esta rotina.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders);

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')

    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY não configurada')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar configuração
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('valor, ativo')
      .eq('chave', 'alerta_estoque_critico')
      .single()

    if (settings?.ativo === false) {
      return new Response(
        JSON.stringify({ success: true, message: 'Alertas de estoque desativados' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'estoque')
      .eq('tipo', 'email')
      .eq('ativo', true)
      .single()

    // Buscar itens com estoque crítico
    const { data: itensCriticos, error: fetchError } = await supabase
      .from('estoque')
      .select('id, nome, quantidade, quantidade_minima, categoria, localizacao, fornecedor')
      .not('quantidade_minima', 'is', null)

    if (fetchError) {
      throw new Error(`Erro ao buscar estoque: ${fetchError.message}`)
    }

    // Filtrar itens abaixo do mínimo
    const itensAlerta = (itensCriticos as EstoqueItem[])?.filter(
      item => item.quantidade <= (item.quantidade_minima || 0)
    ) || []

    if (itensAlerta.length === 0) {
      console.log('Nenhum item com estoque crítico')
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum item crítico', itens: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Encontrados ${itensAlerta.length} itens com estoque crítico`)

    // Buscar admins para enviar alerta
    const { data: admins } = await supabase
      .from('profiles')
      .select('email, nome')
      .eq('ativo', true)

    // Filtrar apenas admins que têm e-mail
    const adminEmails = admins?.filter(a => a.email)?.map(a => a.email) || []

    if (adminEmails.length === 0) {
      console.log('Nenhum admin com e-mail configurado')
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum destinatário configurado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Montar resumo dos itens críticos
    let listaItens = ''
    for (const item of itensAlerta) {
      listaItens += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.nome}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #dc2626; font-weight: bold;">${item.quantidade}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantidade_minima}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.categoria}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${item.localizacao || '-'}</td>
        </tr>
      `
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⚠️ Alerta de Estoque Crítico</h2>
        <p>Os seguintes itens estão com estoque abaixo do mínimo e precisam de reposição:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Qtd. Atual</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Qtd. Mínima</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Categoria</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Localização</th>
            </tr>
          </thead>
          <tbody>
            ${listaItens}
          </tbody>
        </table>
        
        <p style="color: #666; font-size: 14px;">
          Total de itens críticos: <strong>${itensAlerta.length}</strong>
        </p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este é um e-mail automático do sistema EloLab.<br>
          Data/Hora: ${new Date().toLocaleString('pt-BR')}
        </p>
      </div>
    `

    let successCount = 0
    let errorCount = 0

    // Enviar para cada admin
    for (const email of adminEmails) {
      try {
        const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'EloLab Clínica', email: 'noreply@elolab.com.br' },
            to: [{ email }],
            subject: `⚠️ Alerta: ${itensAlerta.length} ite${itensAlerta.length > 1 ? 'ns' : 'm'} com estoque crítico`,
            htmlContent,
          }),
        })

        if (emailRes.ok) {
          successCount++
          console.log(`✅ Alerta enviado para ${email}`)
        } else {
          errorCount++
          const error = await emailRes.json()
          console.error(`❌ Erro ao enviar para ${email}:`, error)
        }
      } catch (err) {
        errorCount++
        console.error(`❌ Exceção ao enviar para ${email}:`, err)
      }
    }

    const duration = Date.now() - startTime

    // Log da automação
    await supabase.from('automation_logs').insert({
      tipo: 'estoque',
      nome: 'Alerta de Estoque Crítico',
      status: errorCount === 0 ? 'sucesso' : 'parcial',
      registros_processados: itensAlerta.length,
      registros_sucesso: successCount,
      registros_erro: errorCount,
      detalhes: {
        itens_criticos: itensAlerta.map(i => ({ id: i.id, nome: i.nome, quantidade: i.quantidade })),
        destinatarios: adminEmails,
      },
      duracao_ms: duration,
      executado_por: 'cron',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Alertas de estoque processados',
        stats: {
          itens_criticos: itensAlerta.length,
          emails_enviados: successCount,
          emails_erro: errorCount,
          duracao_ms: duration,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro na função stock-alert:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
