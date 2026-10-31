import { supabase } from '@/integrations/supabase/client';

export interface NovoItemCotacao {
  estoque_id: string | null;
  descricao: string;
  quantidade: number;
  unidade: string | null;
}

/** Cria a cotação e os itens. Se os itens falharem, cancela a cotação vazia. */
export async function criarCotacao(params: {
  clinicaId: string;
  titulo: string;
  observacoes?: string | null;
  itens: NovoItemCotacao[];
}): Promise<string> {
  const itens = params.itens
    .map(item => ({ ...item, descricao: item.descricao.trim() }))
    .filter(item => item.descricao && Number.isSafeInteger(item.quantidade) && item.quantidade > 0);
  if (!params.titulo.trim()) throw new Error('Informe o título da cotação.');
  if (itens.length === 0) throw new Error('Inclua ao menos um item com descrição e quantidade.');

  const { data: cotacao, error } = await supabase
    .from('cotacoes_compra')
    .insert({ clinica_id: params.clinicaId, titulo: params.titulo.trim(), observacoes: params.observacoes?.trim() || null })
    .select('id')
    .single();
  if (error) throw error;

  const { error: itensError } = await supabase
    .from('cotacao_itens')
    .insert(itens.map(item => ({ ...item, cotacao_id: cotacao.id })));
  if (itensError) {
    await supabase.from('cotacoes_compra').update({ status: 'cancelada' }).eq('id', cotacao.id);
    throw itensError;
  }
  return cotacao.id;
}

const ERRO_TECNICO = /jwt|not authenticated|timeout|timed out|violates|duplicate key|syntax|relation .* does not exist|function .* does not exist/i;

/** Mostra as mensagens em português das regras do banco; erros técnicos viram um texto claro. */
export function mensagemErroCompras(erro: unknown, padrao = 'Não foi possível concluir. Tente novamente.') {
  const mensagem = (typeof erro === 'string' ? erro : (erro as { message?: string } | null)?.message ?? '').trim();
  if (!mensagem) return padrao;
  if (/permission denied|row-level security/i.test(mensagem)) return 'Seu perfil não pode fazer esta alteração.';
  if (/failed to fetch|networkerror/i.test(mensagem)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  return ERRO_TECNICO.test(mensagem) ? padrao : mensagem;
}

/**
 * Itens do estoque que já estão sendo comprados: em cotação aberta ou em
 * pedido emitido que ainda não foi recebido.
 */
export async function buscarEstoqueEmCompra(clinicaId: string): Promise<Set<string>> {
  const [cotacoes, pedidos] = await Promise.all([
    supabase.from('cotacao_itens')
      .select('estoque_id, cotacoes_compra!inner(status)')
      .eq('clinica_id', clinicaId)
      .eq('cotacoes_compra.status', 'aberta')
      .not('estoque_id', 'is', null),
    supabase.from('pedido_compra_itens')
      .select('estoque_id, pedidos_compra!inner(status)')
      .eq('clinica_id', clinicaId)
      .eq('pedidos_compra.status', 'emitido')
      .not('estoque_id', 'is', null),
  ]);
  if (cotacoes.error) throw cotacoes.error;
  if (pedidos.error) throw pedidos.error;
  const ids = new Set<string>();
  for (const linha of [...(cotacoes.data ?? []), ...(pedidos.data ?? [])] as Array<{ estoque_id: string | null }>) {
    if (linha.estoque_id) ids.add(linha.estoque_id);
  }
  return ids;
}
