import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Edit, Trash2, DollarSign, Clock, Palette, AlertTriangle,
  Loader2, Building2, Check, X, Stethoscope, CheckCircle2, PauseCircle, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useConvenios } from '@/hooks/useSupabaseData';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { PageHeader } from '@/components/PageHeader';

type FiltroStatus = 'todos' | 'ativos' | 'inativos' | 'sem_convenio';

const INDICADORES: { key: FiltroStatus; label: string; legenda: string; icon: typeof Layers; cor: string }[] = [
  { key: 'todos', label: 'Tipos', legenda: 'cadastrados', icon: Layers, cor: '' },
  { key: 'ativos', label: 'Ativos', legenda: 'disponíveis para agendar', icon: CheckCircle2, cor: 'bg-success/10 text-success' },
  { key: 'inativos', label: 'Inativos', legenda: 'fora da agenda', icon: PauseCircle, cor: 'bg-muted text-muted-foreground' },
  { key: 'sem_convenio', label: 'Sem convênio', legenda: 'só valor particular', icon: Building2, cor: 'bg-warning/10 text-warning' },
];

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const temNoMaximoDuasCasasDecimais = (valor: number) =>
  Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7;

const CORES = [
  '#1080CA', '#10b981', '#f59e0b', '#ef4444', '#320ee9',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6a648b',
];

interface TipoConsulta {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  instrucoes_preparo: string | null;
  cor: string;
  ativo: boolean;
  valor_particular: number;
  created_at: string;
}

interface PrecoConvenio {
  id: string;
  tipo_consulta_id: string;
  convenio_id: string;
  valor: number;
  ativo: boolean;
}

interface TipoForm {
  nome: string;
  descricao: string;
  instrucoes_preparo: string;
  duracao_minutos: number | '';
  cor: string;
  ativo: boolean;
  valor_particular: number | '';
}

const initialForm: TipoForm = {
  nome: '', descricao: '', instrucoes_preparo: '', duracao_minutos: 30,
  cor: '#1080CA', ativo: true, valor_particular: 0,
};

export default function TiposConsulta() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TipoConsulta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TipoConsulta | null>(null);
  const [precosOpen, setPrecosOpen] = useState(false);
  const [precosTipo, setPrecosTipo] = useState<TipoConsulta | null>(null);
  const [form, setForm] = useState<TipoForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');

  const { user, profile, isAdmin } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const conveniosQuery = useConvenios();
  const convenios = conveniosQuery.data ?? [];

  const tiposQuery = useQuery({
    queryKey: ['tipos_consulta', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      return buscarEmBlocos<TipoConsulta>(() => supabase
        .from('tipos_consulta')
        .select('*')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('nome')
        .order('id'));
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const tipos = tiposQuery.data ?? [];
  const { isLoading } = tiposQuery;

  const precosQuery = useQuery({
    queryKey: ['precos_consulta_convenio', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      return buscarEmBlocos<PrecoConvenio>(() => supabase
        .from('precos_consulta_convenio')
        .select('*')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('id'));
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const precos = precosQuery.data ?? [];
  const dadosAtingiramLimite = tipos.length >= LIMITE_BUSCA_EM_BLOCOS
    || precos.length >= LIMITE_BUSCA_EM_BLOCOS;

  const tiposComConvenio = useMemo(() => new Set(precos.map(p => p.tipo_consulta_id)), [precos]);
  const contagens: Record<FiltroStatus, number> = {
    todos: tipos.length,
    ativos: tipos.filter(t => t.ativo).length,
    inativos: tipos.filter(t => !t.ativo).length,
    sem_convenio: tipos.filter(t => !tiposComConvenio.has(t.id)).length,
  };

  const filtered = useMemo(() => {
    const q = normalizarTexto(search.trim());
    return tipos.filter(t => (
      (!q || normalizarTexto(t.nome).includes(q))
      && (filtroStatus === 'todos'
        || (filtroStatus === 'ativos' && t.ativo)
        || (filtroStatus === 'inativos' && !t.ativo)
        || (filtroStatus === 'sem_convenio' && !tiposComConvenio.has(t.id)))
    ));
  }, [tipos, search, filtroStatus, tiposComConvenio]);
  const temFiltro = !!search.trim() || filtroStatus !== 'todos';
  const limparFiltros = () => { setSearch(''); setFiltroStatus('todos'); };

  const openCreate = () => {
    setEditTarget(null);
    setForm(initialForm);
    setFormOpen(true);
  };

  const openEdit = (t: TipoConsulta) => {
    setEditTarget(t);
    setForm({
      nome: t.nome, descricao: t.descricao || '', duracao_minutos: t.duracao_minutos,
      instrucoes_preparo: t.instrucoes_preparo || '',
      cor: t.cor, ativo: t.ativo, valor_particular: t.valor_particular,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    const nome = form.nome.trim();
    const duracaoMinutos = form.duracao_minutos;
    const valorParticular = form.valor_particular;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Recarregue a página e tente novamente.'); return; }
    if (tiposQuery.isError || tiposQuery.isLoading) { toast.error('Carregue os tipos de consulta antes de salvar.'); return; }
    if (!nome) { toast.error('Nome é obrigatório.'); return; }
    if (tipos.some((tipo) => normalizarTexto(tipo.nome) === normalizarTexto(nome) && tipo.id !== editTarget?.id)) { toast.error('Já existe um tipo de consulta com esse nome.'); return; }
    const nomeFoiAlterado = !!editTarget && normalizarTexto(editTarget.nome) !== normalizarTexto(nome);
    if (tipos.length >= LIMITE_BUSCA_EM_BLOCOS && (!editTarget || nomeFoiAlterado)) {
      toast.error('A lista atingiu o limite de leitura. Não é possível validar nomes duplicados com segurança.');
      return;
    }
    if (typeof duracaoMinutos !== 'number' || !Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) { toast.error('Informe uma duração inteira maior que zero.'); return; }
    if (typeof valorParticular !== 'number' || !Number.isFinite(valorParticular) || valorParticular < 0) { toast.error('Informe um valor particular válido, igual ou maior que zero.'); return; }
    if (Math.abs(valorParticular * 100 - Math.round(valorParticular * 100)) > 1e-7) { toast.error('Informe o valor particular com no máximo duas casas decimais.'); return; }
    if (form.instrucoes_preparo.length > 2000) { toast.error('As instruções de preparo podem ter até 2.000 caracteres.'); return; }
    setSaving(true);
    try {
      const payload = {
        nome,
        descricao: form.descricao.trim() || null,
        instrucoes_preparo: form.instrucoes_preparo.trim() || null,
        duracao_minutos: duracaoMinutos,
        cor: form.cor,
        ativo: form.ativo,
        valor_particular: valorParticular,
      };
      if (editTarget) {
        const { data, error } = await supabase.from('tipos_consulta').update(payload).eq('id', editTarget.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Tipo não encontrado ou sem permissão para alterar.');
        toast.success('Tipo atualizado!');
      } else {
        const { error } = await supabase.from('tipos_consulta').insert({ ...payload, clinica_id: profile.clinica_id });
        if (error) throw error;
        toast.success('Tipo criado!');
      }
      await queryClient.invalidateQueries({ queryKey: ['tipos_consulta'] });
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    setDeleting(true);
    try {
      const { data, error } = await supabase.from('tipos_consulta').delete().eq('id', deleteTarget.id).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir.');
      await queryClient.invalidateQueries({ queryKey: ['tipos_consulta'] });
      toast.success('Tipo excluído!');
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + (e?.message || 'Tente novamente.'));
    } finally {
      setDeleting(false);
    }
  };

  const openPrecos = (t: TipoConsulta) => {
    setPrecosTipo(t);
    setPrecosOpen(true);
  };

  const handleSavePreco = async (convenioId: string, valor: number) => {
    if (!precosTipo || !profile?.clinica_id) throw new Error('Clínica ou tipo de consulta não identificado.');
    if (tiposQuery.isError || tiposQuery.isLoading || conveniosQuery.isError || precosQuery.isError || tiposQuery.isFetching || conveniosQuery.isLoading || precosQuery.isLoading || conveniosQuery.isFetching || precosQuery.isFetching) throw new Error('Aguarde o carregamento de tipos, convênios e preços antes de gravar.');
    if (!tipos.some((tipo) => tipo.id === precosTipo.id)) throw new Error('O tipo de consulta não pertence à clínica atual ou não está mais disponível. Atualize a página e tente novamente.');
    if (!convenios.some((convenio) => convenio.id === convenioId) || !Number.isFinite(valor) || valor < 0) throw new Error('Convênio ou valor inválido.');
    if (!temNoMaximoDuasCasasDecimais(valor)) throw new Error('Informe o preço do convênio com no máximo duas casas decimais.');
    const existing = precos.find(
      p => p.tipo_consulta_id === precosTipo.id && p.convenio_id === convenioId
    );
    if (!existing && precos.length >= LIMITE_BUSCA_EM_BLOCOS) throw new Error('A lista de preços atingiu o limite de leitura. Não é possível validar duplicidade com segurança.');
    try {
      if (existing) {
        const { data, error } = await supabase.from('precos_consulta_convenio')
          .update({ valor }).eq('id', existing.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Preço não encontrado ou sem permissão para alterar.');
      } else {
        const { error } = await supabase.from('precos_consulta_convenio')
          .insert({ tipo_consulta_id: precosTipo.id, convenio_id: convenioId, valor, clinica_id: profile.clinica_id });
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ['precos_consulta_convenio'] });
      toast.success('Preço salvo!');
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const getPrecoConvenio = (tipoId: string, convenioId: string) => {
    return precos.find(p => p.tipo_consulta_id === tipoId && p.convenio_id === convenioId);
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Tipos & Preços de Consulta"
        description={tipos.length > 0
          ? `${contagens.ativos} tipo(s) ativo(s) · ${contagens.inativos} inativo(s) · ${contagens.sem_convenio} sem preço de convênio`
          : 'Cadastre tipos de consulta e defina preços por convênio'}
        icon={<Stethoscope />}
        actions={isAdmin() && (
          <Button onClick={openCreate} className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
            <Plus className="h-4 w-4" /> Novo Tipo
          </Button>
        )}
      />

      {tipos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {INDICADORES.map(({ key, label, legenda, icon: Icon, cor }) => {
            const destaque = key === 'todos';
            return (
              <button
                key={key}
                type="button"
                aria-pressed={filtroStatus === key}
                onClick={() => setFiltroStatus(key)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                  destaque ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card',
                  filtroStatus === key && !destaque && 'border-[#1080CA] ring-1 ring-[#1080CA]',
                  filtroStatus === key && destaque && 'ring-2 ring-[#1080CA]/40 ring-offset-2',
                )}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', destaque ? 'bg-white/20 text-white' : cor)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-2xl font-bold tabular-nums">{contagens[key]}</span>
                  <span className={cn('block text-[11px]', destaque ? 'text-white/80' : 'text-muted-foreground')}>{label} · {legenda}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tipo..." aria-label="Buscar tipo de consulta" value={search} onChange={e => setSearch(e.target.value)} className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" />
        </div>
        {temFiltro && (
          <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={limparFiltros}>Limpar filtros</Button>
        )}
        {tipos.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{filtered.length} de {tipos.length}</span>
        )}
      </div>

      {dadosAtingiramLimite && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A consulta atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros. A lista e as contagens de preços podem estar incompletas.</p>
        </div>
      )}

      {!precosOpen && precosQuery.isError && <ErrorState compact title="Os preços por convênio não foram carregados" description="A lista de tipos continua disponível, mas as configurações de preço estão ocultas até a atualização funcionar." error={precosQuery.error} onRetry={() => void precosQuery.refetch()} />}
      {!precosOpen && precosQuery.isLoading && <p role="status" className="text-sm text-muted-foreground">Carregando preços por convênio…</p>}

      {/* Grid of types */}
      {tiposQuery.isError ? (
        <ErrorState title="Não foi possível carregar os tipos de consulta" error={tiposQuery.error} onRetry={() => void tiposQuery.refetch()} />
      ) : !profile?.clinica_id ? (
        <ErrorState title="Clínica não identificada" description="Não é possível exibir ou alterar os tipos de consulta sem identificar a clínica atual." />
      ) : isLoading ? (
        <CardGridSkeleton count={6} />
      ) : tipos.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border/60 shadow-xs">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span aria-hidden="true" className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Stethoscope className="h-7 w-7" />
            </span>
            <p className="font-bold text-foreground">Nenhum tipo de consulta cadastrado</p>
            <p className="text-sm text-muted-foreground mt-1">Use “Novo Tipo” no topo para cadastrar o primeiro atendimento.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border/60 shadow-xs">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
              <Search className="h-7 w-7" />
            </span>
            <p className="font-bold text-foreground">Nenhum tipo encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente outro termo ou limpe a busca.</p>
            <Button className="mt-4 rounded-full" variant="outline" onClick={limparFiltros}>Limpar busca</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((tipo) => {
              const precosConv = precos.filter(p => p.tipo_consulta_id === tipo.id);
              return (
                <div key={tipo.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                  <Card className="group rounded-2xl border-border/60 bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#9CC7EC] hover:shadow-md">
                    <CardContent className="pt-5 pb-4 px-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: tipo.cor + '20' }}>
                            <Stethoscope className="h-5 w-5" style={{ color: tipo.cor }} />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm">{tipo.nome}</h3>
                            {tipo.descricao && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tipo.descricao}</p>}
                          </div>
                        </div>
                        <Badge variant="outline" className={cn('rounded-full text-[10px]', tipo.ativo ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground')}>
                          {tipo.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3 w-3" /> {tipo.duracao_minutos} min
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-success">
                          <DollarSign className="h-3 w-3" /> {fmt(tipo.valor_particular)}
                        </div>
                      </div>

                      <div className="text-[10px] text-muted-foreground mb-3">
                        {precosConv.length > 0 ? `${precosConv.length} convênio(s) configurado(s)` : 'Sem preço por convênio'}
                      </div>

                      <Separator className="mb-3" />
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-9 flex-1 gap-1 rounded-full text-xs" onClick={() => openPrecos(tipo)}>
                          <Building2 className="h-3 w-3" /> Preços
                        </Button>
                        {isAdmin() && <>
                          <Button aria-label={`Editar ${tipo.nome}`} variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0" onClick={() => openEdit(tipo)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button aria-label={`Excluir ${tipo.nome}`} variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0 text-destructive" onClick={() => setDeleteTarget(tipo)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={open => { if (!saving) setFormOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Tipo' : 'Novo Tipo de Consulta'}</DialogTitle>
            <DialogDescription>Defina os dados do atendimento e as orientações que poderão aparecer no Portal do Paciente.</DialogDescription>
          </DialogHeader>
          <fieldset disabled={saving} className="contents">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tipo-nome" className="text-xs">Nome *</Label>
              <Input id="tipo-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Consulta Inicial" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipo-descricao" className="text-xs">Descrição</Label>
              <Textarea id="tipo-descricao" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição opcional..." rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipo-instrucoes-preparo" className="text-xs">Instruções de preparo para o paciente</Label>
              <Textarea id="tipo-instrucoes-preparo" value={form.instrucoes_preparo} onChange={e => setForm({ ...form, instrucoes_preparo: e.target.value })} placeholder="Orientações gerais para este tipo de atendimento..." rows={3} maxLength={2000} />
              <p className="text-xs text-muted-foreground">Exibidas apenas no portal do paciente com consulta futura ativa. Não são enviadas por mensagem. {form.instrucoes_preparo.length}/2.000</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tipo-duracao" className="text-xs">Duração (min)</Label>
                <Input id="tipo-duracao" type="number" min={1} step={1} value={form.duracao_minutos} onChange={e => setForm({ ...form, duracao_minutos: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipo-valor-particular" className="text-xs">Valor Particular (R$)</Label>
                <Input id="tipo-valor-particular" type="number" min={0} step="0.01" value={form.valor_particular} onChange={e => setForm({ ...form, valor_particular: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {CORES.map(c => (
                  <button type="button" key={c} aria-label={`Cor ${c}`} aria-pressed={form.cor === c} onClick={() => setForm({ ...form, cor: c })}
                    className={cn('h-8 w-8 rounded-lg border-2 transition-all', form.cor === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tipo-ativo" checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
              <Label htmlFor="tipo-ativo" className="text-xs">Ativo</Label>
            </div>
          </div>
          </fieldset>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-full bg-gradient-primary text-white hover:brightness-110">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editTarget ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preços por Convênio Dialog */}
      <Dialog open={precosOpen} onOpenChange={setPrecosOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#1080CA]" />
              Preços — {precosTipo?.nome}
            </DialogTitle>
            <DialogDescription>
              Valor particular: {precosTipo && fmt(precosTipo.valor_particular)}. Configure valores por convênio abaixo.
            </DialogDescription>
          </DialogHeader>
          {conveniosQuery.isError ? (
            <ErrorState compact title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />
          ) : precosQuery.isError ? (
            <ErrorState compact title="Não foi possível carregar os preços por convênio" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} />
          ) : conveniosQuery.isLoading || precosQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground" role="status">Carregando convênios e preços…</div>
          ) : convenios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhum convênio cadastrado.</p>
              <p className="text-xs">Cadastre convênios primeiro em <Link to="/convenios" className="font-medium text-[#1080CA] underline-offset-2 hover:underline">Operacional → Convênios</Link>.</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="w-40">Valor (R$)</TableHead>
                    <TableHead className="w-20 text-center">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convenios.filter(c => c.ativo).map(conv => {
                    const preco = precosTipo ? getPrecoConvenio(precosTipo.id, conv.id) : null;
                    return (
                      <PrecoRow key={conv.id} convenio={conv} precoAtual={preco?.valor ?? null}
                        onSave={(valor) => handleSavePreco(conv.id, valor)} />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && !deleting && setDeleteTarget(null)}
        title="Excluir Tipo de Consulta"
        description={`Tem certeza que deseja excluir "${deleteTarget?.nome}"? Esta ação removerá também todos os preços por convênio vinculados.`}
        onConfirm={() => void handleDelete()}
        variant="destructive"
        isLoading={deleting}
        closeOnConfirm={false}
      />
    </div>
  );
}

// Sub-component for inline price editing
function PrecoRow({ convenio, precoAtual, onSave }: {
  convenio: any; precoAtual: number | null; onSave: (valor: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [valor, setValor] = useState(precoAtual?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const texto = valor.trim();
    const v = texto ? Number(texto.replace(',', '.')) : Number.NaN;
    if (!Number.isFinite(v) || v < 0) { toast.error('Informe um valor válido igual ou maior que zero.'); return; }
    if (!temNoMaximoDuasCasasDecimais(v)) { toast.error('Informe o preço com no máximo duas casas decimais.'); return; }
    setSaving(true);
    try { await onSave(v); setEditing(false); }
    catch { /* O componente pai já apresenta a falha; mantém o campo aberto para correção ou nova tentativa. */ }
    finally { setSaving(false); }
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-sm">{convenio.nome}</TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono">{convenio.codigo}</TableCell>
      <TableCell>
        {editing ? (
          <Input type="number" min="0" step="0.01" aria-label={`Preço para ${convenio.nome}`} value={valor} autoFocus disabled={saving}
            onChange={e => setValor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void save()}
            className="h-8 text-sm" />
        ) : (
          <span className={cn('text-sm font-bold tabular-nums', precoAtual !== null ? 'text-success' : 'text-muted-foreground')}>
            {precoAtual !== null ? fmt(precoAtual) : '—'}
          </span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {editing ? (
          <div className="flex gap-1 justify-center">
            <Button aria-label="Salvar preço" variant="ghost" size="icon" className="h-7 w-7" disabled={saving} onClick={() => void save()}><Check className="h-3.5 w-3.5 text-success" /></Button>
            <Button aria-label="Cancelar edição do preço" variant="ghost" size="icon" className="h-7 w-7" disabled={saving} onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        ) : (
          <Button aria-label={`Editar preço para ${convenio.nome}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setValor(precoAtual?.toString() ?? ''); setEditing(true); }}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
