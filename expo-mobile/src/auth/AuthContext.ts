import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';

export type AppRole = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';
export type MobileProfile = { nome: string; clinicaId: string | null; roles: AppRole[]; isPlatformAdmin: boolean; plan: { slug: string; status: string } | null };

export type AuthContextValue = {
  session: Session | null;
  profile: MobileProfile | null;
  loading: boolean;
  profileLoading: boolean;
  configurationMissing: boolean;
  hasFeature: (feature?: string) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, nome: string, telefone?: string, cpfCnpj?: string, inviteCode?: string) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
