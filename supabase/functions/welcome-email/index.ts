import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Só o agendador. Sem isso, qualquer visitante disparava e-mails de
  // boas-vindas em massa em nome da clínica, queimando o domínio.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const appUrl = Deno.env.get('APP_URL') || 'https://app.elolab.com.br'
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY não configurada')
    }

    // Find users created in the last 10 minutes without a welcome email sent
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    
    const { data: newUsers, error } = await supabase
      .from('profiles')
      .select('id, nome, email, created_at')
      .gte('created_at', tenMinAgo)
      .order('created_at', { ascending: false })

    if (error) throw error

    let sentCount = 0

    for (const user of (newUsers || [])) {
      if (!user.email) continue

      // Get user's clinica_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('clinica_id')
        .eq('id', user.id)
        .single()

      if (!profile?.clinica_id) continue

      // Check if welcome email already sent
      const { data: existing } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('destinatario_id', user.id)
        .eq('tipo', 'email')
        .like('assunto', '%Bem-vindo%')
        .limit(1)

      if (existing && existing.length > 0) continue

      // Send via Brevo
      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'EloLab', email: 'noreply@elolab.com.br' },
          to: [{ email: user.email, name: user.nome || 'Usuário' }],
          subject: '🎉 Bem-vindo ao EloLab!',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #0ea5e9, #6366f1); border-radius: 12px;">
                <h1 style="color: white; margin: 0; font-size: 28px;">EloLab</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Sistema de Gestão Clínica</p>
              </div>
              
              <div style="padding: 30px 0;">
                <h2 style="color: #1e293b; margin-bottom: 16px;">Olá, ${user.nome || 'Usuário'}! 👋</h2>
                
                <p style="color: #475569; line-height: 1.6;">
                  Seja bem-vindo(a) ao <strong>EloLab</strong>! Estamos muito felizes em tê-lo(a) conosco.
                </p>
                
                <p style="color: #475569; line-height: 1.6;">
                  Com o EloLab, você terá acesso a um sistema completo de gestão clínica que inclui:
                </p>
                
                <ul style="color: #475569; line-height: 2;">
                  <li>📅 Agendamento inteligente</li>
                  <li>📋 Prontuário eletrônico completo</li>
                  <li>💰 Gestão financeira integrada</li>
                  <li>🔬 Módulo laboratorial</li>
                  <li>📊 Relatórios e analytics avançados</li>
                  <li>📱 Notificações via WhatsApp</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${appUrl}/dashboard"
                     style="background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                    Acessar o Sistema
                  </a>
                </div>
                
                <p style="color: #475569; line-height: 1.6;">
                  Se precisar de ajuda, estamos à disposição!
                </p>
                
                <p style="color: #94a3b8; font-size: 12px; margin-top: 40px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                  © ${new Date().getFullYear()} EloLab — Sistema de Gestão Clínica
                </p>
              </div>
            </div>
          `,
        }),
      })

      if (emailResponse.ok) {
        // Log in notification queue
        await supabase.from('notification_queue').insert({
          tipo: 'email',
          clinica_id: profile.clinica_id,
          assunto: '🎉 Bem-vindo ao EloLab!',
          conteudo: 'E-mail de boas-vindas enviado',
          destinatario_id: user.id,
          destinatario_email: user.email,
          destinatario_nome: user.nome,
          status: 'enviado',
          enviado_em: new Date().toISOString(),
        })
        sentCount++
      } else {
        console.error('Brevo error:', await emailResponse.text())
      }
    }

    // Log
    await supabase.from('automation_logs').insert({
      tipo: 'email',
      nome: 'E-mail de Boas-Vindas',
      status: 'sucesso',
      registros_processados: newUsers?.length || 0,
      registros_sucesso: sentCount,
    })

    console.info(`Welcome emails sent: ${sentCount}`)

    return new Response(
      JSON.stringify({ success: true, sent: sentCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Welcome email error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})