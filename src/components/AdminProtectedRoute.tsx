/**
 * Protected Route Component para Painel de Admin
 * Apenas contato@elolab.com.br tem acesso
 */

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Skeleton } from '@/components/ui/skeleton';

const ADMIN_EMAIL = 'contato@elolab.com.br';

interface AdminProtectedRouteProps {
  children: ReactNode;
  fallbackPath?: string;
}

export function AdminProtectedRoute({
  children,
  fallbackPath = '/dashboard',
}: AdminProtectedRouteProps) {
  const { user, isLoading } = useSupabaseAuth();

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const isAdminAuthorized = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (!user || !isAdminAuthorized) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Acesso Negado</h1>
          <p className="text-muted-foreground mt-2">Painel Administrativo Restrito</p>
        </div>

        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <Lock className="h-5 w-5" />
              Acesso Exclusivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="border-red-200 bg-white">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 ml-2">
                <strong>Painel de Configurações Avançadas</strong> é restrito apenas ao administrador autorizado.
              </AlertDescription>
            </Alert>

            <div className="mt-6 space-y-3 bg-white p-4 rounded-lg border border-red-100">
              <p className="text-sm font-semibold text-gray-900">Sua Conta:</p>
              <div className="text-sm text-gray-700 space-y-1">
                <p>
                  <span className="font-medium">Email:</span> {user?.email || 'Não conectado'}
                </p>
                <p>
                  <span className="font-medium">Status:</span>{' '}
                  <span className="text-red-600">❌ Sem Permissão</span>
                </p>
              </div>

              <div className="text-sm text-gray-600 border-t border-red-100 pt-3 mt-3">
                <p className="font-semibold mb-2">Conta Autorizada:</p>
                <p className="text-blue-600 font-mono">{ADMIN_EMAIL}</p>
              </div>
            </div>

            <div className="mt-6 text-xs text-muted-foreground">
              <p>
                Se você é o administrador, faça login com a conta <strong>{ADMIN_EMAIL}</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <a href="/dashboard" className="text-primary hover:underline text-sm">
            ← Voltar ao Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Hook para verificar autorização admin
 */
export function useIsAdmin() {
  const { user } = useSupabaseAuth();
  return user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
