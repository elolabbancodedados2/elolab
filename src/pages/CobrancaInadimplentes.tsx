import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Send, Loader2, MessageCircle, RefreshCw, Mail, Search,
  DollarSign, ArrowUpRight, X, Clock, Download,
} from 'lucide-react';
import { agruparPorPaciente, csvCobrancaManual, faixaAtraso, FAIXAS_ATRASO, pacienteMaisUrgente, resumoPorFaixa, type FaixaAtraso } from '@/lib/inadimplencia';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { mensagemDeErro } from '@/lib/erros';
import { useTelaEstreita } from '@/hooks/useTelaEstreita';
import { downloadStringAsFile } from '@/lib/auditExport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const diasTexto = (dias: number) => `${dias} ${dias === 1 ? 'dia' : 'dias'}`;

function mensagemCobranca(nome: string, valor: string, dias: number, titulos = 1) {
  if (titulos > 1) {
    return `Olá, ${nome}! Identificamos ${titulos} pendências que somam ${valor}, a mais antiga vencida há ${diasTexto(dias)}. Podemos ajudar a regularizar o pagamento?`;
  }
  return `Olá, ${nome}! Identificamos uma pendência de ${valor} vencida há ${diasTexto(dias)}. Podemos ajudar a regularizar o pagamento?`;
}

/** Nome com que a pessoa quer ser chamada: nome social, se houver. */
const nomePaciente = (pacientes: any) => pacientes?.nome_social || pacientes?.nome || '';
const formatarReais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const saldoTitulo = (l: any) => Math.max(0,
  Number(l.valor || 0) - Number(l.desconto || 0) + Number(l.acrescimo || 0) - Number(l.valor_pago || 0),
);
const SEM_TITULOS: any[] = [];
// Sem paciente vinculado, o título fica sozinho em vez de se juntar a outros sem vínculo.
const comSaldo = (l: any) => ({ ...l, paciente_id: l.paciente_id ?? `titulo:${l.id}`, saldo: saldoTitulo(l) });

export default function CobrancaInadimplentes() {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [sendProgress, setSendProgress] = useState({ batch: 0, total: 0 });
  const [filtroIndicador, setFiltroIndicador] = useState<FiltroIndicador>('todos');
  const [filtroFaixa, setFiltroFaixa] = useState<FaixaAtraso | 'todas'>('todas');
  const [confirmarExportacao, setConfirmarExportacao] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [agrupamento, setAgrupamento] = useState<'lancamento' | 'paciente'>('lancamento');
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;
  const telaEstreita = useTelaEstreita();

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
  // Título sem saldo (quitado por desconto ou pagamento ainda não refletido no status) não é cobrança.
  const data = useMemo(() => (cobrancasQuery.data ?? SEM_TITULOS).filter((l: any) => saldoTitulo(l) > 0.004), [cobrancasQuery.data]);
  const { isLoading, refetch } = cobrancasQuery;
  const comContato = data.filter((l: any) => l.pacientes?.telefone || l.pacientes?.email);
  const atingiuLimite = data.length >= LIMITE_BUSCA_EM_BLOCOS;

  const pedirEnvioTodos = () => {
    if (!alvosEnvio.length) { toast.error('Nenhum lançamento da lista filtrada tem telefone ou e-mail cadastrado.'); return; }
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
    const lotesIds = Array.from({ length: Math.ceil(alvosEnvio.length / 500) }, (_, index) =>
      alvosEnvio.slice(index * 500, (index + 1) * 500).map((l: any) => l.id));
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
    } catch (e) {
      toast.error(loteAtual > 1
        ? `Falha no lote ${loteAtual} de ${lotesIds.length}. Processados ${processados} até aqui; atualize a lista antes de tentar novamente.`
        : mensagemDeErro(e));
    } finally {
      setSending(false);
      setSendProgress({ batch: 0, total: 0 });
    }
  };

  const saldo = saldoTitulo;
  const totalDevido = data.reduce((a: number, l: any) => a + saldo(l), 0);

  // Dias de atraso calculados uma única vez por lançamento, reaproveitados nos
  // indicadores, no destaque e na tabela.
  const dataComDias = useMemo(() => data.map((l: any) => {
    const vencimentoUtc = l.data_vencimento ? Date.parse(`${l.data_vencimento}T00:00:00Z`) : NaN;
    const hojeUtc = Date.parse(`${todaySaoPauloDateOnly()}T00:00:00Z`);
    const dias = Number.isFinite(vencimentoUtc) ? Math.max(0, Math.floor((hojeUtc - vencimentoUtc) / 86400000)) : 0;
    return { ...l, dias };
  }), [data]);

  const titulosAcimaDeTrinta = dataComDias.filter((l: any) => l.dias > 30);
  const acimaDeTrinta = titulosAcimaDeTrinta.length;
  const saldoAcimaDeTrinta = titulosAcimaDeTrinta.reduce((a: number, l: any) => a + saldo(l), 0);

  const filtrados = useMemo(() => dataComDias.filter((l: any) => {
    if (filtroIndicador === 'atraso30' && l.dias <= 30) return false;
    if (filtroIndicador === 'comContato' && !(l.pacientes?.telefone || l.pacientes?.email)) return false;
    if (filtroFaixa !== 'todas' && faixaAtraso(l.dias) !== filtroFaixa) return false;
    // Nome civil, nome social, CPF, telefone ou e-mail, sem acento nem máscara.
    if (searchTerm.trim() && !pacienteCorresponde(l.pacientes || {}, searchTerm)) return false;
    return true;
  }), [dataComDias, filtroIndicador, filtroFaixa, searchTerm]);
  // A régua respeita os filtros da tela: só os títulos visíveis com contato.
  const alvosEnvio = useMemo(() => filtrados.filter((l: any) => l.pacientes?.telefone || l.pacientes?.email), [filtrados]);

  const porPaciente = useMemo(
    () => agruparPorPaciente((filtrados as any[]).map(comSaldo)).map(g => ({ ...g, pacientes: g.itens[0]?.pacientes })),
    [filtrados],
  );

  const resumoFaixas = useMemo(() => resumoPorFaixa(dataComDias.map((l: any) => ({ dias: l.dias, saldo: saldo(l) }))), [dataComDias]);
  const temFiltro = filtroIndicador !== 'todos' || filtroFaixa !== 'todas' || Boolean(searchTerm.trim());
  const limparFiltros = () => { setFiltroIndicador('todos'); setFiltroFaixa('todas'); setSearchTerm(''); };

  const exportarLista = () => {
    downloadStringAsFile({
      content: csvCobrancaManual(filtrados.map((l: any) => ({
        paciente: nomePaciente(l.pacientes) || null,
        telefone: l.pacientes?.telefone ?? null,
        email: l.pacientes?.email ?? null,
        descricao: l.descricao ?? null,
        saldo: saldo(l),
        vencimento: l.data_vencimento ?? null,
        dias: l.dias,
      }))),
      filename: `cobranca-manual-${todaySaoPauloDateOnly()}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    });
    toast.success(`Lista exportada com ${filtrados.length} ${filtrados.length === 1 ? 'título' : 'títulos'}.`);
  };

  // Destaque: o paciente com mais dias de atraso (empate: maior total), com
  // todos os títulos dele; antes a mensagem cobrava só um título.
  const destaque = useMemo(() => {
    const grupo = pacienteMaisUrgente(agruparPorPaciente((dataComDias as any[]).map(comSaldo)));
    return grupo ? { ...grupo, pacientes: grupo.itens[0]?.pacientes, vencimentoMaisAntigo: grupo.itens.reduce((min: string, t: any) => (!min || t.data_vencimento < min ? t.data_vencimento : min), '') } : null;
  }, [dataComDias]);

  const kpis = [
    {
      key: 'todos' as FiltroIndicador, label: 'Pendências vencidas', value: data.length, icon: AlertTriangle,
      color: 'text-foreground', surface: 'bg-secondary', escuro: false, caption: 'lançamentos em aberto', money: false,
    },
    {
      // O cartão filtra os títulos com mais de 30 dias: o rótulo e o valor dizem isso.
      key: 'atraso30' as FiltroIndicador, label: 'Mais de 30 dias de atraso', value: saldoAcimaDeTrinta, icon: DollarSign,
      color: 'text-foreground', surface: 'bg-secondary', escuro: false,
      caption: `${acimaDeTrinta} ${acimaDeTrinta === 1 ? 'título' : 'títulos'} · total vencido ${formatarReais(totalDevido)}`, money: true,
    },
    {
      key: 'comContato' as FiltroIndicador, label: 'Com contato para cobrança', value: comContato.length, icon: MessageCircle,
      color: 'text-foreground', surface: 'bg-secondary', escuro: false,
      caption: `${data.length - comContato.length} sem telefone ou e-mail`, money: false,
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={'Cobrança de inadimplentes'}
        description={`${data.length} ${data.length === 1 ? 'pendência vencida' : 'pendências vencidas'} · ${comContato.length} com contato para cobrança`}
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
              disabled={sending || cobrancasQuery.isError || !alvosEnvio.length}
              className="shrink-0 gap-2 rounded-full"
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
                'rounded-2xl border border-border bg-card text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativo && 'border-foreground/40 bg-muted/40',
              )}
            >
              <div className="flex min-h-[96px] items-center gap-3 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kpi.surface)}>
                  <Icon aria-hidden="true" className={cn('h-5 w-5', kpi.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-semibold text-foreground">{kpi.label}</h3>
                  <p className={cn('text-xl font-bold tabular-nums', kpi.color)}>
                    {kpi.money ? formatarReais(kpi.value) : kpi.value}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{kpi.caption}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Destaque: paciente mais urgente, com todos os títulos vencidos */}
      {destaque && (() => {
        const nome = nomePaciente(destaque.pacientes) || '—';
        const totalFormatado = formatarReais(destaque.total);
        const whatsapp = linkWhatsApp(destaque.pacientes?.telefone, mensagemCobranca(primeiroNome(nome), totalFormatado, destaque.maiorAtraso, destaque.titulos));
        const vencimento = parseDateOnly(destaque.vencimentoMaisAntigo);
        return (
          <Card className="overflow-hidden rounded-2xl border-destructive/30">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Pendência mais urgente</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{nome}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {vencimento && <span className="inline-flex items-center gap-1">Venc. {format(vencimento, 'dd/MM/yyyy')}</span>}
                    <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                      <Clock aria-hidden="true" className="h-3 w-3" /> {diasTexto(destaque.maiorAtraso)} de atraso
                    </span>
                    <span className="font-semibold text-foreground">{totalFormatado}</span>
                    {destaque.titulos > 1 && <span>{destaque.titulos} títulos</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {whatsapp ? (
                  <Button asChild variant="outline" className="h-11 gap-1.5 rounded-full">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Enviar WhatsApp de cobrança para ${nome}`}><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
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
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                Pendências
                <Badge variant="outline" className="rounded-full border-border text-foreground">{filtrados.length} de {data.length}</Badge>
              </CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-64">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar pendências por paciente"
                    placeholder="Nome, CPF ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-11 rounded-full pl-9 sm:h-10"
                  />
                </div>
                {temFiltro && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                    <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 gap-1.5 rounded-full"
                  disabled={filtrados.length === 0}
                  onClick={() => setConfirmarExportacao(true)}
                >
                  <Download aria-hidden="true" className="h-4 w-4" /> Exportar lista
                </Button>
              </div>
            </div>
            <div role="group" aria-label="Filtrar por faixa de atraso" className="flex flex-wrap gap-2">
              {FAIXAS_ATRASO.map(faixa => {
                const ativo = filtroFaixa === faixa.id;
                const resumo = resumoFaixas[faixa.id];
                return (
                  <button
                    key={faixa.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltroFaixa(ativo ? 'todas' : faixa.id)}
                    className={cn(
                      'min-h-11 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8',
                      ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted/50',
                    )}
                  >
                    {faixa.label} · {resumo.quantidade} · {resumo.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </button>
                );
              })}
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
            <div className="space-y-3">
            <div role="group" aria-label="Agrupar pendências" className="flex flex-wrap gap-2">
              {([['lancamento', 'Por lançamento'], ['paciente', 'Por paciente']] as const).map(([valor, rotulo]) => (
                <button key={valor} type="button" aria-pressed={agrupamento === valor} onClick={() => setAgrupamento(valor)}
                  className={cn('min-h-11 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-8', agrupamento === valor ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
                  {rotulo}{valor === 'paciente' ? ` · ${porPaciente.length}` : ` · ${filtrados.length}`}
                </button>
              ))}
            </div>
            {telaEstreita ? (
              <ul aria-label={agrupamento === 'paciente' ? 'Pendências por paciente' : 'Pendências'} className="space-y-2">
                {agrupamento === 'paciente'
                  ? porPaciente.map(grupo => {
                    const nome = nomePaciente(grupo.pacientes) || '—';
                    const totalFormatado = formatarReais(grupo.total);
                    const whatsapp = linkWhatsApp(grupo.pacientes?.telefone, mensagemCobranca(primeiroNome(nome), totalFormatado, grupo.maiorAtraso, grupo.titulos));
                    return (
                      <li key={grupo.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{nome}</p>
                            <p className="text-xs text-muted-foreground">{grupo.titulos} {grupo.titulos === 1 ? 'título' : 'títulos'} · maior atraso {diasTexto(grupo.maiorAtraso)}</p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums text-foreground">{totalFormatado}</p>
                        </div>
                        <ContatoCobranca pacientes={grupo.pacientes} />
                        {whatsapp && (
                          <Button asChild variant="outline" className="mt-2 h-11 w-full gap-1.5 rounded-full">
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Contatar ${nome} via WhatsApp`}><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
                          </Button>
                        )}
                      </li>
                    );
                  })
                  : filtrados.map((l: any) => {
                    const nome = nomePaciente(l.pacientes) || '—';
                    const valorFormatado = formatarReais(saldo(l));
                    const whatsapp = linkWhatsApp(l.pacientes?.telefone, mensagemCobranca(primeiroNome(nome), valorFormatado, l.dias));
                    const vencimento = parseDateOnly(l.data_vencimento);
                    return (
                      <li key={l.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{nome}</p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{l.descricao || '—'}</p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums text-foreground">{valorFormatado}</p>
                        </div>
                        <p className="mt-1 text-xs">
                          <span className="text-muted-foreground">Venc. {vencimento ? format(vencimento, 'dd/MM/yyyy') : '—'} · </span>
                          <span className={cn('font-medium', l.dias > 30 ? 'text-destructive' : 'text-warning-foreground')}>{diasTexto(l.dias)} de atraso</span>
                        </p>
                        <ContatoCobranca pacientes={l.pacientes} />
                        {whatsapp && (
                          <Button asChild variant="outline" className="mt-2 h-11 w-full gap-1.5 rounded-full">
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Contatar ${nome} via WhatsApp`}><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
                          </Button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            ) : agrupamento === 'paciente' ? (
            <div className="overflow-hidden rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Títulos</TableHead>
                      <TableHead>Total devido</TableHead>
                      <TableHead>Maior atraso</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porPaciente.map(grupo => {
                      const nome = nomePaciente(grupo.pacientes);
                      const totalFormatado = formatarReais(grupo.total);
                      const whatsapp = linkWhatsApp(grupo.pacientes?.telefone, mensagemCobranca(primeiroNome(nome), totalFormatado, grupo.maiorAtraso, grupo.titulos));
                      return (
                        <TableRow key={grupo.id}>
                          <TableCell className="font-medium">{nome || '—'}</TableCell>
                          <TableCell className="tabular-nums">{grupo.titulos}</TableCell>
                          <TableCell className="font-semibold tabular-nums">{totalFormatado}</TableCell>
                          <TableCell>
                            <Badge variant={grupo.maiorAtraso > 30 ? 'destructive' : 'outline'} className={cn('rounded-full', grupo.maiorAtraso <= 30 && 'border-warning/40 bg-warning/10 text-warning-foreground')}>{diasTexto(grupo.maiorAtraso)}</Badge>
                          </TableCell>
                          <TableCell><ContatoCobranca pacientes={grupo.pacientes} /></TableCell>
                          <TableCell className="text-right">
                            {whatsapp ? (
                              <Button aria-label={`Contatar ${nome || 'paciente'} via WhatsApp`} size="icon" variant="ghost" asChild className="h-11 w-11 rounded-full md:h-9 md:w-9">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Contatar ${nome || 'paciente'} via WhatsApp`} title="Contatar via WhatsApp">
                                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
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
            </div>
            ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Dias de atraso</TableHead>
                      <TableHead className="hidden lg:table-cell">Contato</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.map((l: any) => {
                      const vencimento = parseDateOnly(l.data_vencimento);
                      const dias = l.dias;
                      const nome = nomePaciente(l.pacientes);
                      const valorFormatado = formatarReais(saldo(l));
                      const whatsapp = linkWhatsApp(l.pacientes?.telefone, mensagemCobranca(primeiroNome(nome), valorFormatado, dias));
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{nome || '—'}</TableCell>
                          <TableCell className="text-sm">{l.descricao || '—'}</TableCell>
                          <TableCell>{valorFormatado}{l.status === 'parcial' && <span className="ml-1 text-xs text-muted-foreground">(saldo)</span>}</TableCell>
                          <TableCell>{vencimento ? format(vencimento, 'dd/MM/yyyy') : 'Data inválida'}</TableCell>
                          <TableCell>
                            <Badge
                              variant={dias > 30 ? 'destructive' : 'outline'}
                              className={cn('rounded-full', dias <= 30 && 'border-warning/40 bg-warning/10 text-warning-foreground')}
                            >
                              {diasTexto(dias)}
                            </Badge>
                            <p className="mt-1 text-[11px] text-muted-foreground">{FAIXAS_ATRASO.find(f => f.id === faixaAtraso(dias))?.label}</p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell"><ContatoCobranca pacientes={l.pacientes} /></TableCell>
                          <TableCell className="text-right">
                            {whatsapp ? (
                              <Button aria-label={`Contatar ${nome || 'paciente'} via WhatsApp`} size="icon" variant="ghost" asChild className="h-11 w-11 rounded-full md:h-9 md:w-9">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Contatar ${nome || 'paciente'} via WhatsApp sobre ${l.descricao || 'a pendência'}`} title="Contatar via WhatsApp">
                                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
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
            </div>
            )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmarEnvio}
        onOpenChange={setConfirmarEnvio}
        title="Processar cobranças vencidas"
        description={`Processar ${alvosEnvio.length === 1 ? 'a cobrança de 1 lançamento vencido' : `as cobranças de ${alvosEnvio.length} lançamentos vencidos`} com telefone ou e-mail${temFiltro ? ', conforme os filtros atuais' : ''}? A régua pode pular itens fora da data prevista ou já enviados.`}
        confirmLabel="Processar"
        variant="warning"
        onConfirm={() => void enviarTodos()}
      />
      <ConfirmDialog
        open={confirmarExportacao}
        onOpenChange={setConfirmarExportacao}
        title="Exportar lista para cobrança manual"
        description={`A planilha terá nome, contato, saldo e atraso de ${filtrados.length} ${filtrados.length === 1 ? 'título' : 'títulos'}, conforme os filtros atuais. Use-a somente para a cobrança manual autorizada pela clínica e não a compartilhe fora da equipe financeira. Nenhuma mensagem será enviada.`}
        confirmLabel="Exportar"
        variant="warning"
        onConfirm={exportarLista}
      />
    </div>
  );
}

function ContatoCobranca({ pacientes }: { pacientes: any }) {
  if (!pacientes?.telefone && !pacientes?.email) return <p className="mt-1 text-xs text-muted-foreground">Sem contato</p>;
  return (
    <div className="mt-1 space-y-1 break-all text-xs">
      {pacientes?.telefone && <p className="flex items-center gap-1"><MessageCircle className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />{pacientes.telefone}</p>}
      {pacientes?.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />{pacientes.email}</p>}
    </div>
  );
}
