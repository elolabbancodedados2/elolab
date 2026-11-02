/** Regras de operação das salas que dependem de outros módulos (patrimônio) ou de formulário. */

export interface AtivoDaSala {
  id: string;
  name: string;
  room_id: string | null;
  status: 'active' | 'maintenance' | 'unavailable' | 'retired';
  block_room_when_unavailable: boolean;
}

export const ROTULO_STATUS_ATIVO: Record<AtivoDaSala['status'], string> = {
  active: 'em operação',
  maintenance: 'em manutenção',
  unavailable: 'indisponível',
  retired: 'aposentado',
};

/**
 * Ativos do patrimônio instalados na sala (aposentados ficam de fora) e os que
 * impedem o uso: marcados para bloquear a sala e fora de operação.
 */
export function ativosDaSala(salaId: string, ativos: AtivoDaSala[]) {
  const daSala = ativos.filter(a => a.room_id === salaId && a.status !== 'retired');
  const foraDeOperacao = daSala.filter(a => a.status === 'maintenance' || a.status === 'unavailable');
  const bloqueantes = foraDeOperacao.filter(a => a.block_room_when_unavailable);
  return { daSala, foraDeOperacao, bloqueantes };
}

/** Capacidade digitada: inteiro de 1 a 999. Campo vazio é inválido (não volta a 1 sozinho). */
export function lerCapacidade(texto: string): number | null {
  const limpo = texto.trim();
  if (!/^\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  return valor >= 1 && valor <= 999 ? valor : null;
}
