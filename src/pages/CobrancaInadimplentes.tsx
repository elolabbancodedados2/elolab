import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Send, Loader2, MessageCircle, RefreshCw, Mail, Search,
  DollarSign, ArrowUpRight, X, Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { linkWhatsApp } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

type FiltroIndicador = 'todos' | 'atraso30' | 'comContato';

function primeiroNome(nome?: string | null) {
  return (nome || 'paciente').trim().split(' ')[0] || 'paciente';
}

function mensagemCobranca(nome: string, valor: string, dias: number) {
  return `Olá, ${nome}! Identificamos uma pendência de ${valor} vencida há ${dias} dia(s). Podemos ajudar a regularizar o pagamento?`;
}

export default function CobrancaInadimplentes() {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [sendProgress, setSendProgress] = useState({ batch: 0, total: 0 });
  const [filtroIndicador, setFiltroIndicador] = useState<FiltroIndicador>('todos');
  const [searchTerm, setSearchTerm] = useState('');
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

  const pedirEnvioTodos = () => {
    if (!comContato.length) { toast.error('Nenhum lançamento vencido tem telefone ou e-mail cadastrado.'); return; }
    setConfirmarEnvio(true);
  };

  const enviarTodos = async () => {
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

  // Dias de atraso calculados uma única vez por lançamento, reaproveitados nos
  // indicadores, no destaque e na tabela.
  const dataComDias = useMemo(() => data.map((l: any) => {
    const vencimentoUtc = l.data_vencimento ? Date.parse(`${l.data_vencimento}T00:00:00Z`) : NaN;
    const hojeUtc = Date.parse(`${todaySaoPauloDateOnly()}T00:00:00Z`);
    const dias = Number.isFinite(vencimentoUtc) ? Math.max(0, Math.floor((hojeUtc - vencimentoUtc) / 86400000)) : 0;
    return { ...l, dias };
  }), [data]);

  const acimaDeTrinta = dataComDias.filter((l: any) => l.dias > 30).length;

  const filtrados = useMemo(() => dataComDias.filter((l: any) => {
    if (filtroIndicador === 'atraso30' && l.dias <= 30) return false;
    if (filtroIndicador === 'comContato' && !(l.pacientes?.telefone || l.pacientes?.email)) return false;
    if (searchTerm.trim()) {
      const nome = (l.pacientes?.nome || '').toLowerCase();
      if (!nome.includes(searchTerm.trim().toLowerCase())) return false;
    }
    return true;
  }), [dataComDias, filtroIndicador, searchTerm]);

  const temFiltro = filtroIndicador !== 'todos' || Boolean(searchTerm.trim());
  const limparFiltros = () => { setFiltroIndicador('todos'); setSearchTerm(''); };

  // Destaque: o paciente com mais dias de atraso; em caso de empate, o maior saldo.
  const destaque = useMemo(() => dataComDias.reduce((maisUrgente: any, atual: any) => {
    if (!maisUrgente) return atual;
    if (atual.dias > maisUrgente.dias) return atual;
    if (atual.dias === maisUrgente.dias && saldo(atual) > saldo(maisUrgente)) return atual;
    return maisUrgente;
  }, null as any), [dataComDias]);

  const kpis = [
    {
      key: 'todos' as FiltroIndicador, label: 'Pendências vencidas', value: data.length, icon: AlertTriangle,
      color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false, caption: 'lançamentos em aberto', money: false,
    },
    {
      key: 'atraso30' as FiltroIndicador, label: 'Saldo em aberto', value: totalDevido, icon: DollarSign,
      color: 'text-white', surface: 'bg-white/15', escuro: true,
      caption: acimaDeTrinta > 0 ? `${acimaDeTrinta} com +30 dias de atraso` : 'nenhum acima de 30 dias', money: true,
    },
    {
      key: 'comContato' as FiltroIndicador, label: 'Com contato para cobrança', value: comContato.length, icon: MessageCircle,
      color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false,
      caption: `${data.length - comContato.length} sem telefone ou e-mail`, money: false,
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={'Cobrança de inadimplentes'}
        description={`${data.length} pendência(s) vencida(s) · ${comContato.length} com contato para cobrança`}
        icon={<AlertTriangle />}
        actions={(
          <>
            <Button variant="outline" size="icon" className="rounded-full shrink-0" onClick={() => void refetch()} disabled={cobrancasQuery.isFetching} aria-label="Atualizar" title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="gap-1.5 rounded-full shrink-0" onClick={() => navigate('/contas?tab=receber')}>
              <ArrowUpRight className="h-4 w-4" /> Ver contas a receber
            </Button>
            <Button
              onClick={pedirEnvioTodos}
              disabled={sending || cobrancasQuery.isError || !comContato.length}
              className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? `Processando ${sendProgress.batch}/${sendProgress.total}…` : 'Processar régua de cobrança'}
            </Button>
          </>
        )}
      />

      {atingiuLimite && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A busca atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} lançamentos. Os totais e a lista podem estar incompletos.</p>
        </div>
      )}
      {data.length > comContato.length && (
        <p role="status" className="text-sm text-muted-foreground">
          {data.length - comContato.length} cobrança(s) estão fora da régua por falta de telefone e e-mail. Atualize o contato no cadastro do paciente para permitir o envio.
        </p>
      )}

      {/* Indicadores clicáveis */}
      <section role="group" aria-label="Resumo das cobranças" className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          const ativo = filtroIndicador === kpi.key;
          return (
            <button
              key={kpi.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltroIndicador(ativo && kpi.key !== 'todos' ? 'todos' : kpi.key)}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                kpi.escuro && 'border-transparent bg-gradient-primary text-white',
                ativo && !kpi.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                ativo && kpi.escuro && 'ring-2 ring-[#1080CA]/60',
              )}
            >
              <div className="flex min-h-[96px] items-center gap-3 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kpi.surface)}>
                  <Icon aria-hidden="true" className={cn('h-5 w-5', kpi.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={cn('truncate text-xs font-semibold', kpi.escuro ? 'text-white/80' : 'text-foreground')}>{kpi.label}</h3>
                  <p className={cn('text-xl font-bold tabular-nums', kpi.color)}>
                    {kpi.money ? kpi.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : kpi.value}
                  </p>
                  <p className={cn('truncate text-[11px]', kpi.escuro ? 'text-white/60' : 'text-muted-foreground')}>{kpi.caption}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Destaque: paciente mais urgente */}
      {destaque && (() => {
        const nome = destaque.pacientes?.nome || '—';
        const valorFormatado = saldo(destaque).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const whatsapp = linkWhatsApp(destaque.pacientes?.telefone, mensagemCobranca(primeiroNome(nome), valorFormatado, destaque.dias));
        const vencimento = parseDateOnly(destaque.data_vencimento);
        return (
          <Card className="overflow-hidden rounded-2xl border-[#1080CA]/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1080CA]">Pendência mais urgente</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{nome}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {vencimento && <span className="inline-flex items-center gap-1">Venc. {format(vencimento, 'dd/MM/yyyy')}</span>}
                    <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                      <Clock aria-hidden="true" className="h-3 w-3" /> {destaque.dias} dia(s) de atraso
                    </span>
                    <span className="font-semibold text-foreground">{valorFormatado}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {whatsapp ? (
                  <Button asChild variant="outline" className="h-10 gap-1.5 rounded-full border-[#1080CA]/30 text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem telefone válido</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista de pendências */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                Pendências
                <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[#1080CA]">{filtrados.length} de {data.length}</Badge>
              </CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-64">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar pendências por paciente"
                    placeholder="Nome do paciente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
                  />
                </div>
                {temFiltro && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                    <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
            />
          ) : filtrados.length === 0 ? (
            <ActionableEmptyState
              title="Nenhuma pendência corresponde aos filtros"
              description="Ajuste a busca ou limpe os filtros para ver todas as pendências vencidas."
              actionLabel="Limpar filtros"
              onAction={limparFiltros}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
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
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.map((l: any) => {
                      const vencimento = parseDateOnly(l.data_vencimento);
                      const dias = l.dias;
                      const valorFormatado = saldo(l).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                      const whatsapp = linkWhatsApp(l.pacientes?.telefone, mensagemCobranca(primeiroNome(l.pacientes?.nome), valorFormatado, dias));
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.pacientes?.nome || '—'}</TableCell>
                          <TableCell className="text-sm">{l.descricao || '—'}</TableCell>
                          <TableCell>{valorFormatado}{l.status === 'parcial' && <span className="ml-1 text-xs text-muted-foreground">(saldo)</span>}</TableCell>
                          <TableCell>{vencimento ? format(vencimento, 'dd/MM/yyyy') : 'Data inválida'}</TableCell>
                          <TableCell>
                            <Badge
                              variant={dias > 30 ? 'destructive' : 'outline'}
                              className={cn('rounded-full', dias <= 30 && 'border-warning/40 bg-warning/10 text-warning-foreground')}
                            >
                              {dias} dias
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              {l.pacientes?.telefone && <p className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-[#1080CA]" />{l.pacientes.telefone}</p>}
                              {l.pacientes?.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{l.pacientes.email}</p>}
                              {!l.pacientes?.telefone && !l.pacientes?.email && <span className="text-muted-foreground">sem contato</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {whatsapp ? (
                              <Button aria-label="Contatar via WhatsApp" size="icon" variant="ghost" asChild className="h-9 w-9 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Contatar via WhatsApp" title="Contatar via WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem telefone válido</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmarEnvio}
        onOpenChange={setConfirmarEnvio}
        title="Processar cobranças vencidas"
        description={`Processar cobranças dos ${comContato.length} lançamentos vencidos com telefone ou e-mail? A régua pode pular itens fora da data prevista ou já enviados.`}
        confirmLabel="Processar"
        variant="warning"
        onConfirm={() => void enviarTodos()}
      />
    </div>
  );
}
