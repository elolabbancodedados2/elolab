import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, AlertCircle } from 'lucide-react';

interface RoleGuardProps {
  children: ReactNode;
  /** Roles allowed to access. Admin sempre pode acessar. */
  allowedRoles: AppRole[];
  /** Se true, redireciona em vez de mostrar tela de erro */
  redirect?: boolean;
  fallbackPath?: string;
}

/**
 * Etapa 5.1 — Protege rotas por papel (role-based access control).
 * Admin tem acesso a tudo por padrão.
 */
export function RoleGuard({
  children,
  allowedRoles,
  redirect = false,
  fallbackPath = '/dashboard',
}: RoleGuardProps) {
  const { user, profile, isLoading, hasAnyRole, isAdmin } = useSupabaseAuth();

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const allowed = isAdmin() || hasAnyRole(allowedRoles);

  if (!allowed) {
    if (redirect) return <Navigate to={fallbackPath} replace />;

    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Acesso Restrito</h1>
          <p className="text-muted-foreground mt-2">
            Você não tem permissão para acessar esta área
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Permissão Necessária
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Esta página requer um dos seguintes papéis:{' '}
                <strong>{allowedRoles.join(', ')}</strong>.
              </AlertDescription>
            </Alert>
            <div className="text-sm text-muted-foreground">
              <p>
                <strong>Seus papéis atuais:</strong>{' '}
                {profile?.roles?.length ? profile.roles.join(', ') : 'nenhum'}
              </p>
              <p className="mt-2">
                Solicite ao administrador da clínica que conceda a permissão necessária.
              </p>
            </div>
            <a href={fallbackPath} className="text-sm text-primary hover:underline">
              ← Voltar ao Dashboard
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}