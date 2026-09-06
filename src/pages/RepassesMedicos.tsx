import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HandCoins, Play, RefreshCw, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { todayDateOnly, toDateOnly } from '@/lib/dateOnly';

type TipoRepasse = 'percentual' | 'fixo';
interface MedicoRepasse { id: string; nome: string | null; crm: string; tipo_repasse: TipoRepasse | null; percentual_repasse: number | null; valor_repasse_fixo: number | null }
interface Repasse { id: string; valor_base: number; valor_repasse: number; percentual: number; tipo_calculo: TipoRepasse; valor_configurado: number | null; status: string; medicos?: { nome: string | null; crm: string } | null }

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

function ConfiguracaoMedico({ medico, onSaved }: { medico: MedicoRepasse; onSaved: () => void }) {
  const [tipo, setTipo] = useState<TipoRepasse>(medico.tipo_repasse || 'percentual');
  const [valor, setValor] = useState(String(tipo === 'fixo' ? medico.valor_repasse_fixo || 0 : medico.percentual_repasse || 0));
  const [saving, setSaving] = useState(false);

  const trocarTipo = (novoTipo: TipoRepasse) => {
    setTipo(novoTipo);
    setValor(String(novoTipo === 'fixo' ? medico.valor_repasse_fixo || 0 : medico.percentual_repasse || 0));
  };

  const salvar = async () => {
    const numero = Number(valor);
    if (!valor.trim() || !Number.isFinite(numero) || numero < 0 || (tipo === 'percentual' && numero > 100)) {
      toast.error(tipo === 'percentual' ? 'Informe um percentual entre 0 e 100.' : 'Informe um valor fixo válido.');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc('configurar_repasse_medico', { p_medico_id: medico.id, p_tipo: tipo, p_valor: numero });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Regra de repasse de ${medico.nome || medico.crm} atualizada.`);
    onSaved();
  };

  return <div className="rounded-lg border p-4 space-y-3">
    <div><p className="font-medium">{medico.nome || medico.crm}</p><p className="text-xs text-muted-foreground">CRM {medico.crm}</p></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1.5"><Label htmlFor={`tipo-${medico.id}`}>Tipo de repasse</Label><Select value={tipo} onValueChange={(value) => trocarTipo(value as TipoRepasse)}><SelectTrigger id={`tipo-${medico.id}`} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentual">Percentual da receita</SelectItem><SelectItem value="fixo">Valor fixo por atendimento</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor={`valor-${medico.id}`}>{tipo === 'fixo' ? 'Valor fixo (R$)' : 'Percentual (%)'}</Label><Input id={`valor-${medico.id}`} className="min-h-11" type="number" min="0" max={tipo === 'percentual' ? 100 : undefined} step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} /></div>
      <Button className="min-h-11 gap-2" onClick={salvar} disabled={saving}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
    </div>
    <p className="text-xs text-muted-foreground">{tipo === 'fixo' ? 'Aplicado uma vez para cada atendimento com receita quitada.' : 'Calculado sobre o valor efetivamente recebido em cada atendimento.'}</p>
  </div>;
}

export default function RepassesMedicos() {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(() => todayDateOnly().slice(0, 7));
  const competenciaValida = /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia);
  const [processing, setProcessing] = useState(false);
  const { data: medicos = [] } = useQuery({ queryKey: ['medicos-repasse'], queryFn: async () => {
    const { data, error } = await (supabase as any).from('medicos').select('id,nome,crm,tipo_repasse,percentual_repasse,valor_repasse_fixo').eq('ativo', true).order('nome');
    if (error) throw error; return (data ?? []) as MedicoRepasse[];
  }});
  const { data: repasses = [], isLoading } = useQuery({ queryKey: ['repasses-medicos', competencia], enabled: competenciaValida, queryFn: async () => {
    const inicio = `${competencia}-01`;
    const fim = toDateOnly(new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 1));
    const { data, error } = await (supabase as any).from('repasses_medicos').select('*,medicos(nome,crm)').gte('competencia', inicio).lt('competencia', fim).order('created_at');
    if (error) throw error; return (data ?? []) as Repasse[];
  }});
  const totais = useMemo(() => ({
    base: repasses.filter(r => r.status !== 'cancelado').reduce((s, r) => s + Number(r.valor_base), 0),
    devido: repasses.filter(r => r.status !== 'cancelado').reduce((s, r) => s + Number(r.valor_repasse), 0),
    pago: repasses.filter(r => r.status === 'pago').reduce((s, r) => s + Number(r.valor_repasse), 0),
  }), [repasses]);

  const gerar = async () => {
    if (!competenciaValida) { toast.error('Informe uma competência válida.'); return; }
    setProcessing(true);
    const { data, error } = await (supabase as any).rpc('gerar_repasses_medicos', { p_competencia: `${competencia}-01` });
    setProcessing(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ['repasses-medicos'] }); toast.success(`${data ?? 0} repasse(s) conciliado(s).`);
  };
  const mudarStatus = async (id: string, status: string) => {
    const changes: Record<string, string> = { status };
    if (status === 'aprovado') changes.aprovado_em = new Date().toISOString();
    if (status === 'pago') changes.pago_em = new Date().toISOString();
    const { error } = await (supabase as any).from('repasses_medicos').update(changes).eq('id', id);
    if (error) return toast.error(error.message); queryClient.invalidateQueries({ queryKey: ['repasses-medicos'] });
  };

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Repasses médicos</h1><p className="text-sm text-muted-foreground">Configure valor fixo ou percentual e concilie honorários sobre receitas quitadas.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1.5"><Label htmlFor="competencia">Competência</Label><Input id="competencia" className="min-h-11" type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} /></div><Button className="min-h-11" onClick={gerar} disabled={processing}>{processing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Conciliar recebimentos</Button></div>
    <div className="grid gap-3 sm:grid-cols-3">{([['Base recebida', totais.base], ['Repasse devido', totais.devido], ['Repasse pago', totais.pago]] as const).map(([label, valor]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{moeda(valor)}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Regra por médico</CardTitle><CardDescription>Escolha uma regra e salve. Alterações valem para novas conciliações.</CardDescription></CardHeader><CardContent className="grid gap-3 xl:grid-cols-2">{medicos.map(medico => <ConfiguracaoMedico key={medico.id} medico={medico} onSaved={() => queryClient.invalidateQueries({ queryKey: ['medicos-repasse'] })} />)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base"><HandCoins className="mr-2 inline h-4 w-4" />Fechamento</CardTitle></CardHeader><CardContent className="overflow-x-auto">{isLoading ? <p>Carregando…</p> : <Table><TableHeader><TableRow><TableHead>Médico</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Repasse</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{repasses.map(r => <TableRow key={r.id}><TableCell>{r.medicos?.nome || r.medicos?.crm}<p className="text-xs text-muted-foreground">{r.tipo_calculo === 'fixo' ? `${moeda(r.valor_configurado || r.valor_repasse)} fixo` : `${r.percentual}%`}</p></TableCell><TableCell className="text-right">{moeda(r.valor_base)}</TableCell><TableCell className="text-right font-medium">{moeda(r.valor_repasse)}</TableCell><TableCell><Badge variant="outline">{r.status}</Badge></TableCell><TableCell>{r.status === 'pendente' && <Button size="sm" variant="outline" onClick={() => mudarStatus(r.id, 'aprovado')}>Aprovar</Button>}{r.status === 'aprovado' && <Button size="sm" onClick={() => mudarStatus(r.id, 'pago')}><CheckCircle2 className="mr-1 h-4 w-4" />Pagar</Button>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </div>;
}
