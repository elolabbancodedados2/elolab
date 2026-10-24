import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock3, HandCoins, Play, RefreshCw, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { isValidDateOnly, todaySaoPauloDateOnly, toDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { descreverRegraRepasse, podeAprovarRepasse, podePagarRepasse, receitaOrigemQuitada } from '@/lib/repasseWorkflow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

type FiltroStatusRepasse = 'todos' | 'pendente' | 'aprovado' | 'pago' | 'aberto';

type TipoRepasse = 'percentual' | 'fixo';
interface MedicoRepasse { id: string; nome: string | null; crm: string; tipo_repasse: TipoRepasse | null; percentual_repasse: number | null; valor_repasse_fixo: number | null }
interface Repasse { id: string; lancamento_id: string; valor_base: number; valor_repasse: number; percentual: number; tipo_calculo: TipoRepasse; valor_configurado: number | null; status: string; lancamento_pagamento_id?: string | null; lancamentos?: { status: string } | null; medicos?: { nome: string | null; crm: string } | null }

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

interface AlteracaoRegra { alterado_por_nome: string | null; alterado_em: string }

export function ConfiguracaoMedico({ medico, ultimaAlteracao, onSaved }: { medico: MedicoRepasse; ultimaAlteracao?: AlteracaoRegra | null; onSaved: () => void }) {
  const [tipo, setTipo] = useState<TipoRepasse>(medico.tipo_repasse || 'percentual');
  const [valor, setValor] = useState(String(tipo === 'fixo' ? medico.valor_repasse_fixo || 0 : medico.percentual_repasse || 0));
  const [saving, setSaving] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const tipoAtual = medico.tipo_repasse || 'percentual';
  const regraAtual = descreverRegraRepasse(tipoAtual, tipoAtual === 'fixo' ? medico.valor_repasse_fixo : medico.percentual_repasse);
  const alteradoLocalmenteRef = useRef(false);

  useEffect(() => {
    if (alteradoLocalmenteRef.current) return;
    const tipoAtual = medico.tipo_repasse || 'percentual';
    setTipo(tipoAtual);
    setValor(String(tipoAtual === 'fixo' ? medico.valor_repasse_fixo ?? 0 : medico.percentual_repasse ?? 0));
  }, [medico.tipo_repasse, medico.valor_repasse_fixo, medico.percentual_repasse]);

  const trocarTipo = (novoTipo: TipoRepasse) => {
    alteradoLocalmenteRef.current = true;
    setTipo(novoTipo);
    setValor(String(novoTipo === 'fixo' ? medico.valor_repasse_fixo || 0 : medico.percentual_repasse || 0));
  };
  const repasseZerado = valor.trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) === 0;

  const pedirConfirmacao = () => {
    const numero = Number(valor);
    if (!valor.trim() || !Number.isFinite(numero) || numero < 0 || (tipo === 'percentual' && numero > 100)) {
      toast.error(tipo === 'percentual' ? 'Informe um percentual entre 0 e 100.' : 'Informe um valor fixo válido.');
      return;
    }
    if (Math.abs(numero * 100 - Math.round(numero * 100)) > 1e-7) {
      toast.error(tipo === 'percentual'
        ? 'Informe o percentual com no máximo duas casas decimais.'
        : 'Informe o valor com no máximo duas casas decimais.');
      return;
    }
    setConfirmando(true);
  };

  const salvar = async () => {
    const numero = Number(valor);
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('configurar_repasse_medico', { p_medico_id: medico.id, p_tipo: tipo, p_valor: numero, p_confirmado: true });
      if (error) throw error;
      alteradoLocalmenteRef.current = false;
      setConfirmando(false);
      toast.success(data?.alterado === false ? 'A regra informada já estava em vigor.' : `Regra de repasse de ${medico.nome || medico.crm} atualizada.`);
      onSaved();
    } catch (error: any) {
      toast.error('Não foi possível salvar a regra de repasse.', { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-3 rounded-2xl border border-[#DCE6F2] bg-[#F3F8FC] p-4">
    <div className="flex flex-wrap items-center gap-2"><div><p className="font-medium">{medico.nome || medico.crm}</p><p className="text-xs text-muted-foreground">CRM {medico.crm}</p></div>{repasseZerado && <Badge variant="outline" className="rounded-full border-warning/40 text-warning">Repasse zerado</Badge>}</div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1.5"><Label htmlFor={`tipo-${medico.id}`}>Tipo de repasse</Label><Select value={tipo} onValueChange={(value) => trocarTipo(value as TipoRepasse)} disabled={saving}><SelectTrigger id={`tipo-${medico.id}`} className="min-h-11 rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentual">Percentual da receita</SelectItem><SelectItem value="fixo">Valor fixo por atendimento</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor={`valor-${medico.id}`}>{tipo === 'fixo' ? 'Valor fixo (R$)' : 'Percentual (%)'}</Label><Input id={`valor-${medico.id}`} className="min-h-11 rounded-full" type="number" min="0" max={tipo === 'percentual' ? 100 : undefined} step="0.01" value={valor} onChange={(event) => { alteradoLocalmenteRef.current = true; setValor(event.target.value); }} disabled={saving} /></div>
      <Button className="h-11 gap-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" onClick={pedirConfirmacao} disabled={saving}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
    </div>
    {ultimaAlteracao && <p className="text-xs text-muted-foreground">Última alteração por {ultimaAlteracao.alterado_por_nome || 'usuário removido'} em {new Date(ultimaAlteracao.alterado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.</p>}
    <ConfirmDialog
      open={confirmando}
      onOpenChange={open => { if (!saving) setConfirmando(open); }}
      title={`Alterar regra de repasse de ${medico.nome || medico.crm}?`}
      description={`De ${regraAtual} para ${descreverRegraRepasse(tipo, Number(valor))}. A nova regra vale para as próximas conciliações; repasses já gerados não mudam. Seu usuário e a data ficarão registrados.`}
      confirmLabel="Confirmar alteração"
      variant="warning"
      isLoading={saving}
      closeOnConfirm={false}
      onConfirm={() => void salvar()}
    />
    <p className="text-xs text-muted-foreground">{repasseZerado
      ? 'Com o valor zero, recebimentos deste médico não geram repasse.'
      : tipo === 'fixo'
        ? 'Aplicado uma vez para cada atendimento com receita quitada.'
        : 'Calculado sobre o valor efetivamente recebido em cada atendimento.'}</p>
  </div>;
}

export default function RepassesMedicos() {
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const [competencia, setCompetencia] = useState(() => todaySaoPauloDateOnly().slice(0, 7));
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusRepasse>('todos');
  const competenciaValida = /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia);
  const [processing, setProcessing] = useState(false);
  const [statusProcessingId, setStatusProcessingId] = useState<string | null>(null);
  const [repassePagamentoConfirmar, setRepassePagamentoConfirmar] = useState<Repasse | null>(null);
  const [formaPagamentoRepasse, setFormaPagamentoRepasse] = useState('transferencia');
  const [dataPagamentoRepasse, setDataPagamentoRepasse] = useState(() => todaySaoPauloDateOnly());
  const [observacoesPagamentoRepasse, setObservacoesPagamentoRepasse] = useState('');
  const medicosQuery = useQuery({ queryKey: ['medicos-repasse', profile?.clinica_id ?? null], enabled: !!user && !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await (supabase as any).rpc('listar_medicos_repasse_equipe');
    if (error) throw error; return (data ?? []) as MedicoRepasse[];
  }});
  const medicos = medicosQuery.data ?? [];
  const historicoRegrasQuery = useQuery({ queryKey: ['historico-regras-repasse', profile?.clinica_id ?? null], enabled: !!user && !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await (supabase as any).rpc('historico_regras_repasse', { p_limite: 500 });
    if (error) throw error; return (data ?? []) as Array<AlteracaoRegra & { medico_id: string }>;
  }});
  const ultimaAlteracaoPorMedico = useMemo(() => {
    const mapa = new Map<string, AlteracaoRegra>();
    for (const h of historicoRegrasQuery.data ?? []) if (!mapa.has(h.medico_id)) mapa.set(h.medico_id, h);
    return mapa;
  }, [historicoRegrasQuery.data]);
  const repassesQuery = useQuery({ queryKey: ['repasses-medicos', profile?.clinica_id ?? null, competencia], enabled: competenciaValida && !!user && !!profile?.clinica_id, queryFn: async () => {
    const inicio = `${competencia}-01`;
    const fim = toDateOnly(new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 1));
    return buscarEmBlocos<Repasse>(() => (supabase as any).from('repasses_medicos').select('*,medicos(nome,crm),lancamentos!repasses_medicos_lancamento_id_fkey(status)')
      .eq('clinica_id', profile?.clinica_id ?? '').gte('competencia', inicio).lt('competencia', fim)
      .order('created_at').order('id'));
  }});
  const repasses = repassesQuery.data ?? [];
  const repassesAtingiramLimite = repasses.length >= LIMITE_BUSCA_EM_BLOCOS;
  const repassesComOrigemEstornada = repasses.filter(r => r.status !== 'cancelado' && !receitaOrigemQuitada(r.lancamentos?.status));
  const repasseValido = (r: Repasse) => r.status === 'pago' || (r.status !== 'cancelado' && receitaOrigemQuitada(r.lancamentos?.status));
  const totais = useMemo(() => ({
    base: repasses.filter(repasseValido).reduce((s, r) => s + Number(r.valor_base), 0),
    devido: repasses.filter(repasseValido).reduce((s, r) => s + Number(r.valor_repasse), 0),
    pago: repasses.filter(r => r.status === 'pago').reduce((s, r) => s + Number(r.valor_repasse), 0),
    pendente: repasses.filter(r => r.status === 'pendente' && repasseValido(r)).reduce((s, r) => s + Number(r.valor_repasse), 0),
    aprovado: repasses.filter(r => r.status === 'aprovado' && repasseValido(r)).reduce((s, r) => s + Number(r.valor_repasse), 0),
  }), [repasses]);
  const repassesFiltrados = useMemo(() => repasses.filter(r => {
    if (filtroStatus === 'todos') return true;
    if (filtroStatus === 'aberto') return r.status === 'pendente' || r.status === 'aprovado';
    return r.status === filtroStatus;
  }), [repasses, filtroStatus]);

  const gerar = async () => {
    if (!competenciaValida) { toast.error('Informe uma competência válida.'); return; }
    setProcessing(true);
    try {
      const { data, error } = await (supabase as any).rpc('gerar_repasses_medicos', { p_competencia: `${competencia}-01` });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['repasses-medicos'] });
      toast.success(data ? `${data} novo(s) repasse(s) conciliado(s).` : 'Não há novos recebimentos elegíveis nesta competência.');
    } catch (error: any) {
      toast.error('Não foi possível conciliar os recebimentos.', { description: error?.message });
    } finally {
      setProcessing(false);
    }
  };
  const mudarStatus = async (id: string, status: string) => {
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    const repasseAtual = repasses.find(repasse => repasse.id === id);
    if (!repasseAtual) { toast.error('Repasse não encontrado na lista atualizada. Recarregue e tente novamente.'); return; }
    if (status === 'pago' && (!isValidDateOnly(dataPagamentoRepasse) || dataPagamentoRepasse > todaySaoPauloDateOnly())) {
      toast.error('Informe uma data de pagamento válida, igual ou anterior a hoje.');
      return;
    }
    setStatusProcessingId(id);
    try {
      const { data: origemAtual, error: origemError } = await (supabase as any).from('lancamentos')
        .select('status').eq('id', repasseAtual.lancamento_id).eq('clinica_id', profile.clinica_id).maybeSingle();
      if (origemError) throw origemError;
      if (!receitaOrigemQuitada(origemAtual?.status)) {
        await queryClient.invalidateQueries({ queryKey: ['repasses-medicos'] });
        throw new Error('A receita de origem foi estornada ou deixou de estar quitada. O repasse não pode avançar.');
      }
      let jaRegistrado = false;
      if (status === 'pago') {
        const { data, error } = await (supabase as any).rpc('registrar_pagamento_repasse_medico', {
          p_repasse_id: id,
          p_forma_pagamento: formaPagamentoRepasse,
          p_data_pagamento: dataPagamentoRepasse,
          p_observacoes: observacoesPagamentoRepasse.trim() || null,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'O pagamento não foi registrado.');
        jaRegistrado = Boolean(data.ja_registrado);
      } else {
        const { data, error } = await (supabase as any).rpc('aprovar_repasse_medico', {
          p_repasse_id: id,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Este repasse mudou de status. Atualize a lista antes de continuar.');
      }
      await queryClient.invalidateQueries({ queryKey: ['repasses-medicos'] });
      if (status === 'pago') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
          queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
          queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
        ]);
        setRepassePagamentoConfirmar(null);
        setDataPagamentoRepasse(todaySaoPauloDateOnly());
        setObservacoesPagamentoRepasse('');
        toast.success(jaRegistrado ? 'O pagamento deste repasse já estava registrado.' : 'Pagamento registrado como despesa no fluxo financeiro.');
      } else {
        toast.success('Repasse aprovado.');
      }
    } catch (error: any) {
      toast.error('Não foi possível atualizar o repasse.', { description: error?.message });
    } finally {
      setStatusProcessingId(null);
    }
  };

  if (medicosQuery.isError) return <ErrorState title="Não foi possível carregar os médicos" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
  if (repassesQuery.isError) return <ErrorState title="Não foi possível carregar os repasses" error={repassesQuery.error} onRetry={() => void repassesQuery.refetch()} />;

  const emAberto = Math.max(0, totais.devido - totais.pago);
  const descricaoHeader = repasses.length === 0
    ? 'Configure valor fixo ou percentual e concilie honorários sobre receitas quitadas.'
    : `${repasses.length} repasse(s) na competência · ${moeda(emAberto)} em aberto`;
  const atualizarTudo = () => { void medicosQuery.refetch(); void repassesQuery.refetch(); };

  const kpis = [
    { key: 'aberto' as const, label: 'Em aberto', value: emAberto, icon: Clock3, color: 'text-white', surface: 'bg-white/15', escuro: true, caption: 'pendente + aprovado a pagar' },
    { key: 'pendente' as const, label: 'Pendente', value: totais.pendente, icon: AlertTriangle, color: 'text-warning', surface: 'bg-warning/10', escuro: false, caption: 'aguardando aprovação' },
    { key: 'aprovado' as const, label: 'Aprovado', value: totais.aprovado, icon: BadgeCheck, color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false, caption: 'aguardando pagamento' },
    { key: 'pago' as const, label: 'Pago', value: totais.pago, icon: CheckCircle2, color: 'text-success', surface: 'bg-success/10', escuro: false, caption: 'já pago na competência' },
  ];

  return <div className="space-y-6 pb-8">
    <PageHeader
      title="Repasses médicos"
      description={descricaoHeader}
      icon={<HandCoins />}
      actions={(
        <>
          <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={atualizarTudo} aria-label="Atualizar repasses" title="Atualizar repasses">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110"
            onClick={gerar}
            disabled={processing || !competenciaValida}
          >
            {processing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Conciliar recebimentos
          </Button>
        </>
      )}
    />
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-xs"><div className="space-y-1.5"><Label htmlFor="competencia">Competência</Label><Input id="competencia" className="min-h-11 w-full rounded-full sm:w-52" type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} disabled={processing} />{!competenciaValida && <p className="text-xs text-destructive">Selecione uma competência válida.</p>}</div></div>
    {repassesComOrigemEstornada.length > 0 && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{repassesComOrigemEstornada.length} repasse(s) estão vinculados a receitas que não aparecem mais como quitadas. Aprovação e pagamento ficam bloqueados; revise os casos que já constam como pagos.</p></div>}
    <section role="group" aria-label="Resumo dos repasses" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map(kpi => {
        const Icon = kpi.icon;
        const ativo = filtroStatus === kpi.key;
        return (
          <button
            key={kpi.key}
            type="button"
            aria-pressed={ativo}
            onClick={() => setFiltroStatus(ativo ? 'todos' : kpi.key)}
            className={cn(
              'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
              kpi.escuro && 'border-transparent bg-gradient-primary text-white',
              ativo && !kpi.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
              ativo && kpi.escuro && 'ring-2 ring-[#1080CA]/60',
            )}
          >
            <div className="flex items-start justify-between gap-2 p-4">
              <div>
                <p className={cn('text-xs font-medium', kpi.escuro ? 'text-white/80' : 'text-muted-foreground')}>{kpi.label}</p>
                <p className={cn('mt-1 text-lg font-bold tabular-nums sm:text-xl', kpi.color)}>{moeda(kpi.value)}</p>
                <p className={cn('mt-0.5 text-[11px]', kpi.escuro ? 'text-white/60' : 'text-muted-foreground')}>{kpi.caption}</p>
              </div>
              <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kpi.surface)}>
                <Icon className={cn('h-4 w-4', kpi.color)} />
              </span>
            </div>
          </button>
        );
      })}
    </section>
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white">
            <HandCoins className="h-4 w-4" />
          </span>
          Regra por médico
        </CardTitle>
        <CardDescription>Escolha uma regra e salve. Cada alteração pede confirmação, registra quem alterou e quando, e vale para novas conciliações.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 xl:grid-cols-2">{medicosQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando médicos…</p> : medicos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum médico ativo cadastrado para esta clínica.</p> : medicos.map(medico => <ConfiguracaoMedico key={medico.id} medico={medico} ultimaAlteracao={ultimaAlteracaoPorMedico.get(medico.id)} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ['medicos-repasse'] }); void queryClient.invalidateQueries({ queryKey: ['historico-regras-repasse'] }); }} />)}</CardContent>
    </Card>
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white">
            <HandCoins className="h-4 w-4" />
          </span>
          Fechamento
          <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[#1080CA]">{repassesFiltrados.length} de {repasses.length}</Badge>
        </CardTitle>
        <CardDescription>O pagamento registrado gera uma despesa no Fluxo de Caixa. A transferência ao médico é realizada fora do EloLab.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {repassesAtingiramLimite && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros. Os totais podem não incluir todos os repasses.</p></div>}
        {repassesQuery.isLoading ? <p>Carregando…</p> : repasses.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
              <HandCoins className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">Nenhum repasse nesta competência</p>
            <p className="mt-1 text-sm">Concilie os recebimentos para gerar os itens elegíveis.</p>
          </div>
        ) : repassesFiltrados.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
              <HandCoins className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">Nenhum repasse corresponde ao filtro selecionado</p>
            <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => setFiltroStatus('todos')}>Limpar filtro</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader><TableRow><TableHead>Médico</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Repasse</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader>
              <TableBody>{repassesFiltrados.map(r => <TableRow key={r.id}>
                <TableCell>{r.medicos?.nome || r.medicos?.crm}<p className="text-xs text-muted-foreground">{r.tipo_calculo === 'fixo' ? `${moeda(r.valor_configurado || r.valor_repasse)} fixo` : `${r.percentual}%`}</p></TableCell>
                <TableCell className="text-right">{moeda(r.valor_base)}</TableCell>
                <TableCell className="text-right font-medium">{moeda(r.valor_repasse)}</TableCell>
                <TableCell><Badge variant="outline" className={cn('rounded-full', r.status === 'pago' ? 'border-success/40 bg-success/10 text-success-foreground' : r.status === 'aprovado' ? 'border-[#BFD8EE] bg-[#1080CA]/10 text-[#1080CA]' : 'border-warning/40 bg-warning/10 text-warning-foreground')}>{r.status === 'pago' ? 'Pago' : r.status === 'aprovado' ? 'Aprovado' : 'Pendente'}</Badge>{r.status === 'pago' && !r.lancamento_pagamento_id && <p className="mt-1 text-[10px] text-warning">Pago antes do vínculo automático</p>}</TableCell>
                <TableCell>
                  {podeAprovarRepasse(r.status, r.lancamentos?.status) && <Button size="sm" disabled={statusProcessingId !== null} onClick={() => void mudarStatus(r.id, 'aprovado')} className="h-9 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110">Aprovar</Button>}
                  {podePagarRepasse(r.status, r.lancamentos?.status) && <Button size="sm" disabled={statusProcessingId !== null} onClick={() => { setFormaPagamentoRepasse('transferencia'); setDataPagamentoRepasse(todaySaoPauloDateOnly()); setObservacoesPagamentoRepasse(''); setRepassePagamentoConfirmar(r); }} className="h-9 gap-1 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110"><CheckCircle2 className="h-3.5 w-3.5" />Registrar pagamento</Button>}
                  {r.status !== 'pago' && r.status !== 'cancelado' && !receitaOrigemQuitada(r.lancamentos?.status) && <span className="text-xs text-destructive">Receita estornada</span>}
                </TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog open={!!repassePagamentoConfirmar} onOpenChange={open => { if (!open && statusProcessingId === null) setRepassePagamentoConfirmar(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento do repasse</DialogTitle>
          <DialogDescription>
            Confirme que o pagamento de {moeda(Number(repassePagamentoConfirmar?.valor_repasse || 0))} para {repassePagamentoConfirmar?.medicos?.nome || repassePagamentoConfirmar?.medicos?.crm || 'o médico'} já foi realizado. O EloLab registrará a saída no Fluxo de Caixa; nenhuma transferência será iniciada pelo sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="forma-pagamento-repasse">Forma de pagamento</Label>
          <Select value={formaPagamentoRepasse} onValueChange={setFormaPagamentoRepasse} disabled={statusProcessingId !== null}>
            <SelectTrigger id="forma-pagamento-repasse"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="transferencia">Transferência</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
              <SelectItem value="credito">Cartão de crédito</SelectItem>
              <SelectItem value="debito">Cartão de débito</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="data-pagamento-repasse">Data em que foi pago</Label>
          <Input id="data-pagamento-repasse" type="date" required max={todaySaoPauloDateOnly()}
            value={dataPagamentoRepasse} onChange={event => setDataPagamentoRepasse(event.target.value)}
            disabled={statusProcessingId !== null} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="observacoes-pagamento-repasse">Referência ou observação (opcional)</Label>
          <Textarea id="observacoes-pagamento-repasse" value={observacoesPagamentoRepasse}
            onChange={event => setObservacoesPagamentoRepasse(event.target.value)}
            placeholder="Ex.: transferência realizada em 06/10, comprovante 12345"
            rows={2} disabled={statusProcessingId !== null} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setRepassePagamentoConfirmar(null)} disabled={statusProcessingId !== null}>Cancelar</Button>
          <Button className="rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" onClick={() => { if (repassePagamentoConfirmar) void mudarStatus(repassePagamentoConfirmar.id, 'pago'); }} disabled={!repassePagamentoConfirmar || !dataPagamentoRepasse || dataPagamentoRepasse > todaySaoPauloDateOnly() || statusProcessingId !== null}>
            {statusProcessingId === repassePagamentoConfirmar?.id && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar pagamento realizado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
