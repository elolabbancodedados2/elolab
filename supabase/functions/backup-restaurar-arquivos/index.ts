/**
 * Devolve os arquivos de um backup para onde eles moravam.
 *
 * O backup passou a COPIAR os anexos, mas nada os devolvia: restaurar o banco
 * trazia a linha "anexo tal" apontando para um arquivo guardado em
 * `backups-arquivos` que nunca voltava para `medical-attachments`. Meio ciclo
 * não serve — quem restaura precisa do exame, não da localização dele.
 *
 * ─── DUAS DECISÕES ─────────────────────────────────────────────────────────
 *
 * 1. Por padrão NÃO sobrescreve. Restaurar arquivo é operação de emergência,
 *    e emergência é onde se erra: se o arquivo já está lá, o de agora vale
 *    mais que o de trinta dias atrás. Sobrescrever exige pedir de propósito.
 *
 * 2. Sempre em SECO primeiro (`simular: true` é o padrão). A resposta diz o
 *    que faria, sem fazer. Quem restaura arquivo está num dia ruim; ver a
 *    lista antes evita transformar um problema em dois.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface Pedido {
  /** Carimbo da pasta em backups-arquivos. Vazio = a mais recente. */
  pasta?: string
  /** Padrão true: só diz o que faria. */
  simular?: boolean
  /** Padrão false: arquivo que já existe no destino é preservado. */
  sobrescrever?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!cronSecretOk(req)) return responder({ error: 'não autorizado' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const corpo: Pedido = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const simular = corpo.simular !== false
    const sobrescrever = corpo.sobrescrever === true

    // ─── Qual pasta ───
    let pasta = corpo.pasta
    if (!pasta) {
      const { data: pastas, error } = await supabase.storage
        .from('backups-arquivos').list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
      if (error) return responder({ ok: false, erro: `não consegui listar: ${error.message}` }, 500)
      pasta = (pastas ?? []).find((p) => !p.metadata)?.name
      if (!pasta) return responder({ ok: false, erro: 'nenhuma pasta de arquivos encontrada' }, 404)
    }

    // ─── Tudo que está guardado nessa pasta ───
    const encontrados: Array<{ bucket: string; caminho: string }> = []
    const filaDePastas: string[] = [pasta]

    while (filaDePastas.length > 0) {
      const atual = filaDePastas.shift()!
      const { data: itens, error } = await supabase.storage
        .from('backups-arquivos').list(atual, { limit: 1000 })
      if (error) continue

      for (const item of itens ?? []) {
        const completo = `${atual}/${item.name}`
        if (!item.metadata) { filaDePastas.push(completo); continue }
        // O caminho é <carimbo>/<bucket>/<resto...>
        const semCarimbo = completo.slice(pasta.length + 1)
        const barra = semCarimbo.indexOf('/')
        if (barra < 1) continue
        encontrados.push({
          bucket: semCarimbo.slice(0, barra),
          caminho: semCarimbo.slice(barra + 1),
        })
      }
    }

    const resultado = {
      devolvidos: [] as string[],
      ja_existiam: [] as string[],
      falharam: [] as string[],
    }

    for (const a of encontrados) {
      const nome = a.caminho.slice(a.caminho.lastIndexOf('/') + 1)
      const dirDestino = a.caminho.includes('/') ? a.caminho.slice(0, a.caminho.lastIndexOf('/')) : ''

      if (!sobrescrever) {
        const { data: existe } = await supabase.storage
          .from(a.bucket).list(dirDestino, { search: nome, limit: 1 })
        if (existe && existe.length > 0) {
          resultado.ja_existiam.push(`${a.bucket}/${a.caminho}`)
          continue
        }
      }

      if (simular) { resultado.devolvidos.push(`${a.bucket}/${a.caminho}`); continue }

      const { data: blob, error: erroBaixa } = await supabase.storage
        .from('backups-arquivos').download(`${pasta}/${a.bucket}/${a.caminho}`)
      if (erroBaixa || !blob) {
        resultado.falharam.push(`${a.bucket}/${a.caminho}: ${erroBaixa?.message ?? 'download vazio'}`)
        continue
      }

      const { error: erroSubida } = await supabase.storage
        .from(a.bucket).upload(a.caminho, blob, {
          contentType: blob.type || 'application/octet-stream',
          upsert: sobrescrever,
        })
      if (erroSubida) {
        resultado.falharam.push(`${a.bucket}/${a.caminho}: ${erroSubida.message}`)
        continue
      }
      resultado.devolvidos.push(`${a.bucket}/${a.caminho}`)
    }

    if (!simular) {
      const { error: erroLog } = await supabase.from('automation_logs').insert({
        tipo: 'backup-restaurar-arquivos',
        nome: 'Restauração de Arquivos',
        status: resultado.falharam.length === 0 ? 'sucesso' : 'parcial',
        erro_mensagem: resultado.falharam.slice(0, 5).join('; ') || null,
        detalhes: {
          pasta,
          sobrescrever,
          devolvidos: resultado.devolvidos.length,
          ja_existiam: resultado.ja_existiam.length,
          falharam: resultado.falharam.length,
        },
      })
    if (erroLog) console.error('não consegui registrar no log:', erroLog.message)
    }

    return responder({
      ok: resultado.falharam.length === 0,
      simulacao: simular,
      pasta,
      encontrados: encontrados.length,
      devolvidos: resultado.devolvidos.length,
      ja_existiam: resultado.ja_existiam.length,
      falharam: resultado.falharam.length,
      detalhe: {
        devolvidos: resultado.devolvidos.slice(0, 50),
        ja_existiam: resultado.ja_existiam.slice(0, 50),
        falharam: resultado.falharam.slice(0, 20),
      },
      ...(simular ? { aviso: 'Nada foi gravado. Envie {"simular": false} para devolver de verdade.' } : {}),
    })
  } catch (e) {
    return responder({ ok: false, erro: (e as Error).message }, 500)
  }
})
