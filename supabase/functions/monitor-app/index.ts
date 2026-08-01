// Vigia se o app está no ar e avisa quando o estado muda.
//
// Em 01/08 o app ficou fora do ar e a descoberta foi por acaso. Sem isto, quem
// descobre é o cliente ligando — e até lá a clínica passou a manhã sem
// conseguir marcar consulta.
//
// LIMITE HONESTO: roda dentro do Supabase. Se o Supabase cair, isto cai junto e
// nada avisa. Cobre a queda do site, que é o caso mais provável — o site muda
// toda semana, o banco quase nunca — e foi exatamente o que aconteceu.
//
// Avisa só na VIRADA: caiu, um e-mail; voltou, um e-mail. Aviso a cada 5
// minutos vira ruído e para de ser lido justamente quando importa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALVO = Deno.env.get('APP_URL') ?? 'https://app.elolab.com.br'
const AVISAR = Deno.env.get('MONITOR_EMAIL') ?? 'contato@elolab.com.br'
const TIMEOUT_MS = 15_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ─── Verifica ───
  const inicio = Date.now()
  let ok = false
  let statusCode: number | null = null
  let erro: string | null = null

  try {
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS)
    const resp = await fetch(ALVO, {
      method: 'GET',
      redirect: 'follow',
      signal: controle.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    clearTimeout(relogio)
    statusCode = resp.status
    // Só 2xx conta como no ar. O 404 de 01/08 vinha com o domínio respondendo
    // normalmente: "responde" não é o mesmo que "funciona".
    ok = resp.ok
    if (!ok) erro = `respondeu ${resp.status}`
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
    if (erro.includes('abort')) erro = `sem resposta em ${TIMEOUT_MS / 1000}s`
  }

  const ms = Date.now() - inicio

  // ─── Mudou de estado? ───
  const { data: anterior } = await supabase
    .from('monitor_saude')
    .select('ok')
    .eq('alvo', ALVO)
    .order('verificado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Primeira verificação da vida: se está no ar, não avisa nada. Se já nasce
  // fora do ar, avisa — é notícia.
  const estadoAnterior = anterior?.ok ?? true
  const virada = estadoAnterior !== ok

  await supabase.from('monitor_saude').insert({
    alvo: ALVO, ok, status_code: statusCode, erro, ms, virada,
  })

  // ─── Avisa ───
  let avisado = false
  if (virada) {
    const chave = Deno.env.get('BREVO_API_KEY')
    if (!chave) {
      console.error('MONITOR: estado mudou e BREVO_API_KEY não está configurada')
    } else {
      const caiu = !ok
      const assunto = caiu
        ? `🔴 EloLab fora do ar — ${ALVO}`
        : `🟢 EloLab voltou — ${ALVO}`
      const corpo = caiu
        ? `<p>O app parou de responder.</p>
           <p><b>Endereço:</b> ${ALVO}<br>
              <b>Resultado:</b> ${erro ?? 'sem resposta'}<br>
              <b>Momento:</b> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
           <p>Enquanto isso o sistema segue acessível em
              <a href="https://elolab.pages.dev">elolab.pages.dev</a>.</p>
           <p>Onde olhar: Cloudflare → Workers e Páginas → elolab → Domínios personalizados,
              e o registro <code>app</code> em DNS.</p>`
        : `<p>O app voltou a responder normalmente.</p>
           <p><b>Endereço:</b> ${ALVO}<br>
              <b>Resposta:</b> ${statusCode} em ${ms} ms<br>
              <b>Momento:</b> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>`

      try {
        const envio = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': chave, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'EloLab', email: 'noreply@elolab.com.br' },
            to: [{ email: AVISAR }],
            subject: assunto,
            htmlContent: corpo,
          }),
        })
        avisado = envio.ok
        if (!envio.ok) console.error('MONITOR: Brevo recusou', await envio.text())
      } catch (e) {
        console.error('MONITOR: falha ao enviar aviso', e)
      }
    }

    // A virada também entra no registro de automação, onde o painel já olha.
    await supabase.from('automation_logs').insert({
      tipo: 'monitor',
      nome: ok ? 'App voltou ao ar' : 'App fora do ar',
      status: ok ? 'sucesso' : 'erro',
      erro_mensagem: erro,
      duracao_ms: ms,
      detalhes: { alvo: ALVO, status_code: statusCode, aviso_enviado: avisado },
    })
  }

  return new Response(
    JSON.stringify({ ok, status_code: statusCode, ms, virada, aviso_enviado: avisado }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
