import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, CreditCard, LogOut, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

/**
 * A decisão de bloquear NÃO é mais tomada aqui.
 *
 * A versão anterior avaliava o plano no navegador e, na prática, todos os
 * caminhos terminavam liberando o acesso — inclusive para quem nunca assinou.
 * E, por ser client-side, bastava chamar a API do Supabase direto para ignorar
 * o paywall.
 *
 * Agora quem decide é o banco (função clinica_acesso_bloqueado, migration
 * 20260727234500). Esta tela apenas reflete essa resposta. A escrita é barrada
 * por trigger no servidor; a leitura continua liberada de propósito, para a
 * clínica sempre conseguir consultar e exportar os próprios dados.
 */
export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, profile } = useSupabaseAuth();
  const [modoLeitura, setModoLeitura] = useState(false);

  const { data: bloqueado, isLoading } = useQuery({
    queryKey: ['acesso-bloqueado', user?.id],
    enabled: !!user && !!profile,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('clinica_acesso_bloqueado');
      // Falha ao consultar não pode travar a clínica — o servidor continua
      // sendo a autoridade sobre a escrita de qualquer forma.
      if (error) return false;
      return data === true;
    },
  });

  if (!user || !profile || isLoading) return <>{children}</>;
  if (!bloqueado || modoLeitura) return <>{children}</>;

  return <SubscriptionBlockedScreen onContinuarLeitura={() => setModoLeitura(true)} />;
}

function SubscriptionBlockedScreen({ onContinuarLeitura }: { onContinuarLeitura: () => void }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg text-center border-destructive/50 shadow-2xl">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 p-5 rounded-full bg-destructive/10">
            <ShieldAlert className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl text-destructive">
            Assinatura vencida
          </CardTitle>
          <CardDescription className="text-base mt-2">
            O sistema está em <strong>modo somente leitura</strong>. Você continua
            consultando e exportando tudo, mas novos registros ficam bloqueados até
            a regularização do pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              Seus dados estão seguros e serão mantidos. Ao regularizar o pagamento,
              o sistema volta ao normal imediatamente.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="gap-2" onClick={() => navigate('/planos')}>
              <CreditCard className="h-4 w-4" />
              Regularizar
            </Button>
            <Button variant="outline" size="lg" className="gap-2" onClick={onContinuarLeitura}>
              <Eye className="h-4 w-4" />
              Continuar só lendo
            </Button>
            <Button variant="ghost" size="lg" className="gap-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
