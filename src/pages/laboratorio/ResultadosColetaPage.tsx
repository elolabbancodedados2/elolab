import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AlertTriangle, FlaskConical, Loader2, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import { podeRegistrarResultado, STATUS_COLETA_LABELS } from '@/lib/laboratorioWorkflow';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function parseNumeroOpcional(valor: unknown): number | null {
  if (valor == null || String(valor).trim() === '') return null;
  const normalizado = String(valor).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

const FORM_RESULTADO_VAZIO = {
  parametro: '', resultado: '', unidade: '', valor_referencia_min: '',
  valor_referencia_max: '', valor_referencia_texto: '', metodo: '', critico: false,
};

export default function ResultadosColetaPage() {
  const { coletaId } = useParams();
  const { profile } = useSupabaseAuth();
  return <ResultadosWorkspace key={`${profile?.clinica_id ?? ''}:${coletaId}`} />;
}

function ResultadosWorkspace() {
  const { coletaId: showResultados } = useParams();
  const { user, profile } = useSupabaseAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const completed = useRef(false);
  const saveLock = useRef(false);
  const returnTo = typeof location.state?.laboratorioSearch === 'string' && location.state.laboratorioSearch.startsWith('?') ? `/laboratorio${location.state.laboratorioSearch}` : '/laboratorio';
  const returnState = { buscaPaciente: location.state?.buscaPaciente ?? '' };
  const coletaQuery = useQuery({
    queryKey: ['coleta-resultados-contexto', profile?.clinica_id, showResultados],
    enabled: !!profile?.clinica_id && !!showResultados,
    queryFn: async () => {
      const { data, error } = await supabase.from('coletas_laboratorio')
        .select('id, paciente_id, codigo_amostra, tipo_amostra, status, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('id', showResultados!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const resultadosQuery = useQuery({
    queryKey: ['resultados-laboratorio', profile?.clinica_id, user?.id, showResultados],
    queryFn: async () => {
      if (!showResultados) return [];
      const { data: coleta, error: coletaError } = await supabase.from('coletas_laboratorio')
        .select('id')
        .eq('id', showResultados)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (coletaError) throw coletaError;
      if (!coleta) throw new Error('Amostra não encontrada na clínica atual.');
      const { data, error } = await supabase
        .from('resultados_laboratorio')
        .select('*')
        .eq('coleta_id', showResultados).eq('clinica_id', profile!.clinica_id!)
        .order('parametro');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id && !!showResultados && !!coletaQuery.data,
  });
  const perfilCatalogoQuery = useQuery({
    queryKey: ['lab-perfil-catalogo-coleta', profile?.clinica_id, showResultados],
    enabled: !!profile?.clinica_id && !!showResultados && !!coletaQuery.data,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('coletas_laboratorio')
        .select('exames(tipo_exame, tipo_exames_catalog(nome, unidade_padrao, referencia_min, referencia_max, referencia_texto, metodo_padrao))')
        .eq('clinica_id', profile!.clinica_id).eq('id', showResultados).maybeSingle();
      if (error) throw error;
      const exame = Array.isArray(data?.exames) ? data.exames[0] : data?.exames;
      const catalogo = Array.isArray(exame?.tipo_exames_catalog) ? exame.tipo_exames_catalog[0] : exame?.tipo_exames_catalog;
      return catalogo ? { ...catalogo, nome: catalogo.nome || exame?.tipo_exame || '' } : null;
    },
  });
  const resultados = resultadosQuery.data;

  const [newResultForm, setNewResultForm] = useState(FORM_RESULTADO_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<{ id: string; parametro: string } | null>(null);

  const addResultado = useMutation({
    mutationFn: async (form: any) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!String(form.parametro ?? '').trim() || !String(form.resultado ?? '').trim()) {
        throw new Error('Informe o parâmetro e o resultado da análise.');
      }
      const referenciaMinima = parseNumeroOpcional(form.valor_referencia_min);
      const referenciaMaxima = parseNumeroOpcional(form.valor_referencia_max);
      if ([referenciaMinima, referenciaMaxima].some(valor => valor !== null && !Number.isFinite(valor))) {
        throw new Error('Os valores de referência precisam ser numéricos.');
      }
      if (referenciaMinima !== null && referenciaMaxima !== null && referenciaMinima > referenciaMaxima) {
        throw new Error('O valor de referência mínimo não pode ser maior que o máximo.');
      }
      const { data: coleta, error: coletaError } = await supabase.from('coletas_laboratorio')
        .select('id, paciente_id, status')
        .eq('id', form.coleta_id)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (coletaError) throw coletaError;
      if (!coleta || !['coletado', 'em_analise'].includes(coleta.status)) {
        throw new Error('Só é possível registrar resultado em uma amostra coletada que ainda esteja em análise.');
      }
      const { id: resultadoId, ...campos } = form;
      if (resultadoId) {
        // Correção de um resultado já lançado, enquanto a amostra está aberta.
        const { data, error } = await supabase.from('resultados_laboratorio').update({
          parametro: String(campos.parametro).trim(),
          resultado: String(campos.resultado).trim(),
          unidade: campos.unidade,
          valor_referencia_min: referenciaMinima,
          valor_referencia_max: referenciaMaxima,
          valor_referencia_texto: campos.valor_referencia_texto,
          metodo: campos.metodo,
          critico: campos.critico,
        }).eq('id', resultadoId).eq('clinica_id', profile.clinica_id).eq('coleta_id', form.coleta_id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('O resultado não foi encontrado nesta amostra ou não pode mais ser alterado.');
        return 'editado' as const;
      }
      const { error } = await supabase.from('resultados_laboratorio').insert({
        ...campos,
        parametro: String(campos.parametro).trim(),
        resultado: String(campos.resultado).trim(),
        valor_referencia_min: referenciaMinima,
        valor_referencia_max: referenciaMaxima,
        paciente_id: coleta.paciente_id,
        clinica_id: profile.clinica_id,
      });
      if (error) throw error;
      return 'adicionado' as const;
    },
    onSuccess: (acao) => {
      queryClient.invalidateQueries({ queryKey: ['resultados-laboratorio', profile?.clinica_id] });
      setNewResultForm(FORM_RESULTADO_VAZIO);
      setEditandoId(null);
      toast.success(acao === 'editado' ? 'Resultado corrigido' : 'Resultado adicionado!');
    },
    onError: (e) => toast.error(editandoId ? 'Não foi possível corrigir o resultado' : 'Não foi possível adicionar o resultado', { description: mensagemDeErro(e) }),
    onSettled: () => { saveLock.current = false; },
  });

  const removerResultado = useMutation({
    mutationFn: async (resultado: { id: string }) => {
      if (!profile?.clinica_id || !showResultados) throw new Error('Clínica não identificada.');
      const { data: coleta, error: coletaError } = await supabase.from('coletas_laboratorio')
        .select('status').eq('id', showResultados).eq('clinica_id', profile.clinica_id).maybeSingle();
      if (coletaError) throw coletaError;
      if (!coleta || !podeRegistrarResultado(coleta.status)) {
        throw new Error('A amostra não está mais aberta para alterações.');
      }
      const { data, error } = await supabase.from('resultados_laboratorio')
        .delete()
        .eq('id', resultado.id).eq('clinica_id', profile.clinica_id).eq('coleta_id', showResultados)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('O resultado não foi encontrado ou já foi removido.');
    },
    onSuccess: (_dados, resultado) => {
      queryClient.invalidateQueries({ queryKey: ['resultados-laboratorio', profile?.clinica_id] });
      if (editandoId === resultado.id) { setEditandoId(null); setNewResultForm(FORM_RESULTADO_VAZIO); }
      setRemovendo(null);
      toast.success('Resultado removido');
    },
    onError: (e) => toast.error('Não foi possível remover o resultado', { description: mensagemDeErro(e) }),
  });

  const iniciarEdicao = (r: any) => {
    setEditandoId(r.id);
    setNewResultForm({
      parametro: r.parametro ?? '',
      resultado: r.resultado ?? '',
      unidade: r.unidade ?? '',
      valor_referencia_min: r.valor_referencia_min == null ? '' : String(r.valor_referencia_min),
      valor_referencia_max: r.valor_referencia_max == null ? '' : String(r.valor_referencia_max),
      valor_referencia_texto: r.valor_referencia_texto ?? '',
      metodo: r.metodo ?? '',
      critico: r.critico === true,
    });
    window.setTimeout(() => document.getElementById('lab-resultado-parametro')?.focus(), 0);
  };
  const cancelarEdicao = () => { setEditandoId(null); setNewResultForm(FORM_RESULTADO_VAZIO); };
  const amostraAberta = podeRegistrarResultado(coletaQuery.data?.status);

  const dirty = Object.entries(newResultForm).some(([field, value]) => field === 'critico' ? value === true : value !== '');
  return <div className="space-y-5 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={dirty} busy={addResultado.isPending} completed={completed} />
    <Button asChild variant="outline"><Link to={returnTo} state={returnState}>Voltar ao laboratório</Link></Button>
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Resultados da amostra" icon={<FlaskConical className="h-5 w-5" />} description="Confira a identificação da amostra antes de registrar parâmetros. A validação e a liberação continuam no fluxo de laudos." />
      {coletaQuery.isError ? <ErrorState title="Não foi possível carregar a amostra" error={coletaQuery.error} onRetry={() => void coletaQuery.refetch()} /> : coletaQuery.isLoading ? <p role="status">Carregando amostra…</p> : !coletaQuery.data ? <p role="status">Amostra não encontrada nesta clínica.</p> : <>
        <section aria-label="Identificação da amostra" className="space-y-2 border-y py-4">
          <p className="font-mono text-sm text-primary">{coletaQuery.data.codigo_amostra}</p>
          <h2 className="text-lg font-semibold">{coletaQuery.data.pacientes?.nome ?? 'Paciente sem nome'}</h2>
          <p className="text-sm text-muted-foreground">{coletaQuery.data.tipo_amostra} · {STATUS_COLETA_LABELS[coletaQuery.data.status] ?? coletaQuery.data.status}</p>
        </section>
          <div className="space-y-4">
            {resultadosQuery.isLoading && <p role="status" className="text-muted-foreground text-center py-4">Carregando resultados…</p>}
            {resultadosQuery.isError && (
              <ErrorState compact description="Não foi possível carregar os resultados desta amostra" error={resultadosQuery.error} onRetry={() => void resultadosQuery.refetch()} />
            )}
            {!resultadosQuery.isLoading && !resultadosQuery.isError && resultados?.length === 0 && <p className="text-muted-foreground text-center py-4">Nenhum resultado cadastrado</p>}
            {resultados?.map((r: any) => {
              const textoResultado = String(r.resultado ?? '').trim();
              const numeroNormalizado = textoResultado.includes(',')
                ? textoResultado.replace(/\./g, '').replace(',', '.')
                : textoResultado;
              const numResult = textoResultado ? Number(numeroNormalizado) : Number.NaN;
              const isAltered = Number.isFinite(numResult) && ((r.valor_referencia_min != null && numResult < r.valor_referencia_min) || (r.valor_referencia_max != null && numResult > r.valor_referencia_max));
              return (
                <div key={r.id} className={cn('border-b py-4 px-3', (isAltered || r.critico) ? 'border-destructive/30 bg-destructive/5' : '')}>
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium">{r.parametro}{isAltered && <Badge variant="outline">Fora da referência</Badge>}{r.critico && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Crítico</Badge>}</div>
                      {r.metodo && <p className="text-xs text-muted-foreground">Método: {r.metodo}</p>}
                    </div>
                    <div className="text-right">
                      <p className={cn('text-lg font-bold', isAltered && 'text-destructive')}>
                        {r.resultado} {r.unidade}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ref: {r.valor_referencia_texto || `${r.valor_referencia_min ?? '-'} a ${r.valor_referencia_max ?? '-'} ${r.unidade || ''}`}
                      </p>
                    </div>
                  </div>
                  {amostraAberta && (
                    <div className="mt-2 flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" className="h-11 gap-1.5 sm:h-8" aria-label={`Editar resultado ${r.parametro}`} disabled={addResultado.isPending || removerResultado.isPending || editandoId === r.id} onClick={() => iniciarEdicao(r)}>
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />Editar
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-11 gap-1.5 text-destructive sm:h-8" aria-label={`Remover resultado ${r.parametro}`} disabled={addResultado.isPending || removerResultado.isPending} onClick={() => setRemovendo({ id: r.id, parametro: r.parametro })}>
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Remover
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {perfilCatalogoQuery.isError && <ErrorState compact description="Não foi possível carregar o perfil do exame. Tente novamente ou informe os valores manualmente conforme o método utilizado." onRetry={() => void perfilCatalogoQuery.refetch()} />}
            {/* Add resultado form */}
            {amostraAberta ? <Card>
              <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-3"><div><CardTitle className="text-sm">{editandoId ? 'Corrigir resultado' : 'Adicionar Resultado'}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{editandoId ? 'Altere os campos e salve a correção. A alteração fica registrada na auditoria.' : 'Informe resultado e referência definidos para este método.'}</p></div>{perfilCatalogoQuery.data && <Button type="button" size="sm" variant="outline" disabled={perfilCatalogoQuery.isLoading || addResultado.isPending} onClick={() => setNewResultForm(current => ({ ...current, unidade: perfilCatalogoQuery.data?.unidade_padrao || current.unidade, valor_referencia_min: perfilCatalogoQuery.data?.referencia_min == null ? current.valor_referencia_min : String(perfilCatalogoQuery.data.referencia_min), valor_referencia_max: perfilCatalogoQuery.data?.referencia_max == null ? current.valor_referencia_max : String(perfilCatalogoQuery.data.referencia_max), valor_referencia_texto: perfilCatalogoQuery.data?.referencia_texto || current.valor_referencia_texto, metodo: perfilCatalogoQuery.data?.metodo_padrao || current.metodo }))}>Usar perfil do exame</Button>}</CardHeader>
              <CardContent>
                <form aria-label={editandoId ? 'Corrigir resultado' : 'Adicionar resultado'} onSubmit={(e) => {
                  e.preventDefault();
                  if (!showResultados) return;
                  // O botão não era desabilitado durante a mutation: dois
                  // cliques por impaciência inseriam o mesmo parâmetro duas
                  // vezes na coleta, e o laudo saía com a linha repetida.
                  if (saveLock.current) return;
                  saveLock.current = true;
                  const coleta = coletaQuery.data;
                  addResultado.mutate({
                    id: editandoId ?? undefined,
                    coleta_id: showResultados,
                    clinica_id: profile?.clinica_id,
                    paciente_id: coleta?.paciente_id,
                    parametro: newResultForm.parametro,
                    resultado: newResultForm.resultado,
                    unidade: newResultForm.unidade || null,
                    valor_referencia_min: newResultForm.valor_referencia_min,
                    valor_referencia_max: newResultForm.valor_referencia_max,
                    valor_referencia_texto: newResultForm.valor_referencia_texto || null,
                    metodo: newResultForm.metodo || null,
                    critico: newResultForm.critico,
                  });
                }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label htmlFor="lab-resultado-parametro" className="text-xs">Parâmetro *</Label><Input id="lab-resultado-parametro" disabled={addResultado.isPending} value={newResultForm.parametro} onChange={(e) => setNewResultForm(p => ({ ...p, parametro: e.target.value }))} placeholder="Ex: Hemoglobina" /></div>
                  <div><Label htmlFor="lab-resultado-valor" className="text-xs">Resultado *</Label><Input id="lab-resultado-valor" disabled={addResultado.isPending} value={newResultForm.resultado} onChange={(e) => setNewResultForm(p => ({ ...p, resultado: e.target.value }))} placeholder="Ex: 14.2" /></div>
                  <div><Label htmlFor="lab-resultado-unidade" className="text-xs">Unidade</Label><Input id="lab-resultado-unidade" disabled={addResultado.isPending} value={newResultForm.unidade} onChange={(e) => setNewResultForm(p => ({ ...p, unidade: e.target.value }))} placeholder="g/dL" /></div>
                  <div><Label htmlFor="lab-resultado-metodo" className="text-xs">Método</Label><Input id="lab-resultado-metodo" disabled={addResultado.isPending} value={newResultForm.metodo} onChange={(e) => setNewResultForm(p => ({ ...p, metodo: e.target.value }))} placeholder="Automatizado" /></div>
                  <div><Label htmlFor="lab-resultado-ref-min" className="text-xs">Ref. Mínimo</Label><Input id="lab-resultado-ref-min" disabled={addResultado.isPending} type="text" inputMode="decimal" value={newResultForm.valor_referencia_min} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_min: e.target.value }))} placeholder="Opcional" /></div>
                  <div><Label htmlFor="lab-resultado-ref-max" className="text-xs">Ref. Máximo</Label><Input id="lab-resultado-ref-max" disabled={addResultado.isPending} type="text" inputMode="decimal" value={newResultForm.valor_referencia_max} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_max: e.target.value }))} placeholder="Opcional" /></div>
                  <div className="sm:col-span-2"><Label htmlFor="lab-resultado-ref-texto" className="text-xs">Referência textual</Label><Input id="lab-resultado-ref-texto" disabled={addResultado.isPending} value={newResultForm.valor_referencia_texto} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_texto: e.target.value }))} placeholder="Ex: Não reagente" /></div>
                  <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3"><Checkbox id="resultado-critico" checked={newResultForm.critico} disabled={addResultado.isPending} onCheckedChange={(checked) => setNewResultForm(p => ({ ...p, critico: checked === true }))} /><div><Label htmlFor="resultado-critico" className="cursor-pointer text-sm font-medium">Resultado crítico</Label><p className="text-xs text-muted-foreground">Sinaliza para revisão prioritária conforme o protocolo da clínica.</p></div></div>
                  <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3 border-t pt-4 scroll-mb-24">
                    <span role="status" className="mr-auto text-xs text-muted-foreground">{addResultado.isPending ? 'Registrando resultado…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
                    {editandoId && <Button type="button" size="sm" variant="outline" disabled={addResultado.isPending} onClick={cancelarEdicao}>Cancelar correção</Button>}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newResultForm.parametro || !newResultForm.resultado || addResultado.isPending}
                      className="gap-2"
                    >
                      {addResultado.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {editandoId ? 'Salvar correção' : 'Adicionar'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card> : (
              <div role="status" className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-primary">
                A amostra não está mais aberta para lançamento. Isso preserva a conferência e a trilha de auditoria do resultado.
              </div>
            )}
          </div>
      </>}
    </div>
    <ConfirmDialog
      open={removendo !== null}
      onOpenChange={(aberto) => { if (!aberto && !removerResultado.isPending) setRemovendo(null); }}
      title="Remover resultado?"
      description={removendo ? `O parâmetro "${removendo.parametro}" será removido desta amostra. A remoção fica registrada na auditoria.` : ''}
      confirmLabel="Remover resultado"
      variant="destructive"
      isLoading={removerResultado.isPending}
      closeOnConfirm={false}
      onConfirm={() => { if (removendo) removerResultado.mutate({ id: removendo.id }); }}
    />
  </div>;
}
