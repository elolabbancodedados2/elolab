import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileStack, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

interface Convenio { id: string; nome: string; versao_tiss: string | null }
interface LoteExistente { id: string; numero_lote: string; convenio_id: string; competencia: string; quantidade_guias: number; valor_apresentado: number }
interface FormularioLote { convenioId: string; competencia: string; numero: string; quantidade: string; valor: string }
interface FaturamentoFiltros { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface NavegacaoFaturamento { filtros?: FaturamentoFiltros; restaurarFiltros?: FaturamentoFiltros }
interface LotePayload { p_convenio_id: string; p_competencia: string; p_numero_lote: string; p_quantidade_guias: number; p_valor_apresentado: number }

const numeroMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
const primeiroDiaCompetencia = () => `${todaySaoPauloDateOnly().slice(0, 7)}-01`;
const novoFormulario = (): FormularioLote => ({ convenioId: '', competencia: primeiroDiaCompetencia(), numero: '', quantidade: '', valor: '' });
const igualPayload = (a: LotePayload | null, b: LotePayload) => !!a && a.p_convenio_id === b.p_convenio_id
  && a.p_competencia === b.p_competencia && a.p_numero_lote === b.p_numero_lote
  && a.p_quantidade_guias === b.p_quantidade_guias && a.p_valor_apresentado === b.p_valor_apresentado;

export default function NovoLoteTissPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const completed = useRef(false);
  const ultimaTentativa = useRef<LotePayload | null>(null);
  const navigationState = (location.state ?? {}) as NavegacaoFaturamento;
  const filtros = navigationState.filtros;
  const [formulario, setFormulario] = useState<FormularioLote>(novoFormulario);
  const [erro, setErro] = useState('');
  const conveniosQuery = useQuery({
    queryKey: ['convenios-faturamento', profile?.clinica_id ?? null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('convenios').select('id,nome,versao_tiss')
        .eq('clinica_id', profile?.clinica_id ?? '').eq('ativo', true).order('nome');
      if (error) throw error;
      return (data ?? []) as Convenio[];
    },
  });
  const convenios = conveniosQuery.data ?? [];
  const convenioSelecionado = convenios.find(item => item.id === formulario.convenioId);
  const valor = Number(formulario.valor);
  const quantidade = Number(formulario.quantidade);
  const dirty = Boolean(formulario.convenioId || formulario.numero.trim() || formulario.quantidade || formulario.valor
    || formulario.competencia !== primeiroDiaCompetencia());
  const retorno = useMemo(() => ({
    pathname: '/faturamento-convenios',
    state: filtros ? { restaurarFiltros: filtros } : undefined,
  }), [filtros]);

  const criarLote = useMutation({
    mutationFn: async (payload: LotePayload) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      if (!payload.p_convenio_id || !payload.p_numero_lote) throw new Error('Convênio e número do lote são obrigatórios.');
      if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(payload.p_competencia)) throw new Error('Selecione uma competência válida.');
      if (!Number.isInteger(payload.p_quantidade_guias) || payload.p_quantidade_guias < 1 || !Number.isFinite(payload.p_valor_apresentado) || payload.p_valor_apresentado <= 0) {
        throw new Error('Informe ao menos uma guia e um valor apresentado maior que zero.');
      }
      if (Math.abs(payload.p_valor_apresentado * 100 - Math.round(payload.p_valor_apresentado * 100)) >= 1e-7) {
        throw new Error('O valor apresentado deve ter no máximo duas casas decimais.');
      }
      if (!convenios.some(item => item.id === payload.p_convenio_id)) throw new Error('O convênio selecionado não está mais disponível. Atualize os dados e tente novamente.');

      const { data: existente, error: consultaError } = await (supabase as any).from('lotes_tiss')
        .select('id,numero_lote,convenio_id,competencia,quantidade_guias,valor_apresentado')
        .eq('clinica_id', profile.clinica_id).eq('convenio_id', payload.p_convenio_id)
        .eq('numero_lote', payload.p_numero_lote).maybeSingle();
      if (consultaError) throw consultaError;
      if (existente) {
        const mesmoRegistro = existente.competencia === payload.p_competencia
          && Number(existente.quantidade_guias) === payload.p_quantidade_guias
          && Number(existente.valor_apresentado) === payload.p_valor_apresentado;
        if (mesmoRegistro && igualPayload(ultimaTentativa.current, payload)) return { recuperado: true };
        throw new Error('Este número de lote já está cadastrado para o convênio selecionado.');
      }

      ultimaTentativa.current = payload;
      const { data, error } = await (supabase as any).rpc('criar_lote_tiss', payload);
      if (error) {
        if (error.code === '23505') throw new Error('Este número de lote já está cadastrado para o convênio selecionado. Atualize a lista para conferir o registro.');
        throw error;
      }
      if (!data?.success) throw new Error('O banco não confirmou a criação do lote. Atualize a lista antes de tentar novamente.');
      return { recuperado: false };
    },
    onSuccess: async ({ recuperado }) => {
      completed.current = true;
      await queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] });
      toast.success(recuperado ? 'A criação deste lote já havia sido concluída.' : 'Lote criado como rascunho.');
      navigate(retorno.pathname, { replace: true, state: retorno.state });
    },
    onError: error => setErro(mensagemDeErro(error)),
  });

  const mudar = <K extends keyof FormularioLote>(campo: K, valorNovo: FormularioLote[K]) => {
    setErro('');
    setFormulario(atual => ({ ...atual, [campo]: valorNovo }));
  };
  const enviar = () => {
    const payload: LotePayload = {
      p_convenio_id: formulario.convenioId,
      p_competencia: formulario.competencia,
      p_numero_lote: formulario.numero.trim(),
      p_quantidade_guias: quantidade,
      p_valor_apresentado: valor,
    };
    if (!igualPayload(ultimaTentativa.current, payload)) ultimaTentativa.current = null;
    setErro('');
    criarLote.mutate(payload);
  };

  if (conveniosQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} /></div>;
  if (!profile?.clinica_id) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para criar lotes TISS." /></div>;
  if (conveniosQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title="Novo lote TISS" description="Consolide a competência, o volume de guias e o valor que será apresentado à operadora." icon={<FileStack />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })} disabled={criarLote.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} />
    {convenios.length === 0 ? <Card><CardContent className="space-y-3 pt-6"><p className="text-sm text-muted-foreground">Não há convênios ativos nesta clínica. Cadastre ou ative um convênio antes de criar o lote.</p><Button variant="outline" onClick={() => navigate('/convenios')}>Abrir convênios</Button></CardContent></Card> : <>
      <div role="note" className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">O lote será criado como rascunho. O EloLab não gera arquivo TISS homologado nem transmite o lote à operadora.</div>
      <Card>
        <CardHeader className="border-b border-border/70"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Identificação do lote</CardTitle><p className="mt-1 text-sm text-muted-foreground">Os dados serão vinculados à clínica ativa.</p></div><Badge variant="outline">Rascunho ao salvar</Badge></div></CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-2"><Label htmlFor="tiss-convenio">Convênio</Label><Select value={formulario.convenioId} onValueChange={value => mudar('convenioId', value)} disabled={criarLote.isPending}><SelectTrigger id="tiss-convenio"><SelectValue placeholder="Selecione o convênio" /></SelectTrigger><SelectContent>{convenios.map(item => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select>{convenioSelecionado?.versao_tiss && <p className="text-xs text-muted-foreground">Versão cadastrada: {convenioSelecionado.versao_tiss}</p>}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="tiss-numero">Número do lote</Label><Input id="tiss-numero" required maxLength={80} autoComplete="off" value={formulario.numero} onChange={event => mudar('numero', event.target.value)} disabled={criarLote.isPending} aria-invalid={!!erro && !formulario.numero.trim()} /></div>
            <div className="space-y-2"><Label htmlFor="tiss-competencia">Competência</Label><Input id="tiss-competencia" type="month" required value={formulario.competencia.slice(0, 7)} onChange={event => mudar('competencia', event.target.value ? `${event.target.value}-01` : '')} disabled={criarLote.isPending} aria-invalid={!!erro && !/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(formulario.competencia)} /></div>
            <div className="space-y-2"><Label htmlFor="tiss-guias">Quantidade de guias</Label><Input id="tiss-guias" type="number" min="1" step="1" required value={formulario.quantidade} onChange={event => mudar('quantidade', event.target.value)} disabled={criarLote.isPending} aria-invalid={!!erro && (!Number.isInteger(quantidade) || quantidade < 1)} /></div>
            <div className="space-y-2"><Label htmlFor="tiss-valor">Valor apresentado (R$)</Label><Input id="tiss-valor" type="number" min="0.01" step="0.01" required value={formulario.valor} onChange={event => mudar('valor', event.target.value)} disabled={criarLote.isPending} aria-invalid={!!erro && (!Number.isFinite(valor) || valor <= 0)} /><p className="text-xs text-muted-foreground">{numeroMoeda(Number.isFinite(valor) ? valor : 0)} · até duas casas decimais</p></div>
          </div>
          {erro && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erro}</p><p className="mt-1 text-xs">Os campos foram preservados. Se a resposta anterior foi interrompida, confira o lote antes de repetir.</p></div>}
          <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })} disabled={criarLote.isPending}>Cancelar</Button><Button type="button" onClick={enviar} disabled={criarLote.isPending || !formulario.convenioId || !formulario.numero.trim() || !/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(formulario.competencia) || !Number.isInteger(quantidade) || quantidade < 1 || !Number.isFinite(valor) || valor <= 0 || Math.abs(valor * 100 - Math.round(valor * 100)) >= 1e-7}>{criarLote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar lote</Button></div>
        </CardContent>
      </Card>
    </>}
    <UnsavedChangesGuard dirty={dirty} busy={criarLote.isPending} completed={completed} />
  </div>;
}
