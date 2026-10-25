import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AuthContext, type AppRole, type MobileProfile } from './AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!supabase || !userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    let active = true;
    setProfile(null);
    setProfileLoading(true);
    void (async () => {
      const [profileResult, rolesResult] = await Promise.all([
        supabase.from('profiles').select('nome, clinica_id').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (!active) return;
      if (profileResult.error || rolesResult.error) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      const roles = (rolesResult.data ?? []).map(row => row.role).filter(Boolean) as AppRole[];
      let isPlatformAdmin = false;
      if (!profileResult.data?.clinica_id && roles.includes('admin')) {
        const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).eq('ativo', true).maybeSingle();
        isPlatformAdmin = Boolean(data);
      }
      if (!active) return;
      setProfile({
        nome: profileResult.data?.nome ?? '',
        clinicaId: profileResult.data?.clinica_id ?? null,
        roles,
        isPlatformAdmin,
      });
      setProfileLoading(false);
    })();

    return () => { active = false; };
  }, [session?.user.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'O app ainda não está conectado ao Supabase.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return 'O app ainda não está conectado ao Supabase.';
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, nome: string, telefone?: string, cpfCnpj?: string, inviteCode?: string) => {
    if (!supabase) return 'O app ainda não está conectado ao Supabase.';
    const redirect = new URL('https://app.elolab.com.br/auth');
    if (inviteCode) redirect.searchParams.set('codigo', inviteCode);
    else redirect.searchParams.set('cadastro', '1');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirect.toString(),
        data: {
          nome,
          full_name: nome,
          telefone: telefone || null,
          cpf_cnpj: cpfCnpj || null,
        },
      },
    });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, profileLoading, configurationMissing: !isSupabaseConfigured, signIn, signUp, sendPasswordReset, signOut }),
    [session, profile, loading, profileLoading, signIn, signUp, sendPasswordReset, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
