import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { registerAccountSessionActivity } from '@/lib/accountSessionDevice';
import { limparDadosLocaisDoUsuario } from '@/lib/limparDadosLocais';
import { ordenarPapeis } from '@/lib/papeis';

export type AppRole = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';

export type PlatformAdminLevel = 'owner' | 'support' | 'finance';

interface Clinica {
  id: string;
  nome: string;
  cnpj?: string;
  owner_id?: string;
}

interface UserProfile {
  id: string;
  nome: string;
  email: string;
  avatar?: string;
  telefone?: string;
  ativo: boolean;
  clinica_id?: string;
}

interface UserWithRole extends UserProfile {
  role: AppRole | null;
  roles: AppRole[];
  clinica_id?: string;
}

export interface SignOutOptions {
  /**
   * 'global' (padrão) encerra a sessão em todos os aparelhos; 'local' só neste
   * navegador — usado na inatividade e na sessão vencida.
   */
  scope?: 'global' | 'local';
}

interface SupabaseAuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserWithRole | null;
  clinicaId: string | null;
  isLoading: boolean;
  /**
   * Falha ao carregar perfil/papéis (rede, timeout). Diferente de "sem papel":
   * a tela deve oferecer "Tentar novamente", não "Acesso pendente".
   */
  profileError: Error | null;
  isPlatformAdmin: boolean;
  platformAdminLevel: PlatformAdminLevel | null;
  isClinicaOwner: boolean;
  /** @deprecated use isPlatformAdmin */
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string, telefone?: string, cpfCnpj?: string, redirectTo?: string, metadata?: Record<string, unknown>) => Promise<{ data: any; error: Error | null }>;
  signOut: (options?: SignOutOptions) => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  isAdmin: () => boolean;
  refreshProfile: () => Promise<void>;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

const AUTH_BOOTSTRAP_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('A verificação da sessão demorou mais que o esperado.')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function comoErro(error: unknown, padrao: string): Error {
  if (error instanceof Error) return error;
  const message = (error as { message?: unknown } | null)?.message;
  return new Error(typeof message === 'string' && message ? message : padrao);
}

interface DadosConta {
  profile: UserWithRole | null;
  platformAdminLevel: PlatformAdminLevel | null;
  isClinicaOwner: boolean;
}

/**
 * Carrega perfil, papéis e vínculo de plataforma em paralelo (antes eram 4
 * consultas em sequência e platform_admins era lido duas vezes).
 * Lança erro em falha de leitura: "não consegui ler" não pode virar "sem papel".
 */
async function carregarDadosConta(userId: string): Promise<DadosConta> {
  const [profileResult, rolesResult, platformResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.from('platform_admins').select('nivel').eq('user_id', userId).eq('ativo', true).maybeSingle(),
  ]);

  if (profileResult.error) throw comoErro(profileResult.error, 'Não foi possível carregar seu perfil.');
  if (rolesResult.error) throw comoErro(rolesResult.error, 'Não foi possível carregar suas funções.');
  // Falha em platform_admins não derruba o login de quem é só da clínica,
  // mas impede o provisionamento automático logo abaixo.
  const platformAdminLevel = platformResult.error ? null : ((platformResult.data?.nivel as PlatformAdminLevel | undefined) ?? null);

  const profileData = profileResult.data;
  if (!profileData) return { profile: null, platformAdminLevel, isClinicaOwner: false };

  const roles = ordenarPapeis((rolesResult.data ?? []).map(r => r.role));
  let clinicaId = profileData.clinica_id ?? undefined;

  // A conta dona da plataforma pode ter o papel `admin` por legado, mas não
  // pertence a uma clínica. Na dúvida (falha na leitura), não faça uma
  // mutação irreversível: o próximo refresh tenta de novo.
  const isPlatformAccount = Boolean(platformAdminLevel) || Boolean(platformResult.error);

  // Auto-create clinica for admins who don't have one
  if (!clinicaId && roles.includes('admin') && !isPlatformAccount) {
    try {
      const { data: newClinica } = await supabase
        .from('clinicas')
        .insert({ nome: 'Minha Clínica', owner_id: userId })
        .select('id')
        .single();
      if (newClinica) {
        clinicaId = newClinica.id;
        await supabase
          .from('profiles')
          .update({ clinica_id: clinicaId })
          .eq('id', userId);
      }
    } catch (e) {
      console.error('Error auto-creating clinica:', e);
    }
  }

  let isClinicaOwner = false;
  if (clinicaId) {
    try {
      const { data } = await supabase.from('clinicas').select('owner_id').eq('id', clinicaId).maybeSingle();
      isClinicaOwner = data?.owner_id === userId;
    } catch {
      isClinicaOwner = false;
    }
  }

  return {
    profile: {
      id: profileData.id,
      nome: profileData.nome,
      email: profileData.email,
      avatar: profileData.avatar ?? undefined,
      telefone: profileData.telefone ?? undefined,
      ativo: profileData.ativo,
      clinica_id: clinicaId,
      role: roles[0] ?? null,
      roles,
    },
    platformAdminLevel,
    isClinicaOwner,
  };
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [platformAdminLevel, setPlatformAdminLevel] = useState<PlatformAdminLevel | null>(null);
  const [isClinicaOwner, setIsClinicaOwner] = useState(false);
  const previousDataScope = useRef<string | null>(null);
  const userId = user?.id;

  // Impersonação troca a clínica sem trocar o usuário. Limpar o cache nesse
  // momento evita que uma tela renderize por alguns instantes dados da clínica
  // anterior enquanto as consultas protegidas por RLS são refeitas.
  useEffect(() => {
    const scope = userId ? `${userId}:${profile?.clinica_id || 'platform'}` : null;
    const previous = previousDataScope.current;
    if (previous !== null && previous !== scope) queryClient.clear();
    previousDataScope.current = scope;
  }, [userId, profile?.clinica_id, queryClient]);

  const aplicarDadosConta = useCallback((dados: DadosConta) => {
    setProfile(dados.profile);
    setPlatformAdminLevel(dados.platformAdminLevel);
    setIsClinicaOwner(dados.isClinicaOwner);
    setProfileError(null);
  }, []);

  const limparEstadoConta = useCallback(() => {
    setProfile(null);
    setPlatformAdminLevel(null);
    setIsClinicaOwner(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    try {
      aplicarDadosConta(await withTimeout(carregarDadosConta(userId), AUTH_BOOTSTRAP_TIMEOUT_MS));
    } catch (error) {
      console.error('Error refreshing auth profile:', error);
      // Mantém o perfil já carregado; só sinaliza a falha quando não há nenhum.
      setProfileError(comoErro(error, 'Não foi possível carregar seu acesso.'));
    }
  }, [userId, aplicarDadosConta]);

  useEffect(() => {
    let isMounted = true;

    const syncSession = (currentSession: Session | null) => {
      if (!isMounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        syncSession(currentSession);
        // Saída iniciada fora deste signOut (outra aba, sessão revogada,
        // renovação recusada): a limpeza local precisa acontecer igual.
        if (event === 'SIGNED_OUT') {
          queryClient.clear();
          void limparDadosLocaisDoUsuario();
        }
      }
    );

    // THEN check for existing session
    void supabase.auth.getSession()
      .then(({ data: { session: existingSession } }) => {
        syncSession(existingSession);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error('Error restoring auth session:', error);
        setSession(null);
        setUser(null);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Keep the persisted last-seen timestamp current while an authenticated tab
  // is visible. The platform user list uses it as a recent-activity signal.
  const hasSession = Boolean(session?.access_token);
  useEffect(() => {
    if (!userId || !hasSession) return;

    const registrarAtividade = () => {
      if (document.visibilityState !== 'visible') return;
      void registerAccountSessionActivity(
        {
          userId,
          hasSession: true,
          isVisible: document.visibilityState === 'visible',
          userAgent: navigator.userAgent,
        },
        {
          updateLastAccess: async (id) => {
            const { error } = await supabase
              .from('profiles')
              .update({ ultimo_acesso: new Date().toISOString() })
              .eq('id', id);
            if (error) throw error;
          },
          touchSession: async (userAgent) => {
            const { error } = await supabase.rpc('touch_my_account_session', { p_user_agent: userAgent });
            if (error) throw error;
          },
        },
      ).then((recorded) => {
        if (!recorded) console.warn('[AccountSessions] Não foi possível atualizar a atividade da sessão.');
      });
    };

    registrarAtividade();
    const interval = window.setInterval(registrarAtividade, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', registrarAtividade);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', registrarAtividade);
    };
  }, [userId, hasSession]);

  useEffect(() => {
    let isActive = true;

    const syncProfileFromUser = async () => {
      if (!userId) {
        if (!isActive) return;
        limparEstadoConta();
        setProfileError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setProfileError(null);

      try {
        // A sessão precisa estar pronta antes das consultas protegidas por RLS.
        // O limite evita deixar a aplicação presa no loader se o storage ou a
        // inicialização do cliente Supabase não responder.
        const { data: { session: latestSession } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
        );

        if (!isActive) return;

        if (!latestSession?.user || latestSession.user.id !== userId) {
          limparEstadoConta();
          return;
        }

        const dados = await withTimeout(carregarDadosConta(userId), AUTH_BOOTSTRAP_TIMEOUT_MS);
        if (!isActive) return;
        aplicarDadosConta(dados);
      } catch (error) {
        if (!isActive) return;
        console.error('Error initializing auth profile:', error);
        limparEstadoConta();
        setProfileError(comoErro(error, 'Não foi possível carregar seu acesso.'));
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void syncProfileFromUser();

    return () => {
      isActive = false;
    };
  }, [userId, aplicarDadosConta, limparEstadoConta]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, nome: string, telefone?: string, cpfCnpj?: string, redirectTo?: string, metadata: Record<string, unknown> = {}) => {
    const redirectUrl = redirectTo || 'https://app.elolab.com.br/';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          nome,
          full_name: nome,
          telefone: telefone || null,
          cpf_cnpj: cpfCnpj || null,
          ...metadata,
        },
      },
    });
    return { data, error: error as Error | null };
  }, []);

  const signOut = useCallback(async (options: SignOutOptions = {}) => {
    try {
      await supabase.auth.signOut({ scope: options.scope ?? 'global' });
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // O React Query mantinha respostas clínicas em memória mesmo depois do
      // logout. Limpar o cache evita que a próxima conta veja dados da sessão
      // anterior enquanto as consultas ainda estão sendo refeitas.
      queryClient.clear();
      // Caixa, abas abertas, auditoria pendente e caches do service worker:
      // o próximo turno no PC compartilhado não herda nada do anterior.
      await limparDadosLocaisDoUsuario();
      setUser(null);
      setSession(null);
      limparEstadoConta();
      setProfileError(null);
    }
  }, [queryClient, limparEstadoConta]);

  const roles = profile?.roles;
  const hasRole = useCallback((role: AppRole): boolean => Boolean(roles?.includes(role)), [roles]);

  const hasAnyRole = useCallback((allowed: AppRole[]): boolean => {
    if (!roles) return false;
    if (roles.includes('admin')) return true;
    return allowed.some(role => roles.includes(role));
  }, [roles]);

  const isAdmin = useCallback((): boolean => hasRole('admin'), [hasRole]);

  const isPlatformAdmin = platformAdminLevel !== null;

  const value = useMemo<SupabaseAuthContextType>(() => ({
    user,
    session,
    profile,
    clinicaId: profile?.clinica_id || null,
    isLoading,
    profileError,
    isPlatformAdmin,
    platformAdminLevel,
    isClinicaOwner,
    isSuperAdmin: isPlatformAdmin,
    signIn,
    signUp,
    signOut,
    hasRole,
    hasAnyRole,
    isAdmin,
    refreshProfile,
  }), [user, session, profile, isLoading, profileError, isPlatformAdmin, platformAdminLevel, isClinicaOwner, signIn, signUp, signOut, hasRole, hasAnyRole, isAdmin, refreshProfile]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
}
