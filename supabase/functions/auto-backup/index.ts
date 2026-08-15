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

/**
 * Teto de arquivos copiados por execução. Existe para uma clínica com dez anos
 * de exame não deixar a função rodando até o timeout e não guardar nada — o
 * que seria pior que copiar uma parte. Ao bater no teto, `completo` fica falso
 * e o manifesto mostra o que entrou.
 */
const TETO_DE_ARQUIVOS = 5_000

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

    // ─── Os ARQUIVOS ───
    //
    // O backup copiava as 78 tabelas e deixava de fora os arquivos: exame em
    // PDF, foto do paciente, documento assinado. Restaurar devolvia a linha
    // "anexo tal" apontando para um arquivo que não existe mais — o pior tipo
    // de falha, porque quem restaura acha que recuperou tudo e só descobre o
    // buraco quando um paciente pede um exame antigo.
    //
    // A cópia é feita aqui, no servidor, porque o navegador não aguenta o
    // volume de uma clínica com anos de exame.
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
    const arquivos: Array<{ bucket: string; caminho: string; bytes: number }> = []
    const falhasDeArquivo: string[] = []

    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      for (const b of buckets ?? []) {
        // O bucket de backup não se copia a si mesmo: cada semana dobraria.
        if (b.id === 'backups' || b.id === 'backups-arquivos') continue

        const paraVisitar: string[] = ['']
        while (paraVisitar.length > 0 && arquivos.length < TETO_DE_ARQUIVOS) {
          const pasta = paraVisitar.shift()!
          const { data: itens, error } = await supabase.storage
            .from(b.id).list(pasta, { limit: 1000 })
          if (error) { falhasDeArquivo.push(`${b.id}/${pasta}: ${error.message}`); continue }

          for (const item of itens ?? []) {
            const caminho = pasta ? `${pasta}/${item.name}` : item.name
            // Sem metadata é pasta: entra na fila para ser visitada.
            if (!item.metadata) { paraVisitar.push(caminho); continue }
            if (arquivos.length >= TETO_DE_ARQUIVOS) break

            const { data: blob, error: erroBaixa } = await supabase.storage
              .from(b.id).download(caminho)
            if (erroBaixa || !blob) {
              falhasDeArquivo.push(`${b.id}/${caminho}: ${erroBaixa?.message ?? 'download vazio'}`)
              continue
            }

            // Bucket separado: `backups` só aceita application/json, e essa
            // restrição protege o lugar onde ficam os backups.
            const { error: erroCopia } = await supabase.storage
              .from('backups-arquivos')
              .upload(`${carimbo}/${b.id}/${caminho}`, blob, {
                contentType: blob.type || 'application/octet-stream',
                upsert: true,
              })
            if (erroCopia) {
              falhasDeArquivo.push(`${b.id}/${caminho}: ${erroCopia.message}`)
              continue
            }
            arquivos.push({ bucket: b.id, caminho, bytes: blob.size })
          }
        }
      }
    } catch (e) {
      falhasDeArquivo.push(`varredura interrompida: ${(e as Error).message}`)
    }

    // O manifesto entra no JSON: na hora de restaurar, é ele que diz o que
    // deveria existir. Arquivo copiado sem manifesto é arquivo que ninguém
    // sabe de onde veio.
    ;(backup as Record<string, unknown>).arquivos = {
      bucket: 'backups-arquivos',
      pasta: carimbo,
      total: arquivos.length,
      bytes: arquivos.reduce((s, a) => s + a.bytes, 0),
      falhas: falhasDeArquivo,
      lista: arquivos,
    }
    if (falhasDeArquivo.length > 0) (backup as Record<string, unknown>).completo = false

    const nome = `backup-auto-${carimbo}.json`
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
        .filter((o) => o.metadata && o.created_at && o.created_at < limite)
        .map((o) => o.name)
      if (vencidos.length > 0) {
        await supabase.storage.from('backups').remove(vencidos)
        apagados = vencidos.length
      }

      // As pastas de arquivo também vencem. Sem isto o bucket só cresce, e a
      // cópia dos anexos passaria a ser o maior custo de armazenamento da
      // clínica sem ninguém perceber.
      const { data: pastas } = await supabase.storage
        .from('backups-arquivos').list('', { limit: 1000 })
      for (const pasta of pastas ?? []) {
        if (pasta.metadata) continue
        // O nome da pasta é o carimbo ISO com ':' e '.' trocados por '-'.
        const quando = pasta.name.replace(
          /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/,
          '$1T$2:$3:$4.$5Z',
        )
        if (quando >= limite) continue
        const { data: dentro } = await supabase.storage
          .from('backups-arquivos').list(pasta.name, { limit: 1000 })
        const caminhos = (dentro ?? []).map((o) => `${pasta.name}/${o.name}`)
        if (caminhos.length > 0) await supabase.storage.from('backups-arquivos').remove(caminhos)
      }
    } catch (e) {
      console.error('limpeza de backups antigos falhou:', e)
    }

    await registrar({
      status: completo && falhasDeArquivo.length === 0 ? 'sucesso' : 'parcial',
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
        arquivos_copiados: arquivos.length,
        arquivos_com_falha: falhasDeArquivo.length,
        // A mensagem no log, e não só no JSON: quem investiga uma falha de
        // backup não tem o arquivo em mãos, tem a tabela de log.
        arquivos_erros: falhasDeArquivo.slice(0, 5),
        completo: completo && falhasDeArquivo.length === 0,
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
