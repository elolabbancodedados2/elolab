import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Star, Play, Trash2, Loader2, Pause, Mail, Clock as ClockIcon } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ListSkeleton } from '@/components/ui/loading-skeleton';

export default function RelatoriosSalvos() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['relatorios-salvos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('relatorios_salvos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const runNow = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await supabase.functions.invoke('scheduled-reports-runner', { body: { id } });
      if (error) throw error;
      toast.success('Relatório executado e enviado');
      qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
    } catch (e: any) { toast.error(e.message || 'Falha ao executar'); }
    finally { setBusyId(null); }
  };

  const toggleAtivo = async (it: any) => {
    const { error } = await (supabase as any)
      .from('relatorios_salvos').update({ ativo: !it.ativo }).eq('id', it.id);
    if (error) { toast.error('Não foi possível alterar o agendamento do relatório.'); return; }
    qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este relatório?')) return;
    const { error } = await (supabase as any).from('relatorios_salvos').delete().eq('id', id);
    if (error) { toast.error('Não foi possível excluir o relatório.'); return; }
    toast.success('Excluído');
    qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" /> Relatórios salvos e agendados
          </CardTitle>
          <CardDescription>
            Reaproveite filtros favoritos e receba relatórios por e-mail automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton items={3} />
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum relatório salvo. Vá em <b>Relatórios → Customizado</b> e clique em <b>Salvar / Agendar</b>.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it: any) => (
                <div key={it.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{it.nome}</h3>
                      <Badge variant="outline">{it.dataset}</Badge>
                      {!it.ativo && <Badge variant="secondary">Pausado</Badge>}
                      {it.frequencia && <Badge className="bg-primary/10 text-primary">{it.frequencia}</Badge>}
                    </div>
                    {it.descricao && <p className="text-sm text-muted-foreground mt-1">{it.descricao}</p>}
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                      {it.destinatarios?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {it.destinatarios.length} destinatário(s)
                        </span>
                      )}
                      {it.proxima_execucao && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" /> Próxima: {format(new Date(it.proxima_execucao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      {it.ultima_execucao && (
                        <span>Última: {format(new Date(it.ultima_execucao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => runNow(it.id)} disabled={busyId === it.id}>
                      {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      <span className="ml-1">Executar</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleAtivo(it)}>
                      {it.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(it.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}