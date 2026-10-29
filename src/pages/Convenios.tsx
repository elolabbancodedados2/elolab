import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, Edit, Trash2, Building2, Shield, ExternalLink, User, Phone, Loader2,
  FlaskConical, DollarSign, Power, RefreshCw, X, Link2, Receipt, Tags, CheckCircle2, XCircle, Layers,
} from 'lucide-react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConvenios } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { getConveniosPermissions } from '@/lib/conveniosPermissions';

const VERSOES_TISS = ['04.01.00', '04.00.02', '03.05.00', '03.04.01'];

type FiltroConvenio = 'todos' | 'ativos' | 'inativos' | 'com_tabela';

const FILTRO_LABELS: Record<FiltroConvenio, string> = {
  todos: 'todos os convênios',
  ativos: 'convênios ativos',
  inativos: 'convênios inativos',
  com_tabela: 'convênios com tabela de exames',
};

function normalizarCnpj(value: string | null | undefined): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cnpjValido(value: string): boolean {
  const cnpj = normalizarCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = [...base].reduce((total, caractere, indice) =>
      total + (caractere.charCodeAt(0) - 48) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(`${cnpj.slice(0, 12)}${primeiro}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${primeiro}${segundo}`);
}

function urlHttpsSegura(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

interface FormData {
  nome: string;
  codigo: string;
  cnpj: string;
  telefone: string;
  email: string;
  website: string;
  valor_consulta: number;
  valor_retorno: number;
  carencia: number;
  ativo: boolean;
  registro_ans: string;
  codigo_operadora: string;
  versao_tiss: string;
  prazo_retorno: number;
  taxa_glosa: number;
  portal_url: string;
  responsavel_nome: string;
  responsavel_cargo: string;
  responsavel_telefone: string;
  tipo_planos: string[];
}

const initialFormData: FormData = {
  nome: '', codigo: '', cnpj: '', telefone: '', email: '', website: '',
  valor_consulta: 0, valor_retorno: 0, carencia: 0, ativo: true,
  registro_ans: '', codigo_operadora: '', versao_tiss: '04.01.00',
  prazo_retorno: 30, taxa_glosa: 0, portal_url: '',
  responsavel_nome: '', responsavel_cargo: '', responsavel_telefone: '',
  tipo_planos: [],
};

interface ExamePreco {
  id?: string;
  tipo_exame: string;
  codigo_tuss: string;
  descricao: string;
  valor_tabela: number;
  valor_filme: number;
  valor_custo: number;
  valor_repasse: number;
}

const initialExameForm: ExamePreco = {
  tipo_exame: '', codigo_tuss: '', descricao: '', valor_tabela: 0, valor_filme: 0, valor_custo: 0, valor_repasse: 0,
};

/* ─── Tabela de Exames do Convênio ─── */
function TabelaExamesConvenio({ convenioId, creationPage }: { convenioId: string; creationPage: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { agreementExamId: editingExameId } = useParams();
  const formPage = creationPage || !!editingExameId;
  const completed = useRef(false);
  const initialized = useRef(false);
  const baseline = useRef(JSON.stringify(initialExameForm));
  const leaveForm = () => navigate(`/convenios/${convenioId}/exames`, { state: location.state });
  const { profile, hasRole, isAdmin } = useSupabaseAuth();
  const permissoesConvenios = getConveniosPermissions(isAdmin(), hasRole);
  const podeGerenciarTabela = permissoesConvenios.gerenciarTabelaExames;
  const podeExcluirExame = permissoesConvenios.excluirExames;
  const queryClient = useQueryClient();
  const [exameForm, setExameForm] = useState<ExamePreco>(initialExameForm);
  const [isSaving, setIsSaving] = useState(false);
  const exameSaveLock = useRef(false);
  const [isDeletingExame, setIsDeletingExame] = useState(false);
  const exameDeleteLock = useRef(false);
  const [searchExame, setSearchExame] = useState(location.state?.agreementExamSearch ?? '');
  const [deleteExameId, setDeleteExameId] = useState<string | null>(null);

  const { data: exames = [], isLoading, isFetching, error: erroExames, refetch: refetchExames } = useQuery({
    queryKey: ['precos-exames-convenio', profile?.id ?? null, profile?.clinica_id ?? null, convenioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('precos_exames_convenio')
        .select('id,tipo_exame,codigo_tuss,descricao,valor_tabela,valor_filme,valor_total,valor_custo,valor_repasse,ativo,created_at,updated_at')
        .eq('convenio_id', convenioId)
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('tipo_exame');
      if (error) throw error;
      return data || [];
    },
    enabled: !!convenioId && !!profile?.clinica_id,
  });

  const filteredExames = useMemo(() =>
    (exames as any[]).filter(e =>
      normalizarTexto(e.tipo_exame).includes(normalizarTexto(searchExame.trim())) ||
      normalizarTexto(e.codigo_tuss).includes(normalizarTexto(searchExame.trim())) ||
      normalizarTexto(e.descricao).includes(normalizarTexto(searchExame.trim()))
    ), [exames, searchExame]);

  const recordQuery = useQuery({
    queryKey: ['preco-convenio-pagina', profile?.clinica_id, convenioId, editingExameId],
    queryFn: async () => {
      const { data, error } = await supabase.from('precos_exames_convenio').select('*').eq('id', editingExameId!).eq('convenio_id', convenioId).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!editingExameId && !!profile?.clinica_id,
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!formPage || initialized.current || (editingExameId && !recordQuery.data)) return;
    const e = recordQuery.data;
    const value = e ? { tipo_exame: e.tipo_exame, codigo_tuss: e.codigo_tuss || '', descricao: e.descricao || '', valor_tabela: e.valor_tabela || 0, valor_filme: e.valor_filme || 0, valor_custo: e.valor_custo || 0, valor_repasse: e.valor_repasse || 0 } : initialExameForm;
    baseline.current = JSON.stringify(value);
    initialized.current = true;
    setExameForm(value);
  }, [formPage, editingExameId, recordQuery.data]);
  const openPrice = (path: string) => navigate(path, { state: { ...location.state, agreementExamSearch: searchExame } });
  const handleNewExame = () => openPrice(`/convenios/${convenioId}/exames/novo`);
  const handleEditExame = (e: { id: string }) => openPrice(`/convenios/${convenioId}/exames/${e.id}/editar`);

  const handleSaveExame = async () => {
    if (!podeGerenciarTabela) { toast.error('Seu perfil não pode alterar a tabela de exames.'); return; }
    if (exameSaveLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    if (isLoading || isFetching || erroExames) { toast.error('Atualize a tabela de exames antes de salvar.'); return; }
    if (!exameForm.tipo_exame.trim()) { toast.error('Tipo do exame é obrigatório.'); return; }
    const valores = [exameForm.valor_tabela, exameForm.valor_filme, exameForm.valor_custo, exameForm.valor_repasse];
    if (!valores.every(Number.isFinite)) { toast.error('Confira os valores da tabela: todos devem ser números válidos.'); return; }
    if (exameForm.valor_tabela <= 0) { toast.error('Valor da tabela deve ser maior que zero.'); return; }
    if ([exameForm.valor_filme, exameForm.valor_custo, exameForm.valor_repasse].some(valor => valor < 0)) {
      toast.error('Filme, custo e repasse não podem ser negativos.'); return;
    }
    if (valores.some(valor => Math.abs(valor * 100 - Math.round(valor * 100)) >= 1e-7)) {
      toast.error('Os valores da tabela devem ter no máximo duas casas decimais.'); return;
    }
    exameSaveLock.current = true;
    setIsSaving(true);
    try {
      const payload = {
        convenio_id: convenioId,
        tipo_exame: exameForm.tipo_exame.trim(),
        codigo_tuss: exameForm.codigo_tuss.trim() || null,
        descricao: exameForm.descricao.trim() || null,
        valor_tabela: exameForm.valor_tabela,
        valor_filme: exameForm.valor_filme || 0,
        valor_custo: exameForm.valor_custo || 0,
        valor_repasse: exameForm.valor_repasse || 0,
      };
      if (editingExameId) {
        const { data, error } = await supabase.from('precos_exames_convenio').update(payload)
          .eq('id', editingExameId).eq('convenio_id', convenioId).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('O exame não foi atualizado. Verifique se ele ainda existe e se você tem permissão.');
        toast.success('Exame atualizado!');
      } else {
        const { error } = await supabase.from('precos_exames_convenio').insert({
          ...payload,
          clinica_id: profile.clinica_id,
        });
        if (error) throw error;
        toast.success('Exame adicionado à tabela!');
      }
      queryClient.invalidateQueries({ queryKey: ['precos-exames-convenio'] });
      completed.current = true;
      leaveForm();
    } catch (err: any) {
      const message = err.code === '23505'
        ? 'Já existe um exame com este nome para este convênio. Edite o registro existente.'
        : err.message || 'Erro ao salvar exame.';
      toast.error(message);
    } finally { exameSaveLock.current = false; setIsSaving(false); }
  };

  const handleDeleteExame = async () => {
    if (!podeExcluirExame) { toast.error('Somente administradores podem excluir itens da tabela.'); return; }
    if (!deleteExameId || exameDeleteLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); setDeleteExameId(null); return; }
    exameDeleteLock.current = true;
    setIsDeletingExame(true);
    try {
      const { data, error } = await supabase.from('precos_exames_convenio').delete()
        .eq('id', deleteExameId).eq('convenio_id', convenioId).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão para excluir.'); return; }
      toast.success('Exame removido da tabela.');
      queryClient.invalidateQueries({ queryKey: ['precos-exames-convenio'] });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    } finally { exameDeleteLock.current = false; setIsDeletingExame(false); setDeleteExameId(null); }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="space-y-4">
      {formPage && <UnsavedChangesGuard dirty={JSON.stringify(exameForm) !== baseline.current} busy={isSaving} completed={completed} />}
      {formPage && <Button variant="outline" onClick={leaveForm}>Voltar à tabela de exames</Button>}
      {!formPage && <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Tabela de Preços de Exames</h4>
          <Badge variant="secondary" className="text-xs">{(exames as any[]).length} itens</Badge>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input aria-label="Buscar exame por nome, TUSS ou descrição" placeholder="Buscar exame ou TUSS..." value={searchExame}
              onChange={e => setSearchExame(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          {podeGerenciarTabela && <Button size="sm" onClick={handleNewExame} className="gap-1.5" disabled={isLoading || isFetching || !!erroExames}>
            <Plus className="h-3.5 w-3.5" /> Adicionar Exame
          </Button>}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : erroExames ? (
        <ErrorState compact error={erroExames} title="Não foi possível carregar a tabela de exames" onRetry={() => { void refetchExames(); }} />
      ) : filteredExames.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{exames.length === 0 ? 'Nenhum exame cadastrado nesta tabela' : 'Nenhum exame encontrado'}</p>
          <p className="text-sm mt-1">{exames.length === 0 ? 'Adicione os exames e seus valores para este convênio.' : 'Tente outro termo ou limpe a busca.'}</p>
          {exames.length > 0 && <Button variant="link" onClick={() => setSearchExame('')}>Limpar busca</Button>}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exame</TableHead>
                <TableHead className="hidden sm:table-cell">Código TUSS</TableHead>
                <TableHead className="text-right">Valor Tabela</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Filme</TableHead>
                <TableHead className="text-right hidden md:table-cell">Custo</TableHead>
                <TableHead className="text-right hidden md:table-cell">Repasse</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right w-24">{podeGerenciarTabela ? 'Ações' : 'Tabela'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExames.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{e.tipo_exame}</p>
                    {e.descricao && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{e.descricao}</p>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {e.codigo_tuss ? (
                      <Badge variant="outline" className="font-mono text-[10px]">{e.codigo_tuss}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatCurrency(e.valor_tabela)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">{formatCurrency(e.valor_filme || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{formatCurrency(e.valor_custo || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{formatCurrency(e.valor_repasse || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">{formatCurrency(e.valor_total || e.valor_tabela + (e.valor_filme || 0))}</TableCell>
                  <TableCell className="text-right">
                    {podeGerenciarTabela ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Editar exame ${e.tipo_exame}`} onClick={() => handleEditExame(e)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluirExame && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Excluir exame ${e.tipo_exame}`} onClick={() => setDeleteExameId(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>}
                    </div>
                    ) : <span className="text-xs text-muted-foreground">Somente leitura</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      </>}
      {formPage && (editingExameId && recordQuery.isError ? <ErrorState title="Não foi possível abrir o preço do exame" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />
        : editingExameId && recordQuery.isPending ? <p role="status">Carregando preço do exame…</p>
        : editingExameId && !recordQuery.data ? <p role="status">Exame não encontrado na tabela deste convênio.</p>
        : <form onSubmit={event => { event.preventDefault(); void handleSaveExame(); }} className="max-w-3xl space-y-6">
          <h2 className="text-xl font-semibold">{editingExameId ? 'Editar Exame' : 'Novo Exame na Tabela'}</h2>
          {erroExames && <ErrorState compact title="Atualize a tabela antes de salvar" error={erroExames} onRetry={() => void refetchExames()} />}
          <fieldset disabled={isSaving} className="min-w-0">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="convenio-exame-tipo" className="text-xs">Tipo do Exame *</Label>
              <Input id="convenio-exame-tipo" required value={exameForm.tipo_exame}
                onChange={e => setExameForm({ ...exameForm, tipo_exame: e.target.value })}
                placeholder="Ex: Hemograma, Raio-X Tórax..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convenio-exame-tuss" className="text-xs">Código TUSS</Label>
                <Input id="convenio-exame-tuss" value={exameForm.codigo_tuss}
                  onChange={e => setExameForm({ ...exameForm, codigo_tuss: e.target.value })}
                  placeholder="40301010" className="font-mono" />
              </div>
              <div className="space-y-1.5">
              <Label htmlFor="convenio-exame-valor" className="text-xs">Valor Tabela (R$) *</Label>
              <Input id="convenio-exame-valor" type="number" step="0.01" value={exameForm.valor_tabela}
                  onChange={e => setExameForm({ ...exameForm, valor_tabela: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convenio-exame-filme" className="text-xs">Valor Filme (R$)</Label>
              <Input id="convenio-exame-filme" type="number" step="0.01" value={exameForm.valor_filme}
                onChange={e => setExameForm({ ...exameForm, valor_filme: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convenio-exame-custo" className="text-xs">Valor Custo (R$)</Label>
                <Input id="convenio-exame-custo" type="number" step="0.01" value={exameForm.valor_custo}
                  onChange={e => setExameForm({ ...exameForm, valor_custo: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="convenio-exame-repasse" className="text-xs">Valor Repasse (R$)</Label>
                <Input id="convenio-exame-repasse" type="number" step="0.01" value={exameForm.valor_repasse}
                  onChange={e => setExameForm({ ...exameForm, valor_repasse: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convenio-exame-descricao" className="text-xs">Descrição</Label>
              <Input id="convenio-exame-descricao" value={exameForm.descricao}
                onChange={e => setExameForm({ ...exameForm, descricao: e.target.value })}
                placeholder="Descrição opcional do procedimento" />
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valor Total (Tabela + Filme)</span>
                <span className="font-bold text-primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                    .format(exameForm.valor_tabela + (exameForm.valor_filme || 0))}
                </span>
              </div>
              {(exameForm.valor_custo > 0 || exameForm.valor_repasse > 0) && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Margem (Total - Custo - Repasse)</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                      .format((exameForm.valor_tabela + (exameForm.valor_filme || 0)) - (exameForm.valor_custo || 0) - (exameForm.valor_repasse || 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button type="button" variant="outline" onClick={leaveForm} disabled={isSaving}>Cancelar</Button>
            <Button type="submit" className="scroll-mb-24" disabled={isSaving || isLoading || !!erroExames}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </div>
        </form>)}

      {/* Delete Exame Dialog */}
      <AlertDialog open={!!deleteExameId} onOpenChange={open => { if (open || !isDeletingExame) setDeleteExameId(open ? deleteExameId : null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover exame da tabela?</AlertDialogTitle>
            <AlertDialogDescription>O exame será removido da tabela de preços deste convênio.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingExame}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExame} disabled={isDeletingExame} className="bg-destructive text-destructive-foreground">{isDeletingExame && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Página Principal ─── */
function Convenios({ creationPage = false, examTablePage = false, examCreationPage = false }: { creationPage?: boolean; examTablePage?: boolean; examCreationPage?: boolean }) {
  const location = useLocation();
  return <ConveniosWorkspace key={location.pathname} creationPage={creationPage} examTablePage={examTablePage} examCreationPage={examCreationPage} />;
}

function ConveniosWorkspace({ creationPage, examTablePage, examCreationPage }: { creationPage: boolean; examTablePage: boolean; examCreationPage: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { agreementId: editingId } = useParams();
  const taskPage = creationPage || !!editingId;
  const activeTab = examTablePage ? 'exames' : 'dados';
  const completed = useRef(false);
  const initialized = useRef(false);
  const baseline = useRef(JSON.stringify(initialFormData));
  const returnTo = typeof location.state?.agreementReturn === 'string' && /^\/convenios(?:\?|$)/.test(location.state.agreementReturn) ? location.state.agreementReturn : '/convenios';
  const leaveTask = () => navigate(returnTo, { state: { agreementFilters: location.state?.agreementFilters } });
  const { profile, isAdmin, hasRole } = useSupabaseAuth();
  const permissoesConvenios = getConveniosPermissions(isAdmin(), hasRole);
  const podeGerenciarConvenios = permissoesConvenios.gerenciarConvenios;
  const podeGerenciarTabelaExames = permissoesConvenios.gerenciarTabelaExames;
  const [searchTerm, setSearchTerm] = useState(location.state?.agreementFilters?.search ?? '');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const convenioSaveLock = useRef(false);
  const convenioDeleteLock = useRef(false);
  const [atualizandoStatusId, setAtualizandoStatusId] = useState<string | null>(null);
  const [newPlano, setNewPlano] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroConvenio>(location.state?.agreementFilters?.status ?? 'todos');

  const queryClient = useQueryClient();
  const { data: convenios = [], isLoading, error: erroConvenios, refetch: refetchConvenios } = useConvenios();

  // Resumo leve: quais convênios já têm tabela de exames (mesmo prefixo da query da tabela para invalidar junto).
  const tabelasQuery = useQuery({
    queryKey: ['precos-exames-convenio', 'resumo', profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('precos_exames_convenio')
        .select('convenio_id')
        .eq('clinica_id', profile?.clinica_id ?? '');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const conveniosComTabela = useMemo(
    () => new Set((tabelasQuery.data ?? []).map((row: any) => row.convenio_id as string)),
    [tabelasQuery.data],
  );

  const filteredConvenios = useMemo(() =>
    (convenios as any[]).filter(c => {
      if (filtroStatus === 'ativos' && !c.ativo) return false;
      if (filtroStatus === 'inativos' && c.ativo) return false;
      if (filtroStatus === 'com_tabela' && !conveniosComTabela.has(c.id)) return false;
      const termo = searchTerm.trim();
      const termoCnpj = normalizarCnpj(termo);
      return normalizarTexto(c.nome).includes(normalizarTexto(termo)) ||
        normalizarTexto(c.codigo).includes(normalizarTexto(termo)) ||
        normalizarTexto(c.registro_ans).includes(normalizarTexto(termo)) ||
        (termoCnpj.length >= 3 && normalizarCnpj(c.cnpj).includes(termoCnpj));
    }), [convenios, searchTerm, filtroStatus, conveniosComTabela]);

  const totalConvenios = (convenios as any[]).length;
  const totalAtivos = (convenios as any[]).filter(c => c.ativo).length;
  const totalInativos = totalConvenios - totalAtivos;
  const totalComTabela = (convenios as any[]).filter(c => conveniosComTabela.has(c.id)).length;
  const temFiltro = searchTerm.trim() !== '' || filtroStatus !== 'todos';
  const limparFiltros = () => { setSearchTerm(''); setFiltroStatus('todos'); };
  const refresh = () => { void refetchConvenios(); void tabelasQuery.refetch(); };

  const copiarLinkPortal = async (c: any) => {
    const url = urlHttpsSegura(c.portal_url);
    if (!url) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Cópia indisponível neste navegador.');
      await navigator.clipboard.writeText(url);
      toast.success('Link do portal copiado!', { description: c.nome });
    } catch (error: any) {
      toast.error('Não foi possível copiar o link do portal.', { description: error?.message || 'Tente novamente.' });
    }
  };

  const recordQuery = useQuery({
    queryKey: ['convenio-pagina', profile?.clinica_id, editingId],
    queryFn: async () => {
      const { data, error } = await supabase.from('convenios').select('*').eq('id', editingId!).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!editingId && !!profile?.clinica_id,
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!taskPage || initialized.current || (editingId && !recordQuery.data)) return;
    const c = recordQuery.data;
    const value: FormData = c ? {
      nome: c.nome, codigo: c.codigo, cnpj: c.cnpj || '', telefone: c.telefone || '',
      email: c.email || '', website: c.website || '', valor_consulta: c.valor_consulta || 0,
      valor_retorno: c.valor_retorno || 0, carencia: c.carencia || 0, ativo: c.ativo ?? true,
      registro_ans: c.registro_ans || '', codigo_operadora: c.codigo_operadora || '',
      versao_tiss: c.versao_tiss || '04.01.00', prazo_retorno: c.prazo_retorno ?? 30,
      taxa_glosa: c.taxa_glosa || 0, portal_url: c.portal_url || '',
      responsavel_nome: c.responsavel_nome || '', responsavel_cargo: c.responsavel_cargo || '',
      responsavel_telefone: c.responsavel_telefone || '',
      tipo_planos: c.tipo_planos || [],
    } : initialFormData;
    baseline.current = JSON.stringify(value);
    initialized.current = true;
    setEditingUpdatedAt(c?.updated_at || null);
    setFormData(value);
  }, [taskPage, editingId, recordQuery.data]);
  const openTask = (path: string) => navigate(path, { state: taskPage ? location.state : { agreementReturn: location.pathname + location.search, agreementFilters: { search: searchTerm, status: filtroStatus } } });
  const handleNew = () => openTask('/convenios/novo');
  const handleEdit = (c: { id: string }) => openTask(`/convenios/${c.id}/editar`);
  const handleGerenciarPrecosExames = (c: { id: string }) => openTask(`/convenios/${c.id}/exames`);

  const handleDeleteClick = (id: string) => { setSelectedId(id); setIsDeleteOpen(true); };

  const handleToggleAtivo = async (convenio: any) => {
    if (!podeGerenciarConvenios) { toast.error('Somente administradores podem alterar convênios.'); return; }
    if (atualizandoStatusId) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    setAtualizandoStatusId(convenio.id);
    try {
      const { data, error } = await supabase.from('convenios')
        .update({ ativo: !convenio.ativo })
        .eq('id', convenio.id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O status não foi alterado. Verifique se você tem permissão para editar este convênio.');
      queryClient.invalidateQueries({ queryKey: ['convenios'] });
      toast.success(convenio.ativo ? 'Convênio inativado.' : 'Convênio ativado.');
    } catch (error: any) {
      toast.error('Não foi possível alterar o status do convênio.', { description: error.message || 'Tente novamente.' });
    } finally {
      setAtualizandoStatusId(null);
    }
  };

  const handleDelete = async () => {
    if (!podeGerenciarConvenios) { toast.error('Somente administradores podem excluir convênios.'); return; }
    if (!selectedId || convenioDeleteLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    convenioDeleteLock.current = true;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.from('convenios').delete()
        .eq('id', selectedId).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão ou convênio já removido.'); return; }
      toast.success('Convênio excluído!');
      queryClient.invalidateQueries({ queryKey: ['convenios'] });
    } catch (error: any) {
      const message = error.code === '23503'
        ? 'Este convênio possui pacientes, autorizações, preços ou lotes vinculados. Inative-o para preservar esses dados e o histórico.'
        : error.message || 'Erro ao excluir.';
      toast.error('Não foi possível excluir o convênio.', { description: message });
    } finally { convenioDeleteLock.current = false; setIsDeleting(false); setIsDeleteOpen(false); }
  };

  const handleSave = async () => {
    if (!podeGerenciarConvenios) { toast.error('Somente administradores podem alterar convênios.'); return; }
    if (convenioSaveLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão antes de salvar.'); return; }
    const nome = formData.nome.trim();
    const codigo = formData.codigo.trim().toUpperCase();
    if (!nome || !codigo) { toast.error('Nome e código são obrigatórios.'); return; }
    if (formData.cnpj.trim() && !cnpjValido(formData.cnpj)) {
      toast.error('CNPJ inválido.', { description: 'Informe um CNPJ numérico ou alfanumérico válido com 14 caracteres.' });
      return;
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('E-mail do convênio inválido.'); return;
    }
    const valoresFinanceiros = [formData.valor_consulta, formData.valor_retorno];
    if (!valoresFinanceiros.every(Number.isFinite)) {
      toast.error('Informe valores válidos para consulta e retorno.'); return;
    }
    if (valoresFinanceiros.some(valor => valor < 0)) {
      toast.error('Valores não podem ser negativos.'); return;
    }
    if (valoresFinanceiros.some(valor => Math.abs(valor * 100 - Math.round(valor * 100)) >= 1e-7)) {
      toast.error('Valores de consulta e retorno devem ter no máximo duas casas decimais.'); return;
    }
    if (!Number.isInteger(formData.carencia) || !Number.isInteger(formData.prazo_retorno)
      || !Number.isFinite(formData.taxa_glosa) || formData.carencia < 0 || formData.prazo_retorno < 0
      || formData.taxa_glosa < 0 || formData.taxa_glosa > 100) {
      toast.error('Revise a carência, o prazo de retorno e a taxa de glosa (de 0 a 100%).'); return;
    }
    if (Math.abs(formData.taxa_glosa * 100 - Math.round(formData.taxa_glosa * 100)) >= 1e-7) {
      toast.error('A taxa de glosa deve ter no máximo duas casas decimais.'); return;
    }
    if ([formData.website, formData.portal_url].some(value => value.trim() && !urlHttpsSegura(value.trim()))) {
      toast.error('Website e portal do convênio devem usar um endereço HTTPS válido.'); return;
    }
    convenioSaveLock.current = true;
    setIsSubmitting(true);
    try {
      const payload = {
        nome, codigo, cnpj: formData.cnpj.trim().toUpperCase() || null,
        telefone: formData.telefone || null, email: formData.email || null,
        website: formData.website || null, valor_consulta: formData.valor_consulta,
        valor_retorno: formData.valor_retorno, carencia: formData.carencia, ativo: formData.ativo,
        registro_ans: formData.registro_ans || null, codigo_operadora: formData.codigo_operadora || null,
        versao_tiss: formData.versao_tiss || null, prazo_retorno: formData.prazo_retorno,
        taxa_glosa: formData.taxa_glosa, portal_url: formData.portal_url || null,
        responsavel_nome: formData.responsavel_nome || null,
        responsavel_cargo: formData.responsavel_cargo || null,
        responsavel_telefone: formData.responsavel_telefone || null,
        tipo_planos: formData.tipo_planos.length > 0 ? formData.tipo_planos : null,
      };

      if (editingId) {
        if (!editingUpdatedAt) throw new Error('Não foi possível confirmar a versão deste convênio. Feche e abra o cadastro novamente antes de salvar.');
        const { data, error } = await supabase.from('convenios').update(payload)
          .eq('id', editingId).eq('clinica_id', profile.clinica_id).eq('updated_at', editingUpdatedAt)
          .select('id, updated_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este convênio foi alterado ou removido em outra sessão. Seus dados continuam no formulário; reabra o cadastro e confira as alterações antes de salvar novamente.');
        setEditingUpdatedAt(data.updated_at);
        toast.success('Convênio atualizado!');
      } else {
        const { data, error } = await supabase.from('convenios').insert({
          ...payload,
          clinica_id: profile?.clinica_id || null,
        }).select('id').single();
        if (error) throw error;
        if (!data) throw new Error('O cadastro não foi confirmado pelo banco.');
        toast.success('Convênio cadastrado!');
      }
      queryClient.invalidateQueries({ queryKey: ['convenios'] });
      completed.current = true;
      leaveTask();
    } catch (error: any) {
      const message = error.code === '23505'
        ? 'Já existe um convênio com este código interno nesta clínica. Use outro código.'
        : error.message || 'Erro ao salvar.';
      toast.error('Não foi possível salvar o convênio.', { description: message });
    } finally { convenioSaveLock.current = false; setIsSubmitting(false); }
  };

  const addPlano = () => {
    const trimmed = newPlano.trim();
    if (!trimmed || formData.tipo_planos.includes(trimmed)) return;
    setFormData(p => ({ ...p, tipo_planos: [...p.tipo_planos, trimmed] }));
    setNewPlano('');
  };

  const removePlano = (p: string) => {
    setFormData(prev => ({ ...prev, tipo_planos: prev.tipo_planos.filter(x => x !== p) }));
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (isLoading && !taskPage) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (erroConvenios && !taskPage) return <ErrorState error={erroConvenios} title="Não foi possível carregar os convênios" onRetry={() => { void refetchConvenios(); }} />;

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      {taskPage && !examTablePage && <UnsavedChangesGuard dirty={JSON.stringify(formData) !== baseline.current || !!newPlano.trim()} busy={isSubmitting} completed={completed} />}
      {taskPage && <Button variant="outline" onClick={leaveTask}>Voltar aos convênios</Button>}
      {!taskPage && <>
      <PageHeader
        title="Convênios"
        description={totalConvenios > 0
          ? `${totalConvenios} convênio${totalConvenios === 1 ? '' : 's'} · ${totalAtivos} ativo${totalAtivos === 1 ? '' : 's'} · ${totalInativos} inativo${totalInativos === 1 ? '' : 's'} · ${totalComTabela} com tabela de exames`
          : 'Operadoras de saúde, faturamento TISS e tabelas de preços'}
        icon={<Building2 />}
        actions={
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/faturamento-convenios"><Receipt aria-hidden="true" className="h-4 w-4" /> TISS e glosas</Link>
            </Button>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/precos-servicos"><Tags aria-hidden="true" className="h-4 w-4" /> Preços e serviços</Link>
            </Button>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={refresh} aria-label="Atualizar convênios" title="Atualizar convênios">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {podeGerenciarConvenios && (
              <Button onClick={handleNew} className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
                <Plus className="h-4 w-4" />
                Novo Convênio
              </Button>
            )}
          </>
        }
      />

      {/* Indicadores clicáveis */}
      <section role="group" aria-label="Resumo dos convênios" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Visão geral</h2>
          <p className="text-xs text-muted-foreground">
            {filtroStatus === 'todos' ? 'Clique em um indicador para filtrar a lista.' : `Mostrando apenas ${FILTRO_LABELS[filtroStatus]}.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            { key: 'ativos' as FiltroConvenio, icon: CheckCircle2, label: 'Ativos', value: totalAtivos, caption: 'aceitos no atendimento', color: 'text-white', surface: 'bg-white/15', escuro: true },
            { key: 'inativos' as FiltroConvenio, icon: XCircle, label: 'Inativos', value: totalInativos, caption: 'histórico preservado', color: 'text-muted-foreground', surface: 'bg-muted', escuro: false },
            { key: 'com_tabela' as FiltroConvenio, icon: FlaskConical, label: 'Com tabela de exames', value: totalComTabela, caption: 'preços de exames definidos', color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false },
            { key: 'todos' as FiltroConvenio, icon: Layers, label: 'Todos', value: totalConvenios, caption: 'convênios cadastrados', color: 'text-foreground', surface: 'bg-[#EEF4FA]', escuro: false },
          ]).map(s => {
            const Icon = s.icon;
            const ativo = filtroStatus === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltroStatus(ativo && s.key !== 'todos' ? 'todos' : s.key)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                  s.escuro && 'border-transparent bg-gradient-primary text-white',
                  ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                  ativo && s.escuro && 'ring-2 ring-[#1080CA]/60',
                )}
              >
                <div className="flex min-h-[96px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Lista de Convênios <span className="text-muted-foreground">({filteredConvenios.length})</span></CardTitle>
              <div className="relative w-full sm:w-72">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Buscar convênio por nome, código, ANS ou CNPJ" placeholder="Buscar nome, código, ANS ou CNPJ..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)} className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" />
              </div>
            </div>
            <div role="group" aria-label="Filtrar convênios por status" className="flex flex-wrap items-center gap-1.5">
              {([
                { key: 'todos', label: 'Todos' },
                { key: 'ativos', label: 'Ativos' },
                { key: 'inativos', label: 'Inativos' },
              ] as const).map(opt => {
                const ativo = filtroStatus === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltroStatus(opt.key)}
                    className={cn(
                      'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                      ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {temFiltro && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
              <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                {filteredConvenios.length} de {totalConvenios} convênio{totalConvenios === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Convênio</TableHead>
                  <TableHead className="hidden md:table-cell">ANS / Operadora</TableHead>
                  <TableHead className="hidden sm:table-cell">Consulta</TableHead>
                  <TableHead className="hidden lg:table-cell">Retorno</TableHead>
                  <TableHead className="hidden lg:table-cell">TISS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConvenios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                        <Building2 className="h-7 w-7" />
                      </span>
                      <p className="font-medium text-foreground">{totalConvenios === 0 ? 'Nenhum convênio cadastrado ainda' : 'Nenhum convênio corresponde à busca'}</p>
                      <p className="mt-1 text-sm">
                        {totalConvenios === 0
                          ? 'Cadastre as operadoras aceitas para liberar autorizações, tabelas de exames e faturamento TISS.'
                          : 'Ajuste a busca ou o filtro de status para ver todos os convênios.'}
                      </p>
                      {totalConvenios > 0 ? (
                        <Button size="sm" variant="outline" className="mt-4 rounded-full" onClick={limparFiltros}>
                          Limpar filtros
                        </Button>
                      ) : podeGerenciarConvenios ? (
                        <Button size="sm" className="mt-4 gap-1.5 rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={handleNew}>
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Cadastrar convênio
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConvenios.map((c: any) => {
                    const portalUrl = urlHttpsSegura(c.portal_url);
                    const temTabela = conveniosComTabela.has(c.id);
                    return (
                      <TableRow key={c.id} className={cn(!c.ativo && 'bg-muted/30 text-muted-foreground')}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className={cn('font-medium', c.ativo ? 'text-foreground' : 'text-muted-foreground')}>{c.nome}</p>
                            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
                              <span>{c.codigo}</span>
                              {temTabela && (
                                <Badge variant="outline" className="rounded-full border-[#BFD8EE] bg-white font-sans text-[9px] text-[#1080CA]">
                                  <FlaskConical aria-hidden="true" className="mr-0.5 h-2.5 w-2.5" /> Tabela de exames
                                </Badge>
                              )}
                            </div>
                            {c.tipo_planos && c.tipo_planos.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {c.tipo_planos.slice(0, 2).map((p: string) => (
                                  <Badge key={p} variant="secondary" className="rounded-full text-[9px]">{p}</Badge>
                                ))}
                                {c.tipo_planos.length > 2 && <span className="text-[9px] text-muted-foreground">+{c.tipo_planos.length - 2}</span>}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="space-y-0.5 text-xs">
                            {c.registro_ans ? (
                              <p className="flex items-center gap-1"><Shield aria-hidden="true" className="h-3 w-3 text-[#1080CA]" />{c.registro_ans}</p>
                            ) : (
                              <p className="text-muted-foreground">Sem registro</p>
                            )}
                            {c.codigo_operadora && <p className="text-muted-foreground">Op: {c.codigo_operadora}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden tabular-nums sm:table-cell">{formatCurrency(c.valor_consulta || 0)}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="text-xs">
                            <p className="tabular-nums">{formatCurrency(c.valor_retorno || 0)}</p>
                            <p className="text-muted-foreground">{c.prazo_retorno || 30}d</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline" className="rounded-full font-mono text-[10px]">{c.versao_tiss || '04.01.00'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.ativo ? 'success' : 'secondary'} className="rounded-full">
                            {c.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {podeGerenciarConvenios && <Button
                              variant="outline"
                              size="sm"
                              className={cn('h-9 gap-1 rounded-full text-xs', !c.ativo && 'border-success/40 text-success hover:bg-success/10 hover:text-success')}
                              aria-label={c.ativo ? `Inativar convênio ${c.nome}` : `Ativar convênio ${c.nome}`}
                              title={c.ativo ? 'Inativar convênio' : 'Ativar convênio'}
                              onClick={() => void handleToggleAtivo(c)}
                              disabled={atualizandoStatusId !== null}
                            >
                              {atualizandoStatusId === c.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Power aria-hidden="true" className="h-3.5 w-3.5" />}
                              {atualizandoStatusId === c.id ? 'Salvando...' : c.ativo ? 'Inativar' : 'Ativar'}
                            </Button>}
                            {podeGerenciarTabelaExames && <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]" aria-label={`Gerenciar preços de exames do convênio ${c.nome}`} title="Tabela de preços de exames" onClick={() => handleGerenciarPrecosExames(c)}>
                              <FlaskConical className="h-4 w-4" />
                            </Button>}
                            {portalUrl && (
                              <>
                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" asChild title="Portal do convênio">
                                  <a href={portalUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir portal do convênio ${c.nome} em nova aba`}>
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title="Copiar link do portal" aria-label={`Copiar link do portal do convênio ${c.nome}`} onClick={() => void copiarLinkPortal(c)}>
                                  <Link2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {podeGerenciarConvenios && <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`Editar convênio ${c.nome}`} title="Editar convênio" onClick={() => handleEdit(c)} disabled={atualizandoStatusId !== null || isDeleting}><Edit className="h-4 w-4" /></Button>}
                            {podeGerenciarConvenios && <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Excluir convênio ${c.nome}`} title="Excluir convênio" onClick={() => handleDeleteClick(c.id)} disabled={atualizandoStatusId !== null || isDeleting}>
                              <Trash2 className="h-4 w-4" />
                            </Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      </>}
      {taskPage && (examTablePage && !podeGerenciarTabelaExames || !examTablePage && !podeGerenciarConvenios ? <p role="status">Seu perfil não pode alterar este cadastro ou tabela.</p>
        : editingId && recordQuery.isError ? <ErrorState title="Não foi possível abrir o convênio" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />
        : editingId && recordQuery.isPending ? <p role="status">Carregando convênio…</p>
        : editingId && !recordQuery.data ? <p role="status">Convênio não encontrado na clínica atual.</p>
        : <section className="mx-auto max-w-5xl space-y-6 rounded-xl border bg-card p-5 sm:p-8">
          <header className="space-y-2 border-b pb-5">
            <p className="text-sm text-muted-foreground">Convênios{recordQuery.data ? ` / ${recordQuery.data.nome}` : ''}</p>
            <h1 className="text-2xl font-semibold">{examTablePage ? 'Tabela de preços de exames' : editingId ? 'Editar Convênio' : 'Novo Convênio'}</h1>
          </header>
          <fieldset disabled={isSubmitting} className="contents">
          <Tabs activationMode="manual" value={activeTab} onValueChange={value => editingId && openTask(`/convenios/${editingId}/${value === 'exames' ? 'exames' : 'editar'}`)} className="space-y-5">
            <TabsList className={cn('grid h-auto w-full rounded-2xl border border-border bg-muted/60 p-1.5 shadow-sm', podeGerenciarConvenios ? 'grid-cols-2' : 'grid-cols-1')}>
              {podeGerenciarConvenios && <TabsTrigger value="dados" className="min-h-11 gap-2 rounded-xl">
                <Building2 className="h-3.5 w-3.5" /> Dados do Convênio
              </TabsTrigger>}
              {podeGerenciarTabelaExames && <TabsTrigger value="exames" disabled={!editingId} className="min-h-11 gap-2 rounded-xl">
                <FlaskConical className="h-3.5 w-3.5" /> Tabela de Exames
              </TabsTrigger>}
            </TabsList>

            {podeGerenciarConvenios && <TabsContent value="dados" className="mt-4"><form id="agreement-form" onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-5">
              {/* Identificação */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="convenio-nome" className="text-xs">Nome *</Label>
                  <Input id="convenio-nome" required value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="convenio-codigo" className="text-xs">Código Interno *</Label>
                  <Input id="convenio-codigo" required value={formData.codigo} onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })} maxLength={10} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="convenio-cnpj" className="text-xs">CNPJ</Label>
                <Input id="convenio-cnpj" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value.toUpperCase() })} placeholder="00.000.000/0001-00 ou AA.AAA.AAA/AAAA-00" />
              </div>

              {/* Dados ANS */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Shield className="h-4 w-4" /> Dados Regulatórios (ANS)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-ans" className="text-xs">Registro ANS</Label>
                    <Input id="convenio-ans" value={formData.registro_ans} onChange={e => setFormData({ ...formData, registro_ans: e.target.value })}
                      placeholder="Nº ANS" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-operadora" className="text-xs">Código da Operadora</Label>
                    <Input id="convenio-operadora" value={formData.codigo_operadora} onChange={e => setFormData({ ...formData, codigo_operadora: e.target.value })}
                      placeholder="Código TISS" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-tiss" className="text-xs">Versão TISS</Label>
                    <Select value={formData.versao_tiss} onValueChange={v => setFormData({ ...formData, versao_tiss: v })}>
                      <SelectTrigger id="convenio-tiss"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VERSOES_TISS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Valores e Regras */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" /> Valores de Consulta e Regras
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-valor-consulta" className="text-xs">Valor Consulta (R$)</Label>
                    <Input id="convenio-valor-consulta" type="number" step="0.01" value={formData.valor_consulta}
                      onChange={e => setFormData({ ...formData, valor_consulta: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-valor-retorno" className="text-xs">Valor Retorno (R$)</Label>
                    <Input id="convenio-valor-retorno" type="number" step="0.01" value={formData.valor_retorno}
                      onChange={e => setFormData({ ...formData, valor_retorno: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-carencia" className="text-xs">Carência (dias)</Label>
                    <Input id="convenio-carencia" type="number" value={formData.carencia}
                      onChange={e => setFormData({ ...formData, carencia: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-prazo-retorno" className="text-xs">Prazo de Retorno (dias)</Label>
                    <Input id="convenio-prazo-retorno" type="number" value={formData.prazo_retorno}
                      onChange={e => setFormData({ ...formData, prazo_retorno: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-taxa-glosa" className="text-xs">Taxa Glosa (%)</Label>
                    <Input id="convenio-taxa-glosa" type="number" step="0.1" value={formData.taxa_glosa}
                      onChange={e => setFormData({ ...formData, taxa_glosa: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                {!editingId && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5" />
                    Salve o convênio primeiro para cadastrar a tabela de preços de exames.
                  </p>
                )}
              </div>

              {/* Planos Vinculados */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Planos Vinculados</h4>
                <div className="flex gap-2 mb-2">
                  <Input aria-label="Adicionar nome do plano de convênio" value={newPlano} onChange={e => setNewPlano(e.target.value)}
                    placeholder="Ex: Básico, Executivo, Nacional..."
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPlano())} className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={addPlano}>Adicionar</Button>
                </div>
                {formData.tipo_planos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.tipo_planos.map(plano => (
                      <Badge key={plano} variant="secondary" className="min-h-11 gap-1">
                        <span>{plano}</span>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Remover plano ${plano}`}
                          onClick={() => removePlano(plano)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Contato */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Phone className="h-4 w-4" /> Contato
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-telefone" className="text-xs">Telefone</Label>
                    <Input id="convenio-telefone" value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-email" className="text-xs">E-mail</Label>
                    <Input id="convenio-email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-website" className="text-xs">Website</Label>
                    <Input id="convenio-website" value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-portal" className="text-xs">Portal de Autorização (URL)</Label>
                    <Input id="convenio-portal" value={formData.portal_url} onChange={e => setFormData({ ...formData, portal_url: e.target.value })} placeholder="https://portal..." />
                  </div>
                </div>
              </div>

              {/* Responsável Faturamento */}
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <User className="h-4 w-4" /> Responsável no Convênio (Faturamento)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-responsavel-nome" className="text-xs">Nome</Label>
                    <Input id="convenio-responsavel-nome" value={formData.responsavel_nome} onChange={e => setFormData({ ...formData, responsavel_nome: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-responsavel-cargo" className="text-xs">Cargo</Label>
                    <Input id="convenio-responsavel-cargo" value={formData.responsavel_cargo} onChange={e => setFormData({ ...formData, responsavel_cargo: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenio-responsavel-telefone" className="text-xs">Telefone</Label>
                    <Input id="convenio-responsavel-telefone" value={formData.responsavel_telefone} onChange={e => setFormData({ ...formData, responsavel_telefone: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Ativo */}
              <Separator />
              <div className="flex items-center gap-2">
                <Switch id="convenio-ativo" checked={formData.ativo} onCheckedChange={checked => setFormData({ ...formData, ativo: checked })} />
                <Label htmlFor="convenio-ativo">Convênio Ativo</Label>
              </div>
            </form></TabsContent>}

            {podeGerenciarTabelaExames && <TabsContent value="exames" className="mt-4">
              {editingId ? (
                <TabelaExamesConvenio convenioId={editingId} creationPage={examCreationPage} />
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <p>Salve o convênio primeiro para gerenciar a tabela de exames.</p>
                </div>
              )}
            </TabsContent>}
          </Tabs>
          </fieldset>

          {!examTablePage && <div className="flex flex-wrap justify-end gap-3 pt-5 border-t">
            <Button type="button" variant="outline" onClick={leaveTask} disabled={isSubmitting}>Cancelar</Button>
            {podeGerenciarConvenios && activeTab === 'dados' && (
              <Button type="submit" form="agreement-form" className="scroll-mb-24" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
              </Button>
            )}
          </div>}
        </section>)}

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={open => { if (open || !isDeleting) setIsDeleteOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Excluir remove este convênio permanentemente. A exclusão será bloqueada se houver pacientes, autorizações, preços ou lotes vinculados. Para preservar esses dados, prefira inativar o convênio pela lista.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isDeleting}>
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Convenios;
