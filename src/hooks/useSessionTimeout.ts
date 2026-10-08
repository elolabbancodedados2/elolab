import { useEffect, useRef, useCallback } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CONFIG_SEGURANCA_ATUALIZADA_EVENT, lerConfigsClinica } from '@/lib/configClinica';

const DEFAULT_TIMEOUT_MIN = 30;
const WARNING_MS = 5 * 60 * 1000; // 5 minutes before timeout

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
      const minutos = Number((configs.config_seguranca as any)?.sessionTimeoutMin);
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

export function useSessionTimeout() {
  const { user, profile, signOut } = useSupabaseAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();
  const scope = `${profile?.clinica_id || 'pessoal'}:${user?.id || 'anonimo'}`;

  const resetTimer = useCallback(() => {
    if (!user) return;

    const timeoutMs = getTimeoutMs(scope);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    if (timeoutMs > WARNING_MS) {
      warningRef.current = setTimeout(() => {
        toast.warning('Sua sessão expira em 5 minutos por inatividade.', {
          duration: 10000,
          action: {
            label: 'Continuar',
            onClick: () => resetTimer(),
          },
        });
      }, timeoutMs - WARNING_MS);
    }

    timeoutRef.current = setTimeout(() => {
      toast.error('Sessão encerrada por inatividade.');
      signOut();
    }, timeoutMs);
  }, [scope, user, signOut]);

  useEffect(() => {
    if (!user) return;
    loadTimeoutFromSupabase(user.id, profile?.clinica_id).then(() => resetTimer());

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetTimer();
    const recarregarConfiguracao = () => {
      void loadTimeoutFromSupabase(user.id, profile?.clinica_id).then(() => resetTimer());
    };

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    window.addEventListener(CONFIG_SEGURANCA_ATUALIZADA_EVENT, recarregarConfiguracao);
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      window.removeEventListener(CONFIG_SEGURANCA_ATUALIZADA_EVENT, recarregarConfiguracao);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, profile?.clinica_id, resetTimer]);
}
