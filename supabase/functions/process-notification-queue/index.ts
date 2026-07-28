import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface NotificationItem {
  id: string
  tipo: string
  destinatario_email: string | null
  destinatario_telefone: string | null
  destinatario_nome: string | null
  assunto: string | null
  conteudo: string
  tentativas: number
  max_tentativas: number
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

    const { data: pendentes, error: fetchError } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pendente')
      .lte('agendado_para', new Date().toISOString())
      .lt('tentativas', 3)
      .order('agendado_para', { ascending: true })
      .limit(50)

    if (fetchError) {
      throw new Error(`Erro ao buscar fila: ${fetchError.message}`)
    }

    if (!pendentes || pendentes.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhuma notificação pendente', processados: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let errorCount = 0

    for (const notif of pendentes as NotificationItem[]) {
      await supabase
        .from('notification_queue')
        .update({ status: 'enviando', tentativas: notif.tentativas + 1 })
        .eq('id', notif.id)

      try {
        if (notif.tipo === 'email' && notif.destinatario_email) {
          const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'api-key': brevoApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              sender: { name: 'EloLab Clínica', email: 'noreply@elolab.com.br' },
              to: [{ email: notif.destinatario_email, name: notif.destinatario_nome || '' }],
              subject: notif.assunto || 'Notificação EloLab',
              htmlContent: notif.conteudo.replace(/\n/g, '<br>'),
            }),
          })

          if (emailRes.ok) {
            await supabase
              .from('notification_queue')
              .update({ status: 'enviado', enviado_em: new Date().toISOString() })
              .eq('id', notif.id)
            successCount++
          } else {
            const result = await emailRes.json()
            const novasTentativas = notif.tentativas + 1
            await supabase
              .from('notification_queue')
              .update({
                status: novasTentativas >= notif.max_tentativas ? 'erro' : 'pendente',
                erro_mensagem: JSON.stringify(result),
              })
              .eq('id', notif.id)
            errorCount++
          }
        } else if (notif.tipo === 'whatsapp' && notif.destinatario_telefone) {
          // WhatsApp via Evolution API
          const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
          const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

          if (evolutionUrl && evolutionKey) {
            // TODO: implement WhatsApp sending via Evolution API
            console.log(`⏭️ WhatsApp para ${notif.destinatario_telefone} - implementação pendente`)
          }

          await supabase
            .from('notification_queue')
            .update({ status: 'erro', erro_mensagem: 'Integração WhatsApp pendente de configuração completa' })
            .eq('id', notif.id)
          errorCount++
        } else {
          errorCount++
        }
      } catch (err) {
        const novasTentativas = notif.tentativas + 1
        await supabase
          .from('notification_queue')
          .update({
            status: novasTentativas >= notif.max_tentativas ? 'erro' : 'pendente',
            erro_mensagem: String(err),
          })
          .eq('id', notif.id)
        errorCount++
      }
    }

    const duration = Date.now() - startTime

    await supabase.from('automation_logs').insert({
      tipo: 'fila_notificacao',
      nome: 'Processamento de Fila de Notificações',
      status: errorCount === 0 ? 'sucesso' : successCount === 0 ? 'erro' : 'parcial',
      registros_processados: pendentes.length,
      registros_sucesso: successCount,
      registros_erro: errorCount,
      duracao_ms: duration,
      executado_por: 'cron',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Fila processada',
        stats: { processados: pendentes.length, sucesso: successCount, erros: errorCount, duracao_ms: duration },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro na função process-notification-queue:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})