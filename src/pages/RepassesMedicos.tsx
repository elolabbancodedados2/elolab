import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HandCoins, Play, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const competenciaAtual = new Date().toISOString().slice(0, 7);
const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function RepassesMedicos() {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [processing, setProcessing] = useState(false);
  const { data: medicos = [] } = useQuery({ queryKey: ['medicos-repasse'], queryFn: async () => {
    const { data, error } = await supabase.from('medicos').select('id,nome,crm,percentual_repasse').eq('ativo', true).order('nome');
    if (error) throw error; return data ?? [];
  }});
  const { data: repasses = [], isLoading } = useQuery({ queryKey: ['repasses-medicos', competencia], queryFn: async () => {
    const inicio = `${competencia}-01`;
    const fim = new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 1).toISOString().slice(0, 10);
    const { data, error } = await (supabase as any).from('repasses_medicos').select('*,medicos(nome,crm)').gte('competencia', inicio).lt('competencia', fim).order('created_at');
    if (error) throw error; return data ?? [];
  }});
  const totais = useMemo(() => ({
    base: repasses.filter((r:any) => r.status !== 'cancelado').reduce((s:number,r:any)=>s+Number(r.valor_base),0),
    devido: repasses.filter((r:any) => r.status !== 'cancelado').reduce((s:number,r:any)=>s+Number(r.valor_repasse),0),
    pago: repasses.filter((r:any) => r.status === 'pago').reduce((s:number,r:any)=>s+Number(r.valor_repasse),0),
  }), [repasses]);

  async function configurar(id: string, percentual: number) {
    const { error } = await (supabase as any).rpc('configurar_percentual_repasse', { p_medico_id: id, p_percentual: percentual });
    if (error) return toast.error(error.message); qc.invalidateQueries({ queryKey: ['medicos-repasse'] }); toast.success('Percentual atualizado.');
  }
  async function gerar() {
    setProcessing(true);
    const { data, error } = await (supabase as any).rpc('gerar_repasses_medicos', { p_competencia: `${competencia}-01` });
    setProcessing(false);
    if (error) return toast.error(error.message); qc.invalidateQueries({ queryKey: ['repasses-medicos'] }); toast.success(`${data ?? 0} repasse(s) conciliado(s).`);
  }
  async function mudarStatus(id: string, status: string) {
    const changes:any = { status };
    if (status === 'aprovado') changes.aprovado_em = new Date().toISOString();
    if (status === 'pago') changes.pago_em = new Date().toISOString();
    const { error } = await (supabase as any).from('repasses_medicos').update(changes).eq('id', id);
    if (error) return toast.error(error.message); qc.invalidateQueries({ queryKey: ['repasses-medicos'] });
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Repasses médicos</h1><p className="text-sm text-muted-foreground">Conciliação de honorários sobre receitas quitadas.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div><label className="text-sm font-medium" htmlFor="competencia">Competência</label><Input id="competencia" type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)} /></div><Button onClick={gerar} disabled={processing}>{processing?<RefreshCw className="mr-2 h-4 w-4 animate-spin"/>:<Play className="mr-2 h-4 w-4"/>}Conciliar recebimentos</Button></div>
    <div className="grid gap-3 sm:grid-cols-3">{[['Base recebida',totais.base],['Repasse devido',totais.devido],['Repasse pago',totais.pago]].map(([l,v])=><Card key={String(l)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold">{moeda(Number(v))}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Percentuais por médico</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{medicos.map((m:any)=><div key={m.id} className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{m.nome || m.crm}</p><p className="text-xs text-muted-foreground">CRM {m.crm}</p></div><Input className="w-24" aria-label={`Percentual de ${m.nome || m.crm}`} type="number" min="0" max="100" step="0.01" defaultValue={m.percentual_repasse || 0} onBlur={e=>configurar(m.id,Number(e.target.value))}/><span>%</span></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base"><HandCoins className="mr-2 inline h-4 w-4"/>Fechamento</CardTitle></CardHeader><CardContent>{isLoading?<p>Carregando…</p>:<Table><TableHeader><TableRow><TableHead>Médico</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Repasse</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{repasses.map((r:any)=><TableRow key={r.id}><TableCell>{r.medicos?.nome || r.medicos?.crm}<p className="text-xs text-muted-foreground">{r.percentual}%</p></TableCell><TableCell className="text-right">{moeda(r.valor_base)}</TableCell><TableCell className="text-right font-medium">{moeda(r.valor_repasse)}</TableCell><TableCell><Badge variant="outline">{r.status}</Badge></TableCell><TableCell>{r.status==='pendente'&&<Button size="sm" variant="outline" onClick={()=>mudarStatus(r.id,'aprovado')}>Aprovar</Button>}{r.status==='aprovado'&&<Button size="sm" onClick={()=>mudarStatus(r.id,'pago')}><CheckCircle2 className="mr-1 h-4 w-4"/>Pagar</Button>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </div>;
}
