import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HandCoins, Play, RefreshCw, Save } from 'lucide-react';
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
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';

type TipoRepasse = 'percentual' | 'fixo';
interface MedicoRepasse { id: string; nome: string | null; crm: string; tipo_repasse: TipoRepasse | null; percentual_repasse: number | null; valor_repasse_fixo: number | null }
interface Repasse { id: string; valor_base: number; valor_repasse: number; percentual: number; tipo_calculo: TipoRepasse; valor_configurado: number | null; status: string; lancamento_pagamento_id?: string | null; medicos?: { nome: string | null; crm: string } | null }

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

function ConfiguracaoMedico({ medico, onSaved }: { medico: MedicoRepasse; onSaved: () => void }) {
  const [tipo, setTipo] = useState<TipoRepasse>(medico.tipo_repasse || 'percentual');
  const [valor, setValor] = useState(String(tipo === 'fixo' ? medico.valor_repasse_fixo || 0 : medico.percentual_repasse || 0));
  const [saving, setSaving] = useState(false);
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

  const salvar = async () => {
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
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('configurar_repasse_medico', { p_medico_id: medico.id, p_tipo: tipo, p_valor: numero });
      if (error) throw error;
      alteradoLocalmenteRef.current = false;
      toast.success(`Regra de repasse de ${medico.nome || medico.crm} atualizada.`);
      onSaved();
    } catch (error: any) {
      toast.error('Não foi possível salvar a regra de repasse.', { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return <div className="rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2"><div><p className="font-medium">{medico.nome || medico.crm}</p><p className="text-xs text-muted-foreground">CRM {medico.crm}</p></div>{repasseZerado && <Badge variant="outline" className="border-warning/40 text-warning">Repasse zerado</Badge>}</div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1.5"><Label htmlFor={`tipo-${medico.id}`}>Tipo de repasse</Label><Select value={tipo} onValueChange={(value) => trocarTipo(value as TipoRepasse)} disabled={saving}><SelectTrigger id={`tipo-${medico.id}`} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentual">Percentual da receita</SelectItem><SelectItem value="fixo">Valor fixo por atendimento</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor={`valor-${medico.id}`}>{tipo === 'fixo' ? 'Valor fixo (R$)' : 'Percentual (%)'}</Label><Input id={`valor-${medico.id}`} className="min-h-11" type="number" min="0" max={tipo === 'percentual' ? 100 : undefined} step="0.01" value={valor} onChange={(event) => { alteradoLocalmenteRef.current = true; setValor(event.target.value); }} disabled={saving} /></div>
      <Button className="min-h-11 gap-2" onClick={salvar} disabled={saving}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
    </div>
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
  const competenciaValida = /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia);
  const [processing, setProcessing] = useState(false);
  const [statusProcessingId, setStatusProcessingId] = useState<string | null>(null);
  const [repassePagamentoConfirmar, setRepassePagamentoConfirmar] = useState<Repasse | null>(null);
  const [formaPagamentoRepasse, setFormaPagamentoRepasse] = useState('transferencia');
  const [dataPagamentoRepasse, setDataPagamentoRepasse] = useState(() => todaySaoPauloDateOnly());
  const [observacoesPagamentoRepasse, setObservacoesPagamentoRepasse] = useState('');
  const medicosQuery = useQuery({ queryKey: ['medicos-repasse', profile?.clinica_id ?? null], enabled: !!user && !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await (supabase as any).from('medicos').select('id,nome,crm,tipo_repasse,percentual_repasse,valor_repasse_fixo').eq('clinica_id', profile?.clinica_id ?? '').eq('ativo', true).order('nome');
    if (error) throw error; return (data ?? []) as MedicoRepasse[];
  }});
  const medicos = medicosQuery.data ?? [];
  const repassesQuery = useQuery({ queryKey: ['repasses-medicos', profile?.clinica_id ?? null, competencia], enabled: competenciaValida && !!user && !!profile?.clinica_id, queryFn: async () => {
    const inicio = `${competencia}-01`;
    const fim = toDateOnly(new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 1));
    return buscarEmBlocos<Repasse>(() => (supabase as any).from('repasses_medicos').select('*,medicos(nome,crm)')
      .eq('clinica_id', profile?.clinica_id ?? '').gte('competencia', inicio).lt('competencia', fim)
      .order('created_at').order('id'));
  }});
  const repasses = repassesQuery.data ?? [];
  const repassesAtingiramLimite = repasses.length >= LIMITE_BUSCA_EM_BLOCOS;
  const totais = useMemo(() => ({
    base: repasses.filter(r => r.status !== 'cancelado').reduce((s, r) => s + Number(r.valor_base), 0),
    devido: repasses.filter(r => r.status !== 'cancelado').reduce((s, r) => s + Number(r.valor_repasse), 0),
    pago: repasses.filter(r => r.status === 'pago').reduce((s, r) => s + Number(r.valor_repasse), 0),
  }), [repasses]);

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
    if (status === 'pago' && (!isValidDateOnly(dataPagamentoRepasse) || dataPagamentoRepasse > todaySaoPauloDateOnly())) {
      toast.error('Informe uma data de pagamento válida, igual ou anterior a hoje.');
      return;
    }
    setStatusProcessingId(id);
    try {
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
        const { data, error } = await (supabase as any).from('repasses_medicos').update({
          status, aprovado_em: new Date().toISOString(),
        }).eq('id', id).eq('clinica_id', profile.clinica_id).eq('status', 'pendente').select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este repasse já mudou de status. Atualize a lista antes de continuar.');
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

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Repasses médicos</h1><p className="text-sm text-muted-foreground">Configure valor fixo ou percentual e concilie honorários sobre receitas quitadas.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1.5"><Label htmlFor="competencia">Competência</Label><Input id="competencia" className="min-h-11" type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} disabled={processing} />{!competenciaValida && <p className="text-xs text-destructive">Selecione uma competência válida.</p>}</div><Button className="min-h-11" onClick={gerar} disabled={processing || !competenciaValida}>{processing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Conciliar recebimentos</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([['Base recebida', totais.base], ['Total de repasses', totais.devido], ['Pago', totais.pago], ['Em aberto', Math.max(0, totais.devido - totais.pago)]] as const).map(([label, valor]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{moeda(valor)}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Regra por médico</CardTitle><CardDescription>Escolha uma regra e salve. Alterações valem para novas conciliações.</CardDescription></CardHeader><CardContent className="grid gap-3 xl:grid-cols-2">{medicosQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando médicos…</p> : medicos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum médico ativo cadastrado para esta clínica.</p> : medicos.map(medico => <ConfiguracaoMedico key={medico.id} medico={medico} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['medicos-repasse'] })} />)}</CardContent></Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base"><HandCoins className="mr-2 inline h-4 w-4" />Fechamento</CardTitle>
        <CardDescription>O pagamento registrado gera uma despesa no Fluxo de Caixa. A transferência ao médico é realizada fora do EloLab.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {repassesAtingiramLimite && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros. Os totais podem não incluir todos os repasses.</p></div>}
        {repassesQuery.isLoading ? <p>Carregando…</p> : repasses.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum repasse nesta competência. Concilie os recebimentos para gerar os itens elegíveis.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Médico</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Repasse</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader>
            <TableBody>{repasses.map(r => <TableRow key={r.id}>
              <TableCell>{r.medicos?.nome || r.medicos?.crm}<p className="text-xs text-muted-foreground">{r.tipo_calculo === 'fixo' ? `${moeda(r.valor_configurado || r.valor_repasse)} fixo` : `${r.percentual}%`}</p></TableCell>
              <TableCell className="text-right">{moeda(r.valor_base)}</TableCell>
              <TableCell className="text-right font-medium">{moeda(r.valor_repasse)}</TableCell>
              <TableCell><Badge variant="outline">{r.status}</Badge>{r.status === 'pago' && !r.lancamento_pagamento_id && <p className="mt-1 text-[10px] text-warning">Pago antes do vínculo automático</p>}</TableCell>
              <TableCell>
                {r.status === 'pendente' && <Button size="sm" variant="outline" disabled={statusProcessingId !== null} onClick={() => void mudarStatus(r.id, 'aprovado')}>Aprovar</Button>}
                {r.status === 'aprovado' && <Button size="sm" disabled={statusProcessingId !== null} onClick={() => { setFormaPagamentoRepasse('transferencia'); setDataPagamentoRepasse(todaySaoPauloDateOnly()); setObservacoesPagamentoRepasse(''); setRepassePagamentoConfirmar(r); }}><CheckCircle2 className="mr-1 h-4 w-4" />Registrar pagamento</Button>}
              </TableCell>
            </TableRow>)}</TableBody>
          </Table>
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
          <Button variant="outline" onClick={() => setRepassePagamentoConfirmar(null)} disabled={statusProcessingId !== null}>Cancelar</Button>
          <Button onClick={() => { if (repassePagamentoConfirmar) void mudarStatus(repassePagamentoConfirmar.id, 'pago'); }} disabled={!repassePagamentoConfirmar || !dataPagamentoRepasse || dataPagamentoRepasse > todaySaoPauloDateOnly() || statusProcessingId !== null}>
            {statusProcessingId === repassePagamentoConfirmar?.id && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar pagamento realizado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
