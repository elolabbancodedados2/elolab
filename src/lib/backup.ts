/**
 * Backup manual — o que a clínica baixa pelo navegador.
 *
 * ─── O QUE ESTAVA ERRADO ───────────────────────────────────────────────────
 *
 * 1. Cobria 17 tabelas de 78. Ficavam de fora `pagamentos`, `lancamento_itens`,
 *    `triagens`, `anexos_prontuario`, `prontuario_adendos`, `prontuario_acessos`,
 *    `consentimentos_lgpd`, `caixa_diario`, `movimentacoes_estoque`, `retornos`,
 *    `resultados_laboratorio` e o `audit_log`. Quem restaurasse perdia
 *    pagamento, triagem, anexo de prontuário, adendo e a trilha de LGPD.
 *
 * 2. `select('*')` sem paginar. O Supabase corta em 1000 linhas e NÃO avisa:
 *    clínica com mais de mil pacientes baixava metade do arquivo achando que
 *    estava inteiro.
 *
 * 3. Erro de tabela virava `console.warn` e a coleção ficava `[]`. O arquivo
 *    saía com aparência de backup bom. É a pior falha possível aqui: só se
 *    descobre no dia da restauração.
 *
 * ─── COMO FICOU ────────────────────────────────────────────────────────────
 *
 * Mesma lista e mesmo formato (versão 3.0) do backup automático do servidor
 * (`supabase/functions/auto-backup`), para os dois arquivos serem
 * intercambiáveis. A lista vem da RPC `tabelas_para_backup()` — tabela nova
 * entra sozinha, sem ninguém lembrar de atualizar array nenhum.
 *
 * E o arquivo diz de si mesmo se está inteiro: `completo`, `tabelasComFalha` e
 * `tabelasTruncadas`. Um backup que não sabe se está inteiro não serve para
 * decidir nada na hora de restaurar.
 */
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/** O Supabase devolve no máximo 1000 por requisição. */
const PAGINA = 1000;

/**
 * Teto por tabela no navegador. Existe porque o arquivo é montado na memória
 * da aba: passar disso trava o navegador da recepção. Quando bate no teto a
 * tabela entra em `tabelasTruncadas` — em vez de sair curta em silêncio.
 */
const TETO_POR_TABELA = 50_000;

export interface ResultadoDaTabela {
  tabela: string;
  linhas: number;
  erro?: string;
  truncada?: boolean;
}

export interface BackupData {
  version: string;
  createdAt: string;
  type: 'manual' | 'automatic';
  /** Falso quando alguma tabela falhou ou bateu no teto. */
  completo: boolean;
  collections: Record<string, any[]>;
  metadata: {
    totalRecords: number;
    tablesCount: number;
    tabelasComFalha: string[];
    tabelasTruncadas: string[];
    /** Compatibilidade com arquivos 2.0 lidos por telas antigas. */
    collectionCounts: Record<string, number>;
  };
}

/** Lista de tabelas do backup. Mesma fonte que o servidor usa. */
export async function tabelasDoBackup(): Promise<string[]> {
  const { data, error } = await (supabase as any).rpc('tabelas_para_backup');
  if (error) {
    throw new Error(`Não consegui listar as tabelas do backup: ${error.message}`);
  }
  const nomes = (data ?? [])
    .map((t: any) => (typeof t === 'string' ? t : t?.tabelas_para_backup))
    .filter(Boolean) as string[];
  if (nomes.length === 0) {
    throw new Error('A lista de tabelas do backup voltou vazia.');
  }
  return nomes;
}

/** Lê uma tabela inteira, de mil em mil. */
async function lerTabela(tabela: string): Promise<{ linhas: any[]; erro?: string; truncada: boolean }> {
  const linhas: any[] = [];
  let de = 0;

  while (de < TETO_POR_TABELA) {
    const { data, error } = await (supabase as any)
      .from(tabela)
      .select('*')
      .range(de, de + PAGINA - 1);

    // RLS que nega devolve lista vazia, não erro. Erro aqui é problema de
    // verdade (tabela sumiu, coluna quebrada, rede) e precisa aparecer.
    if (error) return { linhas, erro: error.message, truncada: false };
    if (!data || data.length === 0) break;

    linhas.push(...data);
    if (data.length < PAGINA) break;
    de += PAGINA;
  }

  return { linhas, truncada: linhas.length >= TETO_POR_TABELA };
}

export async function createBackup(
  aoProgredir?: (feitas: number, total: number, tabela: string) => void,
): Promise<{ backup: BackupData; resultados: ResultadoDaTabela[] }> {
  const tabelas = await tabelasDoBackup();

  const collections: Record<string, any[]> = {};
  const collectionCounts: Record<string, number> = {};
  const resultados: ResultadoDaTabela[] = [];
  const falhas: string[] = [];
  const truncadas: string[] = [];
  let total = 0;

  for (let i = 0; i < tabelas.length; i++) {
    const tabela = tabelas[i];
    aoProgredir?.(i, tabelas.length, tabela);

    const { linhas, erro, truncada } = await lerTabela(tabela);

    collections[tabela] = linhas;
    collectionCounts[tabela] = linhas.length;
    total += linhas.length;

    if (erro) falhas.push(`${tabela}: ${erro}`);
    if (truncada) truncadas.push(tabela);
    resultados.push({ tabela, linhas: linhas.length, erro, truncada });
  }

  aoProgredir?.(tabelas.length, tabelas.length, '');

  const backup: BackupData = {
    version: '3.0',
    createdAt: new Date().toISOString(),
    type: 'manual',
    completo: falhas.length === 0 && truncadas.length === 0,
    collections,
    metadata: {
      totalRecords: total,
      tablesCount: tabelas.length,
      tabelasComFalha: falhas,
      tabelasTruncadas: truncadas,
      collectionCounts,
    },
  };

  return { backup, resultados };
}

export async function downloadBackup(
  aoProgredir?: (feitas: number, total: number, tabela: string) => void,
): Promise<{ backup: BackupData; resultados: ResultadoDaTabela[] }> {
  const { backup, resultados } = await createBackup(aoProgredir);

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // "parcial" no nome do arquivo: daqui a um ano ninguém vai abrir o JSON para
  // conferir o campo `completo` antes de restaurar.
  a.download = `elolab-backup${backup.completo ? '' : '-PARCIAL'}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { backup, resultados };
}

export function validateBackup(data: any): { valid: boolean; error?: string; backup?: BackupData } {
  if (!data) return { valid: false, error: 'Arquivo vazio ou inválido' };
  if (!data.version || !data.createdAt || !data.collections) {
    return { valid: false, error: 'Formato de backup inválido' };
  }
  if (typeof data.collections !== 'object' || Array.isArray(data.collections)) {
    return { valid: false, error: 'Coleções de dados inválidas' };
  }

  // Arquivos 2.0 não têm `completo` nem os contadores novos. São aceitos, mas
  // normalizados para o resto do código não precisar saber a versão.
  const colecoes = data.collections as Record<string, any[]>;
  const contagens: Record<string, number> = {};
  let total = 0;
  for (const [tabela, linhas] of Object.entries(colecoes)) {
    if (!Array.isArray(linhas)) {
      return { valid: false, error: `A coleção "${tabela}" não é uma lista.` };
    }
    contagens[tabela] = linhas.length;
    total += linhas.length;
  }

  const backup: BackupData = {
    version: data.version,
    createdAt: data.createdAt,
    type: data.type === 'automatic' ? 'automatic' : 'manual',
    completo: data.completo ?? true,
    collections: colecoes,
    metadata: {
      totalRecords: data.metadata?.totalRecords ?? total,
      tablesCount: data.metadata?.tablesCount ?? Object.keys(colecoes).length,
      tabelasComFalha: data.metadata?.tabelasComFalha ?? [],
      tabelasTruncadas: data.metadata?.tabelasTruncadas ?? [],
      collectionCounts: data.metadata?.collectionCounts ?? contagens,
    },
  };

  return { valid: true, backup };
}

/**
 * Ordem de restauração: pai antes de filho.
 *
 * Vem do banco (`ordem_de_restauracao()`, ordenação topológica pelas chaves
 * estrangeiras reais) em vez de uma lista escrita à mão — a lista antiga tinha
 * 17 nomes e o banco tem 78, então 61 tabelas entravam em ordem aleatória e
 * quebravam por chave estrangeira.
 */
async function ordemDeRestauracao(presentes: string[]): Promise<string[]> {
  const { data, error } = await (supabase as any).rpc('ordem_de_restauracao');
  if (error || !Array.isArray(data) || data.length === 0) {
    // Sem a ordem do banco, restaurar às cegas produziria erro de chave
    // estrangeira em cascata e um banco meio preenchido.
    throw new Error(
      `Não consegui obter a ordem de restauração do banco${error ? `: ${error.message}` : ''}. ` +
      'Restaurar sem ela deixaria o banco pela metade.',
    );
  }
  const ordem = (data ?? [])
    .map((t: any) => (typeof t === 'string' ? t : t?.ordem_de_restauracao))
    .filter(Boolean) as string[];

  const noBackup = new Set(presentes);
  const ordenadas = ordem.filter(t => noBackup.has(t));
  // Tabela que existe no arquivo mas não na ordem (banco mais novo que o
  // arquivo, ou o contrário) vai para o fim em vez de sumir.
  const sobrando = presentes.filter(t => !ordem.includes(t));
  return [...ordenadas, ...sobrando];
}

/**
 * Tabelas que a restauração NUNCA escreve.
 *
 * Não são dados da clínica: são o chão em que o SaaS pisa. Restaurar
 * `platform_admins` ou `user_roles` a partir de um JSON — que é um arquivo de
 * texto que qualquer um edita antes de subir — seria entregar a plataforma a
 * quem tem o botão de restaurar. `clinicas` fica de fora pelo mesmo motivo:
 * um backup antigo desligaria a regra de pagamento e mudaria o nome da clínica
 * sem ninguém pedir.
 *
 * O RLS continua sendo a defesa real; esta lista existe para o acidente, que é
 * o caso comum: restaurar um backup de três meses atrás e voltar os papéis de
 * todo mundo junto.
 */
export const TABELAS_QUE_NAO_SE_RESTAURA = new Set([
  'platform_admins', 'platform_impersonation_log', 'plataforma_estado',
  'admin_acoes', 'user_roles', 'profiles', 'clinicas',
  'planos', 'assinaturas_plano', 'registros_pendentes',
  'monitor_saude', 'cid10',
  // Trilhas de auditoria: reescrever histórico de acesso é pior que perdê-lo.
  'audit_log', 'prontuario_acessos',
  'lgpd_access_request_log', 'lgpd_consent_log', 'lgpd_deletion_log',
]);

export interface ResultadoRestauracao {
  success: boolean;
  restored: number;
  porTabela: ResultadoDaTabela[];
  falhas: string[];
  /** Tabelas presentes no arquivo que foram deliberadamente puladas. */
  puladas: string[];
  /** Linhas cuja clínica foi trocada para a do usuário logado. */
  remapeadas: number;
}

/** De que clínica é este arquivo. `null` quando não dá para saber. */
export function clinicaDoBackup(backup: BackupData): string | null {
  for (const linhas of Object.values(backup.collections)) {
    for (const linha of linhas ?? []) {
      const id = (linha as any)?.clinica_id;
      if (id) return String(id);
    }
  }
  return null;
}

export async function restoreBackup(
  backup: BackupData,
  overwrite = true,
  clinicaDestino?: string | null,
  aoProgredir?: (feitas: number, total: number, tabela: string) => void,
): Promise<ResultadoRestauracao> {
  const todas = Object.keys(backup.collections).filter(
    t => Array.isArray(backup.collections[t]) && backup.collections[t].length > 0,
  );
  const puladas = todas.filter(t => TABELAS_QUE_NAO_SE_RESTAURA.has(t));
  const presentes = todas.filter(t => !TABELAS_QUE_NAO_SE_RESTAURA.has(t));
  const ordem = await ordemDeRestauracao(presentes);

  const porTabela: ResultadoDaTabela[] = [];
  const falhas: string[] = [];
  let restored = 0;
  let remapeadas = 0;

  for (let t = 0; t < ordem.length; t++) {
    const tabela = ordem[t];
    aoProgredir?.(t, ordem.length, tabela);

    const originais = backup.collections[tabela];
    if (!originais?.length) continue;

    // A clínica de destino é sempre a de quem está restaurando. Um backup
    // carrega o `clinica_id` de origem; restaurado noutra clínica sem trocar,
    // ele criaria linhas invisíveis (o RLS não as mostra a ninguém) ou seria
    // recusado — e nos dois casos a pessoa não entenderia o porquê.
    const linhas = clinicaDestino
      ? originais.map(l => {
          if (l && typeof l === 'object' && 'clinica_id' in l && l.clinica_id !== clinicaDestino) {
            remapeadas++;
            return { ...l, clinica_id: clinicaDestino };
          }
          return l;
        })
      : originais;

    let inseridas = 0;
    let erroDaTabela: string | undefined;

    // Em lotes: um upsert de 20 mil linhas estoura o limite da requisição.
    for (let i = 0; i < linhas.length; i += PAGINA) {
      const lote = linhas.slice(i, i + PAGINA);
      const { error } = await (supabase as any)
        .from(tabela)
        .upsert(lote, { onConflict: 'id', ignoreDuplicates: !overwrite });

      if (error) { erroDaTabela = error.message; break; }
      inseridas += lote.length;
    }

    restored += inseridas;
    if (erroDaTabela) falhas.push(`${tabela}: ${erroDaTabela}`);
    porTabela.push({ tabela, linhas: inseridas, erro: erroDaTabela });
  }

  aoProgredir?.(ordem.length, ordem.length, '');

  // O antigo devolvia `success: true` sempre, inclusive quando nada entrou.
  return { success: falhas.length === 0, restored, porTabela, falhas, puladas, remapeadas };
}

export async function getStorageStats(): Promise<{ used: string; collections: Record<string, number> }> {
  const tabelas = await tabelasDoBackup();
  const collectionCounts: Record<string, number> = {};

  for (const tabela of tabelas) {
    const { count, error } = await (supabase as any)
      .from(tabela)
      .select('*', { count: 'exact', head: true });
    if (!error && count) collectionCounts[tabela] = count;
  }

  const total = Object.values(collectionCounts).reduce((a, b) => a + b, 0);
  return { used: `${total.toLocaleString('pt-BR')} registros`, collections: collectionCounts };
}

export interface PreviaDaTabela {
  tabela: string;
  novos: number;
  sobrescritos: number;
}

export interface PreviaRestauracao {
  porTabela: PreviaDaTabela[];
  novos: number;
  sobrescritos: number;
  puladas: string[];
}

/**
 * O que a restauração vai fazer, ANTES de fazer.
 *
 * Restaurar é derramar um arquivo por cima de um banco em produção, e a
 * pergunta que decide se é seguro — "isso vai criar ou vai sobrescrever?" —
 * não tinha resposta na tela. Um backup de três meses atrás com 800 pacientes
 * pode significar 800 cadastros novos ou 800 cadastros voltando no tempo, e
 * são situações opostas.
 *
 * Conta por `id`: o que já existe será sobrescrito, o resto é novo. Só lê.
 */
export async function previaRestauracao(backup: BackupData): Promise<PreviaRestauracao> {
  const todas = Object.keys(backup.collections).filter(
    t => Array.isArray(backup.collections[t]) && backup.collections[t].length > 0,
  );
  const puladas = todas.filter(t => TABELAS_QUE_NAO_SE_RESTAURA.has(t));
  const alvo = todas.filter(t => !TABELAS_QUE_NAO_SE_RESTAURA.has(t));

  const porTabela: PreviaDaTabela[] = [];

  for (const tabela of alvo) {
    const ids = backup.collections[tabela]
      .map((l: any) => l?.id)
      .filter((id: any) => typeof id === 'string');

    // Linha sem `id` é sempre inserção — não há com o que colidir.
    const semId = backup.collections[tabela].length - ids.length;

    let existentes = 0;
    for (let i = 0; i < ids.length; i += PAGINA) {
      const lote = ids.slice(i, i + PAGINA);
      const { data, error } = await (supabase as any)
        .from(tabela).select('id').in('id', lote);
      // Tabela ilegível para este perfil: some da prévia em vez de mentir um
      // número. A restauração vai reportar o erro dela por tabela.
      if (error) { existentes = -1; break; }
      existentes += data?.length ?? 0;
    }

    if (existentes < 0) continue;

    porTabela.push({
      tabela,
      sobrescritos: existentes,
      novos: ids.length - existentes + semId,
    });
  }

  return {
    porTabela: porTabela.sort((a, b) => (b.novos + b.sobrescritos) - (a.novos + a.sobrescritos)),
    novos: porTabela.reduce((s, t) => s + t.novos, 0),
    sobrescritos: porTabela.reduce((s, t) => s + t.sobrescritos, 0),
    puladas,
  };
}
