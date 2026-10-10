import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsPadrao } from '../_shared/cors.ts'
import { sendBrandedBrevoRequest } from '../_shared/brevoEmail.ts'

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

Deno.serve(async (req) => {
  const headers = { ...corsPadrao(req), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers })

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Acesso não autorizado.' }, { status: 401, headers })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Acesso não autorizado.' }, { status: 401, headers })

  const { data: isPlatformAdmin, error: roleError } = await authClient.rpc('is_platform_admin')
  if (roleError || isPlatformAdmin !== true) return Response.json({ error: 'Ação restrita à administração da plataforma.' }, { status: 403, headers })

  const brevoApiKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoApiKey) return Response.json({ error: 'O envio de e-mail não está configurado.' }, { status: 503, headers })

  let registrationId: string
  try {
    const body = await req.json()
    registrationId = body?.registration_id
    if (typeof registrationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
      return Response.json({ error: 'Registro inválido.' }, { status: 400, headers })
    }
  } catch {
    return Response.json({ error: 'Informe um registro válido.' }, { status: 400, headers })
  }

  // A RPC exige o JWT de plataforma e estende o prazo do convite selecionado.
  const { data: resend, error: resendError } = await authClient.rpc('resend_activation_manual', { _registro_id: registrationId })
  if (resendError) return Response.json({ error: 'Não foi possível preparar o convite.' }, { status: 400, headers })
  if (!resend?.success) return Response.json({ error: resend?.error || 'Este convite não pode ser reenviado.' }, { status: 409, headers })

  const service = createClient(url, serviceKey)
  const { data: registration, error: registrationError } = await service
    .from('registros_pendentes')
    .select('id,nome,email,codigo_convite,plano_slug,plano_id,user_id,status,reminder_count')
    .eq('id', registrationId)
    .eq('status', 'pago')
    .is('user_id', null)
    .maybeSingle()
  if (registrationError || !registration) return Response.json({ error: 'O cadastro já foi ativado ou não está mais disponível.' }, { status: 409, headers })

  const { data: plan } = await service.from('planos').select('nome').eq('id', registration.plano_id).maybeSingle()
  const planName = plan?.nome || registration.plano_slug || 'EloLab'
  const appUrl = 'https://app.elolab.com.br/auth'
  const activationLink = `${appUrl}?codigo=${encodeURIComponent(registration.codigo_convite)}&email=${encodeURIComponent(registration.email)}&plano=${encodeURIComponent(registration.plano_slug || '')}`
  const name = escapeHtml(registration.nome)
  const safePlanName = escapeHtml(planName)
  const safeCode = escapeHtml(registration.codigo_convite)

  let emailResponse: Response
  try {
    emailResponse = await sendBrandedBrevoRequest({
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'EloLab', email: 'noreply@elolab.com.br' },
        to: [{ email: registration.email, name: registration.nome }],
        subject: `Ative sua conta EloLab · ${planName}`,
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px"><h1>Seu acesso ao EloLab está pronto</h1><p>Olá, <strong>${name}</strong>. Seu pagamento do plano <strong>${safePlanName}</strong> foi confirmado.</p><p>Use seu código de ativação:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${safeCode}</p><p><a href="${activationLink}">Ativar minha conta</a></p><p style="color:#666;font-size:12px">Se você não solicitou este cadastro, ignore esta mensagem.</p></div>`,
      }),
    })
  } catch {
    return Response.json({ error: 'Não foi possível conectar ao serviço de e-mail. Tente novamente.' }, { status: 502, headers })
  }
  if (!emailResponse.ok) {
    console.error('[resend-pending-registration] e-mail recusado pelo provedor:', emailResponse.status)
    return Response.json({ error: 'O serviço de e-mail recusou o envio. Tente novamente.' }, { status: 502, headers })
  }

  const { error: updateError } = await service.from('registros_pendentes')
    .update({ reminder_count: Number(registration.reminder_count || 0) + 1 })
    .eq('id', registrationId)
  if (updateError) console.error('[resend-pending-registration] falha ao registrar o lembrete enviado:', updateError.message)

  return Response.json({ success: true, email: registration.email }, { headers })
})
