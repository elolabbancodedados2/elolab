import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || ''
const TWILIO_SMS_FROM = Deno.env.get('TWILIO_SMS_FROM') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

interface NotificacaoAgendada {
  id: string
  paciente_id: string
  tipo: 'whatsapp' | 'sms' | 'email'
  conteudo: string
  data_envio: string
  status: 'pendente' | 'enviado' | 'falha' | 'cancelado'
  tentativas: number
  telefone_whatsapp: string | null
  clinica_id: string
}

/** Format phone number to E.164 format for Twilio */
function formatPhoneE164(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '')
  // If less than 11 digits, add Brazil country code
  if (cleaned.length < 11) {
    return `+55${cleaned}`
  }
  // If starts with 0, remove it and add country code
  if (cleaned.startsWith('0')) {
    return `+55${cleaned.substring(1)}`
  }
  // Otherwise add country code prefix
  return `+55${cleaned}`
}

/** Send WhatsApp message via Twilio */
async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.warn('Twilio WhatsApp not configured')
    return false
  }

  try {
    const toNumber = formatPhoneE164(to)
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_FROM,
          To: `whatsapp:${toNumber}`,
          Body: message,
        }).toString(),
      }
    )

    if (!response.ok) {
      console.error('WhatsApp send failed:', await response.text())
      return false
    }

    console.log('WhatsApp sent successfully')
    return true
  } catch (e) {
    console.error('Error sending WhatsApp:', e)
    return false
  }
}


/** Send Email via Supabase email service */
async function sendEmail(to: string, subject: string, message: string): Promise<boolean> {
  try {
    // Use Supabase auth email sending
    const { error } = await supabase.auth.admin.sendRawEmail({
      email: to,
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Email send failed:', error)
      return false
    }

    console.log('Email sent successfully')
    return true
  } catch (e) {
    console.error('Error sending email:', e)
    return false
  }
}

Deno.serve(async (req) => {
  try {
    // Get current time
    const now = new Date().toISOString()

    // Fetch pending notifications that are due to be sent
    const { data: notificacoes, error: fetchError } = await supabase
      .from('notificacoes_agendadas')
      .select('*')
      .eq('status', 'pendente')
      .lte('data_envio', now)
      .lt('tentativas', 3) // Max 3 retries
      .order('data_envio', { ascending: true })
      .limit(50) // Process max 50 per batch

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError)
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (!notificacoes || notificacoes.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No pending notifications' }), {
        status: 200,
      })
    }

    let sucessos = 0
    let falhas = 0

    for (const notif of notificacoes as NotificacaoAgendada[]) {
      try {
        let enviado = false

        if (notif.tipo === 'whatsapp' && notif.telefone_whatsapp) {
          enviado = await sendWhatsApp(notif.telefone_whatsapp, notif.conteudo)
        } else if (notif.tipo === 'email') {
          // Get patient email
          const { data: paciente } = await supabase
            .from('pacientes')
            .select('email')
            .eq('id', notif.paciente_id)
            .maybeSingle()

          if (paciente?.email) {
            enviado = await sendEmail(
              paciente.email,
              'Lembrete de Retorno',
              notif.conteudo
            )
          }
        }

        // Update notification status
        const newStatus = enviado ? 'enviado' : 'falha'
        const newTentativas = notif.tentativas + 1

        await supabase
          .from('notificacoes_agendadas')
          .update({
            status: newStatus,
            tentativas: newTentativas,
          })
          .eq('id', notif.id)

        if (enviado) {
          sucessos++
        } else {
          falhas++
        }
      } catch (e) {
        console.error(`Error processing notification ${notif.id}:`, e)
        falhas++

        // Update as failed
        await supabase
          .from('notificacoes_agendadas')
          .update({
            status: 'falha',
            tentativas: notif.tentativas + 1,
          })
          .eq('id', notif.id)
      }
    }

    return new Response(
      JSON.stringify({
        processed: notificacoes.length,
        sucessos,
        falhas,
        message: `Processadas ${notificacoes.length} notificações`,
      }),
      { status: 200 }
    )
  } catch (e) {
    console.error('Edge function error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
