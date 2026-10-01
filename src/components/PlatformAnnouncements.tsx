import { useQuery, useQueryClient } from '@tanstack/react-query';
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

  const announcement = query.data?.[0];
  if (!announcement) return null;

  const Icon = announcement.tipo === 'critico' || announcement.tipo === 'atencao'
    ? AlertTriangle
    : announcement.tipo === 'sucesso' ? CheckCircle2 : Info;

  const dismiss = async () => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) return;
    const { error } = await (supabase as any).from('platform_announcement_reads').upsert({
      announcement_id: announcement.id,
      user_id: currentUser.id,
    });
    // Antes o erro era descartado: o clique parecia morto e o banner voltava a
    // cada carregamento de página, sem explicar por quê.
    if (error) {
      toast.error('Não foi possível marcar o comunicado como lido.', {
        description: mensagemDeErro(error),
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['meus-comunicados', currentUser.id] });
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
      <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Marcar comunicado como lido">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
