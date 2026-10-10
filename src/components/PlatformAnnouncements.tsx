import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';

export function PlatformAnnouncements() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();
  const markReadLock = useRef(false);
  const markAsRead = useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await (supabase as any).rpc('marcar_comunicado_lido', { p_announcement_id: announcementId });
      if (error) throw error;
    },
    onSuccess: () => {
      if (user?.id) void queryClient.invalidateQueries({ queryKey: ['meus-comunicados', user.id] });
    },
    onError: (error) => toast.error('Não foi possível marcar o comunicado como lido.', { description: mensagemDeErro(error) }),
    onSettled: () => { markReadLock.current = false; },
  });
  const query = useQuery({
    queryKey: ['meus-comunicados', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('meus_comunicados');
      if (error) throw error;
      return (data || []).filter((announcement: any) => !announcement.lido);
    },
    refetchInterval: 60000,
  });

  if (query.isError && query.data === undefined) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 border-b bg-destructive/5 px-4 py-3 text-sm">
        <span>Não foi possível carregar os avisos da plataforma.</span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Tentando…' : 'Tentar novamente'}
        </Button>
      </div>
    );
  }

  const announcement = query.data?.[0];
  if (!announcement) return null;

  const Icon = announcement.tipo === 'critico' || announcement.tipo === 'atencao'
    ? AlertTriangle
    : announcement.tipo === 'sucesso' ? CheckCircle2 : Info;

  const dismiss = () => {
    if (!user?.id || markReadLock.current) return;
    markReadLock.current = true;
    markAsRead.mutate(announcement.id);
  };

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 border-b px-4 py-3',
        announcement.tipo === 'critico' && 'bg-destructive/10 text-destructive',
        announcement.tipo === 'atencao' && 'bg-warning/10',
        announcement.tipo === 'sucesso' && 'bg-success/10',
        announcement.tipo === 'info' && 'bg-info/10',
      )}
    >
      <Icon className="mt-0.5 h-5 w-5" />
      <div className="flex-1">
        <p className="font-semibold">{announcement.titulo}</p>
        <p className="text-sm">{announcement.mensagem}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={dismiss} disabled={markAsRead.isPending} aria-label="Marcar comunicado como lido">
        {markAsRead.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : <X className="h-4 w-4" />}
      </Button>
    </div>
  );
}
