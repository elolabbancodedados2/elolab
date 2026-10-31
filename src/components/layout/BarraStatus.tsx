import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';

// Barra de status do protótipo aprovado em 30/10/2026: conexão, clínica, usuário, hora e atalhos.
const papeis: Record<string, string> = {
  admin: 'Administração',
  medico: 'Médico',
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  financeiro: 'Financeiro',
};

function horaAtual() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}

export function BarraStatus() {
  const { profile } = useSupabaseAuth();
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [hora, setHora] = useState(horaAtual);

  useEffect(() => {
    const ligar = () => setOnline(true);
    const desligar = () => setOnline(false);
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    const relogio = window.setInterval(() => setHora(horaAtual()), 30_000);
    return () => {
      window.removeEventListener('online', ligar);
      window.removeEventListener('offline', desligar);
      window.clearInterval(relogio);
    };
  }, []);

  // Mesma chave da barra superior: o React Query reaproveita a resposta.
  const { data: clinica } = useQuery({
    queryKey: ['navbar-clinic-context', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data, error } = await supabase.from('clinicas').select('nome').eq('id', profile.clinica_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(profile?.clinica_id),
    staleTime: 5 * 60_000,
  });

  const item = 'flex h-full items-center gap-1.5 border-r border-border px-3';
  const tecla = 'rounded border border-border bg-card px-1 font-sans text-[10px] font-semibold text-foreground';

  return (
    <footer
      aria-label="Barra de status"
      className="hidden h-7 shrink-0 items-stretch border-t border-border bg-secondary text-[11.5px] text-muted-foreground lg:flex"
    >
      <span className={item} role="status">
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', online ? 'bg-success' : 'bg-destructive')} />
        {online ? 'Online' : 'Sem conexão: as alterações não serão salvas'}
      </span>
      {clinica?.nome && <span className={cn(item, 'max-w-[280px] truncate')}>{clinica.nome}</span>}
      {profile?.nome && (
        <span className={item}>
          {profile.nome}
          {profile.role && papeis[profile.role] ? ` · ${papeis[profile.role]}` : ''}
        </span>
      )}
      <span className="ml-auto flex h-full items-center gap-1.5 border-l border-border px-3">
        <kbd className={tecla}>Ctrl</kbd><kbd className={tecla}>K</kbd> buscar
      </span>
      <span className="flex h-full items-center border-l border-border px-3 tabular-nums text-foreground">{hora}</span>
    </footer>
  );
}
