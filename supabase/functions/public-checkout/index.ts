import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checarRateLimit, clientIp } from '../_shared/rateLimit.ts'
import { corsPadrao } from '../_shared/cors.ts';
import { sendBrandedBrevoRequest } from '../_shared/brevoEmail.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};

const MP_API_BASE = 'https://api.mercadopago.com'

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Cria conta + checkout MP é caro. 10 req/min por IP é folgado para uso
    // legítimo (mesma pessoa corrige e reenvia) e barra script.
    const limitado = await checarRateLimit(supabase, {
      chave: `checkout:${clientIp(req)}`,
      limite: 10,
      janelaSegundos: 60,
    })
    if (limitado) {
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas — aguarde alguns segundos.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { plano_id, plano_slug, nome, email, telefone, clinica, mode = 'trial' } = body
    const normalizedPlanSlug = typeof plano_slug === 'string' ? plano_slug.trim().toLowerCase() : ''
    const normalizedName = typeof nome === 'string' ? nome.trim().slice(0, 120) : ''
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : ''
    const normalizedPhone = typeof telefone === 'string' ? telefone.trim().slice(0, 30) : null
    const normalizedClinic = typeof clinica === 'string' ? clinica.trim().slice(0, 160) : null
    const safeNameForEmail = normalizedName.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char] || char)

    if (!normalizedName || !normalizedEmail || !normalizedPlanSlug) {
      return new Response(
        JSON.stringify({ error: 'Nome, e-mail e plano são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return new Response(
        JSON.stringify({ error: 'Informe um e-mail valido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (mode !== 'trial' && mode !== 'buy') {
      return new Response(
        JSON.stringify({ error: 'Modo de cadastro invalido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (mode === 'trial') {
      return new Response(
        JSON.stringify({ error: 'O teste gratuito agora exige cadastro no EloLab, cartão e autorização da assinatura recorrente no checkout seguro.' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve plan server-side by slug to avoid depender do ID no cliente
    let { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('*')
      .ilike('slug', normalizedPlanSlug)
      .eq('ativo', true)
      .maybeSingle()

    if ((!plano || planoError) && plano_id) {
      const fallbackResult = await supabase
        .from('planos')
        .select('*')
        .eq('id', plano_id)
        .eq('ativo', true)
        .maybeSingle()

      plano = fallbackResult.data
      planoError = fallbackResult.error
    }

    if (planoError || !plano) {
      console.error('Plano não encontrado no public-checkout:', { plano_id, plano_slug: normalizedPlanSlug, planoError })
      return new Response(
        JSON.stringify({ error: 'Plano não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const planoValor = Number(plano.valor)
    if (!Number.isFinite(planoValor) || planoValor <= 0) {
      return new Response(
        JSON.stringify({ error: 'O plano selecionado não possui um valor válido' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a unique invitation code
    const inviteCode = crypto.randomUUID().slice(0, 8).toUpperCase()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Store the pending registration
    const { data: registro, error: regError } = await supabase
      .from('registros_pendentes')
      .insert({
        nome: normalizedName,
        email: normalizedEmail,
        telefone: normalizedPhone,
        clinica: normalizedClinic,
        plano_id: plano.id,
        plano_slug: plano.slug,
        codigo_convite: inviteCode,
        expires_at: expiresAt.toISOString(),
        status: mode === 'buy' ? 'aguardando_pagamento' : 'pendente',
      })
      .select()
      .single()

    if (regError) {
      console.error('Erro ao criar registro:', regError)
      return new Response(
        JSON.stringify({ error: 'Erro ao processar registro' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let checkoutUrl = null
    let checkoutError: string | null = null
    let emailSent = false
    let emailError: string | null = null

    // MODE: BUY — create Mercado Pago Checkout Pro with all payment methods
    if (mode === 'buy' && !mpAccessToken) {
      checkoutError = 'Mercado Pago não configurado (MERCADOPAGO_ACCESS_TOKEN ausente)'
      console.error(checkoutError)
    }

    if (mode === 'buy' && mpAccessToken) {
      try {
        const appUrl = 'https://app.elolab.com.br'
        const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`

        // Assinatura recorrente: o checkout do preapproval coleta o meio de
        // pagamento e gera as cobranças mensais automaticamente.
        const subscriptionPayload = {
          status: 'pending',
          payer_email: normalizedEmail,
          reason: `${plano.nome} - Assinatura EloLab`,
          external_reference: registro.id,
          back_url: `${appUrl}/auth?status=success&id=${registro.id}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: plano.frequencia === 'anual' ? 'years' : 'months',
            transaction_amount: planoValor,
            currency_id: 'BRL',
            start_date: new Date().toISOString(),
          },
          notification_url: webhookUrl,
        }

        console.log('Creating recurring subscription:', JSON.stringify(subscriptionPayload))

        const preapprovalRes = await fetch(`${MP_API_BASE}/preapproval`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mpAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(subscriptionPayload),
        })

        if (preapprovalRes.ok) {
          const preapprovalData = await preapprovalRes.json()
          checkoutUrl = preapprovalData.init_point || preapprovalData.sandbox_init_point
          console.log('Recurring subscription created:', preapprovalData.id)

          // Save reference
          const { error: assinaturaError } = await supabase
            .from('assinaturas_mercadopago')
            .insert({
                mp_preapproval_id: preapprovalData.id,
              nome_plano: plano.nome,
              descricao: plano.descricao || `Plano ${plano.nome} EloLab`,
              valor: planoValor,
               frequencia: plano.frequencia || 'mensal',
              checkout_url: checkoutUrl,
              status: 'pendente',
              detalhes: {
                registro_pendente_id: registro.id,
                payer_email: normalizedEmail,
                payer_name: normalizedName,
                 checkout_reference: registro.id,
                  checkout_type: 'preapproval',
              },
            })
          if (assinaturaError) {
            console.error('Erro ao registrar assinatura local:', assinaturaError)
            // Não deixe uma assinatura externa ativa sem vínculo local.
            await fetch(`${MP_API_BASE}/preapproval/${preapprovalData.id}`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'cancelled' }),
            })
            throw new Error('Não foi possível registrar a assinatura. Tente novamente.')
          }

          const { error: registroUpdateError } = await supabase
            .from('registros_pendentes')
            .update({ mp_payment_id: preapprovalData.id })
            .eq('id', registro.id)
          if (registroUpdateError) {
            // O webhook ainda consegue localizar o registro pelo external_reference,
            // mas a falha precisa ser visível nos logs para reconciliação manual.
            console.error('Assinatura criada, mas não foi possível vincular o ID local:', registroUpdateError)
          }
        } else {
          const errText = await preapprovalRes.text()
          console.error('MP preference error:', errText)
          checkoutError = `Mercado Pago retornou erro ${preapprovalRes.status}. Tente novamente em instantes.`
        }
      } catch (mpErr) {
        console.error('Erro Mercado Pago:', mpErr)
        checkoutError = mpErr instanceof Error
          ? `Erro ao conectar com Mercado Pago: ${mpErr.message}`
          : 'Erro ao conectar com Mercado Pago'
      }
    }

    // Only send welcome email with invite code for TRIAL mode
    // For BUY mode, the email is sent after payment approval via webhook
    if (mode === 'trial' && !brevoApiKey) {
      emailError = 'Brevo não configurado (BREVO_API_KEY ausente). Use o código mostrado abaixo manualmente.'
      console.error(emailError)
    }

    if (brevoApiKey && mode === 'trial') {
      const appUrl = 'https://app.elolab.com.br'
      const activationLink = `${appUrl}/auth?codigo=${inviteCode}&email=${encodeURIComponent(normalizedEmail)}&plano=${encodeURIComponent(plano.slug)}`

      try {
        const emailRes = await sendBrandedBrevoRequest({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'EloLab', email: 'noreply@elolab.com.br' },
            to: [{ email: normalizedEmail, name: normalizedName }],
            subject: `🎁 Seu teste grátis de ${plano.trial_dias || 3} dias começou! Código de ativação`,
            htmlContent: `
              <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #1a9a7a, #14b8a6); padding: 40px 30px; text-align: center;">
                  <h1 style="color: #ffffff; font-size: 28px; margin: 0;">Bem-vindo ao EloLab!</h1>
                  <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin-top: 8px;">Teste Grátis de ${plano.trial_dias || 3} Dias</p>
                </div>
                <div style="padding: 30px;">
                  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Olá, <strong>${safeNameForEmail}</strong>!</p>
                  <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Seu período de teste gratuito de <strong>${plano.trial_dias || 3} dias</strong> começa assim que você criar sua conta. Use o código abaixo:</p>
                  <div style="background: #f0fdf4; border: 2px dashed #1a9a7a; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                    <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Seu código de ativação</p>
                    <p style="color: #1a9a7a; font-size: 36px; font-weight: 800; letter-spacing: 4px; margin: 0;">${inviteCode}</p>
                  </div>
                  <div style="text-align: center; margin: 24px 0;">
                    <a href="${activationLink}" style="display: inline-block; background: linear-gradient(135deg, #1a9a7a, #14b8a6); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Criar Minha Conta →
                    </a>
                  </div>
                  <p style="color: #9ca3af; font-size: 12px; text-align: center;">Este código expira em 7 dias. Após o teste, o plano custa R$ ${Number(plano.valor).toFixed(2)}/mês.</p>
                </div>
                <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">EloLab — Gestão Inteligente para Clínicas</p>
                </div>
              </div>
            `,
          }),
        })

        if (emailRes.ok) {
          emailSent = true
        } else {
          console.error('Falha no envio Brevo (HTTP ' + emailRes.status + ').')
          emailError = `Falha ao enviar email (HTTP ${emailRes.status}). Use o código abaixo manualmente.`
        }
      } catch (emailErr) {
        console.error('Erro ao enviar email:', emailErr)
        emailError = emailErr instanceof Error
          ? `Erro ao enviar email: ${emailErr.message}`
          : 'Erro ao enviar email'
      }
    }

    // Determine final response — success only if critical step succeeded
    const buySuccess = mode === 'buy' && !!checkoutUrl
    const trialSuccess = mode === 'trial' && (emailSent || !brevoApiKey)
    const partialSuccess = mode === 'trial' && !emailSent && !!brevoApiKey
    // (mode buy without checkoutUrl = failure: client paid nothing, no MP redirect)

    if (mode === 'buy' && !checkoutUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: checkoutError || 'Não foi possível iniciar o checkout. Tente novamente.',
          mode,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        message: buySuccess
          ? 'Redirecionando para pagamento. Após aprovação, você receberá o código de ativação por e-mail.'
          : partialSuccess
            ? `Registro criado, mas houve problema ao enviar email. Use o código de ativação: ${inviteCode}`
            : 'Registro criado! Verifique seu e-mail para o código de ativação.',
        checkout_url: checkoutUrl,
        email_sent: mode === 'trial' ? emailSent : null,
        email_error: emailError,
        // Mostrar o código se trial e email não foi enviado, para o cliente não ficar sem
        ...(mode === 'trial' && (!emailSent || !brevoApiKey || partialSuccess) ? { invite_code: inviteCode } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro no public-checkout:', error)
    return new Response(
      JSON.stringify({ error: 'Não foi possível processar o cadastro. Tente novamente mais tarde.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
