import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronForbidden, cronOrUserOk, clinicaDoChamador } from '../_shared/cronAuth.ts'
import { corsPadrao } from '../_shared/cors.ts';
import { sendBrandedBrevoRequest } from '../_shared/brevoEmail.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST' || !cronOrUserOk(req)) return cronForbidden(corsHeaders)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const clinicaDoUsuario = await clinicaDoChamador(req, supabase)
    if (!clinicaDoUsuario) return cronForbidden(corsHeaders)

    const { lancamento_id, chave_idempotencia } = await req.json()

    if (!lancamento_id) {
      return new Response(
        JSON.stringify({ error: 'lancamento_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch lancamento (transaction) details
    const { data: lancamento, error: lancError } = await supabase
      .from('lancamentos')
      .select(`
        id, tipo, valor, descricao, forma_pagamento, data, clinica_id,
        created_at, paciente_id,
        pacientes!inner(nome, email)
      `)
      .eq('id', lancamento_id)
      .eq('clinica_id', clinicaDoUsuario)
      .single()

    if (lancError || !lancamento) {
      return new Response(
        JSON.stringify({ error: 'Lançamento não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only send receipts for income (receita) transactions
    if (lancamento.tipo !== 'receita') {
      return new Response(
        JSON.stringify({ success: true, emailStatus: 'not_applicable', message: 'Recibo apenas para receitas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: automacaoRecibo, error: erroAutomacao } = await supabase
      .from('automation_settings')
      .select('ativo')
      .eq('clinica_id', lancamento.clinica_id)
      .eq('chave', 'recibo_pagamento')
      .maybeSingle()
    if (erroAutomacao) throw new Error('Não foi possível confirmar a configuração de recibos da clínica.')
    if (automacaoRecibo?.ativo === false) {
      return new Response(
        JSON.stringify({ success: true, emailStatus: 'disabled', message: 'O envio automático de recibos está desativado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const paciente = Array.isArray(lancamento.pacientes) ? lancamento.pacientes[0] : lancamento.pacientes
    if (!paciente) {
      return new Response(JSON.stringify({ success: true, emailStatus: 'not_available', message: 'Paciente não encontrado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!paciente?.email) {
      return new Response(
        JSON.stringify({ success: true, emailStatus: 'not_available', message: 'Paciente sem email configurado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (typeof chave_idempotencia !== 'string' || !chave_idempotencia.trim()) {
      throw new Error('Não foi possível identificar o pagamento que deve constar no recibo.')
    }

    // A chave de idempotência identifica a operação. O lote aponta todas as
    // formas gravadas na mesma transação, inclusive pagamentos divididos.
    const { data: pagamentoBase, error: erroPagamentoBase } = await supabase
      .from('pagamentos')
      .select('lote_pagamento_id, created_at')
      .eq('lancamento_id', lancamento.id)
      .eq('chave_idempotencia', chave_idempotencia.trim())
      .maybeSingle()
    if (erroPagamentoBase) throw new Error('Não foi possível localizar o pagamento para montar o recibo.')
    if (pagamentoBase?.lote_pagamento_id == null || !pagamentoBase.created_at) {
      throw new Error('Pagamento confirmado, mas os dados do recibo não foram encontrados.')
    }

    const { data: pagamentosDaOperacao, error: erroPagamentos } = await supabase
      .from('pagamentos')
      .select('forma_pagamento, valor')
      .eq('lancamento_id', lancamento.id)
      .eq('lote_pagamento_id', pagamentoBase.lote_pagamento_id)
      .is('estornado_em', null)
      .order('forma_pagamento')
    if (erroPagamentos || !pagamentosDaOperacao?.length) {
      throw new Error('Não foi possível recuperar os valores deste pagamento para emitir o recibo.')
    }

    const valorRecebido = pagamentosDaOperacao.reduce((total, pagamento) => total + Number(pagamento.valor || 0), 0)
    if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) {
      throw new Error('O valor recebido não é válido para emitir o recibo.')
    }

    // Fetch clinic config
    const { data: clinicConfig } = await supabase
      .from('configuracoes_clinica')
      .select('*')
      .eq('clinica_id', lancamento.clinica_id)
      .single()

    const clinicaNome = clinicConfig?.nome_fantasia || 'Clínica Médica'
    const clinicaCnpj = clinicConfig?.cnpj || '00.000.000/0001-00'

    // Fetch email template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('categoria', 'recibo_pagamento')
      .eq('tipo', 'email')
      .eq('ativo', true)
      .single()

    // Format currency
    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valorRecebido)

    // Format date
    const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(pagamentoBase.created_at))

    // Format forma_pagamento
    const formasPagamento: Record<string, string> = {
      dinheiro: 'Dinheiro',
      pix: 'PIX',
      credito: 'Cartão de Crédito',
      debito: 'Cartão de Débito',
      transferencia: 'Transferência Bancária',
      cheque: 'Cheque',
    }
    const valoresPorForma = new Map<string, number>()
    pagamentosDaOperacao.forEach((pagamento) => {
      const forma = pagamento.forma_pagamento
      valoresPorForma.set(forma, (valoresPorForma.get(forma) || 0) + Number(pagamento.valor || 0))
    })
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    const formaPagamentoFormatada = Array.from(valoresPorForma, ([forma, valor]) =>
      `${formasPagamento[forma] || forma}: ${moeda.format(valor)}`
    ).join(' · ')

    let emailSuccess = false

    // === SEND EMAIL ===
    if (brevoApiKey && template) {
      try {
        const conteudo = template.conteudo
          .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
          .replace(/\{\{valor\}\}/g, valorFormatado)
          .replace(/\{\{forma_pagamento\}\}/g, formaPagamentoFormatada)
          .replace(/\{\{data\}\}/g, dataFormatada)
          .replace(/\{\{descricao\}\}/g, lancamento.descricao || 'Consulta/Serviço')
          .replace(/\{\{clinica_nome\}\}/g, clinicaNome)
          .replace(/\{\{clinica_cnpj\}\}/g, clinicaCnpj)

        const assunto = (template.assunto || 'Recibo de Pagamento')
          .replace(/\{\{clinica_nome\}\}/g, clinicaNome)

        const emailRes = await sendBrandedBrevoRequest({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: clinicaNome, email: 'noreply@elolab.com.br' },
            to: [{ email: paciente.email, name: paciente.nome }],
            subject: assunto,
            htmlContent: conteudo.replace(/\n/g, '<br>'),
          }),
        })

        if (emailRes.ok) {
          emailSuccess = true
          await supabase.from('notification_queue').insert({
            tipo: 'email',
            clinica_id: lancamento.clinica_id,
            destinatario_id: lancamento.paciente_id,
            destinatario_email: paciente.email,
            destinatario_nome: paciente.nome,
            assunto,
            conteudo,
            dados_extras: { lancamento_id: lancamento.id, valor: valorRecebido, tipo_notificacao: 'recibo' },
            status: 'enviado',
            enviado_em: new Date().toISOString(),
          })
        } else {
          console.error('Falha no envio Brevo (HTTP ' + emailRes.status + ').')
        }
      } catch (emailError) {
        console.error('Email error:', emailError)
      }
    }

    await supabase.from('automation_logs').insert({
      tipo: 'recibo_pagamento',
      nome: 'Envio de Recibo de Pagamento',
      status: emailSuccess ? 'sucesso' : 'erro',
      registros_processados: 1,
      registros_sucesso: emailSuccess ? 1 : 0,
      registros_erro: emailSuccess ? 0 : 1,
        detalhes: { email: emailSuccess, valor: valorRecebido, forma: formaPagamentoFormatada },
      executado_por: 'event',
    })

    return new Response(
      JSON.stringify({
        success: true,
        emailStatus: emailSuccess ? 'sent' : (!brevoApiKey || !template ? 'not_configured' : 'failed'),
        message: emailSuccess ? 'Recibo enviado' : (!brevoApiKey || !template ? 'O envio de e-mail não está configurado.' : 'O serviço de e-mail não aceitou o recibo.'),
        stats: { email: emailSuccess, valor: valorRecebido },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
