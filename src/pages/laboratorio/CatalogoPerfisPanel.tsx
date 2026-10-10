import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Beaker, Loader2, Pencil, Plus, Save, X } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

type Perfil = { id: string; nome: string; categoria: string; unidade_padrao: string | null; referencia_min: number | null; referencia_max: number | null; referencia_texto: string | null; metodo_padrao: string | null; preparo: string | null; tubo_padrao: string | null; tempo_estimado_horas: number | null; setor_id: string | null; laboratorio_id: string | null; preco_custo: number | null; ativo: boolean | null };
type FormPerfil = { nome: string; categoria: string; unidade_padrao: string; referencia_min: string; referencia_max: string; referencia_texto: string; metodo_padrao: string; preparo: string; tubo_padrao: string; tempo_estimado_horas: string; preco_custo: string; setor_id: string; laboratorio_id: string };
const vazio: FormPerfil = { nome: '', categoria: 'laboratorial', unidade_padrao: '', referencia_min: '', referencia_max: '', referencia_texto: '', metodo_padrao: '', preparo: '', tubo_padrao: '', tempo_estimado_horas: '', preco_custo: '', setor_id: '', laboratorio_id: '' };
const db = supabase as any;

export function CatalogoPerfisPanel() {
  const { profile } = useSupabaseAuth();
  const cache = useQueryClient();
  const [form, setForm] = useState<FormPerfil>(vazio);
  const [editando, setEditando] = useState<string | null>(null);
  const clinicaId = profile?.clinica_id;
  const perfisQuery = useQuery({
    queryKey: ['lab-catalogo-perfis', clinicaId], enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await db.from('tipo_exames_catalog')
        .select('id, nome, categoria, unidade_padrao, referencia_min, referencia_max, referencia_texto, metodo_padrao, preparo, tubo_padrao, tempo_estimado_horas, setor_id, laboratorio_id, preco_custo, ativo')
        .eq('clinica_id', clinicaId).order('nome').limit(1000);
      if (error) throw error; return (data ?? []) as Perfil[];
    },
  });
  const setoresQuery = useQuery({
    queryKey: ['lab-gestao-setores', clinicaId], enabled: !!clinicaId,
    queryFn: async () => { const { data, error } = await db.from('laboratorio_setores').select('id,nome').eq('clinica_id', clinicaId).eq('ativo', true).order('nome'); if (error) throw error; return data ?? []; },
  });
  const parceirosQuery = useQuery({
    queryKey: ['lab-parceiros', clinicaId], enabled: !!clinicaId,
    queryFn: async () => { const { data, error } = await db.from('laboratorios').select('id,nome').eq('clinica_id', clinicaId).eq('ativo', true).order('nome'); if (error) throw error; return data ?? []; },
  });
  const salvar = useMutation({
    mutationFn: async () => {
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const minimo = form.referencia_min.trim() ? Number(form.referencia_min.replace(',', '.')) : null;
      const maximo = form.referencia_max.trim() ? Number(form.referencia_max.replace(',', '.')) : null;
      const horas = form.tempo_estimado_horas.trim() ? Number(form.tempo_estimado_horas) : null;
      const custo = form.preco_custo.trim() ? Number(form.preco_custo.replace(',', '.')) : null;
      if (!form.nome.trim()) throw new Error('Informe o nome do exame.');
      if ((minimo != null && !Number.isFinite(minimo)) || (maximo != null && !Number.isFinite(maximo)) || (minimo != null && maximo != null && minimo > maximo)) throw new Error('Confira os limites de referência.');
      if (horas != null && (!Number.isInteger(horas) || horas < 1)) throw new Error('O prazo estimado deve ser um número inteiro positivo de horas.');
      if (custo != null && (!Number.isFinite(custo) || custo < 0)) throw new Error('O custo deve ser um valor válido e não negativo.');
      const values = { nome: form.nome.trim(), categoria: form.categoria.trim() || 'laboratorial', unidade_padrao: form.unidade_padrao.trim() || null, referencia_min: minimo, referencia_max: maximo, referencia_texto: form.referencia_texto.trim() || null, metodo_padrao: form.metodo_padrao.trim() || null, preparo: form.preparo.trim() || null, tubo_padrao: form.tubo_padrao.trim() || null, tempo_estimado_horas: horas, preco_custo: custo, setor_id: form.setor_id || null, laboratorio_id: form.laboratorio_id || null };
      const query = editando
        ? db.from('tipo_exames_catalog').update(values).eq('id', editando).eq('clinica_id', clinicaId).select('id').maybeSingle()
        : db.from('tipo_exames_catalog').insert({ ...values, clinica_id: clinicaId, ativo: true }).select('id').maybeSingle();
      const { data, error } = await query;
      if (error) throw error; if (!data) throw new Error('O exame não foi encontrado nesta clínica.');
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['lab-catalogo-perfis', clinicaId] }),
        cache.invalidateQueries({ queryKey: ['lab-catalogo-exames', clinicaId] }),
      ]);
      setForm(vazio); setEditando(null); toast.success('Perfil laboratorial salvo.');
    },
    onError: (error: Error) => toast.error('Não foi possível salvar o perfil.', { description: error.message }),
  });
  const editar = (perfil: Perfil) => {
    setEditando(perfil.id);
    setForm({ nome: perfil.nome, categoria: perfil.categoria, unidade_padrao: perfil.unidade_padrao || '', referencia_min: perfil.referencia_min == null ? '' : String(perfil.referencia_min), referencia_max: perfil.referencia_max == null ? '' : String(perfil.referencia_max), referencia_texto: perfil.referencia_texto || '', metodo_padrao: perfil.metodo_padrao || '', preparo: perfil.preparo || '', tubo_padrao: perfil.tubo_padrao || '', tempo_estimado_horas: perfil.tempo_estimado_horas == null ? '' : String(perfil.tempo_estimado_horas), preco_custo: perfil.preco_custo == null ? '' : String(perfil.preco_custo), setor_id: perfil.setor_id || '', laboratorio_id: perfil.laboratorio_id || '' });
  };
  const erro = [perfisQuery, setoresQuery, parceirosQuery].find((query) => query.isError);

  return <section className="space-y-4" aria-labelledby="lab-perfis-title">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Configuração técnica</p><h3 id="lab-perfis-title" className="mt-1 text-xl font-semibold">Catálogo e perfis de exame</h3><p className="mt-1 text-sm text-muted-foreground">Configure unidade, referências, preparo, tubo, prazo e setor para exames realmente oferecidos pela clínica.</p></div>
    {erro && <ErrorState compact title="Não foi possível carregar o catálogo" error={erro.error} onRetry={() => { void perfisQuery.refetch(); void setoresQuery.refetch(); void parceirosQuery.refetch(); }} />}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)]">
      <Card className="overflow-hidden border-border/70"><CardHeader className="border-b bg-muted/20"><CardTitle className="text-base">Exames cadastrados</CardTitle><CardDescription>{perfisQuery.data?.length ?? 0} perfil(is) configurado(s)</CardDescription></CardHeader><CardContent className="p-0">{perfisQuery.isLoading ? <p role="status" className="p-8 text-center text-sm text-muted-foreground">Carregando catálogo…</p> : !perfisQuery.data?.length ? <div className="p-10 text-center"><Beaker className="mx-auto h-7 w-7 text-muted-foreground/50"/><p className="mt-3 font-medium">Sem exames configurados</p><p className="mt-1 text-sm text-muted-foreground">Adicione os exames que a clínica processa ou encaminha.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Exame</th><th className="px-4 py-3">Setor / parceiro</th><th className="px-4 py-3">Unidade / prazo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"/></tr></thead><tbody className="divide-y">{perfisQuery.data?.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.nome}<span className="block text-xs text-muted-foreground">{item.categoria}{item.referencia_texto ? ` · ${item.referencia_texto}` : item.referencia_min != null || item.referencia_max != null ? ` · ${item.referencia_min ?? '—'}–${item.referencia_max ?? '—'}` : ''}</span></td><td className="px-4 py-3">{(setoresQuery.data ?? []).find((x: any) => x.id === item.setor_id)?.nome || 'Sem setor'}<span className="block text-xs text-muted-foreground">{(parceirosQuery.data ?? []).find((x: any) => x.id === item.laboratorio_id)?.nome || 'Processamento interno'}</span></td><td className="px-4 py-3">{item.unidade_padrao || 'Sem unidade'}<span className="block text-xs text-muted-foreground">{item.tempo_estimado_horas ? `${item.tempo_estimado_horas} h` : 'Sem prazo'}</span></td><td className="px-4 py-3"><Badge variant={item.ativo ? 'secondary' : 'outline'}>{item.ativo ? 'Ativo' : 'Inativo'}</Badge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => editar(item)}><Pencil className="mr-1 h-3.5 w-3.5"/>Editar</Button></td></tr>)}</tbody></table></div>}</CardContent></Card>
      <Card className="border-border/70"><CardHeader><CardTitle className="text-base">{editando ? 'Editar perfil' : 'Adicionar exame'}</CardTitle><CardDescription>Os valores clínicos devem ser confirmados pelo responsável técnico antes do uso.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); salvar.mutate(); }}>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Nome *</Label><Input required maxLength={120} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })}/></div><div className="space-y-1"><Label>Categoria</Label><Input value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}/></div></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Setor</Label><Select value={form.setor_id || '__none__'} onValueChange={(value) => setForm({ ...form, setor_id: value === '__none__' ? '' : value })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Sem setor</SelectItem>{(setoresQuery.data ?? []).map((item: any) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Laboratório parceiro</Label><Select value={form.laboratorio_id || '__none__'} onValueChange={(value) => setForm({ ...form, laboratorio_id: value === '__none__' ? '' : value })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Processamento interno</SelectItem>{(parceirosQuery.data ?? []).map((item: any) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Unidade</Label><Input value={form.unidade_padrao} onChange={(event) => setForm({ ...form, unidade_padrao: event.target.value })}/></div><div className="space-y-1"><Label>Método padrão</Label><Input value={form.metodo_padrao} onChange={(event) => setForm({ ...form, metodo_padrao: event.target.value })}/></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="space-y-1"><Label>Ref. mínima</Label><Input inputMode="decimal" value={form.referencia_min} onChange={(event) => setForm({ ...form, referencia_min: event.target.value })}/></div><div className="space-y-1"><Label>Ref. máxima</Label><Input inputMode="decimal" value={form.referencia_max} onChange={(event) => setForm({ ...form, referencia_max: event.target.value })}/></div><div className="space-y-1"><Label>Prazo (h)</Label><Input type="number" min="1" step="1" value={form.tempo_estimado_horas} onChange={(event) => setForm({ ...form, tempo_estimado_horas: event.target.value })}/></div><div className="space-y-1"><Label>Custo base (R$)</Label><Input inputMode="decimal" value={form.preco_custo} onChange={(event) => setForm({ ...form, preco_custo: event.target.value })}/></div></div>
        <div className="space-y-1"><Label>Referência textual</Label><Input value={form.referencia_texto} onChange={(event) => setForm({ ...form, referencia_texto: event.target.value })}/></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Tubo</Label><Input value={form.tubo_padrao} onChange={(event) => setForm({ ...form, tubo_padrao: event.target.value })}/></div><div className="space-y-1"><Label>Preparo do paciente</Label><Textarea rows={2} value={form.preparo} onChange={(event) => setForm({ ...form, preparo: event.target.value })}/></div></div>
        <div className="flex gap-2">{editando && <Button type="button" variant="ghost" onClick={() => { setEditando(null); setForm(vazio); }}><X className="mr-1 h-4 w-4"/>Cancelar</Button>}<Button className="ml-auto gap-2" type="submit" disabled={salvar.isPending || !form.nome.trim()}>{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : editando ? <Save className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}{editando ? 'Salvar perfil' : 'Adicionar ao catálogo'}</Button></div>
      </form></CardContent></Card>
    </div>
  </section>;
}
