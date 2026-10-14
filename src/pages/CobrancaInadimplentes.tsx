import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useState } from 'react';
import { AlertTriangle, Send, Loader2, MessageCircle, RefreshCw, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';

export default function CobrancaInadimplentes() {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ batch: 0, total: 0 });
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;

  const cobrancasQuery = useQuery({
    queryKey: ['inadimplentes', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const hoje = todaySaoPauloDateOnly();
      const cobrancas = await buscarEmBlocos<any>(() => (supabase as any)
        .from('lancamentos')
        .select('id, descricao, valor, valor_pago, desconto, acrescimo, status, data_vencimento, paciente_id')
        .eq('clinica_id', clinicaId)
        .eq('tipo', 'receita')
        .in('status', ['pendente', 'parcial', 'atrasado'])
        .lt('data_vencimento', hoje)
        .not('paciente_id', 'is', null)
        .order('data_vencimento', { ascending: true })
        .order('id', { ascending: true }), { bloco: 500, teto: LIMITE_BUSCA_EM_BLOCOS });
      const pacientesPorId = await buscarDadosBasicosPacientes(cobrancas.map((conta: any) => conta.paciente_id));
      return cobrancas.map((conta: any) => ({ ...conta, pacientes: pacientesPorId.get(conta.paciente_id) ?? null }));
    },
  });
  const data = cobrancasQuery.data ?? [];
  const { isLoading, refetch } = cobrancasQuery;
  const comContato = data.filter((l: any) => l.pacientes?.telefone || l.pacientes?.email);
  const atingiuLimite = data.length >= LIMITE_BUSCA_EM_BLOCOS;

  const enviarTodos = async () => {
    if (!comContato.length) { toast.error('Nenhum lançamento vencido tem telefone ou e-mail cadastrado.'); return; }
    if (!confirm(`Processar cobranças dos ${comContato.length} lançamentos vencidos com telefone ou e-mail? A régua pode pular itens fora da data prevista ou já enviados.`)) return;
    setSending(true);
    let processados = 0;
    let enviadosWhatsApp = 0;
    let emailsEnfileirados = 0;
    let naoEnviados = 0;
    const motivosNaoEnviados: Record<string, number> = {};
    let loteAtual = 0;
    const lotesIds = Array.from({ length: Math.ceil(comContato.length / 500) }, (_, index) =>
      comContato.slice(index * 500, (index + 1) * 500).map((l: any) => l.id));
    setSendProgress({ batch: 0, total: lotesIds.length });
    try {
      for (const [index, lancamentoIds] of lotesIds.entries()) {
        loteAtual = index + 1;
        setSendProgress({ batch: loteAtual, total: lotesIds.length });
        const { data: resp, error } = await supabase.functions.invoke('delinquency-whatsapp-reminder', { body: { lancamento_ids: lancamentoIds } });
        if (error) throw error;
        processados += Number(resp?.processed || 0);
        const resultados = Array.isArray(resp?.results) ? resp.results : [];
        enviadosWhatsApp += resultados.filter((r: any) => r.sent && r.channel === 'whatsapp').length;
        emailsEnfileirados += resultados.filter((r: any) => r.sent && ['email_queue', 'email_queue_retry'].includes(r.channel)).length;
        const semEnvio = resultados.filter((r: any) => !r.sent);
        naoEnviados += semEnvio.length;
        for (const resultado of semEnvio) {
          const motivo = resultado.reason || 'motivo_desconhecido';
          motivosNaoEnviados[motivo] = (motivosNaoEnviados[motivo] || 0) + 1;
        }
      }
      const motivosLegiveis: Record<string, string> = {
        sem_saldo: 'sem saldo pendente',
        fora_da_regua: 'fora da data prevista pela régua',
        ja_enviado: 'já enviados nesta etapa',
        falha_ao_enfileirar_email: 'falha ao enfileirar e-mail',
        falha_ao_reabrir_email: 'falha ao retomar e-mail na fila',
        resultado_whatsapp_indeterminado: 'resultado do WhatsApp indeterminado; confira a fila antes de reenviar',
        sem_contato: 'sem contato disponível',
        falha_whatsapp_sem_email_alternativo: 'falha no WhatsApp sem e-mail alternativo',
        dry_run: 'simulação, sem envio',
      };
      const resumoMotivos = Object.entries(motivosNaoEnviados)
        .map(([motivo, quantidade]) => `${quantidade} ${motivosLegiveis[motivo] || motivo.replace(/_/g, ' ')}`)
        .join(' · ');
      const resumoEnvios = `WhatsApp: ${enviadosWhatsApp} · e-mails enfileirados: ${emailsEnfileirados} · não enviados: ${naoEnviados}`;
      if (naoEnviados > 0) {
        toast.warning(`Régua concluída. Processados: ${processados}. ${resumoEnvios}`, {
          description: resumoMotivos || 'Confira a lista atualizada para identificar as pendências.',
          duration: 10000,
        });
      } else {
        toast.success(`Régua concluída. Processados: ${processados}. ${resumoEnvios}`);
      }
      await refetch();
    } catch (e: any) {
      toast.error(loteAtual > 1
        ? `Falha no lote ${loteAtual} de ${lotesIds.length}. Processados ${processados} até aqui; atualize a lista antes de tentar novamente.`
        : e.message || 'Falha ao disparar cobrança');
    } finally {
      setSending(false);
      setSendProgress({ batch: 0, total: 0 });
    }
  };

  const saldo = (l: any) => Math.max(0,
    Number(l.valor || 0) - Number(l.desconto || 0) + Number(l.acrescimo || 0) - Number(l.valor_pago || 0),
  );
  const totalDevido = data.reduce((a: number, l: any) => a + saldo(l), 0);

  return (
    <div className="space-y-5 pb-8">
      <Card className="overflow-hidden rounded-2xl border-[#e3dff7] shadow-sm">
        <CardHeader className="border-b border-[#e7e4f6] bg-gradient-to-r from-[#f6f4ff] via-white to-[#f2f0ff] p-4 sm:p-5">
          <PageHeader
            title={'Cobran\u00e7a de inadimplentes'}
            description={'Pacientes com lan\u00e7amentos vencidos e em aberto. A r\u00e9gua envia por WhatsApp ou, quando necess\u00e1rio, enfileira e-mail.'}
            icon={<AlertTriangle />}
            actions={<div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refetch()} disabled={cobrancasQuery.isFetching}>
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
              <Button onClick={enviarTodos} disabled={sending || cobrancasQuery.isError || !comContato.length}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {sending ? `Processando ${sendProgress.batch}/${sendProgress.total}…` : 'Processar régua de cobrança'}
              </Button>
            </div>}
          />
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          {atingiuLimite && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>A busca atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} lançamentos. Os totais e a lista podem estar incompletos.</p></div>}
          {data.length > comContato.length && <p role="status" className="mb-4 text-sm text-muted-foreground">{data.length - comContato.length} cobrança(s) estão fora da régua por falta de telefone e e-mail. Atualize o contato no cadastro do paciente para permitir o envio.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#e6e2f7] bg-[#f8f7ff] p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Pendências vencidas</p>
              <p className="mt-1 text-xl font-semibold text-[#36248f]">{data.length}</p>
            </div>
            <div className="rounded-xl border border-[#f3dddd] bg-[#fff7f6] p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Saldo em aberto</p>
              <p className="mt-1 text-xl font-semibold text-[#a44f4b]">{totalDevido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>
            <div className="rounded-xl border border-[#d9eee6] bg-[#f3fbf7] p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Com contato para cobrança</p>
              <p className="mt-1 text-xl font-semibold text-[#327b63]">{comContato.length}</p>
            </div>
          </div>
          {cobrancasQuery.isError ? (
            <ErrorState title="Não foi possível carregar as pendências" error={cobrancasQuery.error} onRetry={() => void refetch()} />
          ) : !clinicaId ? (
            <ErrorState title="Clínica não identificada" description="A cobrança foi bloqueada porque não foi possível identificar a clínica atual." />
          ) : isLoading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : !data?.length ? (
            <ActionableEmptyState
              title="Nenhuma pendência vencida"
              description="Não há contas vencidas vinculadas a pacientes. Consulte todas as contas a receber para acompanhar os próximos vencimentos."
              actionLabel="Abrir contas a receber"
              onAction={() => navigate('/contas?tab=receber')}
              className="text-emerald-700"
            />
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
                    <TableHead>Contato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((l: any) => {
                    const vencimento = parseDateOnly(l.data_vencimento);
                    const vencimentoUtc = l.data_vencimento ? Date.parse(`${l.data_vencimento}T00:00:00Z`) : NaN;
                    const hojeUtc = Date.parse(`${todaySaoPauloDateOnly()}T00:00:00Z`);
                    const dias = Number.isFinite(vencimentoUtc) ? Math.max(0, Math.floor((hojeUtc - vencimentoUtc) / 86400000)) : 0;
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.pacientes?.nome || '—'}</TableCell>
                        <TableCell className="text-sm">{l.descricao || '—'}</TableCell>
                        <TableCell>{saldo(l).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{l.status === 'parcial' && <span className="ml-1 text-xs text-muted-foreground">(saldo)</span>}</TableCell>
                        <TableCell>{vencimento ? format(vencimento, 'dd/MM/yyyy') : 'Data inválida'}</TableCell>
                        <TableCell>
                          <Badge variant={dias > 30 ? 'destructive' : 'secondary'}>{dias} dias</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {l.pacientes?.telefone && <p className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-emerald-600" />{l.pacientes.telefone}</p>}
                            {l.pacientes?.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{l.pacientes.email}</p>}
                            {!l.pacientes?.telefone && !l.pacientes?.email && <span className="text-muted-foreground">sem contato</span>}
                          </div>
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
