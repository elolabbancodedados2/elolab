import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { AlertTriangle, Send, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export default function CobrancaInadimplentes() {
  const [sending, setSending] = useState(false);
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inadimplentes', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from('lancamentos')
        .select('id, descricao, valor, data_vencimento, paciente_id, pacientes(nome, telefone)')
        .eq('clinica_id', clinicaId)
        .eq('tipo', 'receita')
        .eq('status', 'pendente')
        .lt('data_vencimento', hoje)
        .not('paciente_id', 'is', null)
        .order('data_vencimento', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const enviarTodos = async () => {
    if (!confirm(`Enviar mensagem de cobrança via WhatsApp para ${data?.length || 0} pacientes inadimplentes?`)) return;
    setSending(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('delinquency-whatsapp-reminder', { body: {} });
      if (error) throw error;
      const sent = (resp?.results || []).filter((r: any) => r.sent).length;
      toast.success(`Mensagens enviadas: ${sent}/${resp?.processed || 0}`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao disparar cobrança');
    } finally {
      setSending(false);
    }
  };

  const totalDevido = (data || []).reduce((a: number, l: any) => a + Number(l.valor || 0), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Cobrança de inadimplentes
              </CardTitle>
              <CardDescription>
                Pacientes com lançamentos vencidos e em aberto. Envie mensagens via WhatsApp em lote.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
              <Button onClick={enviarTodos} disabled={sending || !data?.length}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar cobrança a todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Badge variant="secondary">{data?.length || 0} pendências</Badge>
            <Badge className="bg-rose-100 text-rose-800">
              Total devido: {totalDevido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </Badge>
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !data?.length ? (
            <div className="text-center py-12 text-emerald-700">
              ✅ Nenhum paciente inadimplente no momento.
            </div>
          ) : (
            <ScrollArea className="h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Dias atraso</TableHead>
                    <TableHead>Telefone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((l: any) => {
                    const dias = Math.floor((Date.now() - parseDateOnly(l.data_vencimento)!.getTime()) / 86400000);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.pacientes?.nome || '—'}</TableCell>
                        <TableCell className="text-sm">{l.descricao || '—'}</TableCell>
                        <TableCell>{Number(l.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                        <TableCell>{format(parseDateOnly(l.data_vencimento)!, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant={dias > 30 ? 'destructive' : 'secondary'}>{dias} dias</Badge>
                        </TableCell>
                        <TableCell className="flex items-center gap-1 text-sm">
                          {l.pacientes?.telefone ? (
                            <><MessageCircle className="h-3 w-3 text-emerald-600" /> {l.pacientes.telefone}</>
                          ) : (
                            <span className="text-muted-foreground">sem telefone</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}