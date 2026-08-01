// Backup semanal do banco.
//
// A versão anterior nunca guardou um único arquivo em quatro meses. Mandava o
// JSON para o bucket `medical-attachments`, que só aceita imagem e PDF, e
// `application/json` era recusado toda vez. Pior: respondia HTTP 200 com
// `success: true` mesmo com a subida falhando, então nada acusou — o registro
// dizia "erro" e ninguém lia.
//
// Três defeitos, os três corrigidos aqui:
//   1. destino errado          -> bucket `backups`, privado, que aceita JSON
//   2. falha respondia sucesso -> falhar na subida devolve 500
//   3. lista fixa de 17 tabelas -> vem do banco, 74 tabelas, e tabela nova
//                                  entra sozinha
//
// Havia ainda um `.limit(10000)` por tabela que cortava em silêncio. Agora a
// leitura é paginada e, se ainda assim algo ficar de fora, o backup é marcado
// como incompleto em vez de parecer inteiro.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGINA = 1000
const TETO_POR_TABELA = 200_000
const GUARDAR_DIAS = 90

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Só o agendador. Antes bastava a chave anon, que é pública: qualquer
  // visitante conseguia disparar backups à vontade.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders)

  const inicio = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const responder = (corpo: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const registrar = async (campos: Record<string, unknown>) => {
    await supabase.from('automation_logs').insert({
      tipo: 'backup', nome: 'Backup Automático', ...campos,
    })
  }

  try {
    // ─── Que tabelas copiar ───
    const { data: tabelas, error: erroLista } = await supabase.rpc('tabelas_para_backup')
    if (erroLista || !Array.isArray(tabelas) || tabelas.length === 0) {
      const msg = erroLista?.message ?? 'lista de tabelas vazia'
      await registrar({ status: 'erro', erro_mensagem: `não consegui listar as tabelas: ${msg}` })
      return responder({ error: msg }, 500)
    }

    const dados: Record<string, unknown[]> = {}
    const falhas: string[] = []
    const truncadas: string[] = []
    let total = 0

    for (const tabela of tabelas as string[]) {
      const linhas: unknown[] = []
      let de = 0

      while (de < TETO_POR_TABELA) {
        const { data, error } = await supabase
          .from(tabela).select('*').range(de, de + PAGINA - 1)

        if (error) { falhas.push(`${tabela}: ${error.message}`); break }
        if (!data || data.length === 0) break

        linhas.push(...data)
        if (data.length < PAGINA) break
        de += PAGINA
      }

      if (linhas.length >= TETO_POR_TABELA) truncadas.push(tabela)
      dados[tabela] = linhas
      total += linhas.length
    }

    const completo = falhas.length === 0 && truncadas.length === 0

    const backup = {
      version: '3.0',
      createdAt: new Date().toISOString(),
      type: 'automatic',
      // Um backup que não sabe se está inteiro não serve para decidir nada na
      // hora de restaurar.
      completo,
      collections: dados,
      metadata: {
        totalRecords: total,
        tablesCount: Object.keys(dados).length,
        tabelasComFalha: falhas,
        tabelasTruncadas: truncadas,
      },
    }

    const nome = `backup-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const corpo = JSON.stringify(backup)

    const { error: erroSubida } = await supabase.storage
      .from('backups')
      .upload(nome, new Blob([corpo], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: false,
      })

    const duracao = Date.now() - inicio

    // Subida falhou = NÃO existe backup. Responder 200 aqui foi exatamente o
    // que escondeu o problema por quatro meses.
    if (erroSubida) {
      await registrar({
        status: 'erro', duracao_ms: duracao,
        erro_mensagem: `não consegui guardar o arquivo: ${erroSubida.message}`,
        detalhes: { arquivo: nome, tamanho_bytes: corpo.length },
      })
      return responder({ error: erroSubida.message, arquivo_guardado: false }, 500)
    }

    // Confere que o arquivo está lá. Uma subida que responde ok e não deixa
    // objeto é o mesmo que não ter backup.
    const { data: conferencia } = await supabase.storage
      .from('backups').list('', { search: nome, limit: 1 })

    if (!conferencia || conferencia.length === 0) {
      await registrar({
        status: 'erro', duracao_ms: duracao,
        erro_mensagem: 'a subida respondeu ok mas o arquivo não está no bucket',
        detalhes: { arquivo: nome },
      })
      return responder({ error: 'arquivo não encontrado após subir', arquivo_guardado: false }, 500)
    }

    // ─── Retenção ───
    const limite = new Date(Date.now() - GUARDAR_DIAS * 86400_000).toISOString()
    let apagados = 0
    try {
      const { data: antigos } = await supabase.storage.from('backups').list('', { limit: 1000 })
      const vencidos = (antigos ?? [])
        .filter((o) => o.created_at && o.created_at < limite)
        .map((o) => o.name)
      if (vencidos.length > 0) {
        await supabase.storage.from('backups').remove(vencidos)
        apagados = vencidos.length
      }
    } catch (e) {
      console.error('limpeza de backups antigos falhou:', e)
    }

    await registrar({
      status: completo ? 'sucesso' : 'parcial',
      registros_processados: total,
      registros_sucesso: total,
      duracao_ms: duracao,
      erro_mensagem: completo ? null
        : [...falhas, ...truncadas.map((t) => `${t}: truncada`)].join('; '),
      detalhes: {
        arquivo: nome,
        tabelas: Object.keys(dados).length,
        registros: total,
        tamanho_bytes: corpo.length,
        completo,
        antigos_apagados: apagados,
      },
    })

    return responder({
      success: true,
      arquivo_guardado: true,
      arquivo: nome,
      completo,
      registros: total,
      tabelas: Object.keys(dados).length,
      duracao_ms: duracao,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('auto-backup:', msg)
    await registrar({ status: 'erro', erro_mensagem: msg }).catch(() => {})
    return responder({ error: msg, arquivo_guardado: false }, 500)
  }
})
