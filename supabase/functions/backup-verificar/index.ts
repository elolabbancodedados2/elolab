/**
 * Confere se o último backup vale alguma coisa.
 *
 * Um backup que nunca foi conferido é uma hipótese, não uma garantia. Este
 * sistema tinha três arquivos guardados e ninguém jamais tinha aberto nenhum
 * deles: se o JSON estivesse truncado, com uma tabela vazia ou com metade dos
 * pacientes, só se descobriria no dia em que restaurar fosse a única saída.
 *
 * A conferência é SÓ LEITURA. Ela abre o arquivo mais recente e responde três
 * perguntas:
 *
 *   1. dá para ler? (JSON válido, com as chaves esperadas)
 *   2. as contagens batem com o banco de hoje?
 *   3. os arquivos do manifesto existem mesmo no bucket?
 *
 * A pergunta 2 tem uma sutileza: o banco de HOJE tem mais linhas que o backup
 * de ontem, e isso é normal. O que denuncia problema é o contrário — backup
 * com MENOS linhas do que deveria na data em que foi feito, ou tabela que
 * existe no banco e está zerada no arquivo.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!cronSecretOk(req)) {
    return responder({ error: 'não autorizado' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ─── O arquivo mais recente ───
    const { data: lista, error: erroLista } = await supabase.storage
      .from('backups').list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })

    if (erroLista) return responder({ ok: false, erro: `não consegui listar: ${erroLista.message}` }, 500)

    const arquivo = (lista ?? []).find((o) => o.name.endsWith('.json'))
    if (!arquivo) {
      return responder({ ok: false, erro: 'NENHUM backup encontrado no bucket' }, 500)
    }

    const { data: blob, error: erroBaixa } = await supabase.storage
      .from('backups').download(arquivo.name)
    if (erroBaixa || !blob) {
      return responder({ ok: false, arquivo: arquivo.name, erro: `não consegui baixar: ${erroBaixa?.message}` }, 500)
    }

    let backup: Record<string, any>
    try {
      backup = JSON.parse(await blob.text())
    } catch (e) {
      // Arquivo ilegível é o pior caso: existe, ocupa espaço e dá falsa
      // segurança.
      return responder({
        ok: false, arquivo: arquivo.name,
        erro: `o arquivo existe mas NÃO é um JSON válido: ${(e as Error).message}`,
      }, 500)
    }

    const colecoes = backup.collections ?? {}
    const problemas: string[] = []
    const avisos: string[] = []

    if (!backup.version || !backup.createdAt) problemas.push('faltam version/createdAt')
    if (backup.completo === false) {
      problemas.push(`o próprio backup se declara incompleto: ${JSON.stringify(backup.metadata?.tabelasComFalha ?? [])}`)
    }

    // ─── Contagens ───
    const { data: tabelas } = await supabase.rpc('tabelas_para_backup')
    const nomes = (tabelas ?? []) as string[]
    const comparacao: Array<{ tabela: string; no_arquivo: number; no_banco: number }> = []

    for (const tabela of nomes) {
      const { count, error } = await supabase
        .from(tabela).select('*', { count: 'exact', head: true })
      if (error) continue

      const noBanco = count ?? 0
      const noArquivo = Array.isArray(colecoes[tabela]) ? colecoes[tabela].length : -1

      if (noArquivo < 0) {
        problemas.push(`${tabela}: ausente do arquivo (o banco tem ${noBanco})`)
        continue
      }
      // Tabela com dado no banco e zerada no backup é o sintoma clássico de
      // permissão negada durante a cópia.
      if (noBanco > 0 && noArquivo === 0) {
        problemas.push(`${tabela}: ZERADA no arquivo, ${noBanco} no banco`)
      } else if (noArquivo < noBanco) {
        // Normal quando o backup é de ontem e a clínica trabalhou hoje.
        avisos.push(`${tabela}: ${noArquivo} no arquivo, ${noBanco} agora (+${noBanco - noArquivo} depois do backup)`)
      }
      comparacao.push({ tabela, no_arquivo: noArquivo, no_banco: noBanco })
    }

    // ─── Os arquivos do manifesto ───
    const manifesto = backup.arquivos ?? null
    let arquivosConferidos = 0
    let arquivosFaltando = 0

    if (manifesto?.lista?.length) {
      for (const item of manifesto.lista as Array<{ bucket: string; caminho: string }>) {
        const destino = `${manifesto.pasta}/${item.bucket}/${item.caminho}`
        const pasta = destino.slice(0, destino.lastIndexOf('/'))
        const nome = destino.slice(destino.lastIndexOf('/') + 1)
        const { data: achado } = await supabase.storage
          .from(manifesto.bucket ?? 'backups-arquivos').list(pasta, { search: nome, limit: 1 })
        if (achado && achado.length > 0) arquivosConferidos++
        else { arquivosFaltando++; problemas.push(`arquivo do manifesto não está no bucket: ${destino}`) }
      }
    }

    const ok = problemas.length === 0

    // `nome` é NOT NULL e ficou de fora na primeira versão: o insert falhava e
    // o erro era descartado, então a função dizia ter registrado e não tinha.
    // É o mesmo vício que este projeto passou a sessão inteira corrigindo.
    const { error: erroLog } = await supabase.from('automation_logs').insert({
      tipo: 'backup-verificar',
      nome: 'Conferência do Backup',
      status: ok ? 'sucesso' : 'erro',
      erro_mensagem: ok ? null : problemas.slice(0, 5).join('; '),
      detalhes: {
        arquivo: arquivo.name,
        criado_em: backup.createdAt,
        tabelas_conferidas: comparacao.length,
        registros_no_arquivo: comparacao.reduce((s, c) => s + c.no_arquivo, 0),
        arquivos_conferidos: arquivosConferidos,
        arquivos_faltando: arquivosFaltando,
        problemas: problemas.slice(0, 10),
        avisos: avisos.slice(0, 5),
      },
    })
    if (erroLog) console.error('não consegui registrar no log:', erroLog.message)

    return responder({
      ok,
      arquivo: arquivo.name,
      criado_em: backup.createdAt,
      tabelas_conferidas: comparacao.length,
      registros_no_arquivo: comparacao.reduce((s, c) => s + c.no_arquivo, 0),
      arquivos: { conferidos: arquivosConferidos, faltando: arquivosFaltando },
      problemas,
      avisos: avisos.slice(0, 10),
    }, ok ? 200 : 500)
  } catch (e) {
    return responder({ ok: false, erro: (e as Error).message }, 500)
  }
})
