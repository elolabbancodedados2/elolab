import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY não configurada')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Calcular período do mês anterior
    const hoje = new Date()
    const primeiroDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const ultimoDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
    
    const mesAnteriorInicio = primeiroDiaMesAnterior.toISOString().split('T')[0]
    const mesAnteriorFim = ultimoDiaMesAnterior.toISOString().split('T')[0]
    
    const nomeMes = primeiroDiaMesAnterior.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    console.log(`Gerando relatório de ${mesAnteriorInicio} até ${mesAnteriorFim}`)

    // 1. Faturamento total do mês
    const { data: lancamentosReceita } = await supabase
      .from('lancamentos')
      .select('valor, status, categoria')
      .eq('tipo', 'receita')
      .gte('data', mesAnteriorInicio)
      .lte('data', mesAnteriorFim)

    const faturamentoTotal = lancamentosReceita?.reduce((sum, l) => sum + (l.valor || 0), 0) || 0
    const faturamentoPago = lancamentosReceita?.filter(l => l.status === 'pago')
      .reduce((sum, l) => sum + (l.valor || 0), 0) || 0
    const faturamentoPendente = lancamentosReceita?.filter(l => l.status === 'pendente')
      .reduce((sum, l) => sum + (l.valor || 0), 0) || 0

    // 2. Despesas do mês
    const { data: lancamentosDespesa } = await supabase
      .from('lancamentos')
      .select('valor, status, categoria')
      .eq('tipo', 'despesa')
      .gte('data', mesAnteriorInicio)
      .lte('data', mesAnteriorFim)

    const despesasTotal = lancamentosDespesa?.reduce((sum, l) => sum + (l.valor || 0), 0) || 0

    // 3. Agendamentos do mês
    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('id, status, tipo')
      .gte('data', mesAnteriorInicio)
      .lte('data', mesAnteriorFim)

    const totalAgendamentos = agendamentos?.length || 0
    const agendamentosFinalizados = agendamentos?.filter(a => a.status === 'finalizado').length || 0
    const agendamentosCancelados = agendamentos?.filter(a => a.status === 'cancelado').length || 0
    const agendamentosFaltas = agendamentos?.filter(a => a.status === 'faltou').length || 0

    // 4. Novos pacientes
    const { data: novosPacientes } = await supabase
      .from('pacientes')
      .select('id')
      .gte('created_at', mesAnteriorInicio)
      .lte('created_at', mesAnteriorFim + 'T23:59:59')

    const qtdNovosPacientes = novosPacientes?.length || 0

    // 5. Exames realizados
    const { data: exames } = await supabase
      .from('exames')
      .select('id, tipo_exame, status')
      .gte('data_realizacao', mesAnteriorInicio)
      .lte('data_realizacao', mesAnteriorFim)

    const totalExames = exames?.length || 0

    // 6. Agrupar por categoria de receita
    const receitasPorCategoria: Record<string, number> = {}
    lancamentosReceita?.forEach(l => {
      const cat = l.categoria || 'Outros'
      receitasPorCategoria[cat] = (receitasPorCategoria[cat] || 0) + (l.valor || 0)
    })

    // Montar HTML do relatório
    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1e3a5f; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; }
    h2 { color: #2563eb; margin-top: 30px; }
    .card { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 15px 0; }
    .metric { display: inline-block; min-width: 200px; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 28px; font-weight: bold; color: #1e3a5f; }
    .metric-label { color: #64748b; font-size: 14px; }
    .positive { color: #16a34a; }
    .negative { color: #dc2626; }
    .warning { color: #f59e0b; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📊 Relatório Mensal - ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</h1>
  
  <h2>💰 Resumo Financeiro</h2>
  <div class="card">
    <div class="metric">
      <div class="metric-value positive">R$ ${faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      <div class="metric-label">Faturamento Total</div>
    </div>
    <div class="metric">
      <div class="metric-value">R$ ${faturamentoPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      <div class="metric-label">Recebido</div>
    </div>
    <div class="metric">
      <div class="metric-value warning">R$ ${faturamentoPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      <div class="metric-label">Pendente</div>
    </div>
    <div class="metric">
      <div class="metric-value negative">R$ ${despesasTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      <div class="metric-label">Despesas</div>
    </div>
    <div class="metric">
      <div class="metric-value ${(faturamentoTotal - despesasTotal) >= 0 ? 'positive' : 'negative'}">
        R$ ${(faturamentoTotal - despesasTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </div>
      <div class="metric-label">Lucro Líquido</div>
    </div>
  </div>

  <h2>📅 Atendimentos</h2>
  <div class="card">
    <div class="metric">
      <div class="metric-value">${totalAgendamentos}</div>
      <div class="metric-label">Total de Agendamentos</div>
    </div>
    <div class="metric">
      <div class="metric-value positive">${agendamentosFinalizados}</div>
      <div class="metric-label">Finalizados</div>
    </div>
    <div class="metric">
      <div class="metric-value negative">${agendamentosCancelados}</div>
      <div class="metric-label">Cancelados</div>
    </div>
    <div class="metric">
      <div class="metric-value warning">${agendamentosFaltas}</div>
      <div class="metric-label">Faltas</div>
    </div>
    <div class="metric">
      <div class="metric-value">${totalAgendamentos > 0 ? ((agendamentosFinalizados / totalAgendamentos) * 100).toFixed(1) : 0}%</div>
      <div class="metric-label">Taxa de Comparecimento</div>
    </div>
  </div>

  <h2>👥 Pacientes & Exames</h2>
  <div class="card">
    <div class="metric">
      <div class="metric-value positive">${qtdNovosPacientes}</div>
      <div class="metric-label">Novos Pacientes</div>
    </div>
    <div class="metric">
      <div class="metric-value">${totalExames}</div>
      <div class="metric-label">Exames Realizados</div>
    </div>
  </div>

  <h2>📈 Receitas por Categoria</h2>
  <table>
    <thead>
      <tr>
        <th>Categoria</th>
        <th>Valor</th>
        <th>%</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(receitasPorCategoria)
        .sort(([,a], [,b]) => b - a)
        .map(([cat, valor]) => `
          <tr>
            <td>${cat.charAt(0).toUpperCase() + cat.slice(1)}</td>
            <td>R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${faturamentoTotal > 0 ? ((valor / faturamentoTotal) * 100).toFixed(1) : 0}%</td>
          </tr>
        `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Relatório gerado automaticamente pelo sistema EloLab em ${new Date().toLocaleString('pt-BR')}</p>
  </div>
</body>
</html>
    `

    // Buscar admins para enviar o relatório
    const { data: admins } = await supabase
      .from('profiles')
      .select('email, nome')
      .eq('ativo', true)

    const adminEmails = admins?.filter(a => a.email)?.map(a => a.email) || []

    if (adminEmails.length === 0) {
      console.log('Nenhum admin para enviar relatório')
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum destinatário configurado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let errorCount = 0

    for (const email of adminEmails) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'EloLab <onboarding@resend.dev>',
            to: [email],
            subject: `📊 Relatório Mensal - ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} - EloLab`,
            html: htmlReport,
          }),
        })

        if (emailRes.ok) {
          successCount++
          console.log(`✅ Relatório enviado para ${email}`)
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
      tipo: 'relatorio',
      nome: 'Relatório Mensal',
      status: errorCount === 0 ? 'sucesso' : 'parcial',
      registros_processados: 1,
      registros_sucesso: successCount,
      registros_erro: errorCount,
      detalhes: {
        periodo: { inicio: mesAnteriorInicio, fim: mesAnteriorFim },
        metricas: {
          faturamento_total: faturamentoTotal,
          despesas_total: despesasTotal,
          lucro: faturamentoTotal - despesasTotal,
          agendamentos: totalAgendamentos,
          novos_pacientes: qtdNovosPacientes,
          exames: totalExames,
        },
        destinatarios: adminEmails,
      },
      duracao_ms: duration,
      executado_por: 'cron',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Relatório mensal gerado e enviado',
        stats: {
          periodo: nomeMes,
          emails_enviados: successCount,
          emails_erro: errorCount,
          duracao_ms: duration,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro na função monthly-report-generator:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
