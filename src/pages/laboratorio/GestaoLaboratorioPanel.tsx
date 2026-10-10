import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Beaker, CheckCircle2, ClipboardCheck, Cog, Loader2, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CatalogoPerfisPanel } from '@/pages/laboratorio/CatalogoPerfisPanel';

type Setor = { id: string; nome: string; ativo: boolean; descricao: string | null };
type Equipamento = { id: string; nome: string; fabricante: string | null; modelo: string | null; numero_serie: string | null; status: string; calibracao_vencimento: string | null; setor_id: string | null };
type Lote = { id: string; nome: string; fabricante: string | null; lote: string; quantidade: number; unidade: string | null; validade: string | null; status: string };
type Controle = { id: string; analito: string; nivel: string | null; resultado: number; unidade: string | null; aprovado: boolean; realizado_em: string; equipamento_id: string | null };

const db = supabase as any;
const EMPTY: never[] = [];

export function GestaoLaboratorioPanel() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [novoSetor, setNovoSetor] = useState('');
  const [novoEquipamento, setNovoEquipamento] = useState({ nome: '', fabricante: '', modelo: '', numero_serie: '', setor_id: '', calibracao_vencimento: '' });
  const [novoLote, setNovoLote] = useState({ nome: '', fabricante: '', lote: '', quantidade: '', unidade: '', validade: '' });
  const [novoControle, setNovoControle] = useState({ analito: '', nivel: '', resultado: '', unidade: '', limite_inferior: '', limite_superior: '', equipamento_id: '', setor_id: '' });

  const setoresQuery = useQuery({
    queryKey: ['lab-gestao-setores', profile?.clinica_id], enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await db.from('laboratorio_setores').select('id, nome, descricao, ativo')
        .eq('clinica_id', profile!.clinica_id).order('nome');
      if (error) throw error; return (data ?? []) as Setor[];
    },
  });
  const equipamentosQuery = useQuery({
    queryKey: ['lab-gestao-equipamentos', profile?.clinica_id], enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await db.from('laboratorio_equipamentos')
        .select('id, nome, fabricante, modelo, numero_serie, status, calibracao_vencimento, setor_id')
        .eq('clinica_id', profile!.clinica_id).order('nome');
      if (error) throw error; return (data ?? []) as Equipamento[];
    },
  });
  const lotesQuery = useQuery({
    queryKey: ['lab-gestao-lotes', profile?.clinica_id], enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await db.from('laboratorio_lotes_insumos')
        .select('id, nome, fabricante, lote, quantidade, unidade, validade, status')
        .eq('clinica_id', profile!.clinica_id).order('validade', { ascending: true });
      if (error) throw error; return (data ?? []) as Lote[];
    },
  });
  const qualidadeQuery = useQuery({
    queryKey: ['lab-gestao-qualidade', profile?.clinica_id], enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await db.from('laboratorio_controles_qualidade')
        .select('id, analito, nivel, resultado, unidade, aprovado, realizado_em, equipamento_id')
        .eq('clinica_id', profile!.clinica_id).order('realizado_em', { ascending: false }).limit(200);
      if (error) throw error; return (data ?? []) as Controle[];
    },
  });

  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['lab-gestao-setores', profile?.clinica_id] }),
    queryClient.invalidateQueries({ queryKey: ['lab-gestao-equipamentos', profile?.clinica_id] }),
    queryClient.invalidateQueries({ queryKey: ['lab-gestao-lotes', profile?.clinica_id] }),
    queryClient.invalidateQueries({ queryKey: ['lab-gestao-qualidade', profile?.clinica_id] }),
  ]);
  const salvar = useMutation({
    mutationFn: async ({ tabela, valores }: { tabela: string; valores: Record<string, unknown> }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { error } = await db.from(tabela).insert({ ...valores, clinica_id: profile.clinica_id });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      await invalidate();
      toast.success('Registro laboratorial salvo');
      if (variables.tabela === 'laboratorio_equipamentos') setNovoEquipamento({ nome: '', fabricante: '', modelo: '', numero_serie: '', setor_id: '', calibracao_vencimento: '' });
      if (variables.tabela === 'laboratorio_lotes_insumos') setNovoLote({ nome: '', fabricante: '', lote: '', quantidade: '', unidade: '', validade: '' });
      if (variables.tabela === 'laboratorio_controles_qualidade') setNovoControle({ analito: '', nivel: '', resultado: '', unidade: '', limite_inferior: '', limite_superior: '', equipamento_id: '', setor_id: '' });
      if (variables.tabela === 'laboratorio_setores') setNovoSetor('');
    },
    onError: (error) => toast.error('Não foi possível salvar', { description: error.message }),
  });
  const alterarEquipamento = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await db.from('laboratorio_equipamentos').update({ status })
        .eq('id', id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
      if (error) throw error; if (!data) throw new Error('Equipamento não encontrado nesta clínica.');
    },
    onSuccess: async () => { await invalidate(); toast.success('Estado do equipamento atualizado'); },
    onError: (error) => toast.error('Não foi possível alterar o equipamento', { description: error.message }),
  });
  const setor = (id: string | null) => (setoresQuery.data ?? []).find((item) => item.id === id)?.nome ?? 'Sem setor';
  const equipamento = (id: string | null) => (equipamentosQuery.data ?? []).find((item) => item.id === id)?.nome ?? '—';
  const expirado = (date: string | null) => !!date && date < new Date().toISOString().slice(0, 10);
  const vencendo = (date: string | null) => !!date && !expirado(date) && date <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const erro = [setoresQuery, equipamentosQuery, lotesQuery, qualidadeQuery].find((query) => query.isError);
  if (!profile?.clinica_id) return <ErrorState title="Clínica não identificada" description="A gestão laboratorial só pode abrir com uma clínica ativa." />;

  return (
    <section className="space-y-5" aria-labelledby="lab-gestao-title">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Qualidade e recursos</p><h2 id="lab-gestao-title" className="mt-1 text-2xl font-semibold tracking-tight">Gestão do laboratório</h2><p className="mt-1 text-sm text-muted-foreground">Setores, equipamentos, lotes e controles de qualidade da clínica.</p></div>
      {erro && <ErrorState compact title="Alguns dados de gestão não carregaram" error={erro.error} onRetry={() => { void setoresQuery.refetch(); void equipamentosQuery.refetch(); void lotesQuery.refetch(); void qualidadeQuery.refetch(); }} />}

      <Tabs defaultValue="equipamentos" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="equipamentos" className="gap-2"><Wrench className="h-4 w-4" />Equipamentos</TabsTrigger><TabsTrigger value="insumos" className="gap-2"><Beaker className="h-4 w-4" />Insumos e lotes</TabsTrigger><TabsTrigger value="qualidade" className="gap-2"><ClipboardCheck className="h-4 w-4" />Controle de qualidade</TabsTrigger><TabsTrigger value="setores" className="gap-2"><Cog className="h-4 w-4" />Setores</TabsTrigger><TabsTrigger value="catalogo" className="gap-2"><Beaker className="h-4 w-4" />Perfis de exame</TabsTrigger></TabsList>

        <TabsContent value="equipamentos" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <Card className="overflow-hidden border-border/70"><CardHeader className="border-b bg-muted/20"><CardTitle className="text-base">Cadastro de equipamentos</CardTitle><CardDescription>Calibração e disponibilidade operacional.</CardDescription></CardHeader><CardContent className="p-0">{equipamentosQuery.isLoading ? <p role="status" className="p-8 text-center text-sm text-muted-foreground">Carregando equipamentos…</p> : (equipamentosQuery.data ?? EMPTY).length === 0 ? <div className="p-10 text-center"><Wrench className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-3 font-medium">Nenhum equipamento cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Registre analisadores e equipamentos usados nos setores.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Equipamento</th><th className="px-4 py-3">Setor</th><th className="px-4 py-3">Série / modelo</th><th className="px-4 py-3">Calibração</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y">{equipamentosQuery.data?.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.nome}<span className="block text-xs text-muted-foreground">{item.fabricante || 'Fabricante não informado'}</span></td><td className="px-4 py-3">{setor(item.setor_id)}</td><td className="px-4 py-3">{item.numero_serie || '—'}<span className="block text-xs text-muted-foreground">{item.modelo || '—'}</span></td><td className="px-4 py-3">{item.calibracao_vencimento ? <span className={vencendo(item.calibracao_vencimento) || expirado(item.calibracao_vencimento) ? 'font-medium text-destructive' : ''}>{new Date(`${item.calibracao_vencimento}T12:00:00`).toLocaleDateString('pt-BR')}{expirado(item.calibracao_vencimento) ? ' · vencida' : vencendo(item.calibracao_vencimento) ? ' · vence em breve' : ''}</span> : 'Não informada'}</td><td className="px-4 py-3"><Badge variant={item.status === 'ativo' ? 'secondary' : 'outline'}>{item.status === 'ativo' ? 'Ativo' : item.status === 'manutencao' ? 'Manutenção' : 'Inativo'}</Badge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" disabled={alterarEquipamento.isPending} onClick={() => alterarEquipamento.mutate({ id: item.id, status: item.status === 'ativo' ? 'manutencao' : 'ativo' })}>{item.status === 'ativo' ? 'Enviar manutenção' : 'Marcar ativo'}</Button></td></tr>)}</tbody></table></div>}</CardContent></Card>
            <Card className="border-border/70"><CardHeader><CardTitle className="text-base">Adicionar equipamento</CardTitle><CardDescription>Os prazos de calibração geram alertas visuais nesta lista.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!novoEquipamento.nome.trim()) return; salvar.mutate({ tabela: 'laboratorio_equipamentos', valores: { ...novoEquipamento, nome: novoEquipamento.nome.trim(), setor_id: novoEquipamento.setor_id || null, calibracao_vencimento: novoEquipamento.calibracao_vencimento || null } }) }}><div className="space-y-1"><Label>Nome *</Label><Input required maxLength={120} value={novoEquipamento.nome} onChange={(event) => setNovoEquipamento({ ...novoEquipamento, nome: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Fabricante</Label><Input value={novoEquipamento.fabricante} onChange={(event) => setNovoEquipamento({ ...novoEquipamento, fabricante: event.target.value })} /></div><div className="space-y-1"><Label>Modelo</Label><Input value={novoEquipamento.modelo} onChange={(event) => setNovoEquipamento({ ...novoEquipamento, modelo: event.target.value })} /></div></div><div className="space-y-1"><Label>Número de série</Label><Input value={novoEquipamento.numero_serie} onChange={(event) => setNovoEquipamento({ ...novoEquipamento, numero_serie: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Setor</Label><Select value={novoEquipamento.setor_id || '__none__'} onValueChange={(value) => setNovoEquipamento({ ...novoEquipamento, setor_id: value === '__none__' ? '' : value })}><SelectTrigger><SelectValue placeholder="Sem setor" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem setor</SelectItem>{(setoresQuery.data ?? []).filter((item) => item.ativo).map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Calibração até</Label><Input type="date" value={novoEquipamento.calibracao_vencimento} onChange={(event) => setNovoEquipamento({ ...novoEquipamento, calibracao_vencimento: event.target.value })} /></div></div><Button type="submit" className="w-full gap-2" disabled={salvar.isPending || !novoEquipamento.nome.trim()}>{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Cadastrar equipamento</Button></form></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="insumos" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <Card className="overflow-hidden border-border/70"><CardHeader className="border-b bg-muted/20"><CardTitle className="text-base">Lotes de reagentes e materiais</CardTitle><CardDescription>Validade, saldo e vínculo opcional com o estoque da clínica.</CardDescription></CardHeader><CardContent className="p-0">{lotesQuery.isLoading ? <p role="status" className="p-8 text-center text-sm text-muted-foreground">Carregando lotes…</p> : (lotesQuery.data ?? EMPTY).length === 0 ? <div className="p-10 text-center"><Beaker className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-3 font-medium">Nenhum lote registrado</p><p className="mt-1 text-sm text-muted-foreground">Cadastre o lote físico para acompanhar saldo e vencimento.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Insumo</th><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y">{lotesQuery.data?.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.nome}<span className="block text-xs text-muted-foreground">{item.fabricante || 'Fabricante não informado'}</span></td><td className="px-4 py-3 font-mono text-xs">{item.lote}</td><td className="px-4 py-3 tabular-nums">{item.quantidade} {item.unidade}</td><td className="px-4 py-3">{item.validade ? <span className={expirado(item.validade) || vencendo(item.validade) ? 'font-medium text-destructive' : ''}>{new Date(`${item.validade}T12:00:00`).toLocaleDateString('pt-BR')}</span> : '—'}{expirado(item.validade) && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-destructive" />}</td><td className="px-4 py-3"><Badge variant={item.status === 'disponivel' && !expirado(item.validade) ? 'secondary' : 'destructive'}>{expirado(item.validade) ? 'Vencido' : item.status}</Badge></td></tr>)}</tbody></table></div>}</CardContent></Card>
            <Card className="border-border/70"><CardHeader><CardTitle className="text-base">Registrar lote</CardTitle><CardDescription>Informe o identificador do lote e sua validade.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!novoLote.nome.trim() || !novoLote.lote.trim()) return; salvar.mutate({ tabela: 'laboratorio_lotes_insumos', valores: { ...novoLote, nome: novoLote.nome.trim(), quantidade: Number(novoLote.quantidade || 0), validade: novoLote.validade || null } }) }}><div className="space-y-1"><Label>Insumo / reagente *</Label><Input required value={novoLote.nome} onChange={(event) => setNovoLote({ ...novoLote, nome: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Lote *</Label><Input required value={novoLote.lote} onChange={(event) => setNovoLote({ ...novoLote, lote: event.target.value })} /></div><div className="space-y-1"><Label>Fabricante</Label><Input value={novoLote.fabricante} onChange={(event) => setNovoLote({ ...novoLote, fabricante: event.target.value })} /></div></div><div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label>Quantidade</Label><Input type="number" min="0" step="0.001" value={novoLote.quantidade} onChange={(event) => setNovoLote({ ...novoLote, quantidade: event.target.value })} /></div><div className="space-y-1"><Label>Unidade</Label><Input value={novoLote.unidade} onChange={(event) => setNovoLote({ ...novoLote, unidade: event.target.value })} /></div><div className="space-y-1"><Label>Validade</Label><Input type="date" value={novoLote.validade} onChange={(event) => setNovoLote({ ...novoLote, validade: event.target.value })} /></div></div><Button type="submit" className="w-full gap-2" disabled={salvar.isPending || !novoLote.nome.trim() || !novoLote.lote.trim()}><Plus className="h-4 w-4" />Registrar lote</Button></form></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="qualidade" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.8fr)]">
            <Card className="overflow-hidden border-border/70"><CardHeader className="border-b bg-muted/20"><CardTitle className="text-base">Histórico do controle interno</CardTitle><CardDescription>Resultados de controle comparados aos limites informados.</CardDescription></CardHeader><CardContent className="p-0">{qualidadeQuery.isLoading ? <p role="status" className="p-8 text-center text-sm text-muted-foreground">Carregando controles…</p> : (qualidadeQuery.data ?? EMPTY).length === 0 ? <div className="p-10 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-3 font-medium">Nenhum controle lançado</p><p className="mt-1 text-sm text-muted-foreground">Registre controles da rotina definidos pelo responsável técnico.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-sm"><thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Analito / nível</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3">Equipamento</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Conferência</th></tr></thead><tbody className="divide-y">{qualidadeQuery.data?.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.analito}<span className="block text-xs text-muted-foreground">{item.nivel || 'Nível não informado'}</span></td><td className="px-4 py-3 tabular-nums">{item.resultado} {item.unidade}</td><td className="px-4 py-3">{equipamento(item.equipamento_id)}</td><td className="px-4 py-3">{new Date(item.realizado_em).toLocaleString('pt-BR')}</td><td className="px-4 py-3">{item.aprovado ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Dentro do limite</Badge> : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Revisar controle</Badge>}</td></tr>)}</tbody></table></div>}</CardContent></Card>
            <Card className="border-border/70"><CardHeader><CardTitle className="text-base">Lançar controle</CardTitle><CardDescription>Os limites precisam refletir o método e o material de controle adotados pela clínica.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const lower = novoControle.limite_inferior ? Number(novoControle.limite_inferior) : null; const upper = novoControle.limite_superior ? Number(novoControle.limite_superior) : null; if (lower != null && upper != null && lower > upper) { toast.error('O limite inferior não pode superar o superior.'); return; } if (!novoControle.analito.trim() || !Number.isFinite(Number(novoControle.resultado))) return; salvar.mutate({ tabela: 'laboratorio_controles_qualidade', valores: { analito: novoControle.analito.trim(), nivel: novoControle.nivel || null, resultado: Number(novoControle.resultado), unidade: novoControle.unidade || null, limite_inferior: lower, limite_superior: upper, equipamento_id: novoControle.equipamento_id || null, setor_id: novoControle.setor_id || null } }) }}><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Analito *</Label><Input required value={novoControle.analito} onChange={(event) => setNovoControle({ ...novoControle, analito: event.target.value })} /></div><div className="space-y-1"><Label>Nível / lote controle</Label><Input value={novoControle.nivel} onChange={(event) => setNovoControle({ ...novoControle, nivel: event.target.value })} /></div></div><div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label>Resultado *</Label><Input type="number" step="any" required value={novoControle.resultado} onChange={(event) => setNovoControle({ ...novoControle, resultado: event.target.value })} /></div><div className="space-y-1"><Label>Limite inferior</Label><Input type="number" step="any" value={novoControle.limite_inferior} onChange={(event) => setNovoControle({ ...novoControle, limite_inferior: event.target.value })} /></div><div className="space-y-1"><Label>Limite superior</Label><Input type="number" step="any" value={novoControle.limite_superior} onChange={(event) => setNovoControle({ ...novoControle, limite_superior: event.target.value })} /></div></div><div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label>Unidade</Label><Input value={novoControle.unidade} onChange={(event) => setNovoControle({ ...novoControle, unidade: event.target.value })} /></div><div className="space-y-1"><Label>Equipamento</Label><Select value={novoControle.equipamento_id || '__none__'} onValueChange={(value) => setNovoControle({ ...novoControle, equipamento_id: value === '__none__' ? '' : value })}><SelectTrigger><SelectValue placeholder="Não vincular" /></SelectTrigger><SelectContent><SelectItem value="__none__">Não vincular</SelectItem>{(equipamentosQuery.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Setor</Label><Select value={novoControle.setor_id || '__none__'} onValueChange={(value) => setNovoControle({ ...novoControle, setor_id: value === '__none__' ? '' : value })}><SelectTrigger><SelectValue placeholder="Sem setor" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem setor</SelectItem>{(setoresQuery.data ?? []).filter((item) => item.ativo).map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div></div><Button type="submit" className="w-full gap-2" disabled={salvar.isPending || !novoControle.analito.trim() || novoControle.resultado === ''}><ClipboardCheck className="h-4 w-4" />Registrar controle</Button></form></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="setores" className="space-y-4">
          <Card className="max-w-2xl border-border/70"><CardHeader><CardTitle className="text-base">Setores analíticos</CardTitle><CardDescription>Use setores para organizar a bancada e vincular equipamentos e catálogo.</CardDescription></CardHeader><CardContent className="space-y-4"><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!novoSetor.trim()) return; salvar.mutate({ tabela: 'laboratorio_setores', valores: { nome: novoSetor.trim() } }) }}><Input aria-label="Nome do novo setor" value={novoSetor} onChange={(event) => setNovoSetor(event.target.value)} placeholder="Ex.: Hematologia" maxLength={80} /><Button type="submit" disabled={salvar.isPending || !novoSetor.trim()} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button></form>{setoresQuery.isLoading ? <p role="status" className="p-5 text-center text-sm text-muted-foreground">Carregando setores…</p> : (setoresQuery.data ?? EMPTY).length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum setor configurado.</p> : <ul className="divide-y rounded-lg border">{setoresQuery.data?.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 p-3"><div><p className="font-medium">{item.nome}</p>{item.descricao && <p className="text-xs text-muted-foreground">{item.descricao}</p>}</div><Badge variant={item.ativo ? 'secondary' : 'outline'}>{item.ativo ? 'Ativo' : 'Inativo'}</Badge></li>)}</ul>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="catalogo" className="space-y-4"><CatalogoPerfisPanel /></TabsContent>
      </Tabs>
      {(salvar.isSuccess || alterarEquipamento.isSuccess) && <p className="sr-only" role="status">Dados salvos</p>}
    </section>
  );
}
