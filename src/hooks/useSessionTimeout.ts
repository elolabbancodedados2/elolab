import { useEffect, useRef, useCallback, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CONFIG_SEGURANCA_ATUALIZADA_EVENT, lerConfigsClinica } from '@/lib/configClinica';

const DEFAULT_TIMEOUT_MIN = 30;
export const WARNING_MS = 5 * 60 * 1000; // aviso 5 minutos antes
/** Intervalo de checagem do relógio de inatividade. */
const TICK_MS = 1000;
/** Eventos passivos (movimento, rolagem) contam no máximo uma vez por janela. */
const THROTTLE_PASSIVO_MS = 15_000;
/** Escrita da última atividade no storage, compartilhada entre abas. */
const THROTTLE_ESCRITA_MS = 5_000;

export const CHAVE_ATIVIDADE_SESSAO = 'elolab:sessao:ultima-atividade';
const CANAL_SESSAO = 'elolab-sessao';

let cachedTimeoutMin: number | null = null;
let cachedTimeoutScope: string | null = null;

// Preferir a configuração compartilhada da clínica, com fallback para a chave
// pessoal antiga durante a migração de preferências.
async function loadTimeoutFromSupabase(userId: string, clinicaId?: string | null) {
  const scope = `${clinicaId || 'pessoal'}:${userId}`;
  cachedTimeoutScope = scope;
  cachedTimeoutMin = null;

  if (clinicaId) {
    try {
      const configs = await lerConfigsClinica(clinicaId, ['config_seguranca']);
      const minutos = Number((configs.config_seguranca as { sessionTimeoutMin?: unknown } | undefined)?.sessionTimeoutMin);
      if (cachedTimeoutScope === scope && Number.isFinite(minutos) && minutos >= 5 && minutos <= 480) {
        cachedTimeoutMin = minutos;
        return;
      }
    } catch {
      // Mantém a preferência legada como fallback se a leitura compartilhada falhar.
    }
  }

  try {
    const { data } = await supabase
      .from('configuracoes_clinica')
      .select('valor')
      .eq('chave', 'session_timeout_min')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.valor) {
      const mins = typeof data.valor === 'number' ? data.valor : parseInt(String(data.valor), 10);
      if (cachedTimeoutScope === scope && mins >= 5 && mins <= 480) {
        cachedTimeoutScope = scope;
        cachedTimeoutMin = mins;
      }
    }
  } catch { /* ignore */ }
}

function getTimeoutMs(scope: string): number {
  if (cachedTimeoutScope === scope && cachedTimeoutMin && cachedTimeoutMin >= 5 && cachedTimeoutMin <= 480) {
    return cachedTimeoutMin * 60 * 1000;
  }
  return DEFAULT_TIMEOUT_MIN * 60 * 1000;
}

function lerAtividadeCompartilhada(): number {
  try {
    const valor = Number(localStorage.getItem(CHAVE_ATIVIDADE_SESSAO));
    return Number.isFinite(valor) ? valor : 0;
  } catch {
    return 0;
  }
}

function gravarAtividadeCompartilhada(instante: number) {
  try {
    localStorage.setItem(CHAVE_ATIVIDADE_SESSAO, String(instante));
  } catch { /* storage bloqueado: a aba segue com o próprio relógio */ }
}

type MensagemCanal = { tipo: 'atividade'; em: number } | { tipo: 'encerrada' };

function abrirCanal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CANAL_SESSAO) : null;
  } catch {
    return null;
  }
}

export interface EstadoInatividade {
  /** Aviso de expiração visível. */
  avisoAberto: boolean;
  /** Segundos até o encerramento por inatividade (só faz sentido com o aviso aberto). */
  segundosRestantes: number;
  /** "Continuar conectado": registra atividade e fecha o aviso. */
  continuar: () => void;
}

/**
 * Encerra a sessão deste navegador depois de um período sem uso.
 *
 * - A atividade é compartilhada entre abas (localStorage + BroadcastChannel):
 *   usar o app numa aba mantém as outras abertas.
 * - Movimento do mouse e rolagem contam, com limite de frequência.
 * - O encerramento é local (`scope: 'local'`): não derruba os outros aparelhos
 *   da mesma pessoa.
 * - Cinco minutos antes, um diálogo com contagem regressiva oferece
 *   "Continuar conectado".
 */
export function useSessionTimeout(): EstadoInatividade {
  const { user, profile, signOut } = useSupabaseAuth();
  const scope = `${profile?.clinica_id || 'pessoal'}:${user?.id || 'anonimo'}`;
  const ultimaAtividadeRef = useRef<number>(Date.now());
  const ultimaEscritaRef = useRef<number>(0);
  const ultimoPassivoRef = useRef<number>(0);
  const avisoAbertoRef = useRef(false);
  const encerrandoRef = useRef(false);
  const canalRef = useRef<BroadcastChannel | null>(null);
  const [avisoAberto, setAvisoAberto] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(0);

  const registrarAtividade = useCallback((instante = Date.now(), propagar = true) => {
    if (instante <= ultimaAtividadeRef.current) return;
    ultimaAtividadeRef.current = instante;
    if (avisoAbertoRef.current) {
      avisoAbertoRef.current = false;
      setAvisoAberto(false);
    }
    if (!propagar) return;
    if (instante - ultimaEscritaRef.current >= THROTTLE_ESCRITA_MS) {
      ultimaEscritaRef.current = instante;
      gravarAtividadeCompartilhada(instante);
      try {
        canalRef.current?.postMessage({ tipo: 'atividade', em: instante } satisfies MensagemCanal);
      } catch { /* canal fechado */ }
    }
  }, []);

  const continuar = useCallback(() => {
    // Força a propagação imediata: as outras abas também fecham o aviso.
    ultimaEscritaRef.current = 0;
    registrarAtividade(Date.now(), true);
  }, [registrarAtividade]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    encerrandoRef.current = false;
    const agora = Date.now();
    ultimaAtividadeRef.current = Math.max(agora, lerAtividadeCompartilhada());
    ultimaEscritaRef.current = 0;
    gravarAtividadeCompartilhada(ultimaAtividadeRef.current);
    void loadTimeoutFromSupabase(userId, profile?.clinica_id);

    const canal = abrirCanal();
    canalRef.current = canal;

    const encerrar = async (avisar: boolean) => {
      if (encerrandoRef.current) return;
      encerrandoRef.current = true;
      avisoAbertoRef.current = false;
      setAvisoAberto(false);
      if (avisar) {
        try { canal?.postMessage({ tipo: 'encerrada' } satisfies MensagemCanal); } catch { /* canal fechado */ }
      }
      toast.error('Sessão encerrada por inatividade.', { id: 'sessao-inatividade' });
      await signOut({ scope: 'local' });
    };

    const verificar = () => {
      if (encerrandoRef.current) return;
      // Outra aba pode ter registrado atividade sem o evento chegar aqui.
      const compartilhada = lerAtividadeCompartilhada();
      if (compartilhada > ultimaAtividadeRef.current) registrarAtividade(compartilhada, false);
      const restante = ultimaAtividadeRef.current + getTimeoutMs(scope) - Date.now();
      if (restante <= 0) {
        void encerrar(true);
        return;
      }
      if (restante <= WARNING_MS) {
        setSegundosRestantes(Math.ceil(restante / 1000));
        if (!avisoAbertoRef.current) {
          avisoAbertoRef.current = true;
          setAvisoAberto(true);
        }
      }
    };

    const ativo = () => {
      // Com o aviso aberto, só a escolha explícita (ou atividade real em
      // outra aba) mantém a sessão; um esbarrão no mouse não fecha o aviso.
      if (avisoAbertoRef.current) return;
      registrarAtividade();
    };
    const passivo = () => {
      if (avisoAbertoRef.current) return;
      const agoraPassivo = Date.now();
      if (agoraPassivo - ultimoPassivoRef.current < THROTTLE_PASSIVO_MS) return;
      ultimoPassivoRef.current = agoraPassivo;
      registrarAtividade(agoraPassivo);
    };
    const aoMudarStorage = (event: StorageEvent) => {
      if (event.key !== CHAVE_ATIVIDADE_SESSAO || !event.newValue) return;
      const instante = Number(event.newValue);
      if (Number.isFinite(instante)) registrarAtividade(instante, false);
    };
    const aoReceberMensagem = (event: MessageEvent<MensagemCanal>) => {
      const mensagem = event.data;
      if (mensagem?.tipo === 'atividade' && Number.isFinite(mensagem.em)) registrarAtividade(mensagem.em, false);
      if (mensagem?.tipo === 'encerrada') void encerrar(false);
    };
    const recarregarConfiguracao = () => {
      void loadTimeoutFromSupabase(userId, profile?.clinica_id).then(verificar);
    };

    const eventosAtivos = ['mousedown', 'keydown', 'touchstart'] as const;
    const eventosPassivos = ['mousemove', 'wheel', 'scroll'] as const;
    eventosAtivos.forEach(e => window.addEventListener(e, ativo, { passive: true }));
    eventosPassivos.forEach(e => window.addEventListener(e, passivo, { passive: true, capture: e === 'scroll' }));
    window.addEventListener('storage', aoMudarStorage);
    window.addEventListener(CONFIG_SEGURANCA_ATUALIZADA_EVENT, recarregarConfiguracao);
    canal?.addEventListener('message', aoReceberMensagem as EventListener);
    const intervalo = window.setInterval(verificar, TICK_MS);

    return () => {
      eventosAtivos.forEach(e => window.removeEventListener(e, ativo));
      eventosPassivos.forEach(e => window.removeEventListener(e, passivo, { capture: e === 'scroll' }));
      window.removeEventListener('storage', aoMudarStorage);
      window.removeEventListener(CONFIG_SEGURANCA_ATUALIZADA_EVENT, recarregarConfiguracao);
      canal?.removeEventListener('message', aoReceberMensagem as EventListener);
      canal?.close();
      canalRef.current = null;
      window.clearInterval(intervalo);
      avisoAbertoRef.current = false;
      setAvisoAberto(false);
    };
  }, [userId, profile?.clinica_id, scope, signOut, registrarAtividade]);

  return { avisoAberto: Boolean(userId) && avisoAberto, segundosRestantes, continuar };
}
