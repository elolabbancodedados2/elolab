import { Navigate, useLocation } from 'react-router-dom';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { useState } from 'react';
import { BrandLoadingScreen } from '@/components/BrandLoadingScreen';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';

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
  /** Permite apenas ao comprador autenticado sem clínica acessar o checkout do plano escolhido. */
  permitirCompradorPendente?: boolean;
}

export function SupabaseProtectedRoute({
  children,
  allowedRoles,
  somentePlataforma,
  permitirCompradorPendente = false,
}: SupabaseProtectedRouteProps) {
  const { user, profile, isLoading, profileError, hasAnyRole, isPlatformAdmin, refreshProfile, signOut } = useSupabaseAuth();
  const location = useLocation();
  const [tentando, setTentando] = useState(false);

  if (isLoading) {
    return <BrandLoadingScreen message="Verificando seu acesso" detail="Estamos preparando seu espaço de trabalho." />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Falha de rede ao ler perfil/papéis não é "conta sem função": oferece
  // tentar de novo em vez de mandar a pessoa esperar um administrador.
  if (!profile && profileError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-3">
          <ErrorState
            title="Não foi possível carregar seu acesso"
            error={profileError}
            retryLabel={tentando ? 'Tentando…' : 'Tentar novamente'}
            onRetry={() => {
              if (tentando) return;
              setTentando(true);
              void refreshProfile().finally(() => setTentando(false));
            }}
          />
          <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </main>
    );
  }

  // Dono da plataforma não tem papel de clínica, e não deveria mesmo ter: ele
  // não atende paciente, administra o produto. Sem esta saída, tirar o papel
  // solto da conta dele o trancaria na tela de "Acesso Pendente" — o dono do
  // app impedido de entrar no próprio app.
  //
  // São dois tipos de administrador que o sistema precisa distinguir:
  //   admin de clínica  — comprou o EloLab e administra a clínica dele
  //   dono da plataforma — administra o EloLab, e não pertence a clínica alguma
  const checkoutSlug = location.pathname.match(/^\/planos\/checkout\/([^/]+)$/)?.[1];
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const checkoutIntentSlug = typeof metadata?.checkout_plan_slug === 'string' && /^[a-z0-9-]+$/i.test(metadata.checkout_plan_slug)
    ? metadata.checkout_plan_slug
    : null;
  const compradorSemClinica = Boolean(
    profile && !profile.clinica_id && profile.roles.length === 0 &&
    metadata?.checkout_flow === 'saas_subscription' && checkoutIntentSlug
  );
  const compradorPendente = Boolean(
    compradorSemClinica && (
      location.pathname === '/planos' || (permitirCompradorPendente && checkoutSlug)
    )
  );

  // A confirmação/login pode voltar sem os parâmetros originais da compra.
  // Preserve a jornada pelo slug salvo no cadastro, permitindo também escolher
  // outro plano antes do primeiro pagamento.
  if (compradorSemClinica && !compradorPendente && !isPlatformAdmin && checkoutIntentSlug) {
    return <Navigate to={`/planos/checkout/${encodeURIComponent(checkoutIntentSlug)}`} replace />;
  }
  if (!profile || (profile.roles.length === 0 && !isPlatformAdmin && !compradorPendente)) {
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
  if (allowedRoles && !hasAnyRole(allowedRoles) && !compradorPendente) {
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
