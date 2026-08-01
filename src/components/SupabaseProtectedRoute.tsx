import { Navigate, useLocation } from 'react-router-dom';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { Loader2 } from 'lucide-react';

interface SupabaseProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  /**
   * Restringe ao dono da plataforma (tabela platform_admins), não ao papel
   * `admin`, que é de CLÍNICA. Sem isso, telas de plataforma ficavam abertas ao
   * administrador de qualquer clínica: /painel-admin listava perfis, papéis,
   * assinaturas e planos de todos os clientes.
   */
  somentePlataforma?: boolean;
}

export function SupabaseProtectedRoute({
  children,
  allowedRoles,
  somentePlataforma,
}: SupabaseProtectedRouteProps) {
  const { user, profile, isLoading, hasAnyRole, isPlatformAdmin } = useSupabaseAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Dono da plataforma não tem papel de clínica, e não deveria mesmo ter: ele
  // não atende paciente, administra o produto. Sem esta saída, tirar o papel
  // solto da conta dele o trancaria na tela de "Acesso Pendente" — o dono do
  // app impedido de entrar no próprio app.
  //
  // São dois tipos de administrador que o sistema precisa distinguir:
  //   admin de clínica  — comprou o EloLab e administra a clínica dele
  //   dono da plataforma — administra o EloLab, e não pertence a clínica alguma
  if (!profile || (profile.roles.length === 0 && !isPlatformAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Acesso Pendente</h1>
          <p className="text-muted-foreground mb-4">
            Sua conta foi criada, mas você ainda não tem uma função atribuída.
            Por favor, aguarde um administrador configurar seu acesso.
          </p>
          <p className="text-sm text-muted-foreground">
            Logado como: {user.email}
          </p>
        </div>
      </div>
    );
  }

  // Telas da plataforma: não basta ser admin da clínica.
  if (somentePlataforma && !isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check role-based access
  if (allowedRoles && !hasAnyRole(allowedRoles)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
