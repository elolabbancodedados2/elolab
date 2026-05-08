/**
 * Hook para verificar acesso admin ao painel de configurações
 * Apenas contato@elolab.com.br tem acesso total
 */

import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';

const ADMIN_EMAIL = 'contato@elolab.com.br';

export function useAdminAccess() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      setIsAdminAuthorized(false);
      return;
    }

    // Verificar se o usuário é o admin autorizado
    const isAuthorized = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    setIsAdminAuthorized(isAuthorized);
    setIsLoading(false);

    // Se não autorizado, redirecionar
    if (!isAuthorized) {
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    }
  }, [user, navigate]);

  return {
    isAdminAuthorized,
    isLoading,
    adminEmail: ADMIN_EMAIL,
  };
}

export function isAdminUser(email?: string): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
