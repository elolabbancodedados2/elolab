import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { limparAuditoriaPendente } from '@/lib/auditTrail';

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

interface SupabaseAuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserWithRole | null;
  clinicaId: string | null;
  isLoading: boolean;
  isPlatformAdmin: boolean;
  platformAdminLevel: PlatformAdminLevel | null;
  isClinicaOwner: boolean;
  /** @deprecated use isPlatformAdmin */
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string, telefone?: string, cpfCnpj?: string, redirectTo?: string) => Promise<{ data: any; error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  isAdmin: () => boolean;
  refreshProfile: () => Promise<void>;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [platformAdminLevel, setPlatformAdminLevel] = useState<PlatformAdminLevel | null>(null);
  const [isClinicaOwner, setIsClinicaOwner] = useState(false);
  const previousDataScope = useRef<string | null>(null);

  // Impersonação troca a clínica sem trocar o usuário. Limpar o cache nesse
  // momento evita que uma tela renderize por alguns instantes dados da clínica
  // anterior enquanto as consultas protegidas por RLS são refeitas.
  useEffect(() => {
    const scope = user ? `${user.id}:${profile?.clinica_id || 'platform'}` : null;
    const previous = previousDataScope.current;
    if (previous !== null && previous !== scope) queryClient.clear();
    previousDataScope.current = scope;
  }, [user?.id, profile?.clinica_id, queryClient]);

  const fetchProfile = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return null;
      }

      if (!profileData) {
        return null;
      }

      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      }

      const roles = (rolesData?.map(r => r.role) || []) as AppRole[];
      const primaryRole = roles.length > 0 ? roles[0] : null;

      let clinicaId = (profileData as any).clinica_id as string | undefined;

      // A conta dona da plataforma pode ter o papel `admin` por legado, mas
      // não pertence a uma clínica. Consulte a autoridade de plataforma antes
      // do provisionamento automático para não criar uma clínica fantasma para
      // suporte/dono do produto.
      let isPlatformAccount = false;
      if (!clinicaId && roles.includes('admin')) {
        const { data: platformAdmin, error: platformAdminError } = await (supabase as any)
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', userId)
          .eq('ativo', true)
          .maybeSingle();
        // Em caso de falha na consulta, não faça uma mutação irreversível por
        // engano. O próximo refresh poderá tentar o provisionamento novamente.
        isPlatformAccount = Boolean(platformAdmin) || Boolean(platformAdminError);
      }

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
              .update({ clinica_id: clinicaId } as any)
              .eq('id', userId);
          }
        } catch (e) {
          console.error('Error auto-creating clinica:', e);
        }
      }

      return {
        id: profileData.id,
        nome: profileData.nome,
        email: profileData.email,
        avatar: profileData.avatar,
        telefone: profileData.telefone,
        ativo: profileData.ativo,
        clinica_id: clinicaId,
        role: primaryRole,
        roles,
      } as UserWithRole;
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      return null;
    }
  };

  const fetchPlatformAdmin = async (userId: string): Promise<PlatformAdminLevel | null> => {
    try {
      const { data } = await (supabase as any)
        .from('platform_admins')
        .select('nivel')
        .eq('user_id', userId)
        .eq('ativo', true)
        .maybeSingle();
      return (data?.nivel as PlatformAdminLevel) ?? null;
    } catch {
      return null;
    }
  };

  const fetchIsClinicaOwner = async (userId: string, clinicaId?: string | null): Promise<boolean> => {
    if (!clinicaId) return false;
    try {
      const { data } = await supabase
        .from('clinicas')
        .select('owner_id')
        .eq('id', clinicaId)
        .maybeSingle();
      return (data as any)?.owner_id === userId;
    } catch {
      return false;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const userProfile = await fetchProfile(user.id);
      setProfile(userProfile);
      const level = await fetchPlatformAdmin(user.id);
      setPlatformAdminLevel(level);
      const owner = await fetchIsClinicaOwner(user.id, userProfile?.clinica_id);
      setIsClinicaOwner(owner);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncSession = async (currentSession: Session | null) => {
      if (!isMounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        void syncSession(currentSession);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      void syncSession(existingSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Keep the persisted last-seen timestamp current while an authenticated tab
  // is visible. The platform user list uses it as a recent-activity signal.
  useEffect(() => {
    if (!user?.id) return;

    const registrarAtividade = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase
        .from('profiles')
        .update({ ultimo_acesso: new Date().toISOString() } as any)
        .eq('id', user.id);
    };

    registrarAtividade();
    const interval = window.setInterval(registrarAtividade, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', registrarAtividade);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', registrarAtividade);
    };
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;

    const syncProfileFromUser = async () => {
      if (!user) {
        if (!isActive) return;
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Ensure session is fully available before running RLS-protected queries
      const { data: { session: latestSession } } = await supabase.auth.getSession();

      if (!isActive) return;

      if (!latestSession?.user || latestSession.user.id !== user.id) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const userProfile = await fetchProfile(user.id);

      if (!isActive) return;
      setProfile(userProfile);

      const level = await fetchPlatformAdmin(user.id);
      if (!isActive) return;
      setPlatformAdminLevel(level);

      const owner = await fetchIsClinicaOwner(user.id, userProfile?.clinica_id);
      if (!isActive) return;
      setIsClinicaOwner(owner);

      setIsLoading(false);
    };

    void syncProfileFromUser();

    return () => {
      isActive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally depends on user.id only, not the full user object
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, nome: string, telefone?: string, cpfCnpj?: string, redirectTo?: string) => {
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
        },
      },
    });
    return { data, error: error as Error | null };
  };

  /**
   * Remove do navegador qualquer resposta de API/arquivo que o service worker
   * do PWA tenha guardado. Sem isso, dados clínicos continuavam recuperáveis
   * no Cache Storage depois do logout em computadores compartilhados.
   */
  const clearClinicalCaches = async () => {
    if (typeof caches === 'undefined') return;
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.includes('supabase') || k.includes('images-cache'))
          .map(k => caches.delete(k))
      );
    } catch (error) {
      console.error('Error clearing caches:', error);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      await clearClinicalCaches();
      // O React Query mantinha respostas clínicas em memória mesmo depois do
      // logout. Limpar o cache evita que a próxima conta veja dados da sessão
      // anterior enquanto as consultas ainda estão sendo refeitas.
      queryClient.clear();
      // A fila de auditoria pendente também precisa sair: em computador de
      // recepção compartilhado, o próximo turno herdaria registros do anterior.
      limparAuditoriaPendente();
      // O estado de abertura/fechamento de caixa vive em chaves
      // `caixa_estado_*` do localStorage: o próximo turno não pode herdar o
      // estado financeiro do anterior no PC compartilhado da recepção.
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith('caixa_estado_'))
          .forEach(k => localStorage.removeItem(k));
      } catch { /* storage indisponível neste contexto */ }
      setUser(null);
      setSession(null);
      setProfile(null);
      setPlatformAdminLevel(null);
      setIsClinicaOwner(false);
    }
  };

  const hasRole = (role: AppRole): boolean => {
    if (!profile) return false;
    return profile.roles.includes(role);
  };

  const hasAnyRole = (roles: AppRole[]): boolean => {
    if (!profile) return false;
    if (profile.roles.includes('admin')) return true;
    return roles.some(role => profile.roles.includes(role));
  };

  const isAdmin = (): boolean => {
    return hasRole('admin');
  };

  const isPlatformAdmin = platformAdminLevel !== null;

  return (
    <SupabaseAuthContext.Provider
       value={{
        user,
        session,
        profile,
        clinicaId: profile?.clinica_id || null,
        isLoading,
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
      }}
    >
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
