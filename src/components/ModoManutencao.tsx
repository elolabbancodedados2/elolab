import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { DatabaseZap, Clock, ShieldAlert } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import logoIcon from '@/assets/logo-elolab-icon.png';

export interface EstadoDaPlataforma {
  manutencao: boolean;
  titulo: string;
  mensagem: string;
  previsao_retorno: string | null;
}

/** De quanto em quanto tempo cada aba confere se algo mudou. */
const INTERVALO_MS = 30_000;

export function useEstadoDaPlataforma() {
  const [estado, setEstado] = useState<EstadoDaPlataforma | null>(null);

  useEffect(() => {
    // A suíte E2E usa o banco remoto apenas como dependência, mas precisa
    // validar as páginas mesmo quando a operação colocou produção em
    // manutenção. O modo `test` é exclusivo do servidor Playwright e nunca é
    // usado no build publicado.
    if (import.meta.env.MODE === 'test') return;

    let ativo = true;

    const conferir = async () => {
      const { data, error } = await (supabase as any)
        .from('plataforma_estado')
        .select('manutencao, titulo, mensagem, previsao_retorno')
        .maybeSingle();

      if (!ativo) return;

      // FALHA ABERTA, de propósito.
      //
      // Se a consulta falhar — rede instável, banco fora do ar, política mal
      // configurada — o sistema segue liberado. Uma tela de manutenção que
      // aparece por engano tranca todas as clínicas de uma vez, e ninguém do
      // outro lado consegue desfazer. É o erro mais caro possível aqui.
      if (error) {
        console.error('não consegui ler o estado da plataforma:', error.message);
        return;
      }
      if (data) setEstado(data as EstadoDaPlataforma);
    };

    conferir();
    const relogio = setInterval(conferir, INTERVALO_MS);
    return () => { ativo = false; clearInterval(relogio); };
  }, []);

  return estado;
}

/**
 * Tela cheia de manutenção.
 *
 * O dono da plataforma NÃO é bloqueado: é ele quem precisa entrar para
 * conferir o que está consertando e para desligar o aviso depois. Trancar o
 * dono junto transformaria a manutenção num problema maior que o original.
 *
 * Enquanto a autenticação carrega, nada é bloqueado — do contrário o dono veria
 * a tela cheia por um instante a cada carregamento, antes de o sistema saber
 * quem ele é.
 *
 * SAÍDA DE EMERGÊNCIA: se por qualquer motivo a tela não sair pelo painel,
 * roda no SQL Editor do Supabase:
 *     update public.plataforma_estado set manutencao = false;
 */
export function ModoManutencao({ children }: { children: React.ReactNode }) {
  const estado = useEstadoDaPlataforma();
  const { isPlatformAdmin, isLoading } = useSupabaseAuth();
  const { pathname } = useLocation();

  const emManutencao = estado?.manutencao === true;

  // O login precisa continuar disponível para o dono da plataforma recuperar
  // acesso. Isso não libera módulos: depois de autenticar, usuários comuns
  // voltam a cair nesta tela e só platform_admin atravessa a proteção.
  if (!emManutencao || isLoading || pathname === '/auth' || pathname === '/redefinir-senha') return <>{children}</>;

  if (isPlatformAdmin) {
    return (
      <>
        <div className="sticky top-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-1.5 text-xs font-medium text-destructive-foreground">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>
            Manutenção ligada — todos os outros usuários estão vendo a tela de aviso. Você continua
            com acesso normal.
          </span>
        </div>
        {children}
      </>
    );
  }

  const previsao = estado?.previsao_retorno
    ? new Date(estado.previsao_retorno)
    : null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="manutencao-titulo"
      aria-describedby="manutencao-mensagem"
      aria-live="assertive"
      className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-background p-6"
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <img src={logoIcon} alt="EloLab" className="h-10 w-10 object-contain" />
        </div>

        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-warning/15">
          <DatabaseZap className="h-5 w-5 text-warning" />
        </div>

        <h1 id="manutencao-titulo" className="mb-3 text-2xl font-bold tracking-tight">
          {estado?.titulo || 'Banco de dados Supabase não suportado'}
        </h1>

        <p id="manutencao-mensagem" className="text-sm leading-relaxed text-muted-foreground">
          {estado?.mensagem || 'Entre em contato com o suporte para atualizar para a nova versão e aplicar o SQL necessário.'}
        </p>

        {previsao && (
          <p className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Previsão de retorno:{' '}
            {previsao.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}

        <p className="mt-8 text-xs text-muted-foreground/70">
          Esta página se atualiza sozinha quando o sistema voltar. Não é preciso ficar recarregando.
        </p>
      </div>
    </div>
  );
}
