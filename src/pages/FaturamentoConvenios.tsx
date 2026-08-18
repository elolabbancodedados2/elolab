import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileDown, FileStack, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const hoje = new Date().toISOString().slice(0, 10);

export default function FaturamentoConvenios() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [lotOpen, setLotOpen] = useState(false);
  const [glosaOpen, setGlosaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lotForm, setLotForm] = useState({ convenio_id: '', competencia: hoje.slice(0, 7) + '-01', numero_lote: '', quantidade_guias: 0, valor_apresentado: 0 });
  const [glosaForm, setGlosaForm] = useState({ lote_id: '', codigo_glosa: '', motivo: '', guia_referencia: '', valor_glosado: 0 });

  const { data: convenios = [] } = useQuery({ queryKey: ['convenios-faturamento'], queryFn: async () => {
    const { data, error } = await supabase.from('convenios').select('id,nome,versao_tiss').eq('ativo', true).order('nome');
    if (error) throw error; return data ?? [];
  }});
  const { data: lotes = [], isLoading } = useQuery({ queryKey: ['lotes-tiss'], queryFn: async () => {
    const { data, error } = await (supabase as any).from('lotes_tiss').select('*,convenios(nome,registro_ans)').order('competencia', { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  const { data: glosas = [] } = useQuery({ queryKey: ['glosas-convenio'], queryFn: async () => {
    const { data, error } = await (supabase as any).from('glosas_convenio').select('*,lotes_tiss(numero_lote,convenios(nome))').order('created_at', { ascending: false });
    if (error) throw error; return data ?? [];
  }});

  const resumo = useMemo(() => ({
    apresentado: lotes.reduce((s: number, l: any) => s + Number(l.valor_apresentado || 0), 0),
    pago: lotes.reduce((s: number, l: any) => s + Number(l.valor_pago || 0), 0),
    glosado: glosas.reduce((s: number, g: any) => s + Number(g.valor_glosado || 0), 0),
    recuperado: glosas.reduce((s: number, g: any) => s + Number(g.valor_recuperado || 0), 0),
  }), [lotes, glosas]);

  async function saveLot() {
    if (!lotForm.convenio_id || !lotForm.numero_lote.trim()) return toast.error('Convênio e número do lote são obrigatórios.');
    const convenio: any = convenios.find((c: any) => c.id === lotForm.convenio_id);
    setSaving(true);
    const { error } = await (supabase as any).from('lotes_tiss').insert({ ...lotForm, numero_lote: lotForm.numero_lote.trim(), versao_tiss: convenio?.versao_tiss || '04.01.00', clinica_id: profile?.clinica_id });
    setSaving(false);
    if (error) return toast.error(error.message);
    setLotOpen(false); setLotForm({ convenio_id: '', competencia: hoje.slice(0, 7) + '-01', numero_lote: '', quantidade_guias: 0, valor_apresentado: 0 });
    queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }); toast.success('Lote criado.');
  }

  async function saveGlosa() {
    if (!glosaForm.lote_id || !glosaForm.codigo_glosa.trim() || !glosaForm.motivo.trim() || glosaForm.valor_glosado <= 0) return toast.error('Preencha lote, código, motivo e valor da glosa.');
    setSaving(true);
    const { error } = await (supabase as any).from('glosas_convenio').insert({ ...glosaForm, clinica_id: profile?.clinica_id });
    setSaving(false);
    if (error) return toast.error(error.message);
    setGlosaOpen(false); queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] }); toast.success('Glosa registrada.');
  }

  async function updateLot(id: string, status: string) {
    const changes: any = { status };
    if (status === 'enviado') changes.enviado_em = new Date().toISOString();
    const { error } = await (supabase as any).from('lotes_tiss').update(changes).eq('id', id);
    if (error) return toast.error(error.message); queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] });
  }

  async function updateGlosa(id: string, status: string) {
    const changes: any = { status };
    if (status === 'recurso_enviado') changes.recurso_enviado_em = new Date().toISOString();
    if (['aceita', 'mantida'].includes(status)) changes.resolvido_em = new Date().toISOString();
    const { error } = await (supabase as any).from('glosas_convenio').update(changes).eq('id', id);
    if (error) return toast.error(error.message); queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] });
  }

  function exportLot(lote: any) {
    const escape = (v: unknown) => String(v ?? '').replace(/[<>&'\"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;' }[c]!));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<loteOperacional versaoTISS="${escape(lote.versao_tiss)}"><numero>${escape(lote.numero_lote)}</numero><competencia>${escape(lote.competencia)}</competencia><registroANS>${escape(lote.convenios?.registro_ans)}</registroANS><quantidadeGuias>${lote.quantidade_guias}</quantidadeGuias><valorApresentado>${Number(lote.valor_apresentado).toFixed(2)}</valorApresentado></loteOperacional>`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' })); const a = document.createElement('a'); a.href = url; a.download = `lote-${lote.numero_lote}.xml`; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Faturamento de Convênios</h1><p className="text-sm text-muted-foreground">Lotes TISS, retorno das operadoras, glosas e recursos.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      ['Apresentado', resumo.apresentado], ['Pago', resumo.pago], ['Glosado', resumo.glosado], ['Recuperado', resumo.recuperado],
    ].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{brl(Number(value))}</p></CardContent></Card>)}</div>
    <div className="flex flex-wrap gap-2"><Button onClick={() => setLotOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo lote</Button><Button variant="outline" onClick={() => setGlosaOpen(true)}><AlertTriangle className="mr-2 h-4 w-4" />Registrar glosa</Button></div>
    <Tabs defaultValue="lotes"><TabsList><TabsTrigger value="lotes">Lotes ({lotes.length})</TabsTrigger><TabsTrigger value="glosas">Glosas ({glosas.length})</TabsTrigger></TabsList>
      <TabsContent value="lotes"><Card><CardHeader><CardTitle className="text-base"><FileStack className="mr-2 inline h-4 w-4" />Lotes faturados</CardTitle></CardHeader><CardContent>{isLoading ? <p>Carregando…</p> : <Table><TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Convênio</TableHead><TableHead>Competência</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{lotes.map((l: any) => <TableRow key={l.id}><TableCell className="font-medium">{l.numero_lote}<p className="text-[10px] text-muted-foreground">TISS {l.versao_tiss} · {l.quantidade_guias} guias</p></TableCell><TableCell>{l.convenios?.nome}</TableCell><TableCell>{new Date(`${l.competencia}T12:00:00`).toLocaleDateString('pt-BR', { month:'2-digit', year:'numeric' })}</TableCell><TableCell className="text-right">{brl(l.valor_apresentado)}</TableCell><TableCell><Badge variant="outline">{l.status.replace('_',' ')}</Badge></TableCell><TableCell><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => exportLot(l)} aria-label={`Exportar lote ${l.numero_lote}`}><FileDown className="h-4 w-4" /></Button>{l.status === 'rascunho' && <Button size="sm" onClick={() => updateLot(l.id, 'enviado')}>Enviar</Button>}</div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></TabsContent>
      <TabsContent value="glosas"><Card><CardHeader><CardTitle className="text-base">Tratamento de glosas</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Código / motivo</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Glosado</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{glosas.map((g: any) => <TableRow key={g.id}><TableCell><b>{g.codigo_glosa}</b><p className="max-w-sm text-xs text-muted-foreground">{g.motivo}</p></TableCell><TableCell>{g.lotes_tiss?.numero_lote}<p className="text-[10px]">{g.lotes_tiss?.convenios?.nome}</p></TableCell><TableCell className="text-right">{brl(g.valor_glosado)}</TableCell><TableCell><Badge variant="outline">{g.status.replaceAll('_',' ')}</Badge></TableCell><TableCell>{g.status === 'pendente' && <Button size="sm" variant="outline" onClick={() => updateGlosa(g.id, 'recurso_preparacao')}>Preparar recurso</Button>}{g.status === 'recurso_preparacao' && <Button size="sm" onClick={() => updateGlosa(g.id, 'recurso_enviado')}>Marcar enviado</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
    </Tabs>
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" /><span>O XML exportado é um resumo operacional. Valide o arquivo no padrão/XSD exigido pela operadora antes da transmissão oficial.</span></div>

    <Dialog open={lotOpen} onOpenChange={setLotOpen}><DialogContent><DialogHeader><DialogTitle>Novo lote TISS</DialogTitle></DialogHeader><div className="space-y-3"><Field label="Convênio"><Select value={lotForm.convenio_id} onValueChange={v => setLotForm(f => ({...f,convenio_id:v}))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{convenios.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Número do lote"><Input value={lotForm.numero_lote} onChange={e=>setLotForm(f=>({...f,numero_lote:e.target.value}))}/></Field><Field label="Competência"><Input type="date" value={lotForm.competencia} onChange={e=>setLotForm(f=>({...f,competencia:e.target.value}))}/></Field><Field label="Quantidade de guias"><Input type="number" min="0" value={lotForm.quantidade_guias} onChange={e=>setLotForm(f=>({...f,quantidade_guias:Number(e.target.value)}))}/></Field><Field label="Valor apresentado"><Input type="number" min="0" step="0.01" value={lotForm.valor_apresentado} onChange={e=>setLotForm(f=>({...f,valor_apresentado:Number(e.target.value)}))}/></Field></div></div><DialogFooter><Button onClick={saveLot} disabled={saving}>{saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Salvar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={glosaOpen} onOpenChange={setGlosaOpen}><DialogContent><DialogHeader><DialogTitle>Registrar glosa</DialogTitle></DialogHeader><div className="space-y-3"><Field label="Lote"><Select value={glosaForm.lote_id} onValueChange={v=>setGlosaForm(f=>({...f,lote_id:v}))}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{lotes.map((l:any)=><SelectItem key={l.id} value={l.id}>{l.numero_lote} · {l.convenios?.nome}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Código da glosa"><Input value={glosaForm.codigo_glosa} onChange={e=>setGlosaForm(f=>({...f,codigo_glosa:e.target.value}))}/></Field><Field label="Guia de referência"><Input value={glosaForm.guia_referencia} onChange={e=>setGlosaForm(f=>({...f,guia_referencia:e.target.value}))}/></Field></div><Field label="Valor glosado"><Input type="number" min="0.01" step="0.01" value={glosaForm.valor_glosado} onChange={e=>setGlosaForm(f=>({...f,valor_glosado:Number(e.target.value)}))}/></Field><Field label="Motivo"><Textarea value={glosaForm.motivo} onChange={e=>setGlosaForm(f=>({...f,motivo:e.target.value}))}/></Field></div><DialogFooter><Button onClick={saveGlosa} disabled={saving}>Registrar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
