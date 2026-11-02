import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FlaskConical, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { mensagemDeErro } from '@/lib/erros';
import { buildSampleReasonPayload, SAMPLE_REJECTION_REASONS } from '@/lib/sampleRejection';
import { STATUS_COLETA_LABELS } from '@/lib/laboratorioWorkflow';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const nomePaciente = (paciente: { nome_social?: string; nome?: string } | null) => paciente?.nome_social?.trim() || paciente?.nome || '—';
const TIPO_EVENTO: Record<string, string> = { recebida: 'Recebimento no laboratório', transporte: 'Transporte', armazenamento: 'Armazenamento', observacao: 'Observação', rejeicao: 'Amostra rejeitada', recoleta: 'Recoleta solicitada', coleta: 'Coleta registrada', status: 'Mudança de status' };
const rotuloEvento = (tipo: unknown) => TIPO_EVENTO[String(tipo)] ?? String(tipo ?? '').replace(/_/g, ' ').replace(/^./, (letra) => letra.toUpperCase());
const dataHoraClinica = (instant: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);

export default function AmostraPage() {
  const { coletaId } = useParams();
  const { profile } = useSupabaseAuth();
  return <AmostraWorkspace key={`${profile?.clinica_id ?? ''}:${coletaId}`} />;
}

function AmostraWorkspace() {
  const { coletaId: detailId } = useParams();
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const completed = useRef(false);
  const saveLock = useRef(false);
  const coletaQuery = useQuery({
    queryKey: ['mapa-amostra-detalhe', profile?.clinica_id, detailId],
    enabled: !!profile?.clinica_id && !!detailId,
    queryFn: async () => {
      const { data, error } = await supabase.from('coletas_laboratorio')
        .select('*, pacientes(nome, nome_social, cpf), medicos(nome), exames(tipo_exame), laboratorio_setores(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('id', detailId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [eventoTipo, setEventoTipo] = useState(location.state?.eventoInicial === 'recoleta' ? 'recoleta' : 'transporte');
  const [eventoLocal, setEventoLocal] = useState('');
  const [eventoMotivoCodigo, setEventoMotivoCodigo] = useState('');
  const [eventoMotivo, setEventoMotivo] = useState('');
  const [savingEvento, setSavingEvento] = useState(false);
  const eventosAmostraQuery = useQuery({
    queryKey: ['lab-amostra-eventos', profile?.clinica_id, detailId],
    enabled: !!profile?.clinica_id && !!detailId && !!coletaQuery.data,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorio_eventos_amostra')
        .select('id, tipo, status_anterior, status_novo, local, detalhes, created_at, profiles(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('coleta_id', detailId!)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const registrarEventoAmostra = async () => {
    const amostra = coletaQuery.data;
    if (!amostra || !profile?.clinica_id || saveLock.current) return;
    if (['transporte', 'armazenamento'].includes(eventoTipo) && !eventoLocal.trim()) {
      toast.error('Informe o local da amostra.');
      return;
    }
    const exigeMotivoEstruturado = ['rejeicao', 'recoleta'].includes(eventoTipo);
    const motivoEstruturado = exigeMotivoEstruturado
      ? buildSampleReasonPayload(eventoMotivoCodigo, eventoMotivo)
      : null;
    if (exigeMotivoEstruturado && !motivoEstruturado) {
      toast.error(eventoMotivoCodigo === 'outro'
        ? 'Explique o motivo selecionado em pelo menos 5 caracteres.'
        : 'Selecione um motivo para continuar.');
      return;
    }
    saveLock.current = true;
    setSavingEvento(true);
    try {
      const detalhesEvento = motivoEstruturado ?? (eventoMotivo.trim() ? { motivo: eventoMotivo.trim() } : {});
      const { data, error } = await (supabase as any).rpc('laboratorio_registrar_evento_amostra', {
        p_coleta_id: amostra.id,
        p_tipo: eventoTipo,
        p_local: eventoLocal.trim() || null,
        p_detalhes: detalhesEvento,
      });
      if (error) throw error;
      const resultId = typeof data === 'string' ? data : amostra.id;
      toast.success(eventoTipo === 'recoleta' ? 'Nova amostra criada e vinculada à anterior' : 'Movimentação registrada no histórico');
      setEventoLocal(''); setEventoMotivoCodigo(''); setEventoMotivo(''); setEventoTipo('transporte');
      await Promise.all([coletaQuery.refetch(), eventosAmostraQuery.refetch()]);
      if (eventoTipo === 'recoleta') { completed.current = true; navigate(`/mapa-coleta/${resultId}`, { replace: true, state: { mapaFilters: location.state?.mapaFilters } }); }
    } catch (error) {
      toast.error('Não foi possível registrar a movimentação', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setSavingEvento(false);
    }
  };

  const detailItem = coletaQuery.data;
  const dirty = eventoLocal !== '' || eventoMotivoCodigo !== '' || eventoMotivo !== '';
  return <div className="space-y-5 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={dirty} busy={savingEvento} completed={completed} />
    <Button asChild variant="outline"><Link to="/mapa-coleta" state={{ mapaFilters: location.state?.mapaFilters }}>Voltar ao mapa de coleta</Link></Button>
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Detalhes da coleta" icon={<FlaskConical className="h-5 w-5" />} description={detailItem?.codigo_amostra ? `Amostra ${detailItem.codigo_amostra} · identificação, condições e movimentações` : 'Consulte a identificação e a rastreabilidade da amostra.'} />
      {coletaQuery.isError ? <ErrorState title="Não foi possível carregar a amostra" error={coletaQuery.error} onRetry={() => void coletaQuery.refetch()} /> : coletaQuery.isLoading ? <p role="status">Carregando amostra…</p> : !detailItem ? <p role="status">Amostra não encontrada nesta clínica.</p> : <>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-y py-5">
                <div><p className="text-[11px] text-muted-foreground">Paciente</p><p className="font-semibold">{nomePaciente(detailItem.pacientes)}</p></div>
                <div><p className="text-[11px] text-muted-foreground">CPF</p><p>{detailItem.pacientes?.cpf || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Solicitada em</p><p>{detailItem.created_at ? dataHoraClinica(new Date(detailItem.created_at)) : '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Coletada em</p><p>{detailItem.data_coleta ? dataHoraClinica(new Date(detailItem.data_coleta)) : '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Médico</p><p>{detailItem.medicos?.nome || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Exame</p><p>{detailItem.exames?.tipo_exame || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Setor</p><p>{detailItem.laboratorio_setores?.nome || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Amostra</p><p>{detailItem.tipo_amostra} {detailItem.tubo && `· ${detailItem.tubo}`}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Volume</p><p>{detailItem.volume_ml ? `${detailItem.volume_ml}mL` : '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Sítio</p><p>{detailItem.sitio_coleta || '—'}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Lote do insumo</p><p>{detailItem.lote_insumo || '—'}</p></div>
              </div>
              {detailItem.condicao_amostra?.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">Condições da Amostra</p>
                  <div className="flex flex-wrap gap-1">
                    {detailItem.condicao_amostra.map((c: string) => <Badge key={c} variant="destructive" className="rounded-full text-[10px]">{c}</Badge>)}
                  </div>
                </div>
              )}
              {detailItem.observacoes && (
                <div><p className="text-[11px] text-muted-foreground">Observações</p><p>{detailItem.observacoes}</p></div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline">{STATUS_COLETA_LABELS[detailItem.status] ?? detailItem.status}</Badge>
                {detailItem.urgente && <Badge variant="outline" className="gap-1 rounded-full border-warning/40 bg-warning/10 text-warning-foreground"><Zap aria-hidden="true" className="h-3 w-3" />Urgente</Badge>}
                {detailItem.jejum_necessario && <Badge variant="outline" className="rounded-full">Jejum {detailItem.jejum_horas}h</Badge>}
              </div>
              {detailItem.local_atual && <p className="text-xs text-muted-foreground">Local atual: <span className="font-medium text-foreground">{detailItem.local_atual}</span></p>}
              {detailItem.rejeicao_motivo && <p className="rounded-md bg-destructive/5 p-2 text-xs text-destructive">Motivo da rejeição: {detailItem.rejeicao_motivo}</p>}

              <section className="space-y-3 border-b py-5" aria-label="Histórico de rastreabilidade">
                <div><p className="text-sm font-semibold">Rastreabilidade da amostra</p><p className="text-xs text-muted-foreground">Cada movimentação fica registrada com data e responsável. Exibindo os 100 eventos mais recentes.</p></div>
                {eventosAmostraQuery.isError ? <ErrorState compact description="Não foi possível carregar o histórico" error={eventosAmostraQuery.error} onRetry={() => void eventosAmostraQuery.refetch()} /> : eventosAmostraQuery.isLoading ? <p role="status" className="text-xs text-muted-foreground">Carregando histórico…</p> : eventosAmostraQuery.data?.length ? (
                  <ol className="space-y-3">{eventosAmostraQuery.data.map((evento: any) => <li key={evento.id} className="flex gap-2 border-l-2 border-primary/30 pl-3"><div className="min-w-0"><p className="text-xs font-medium">{rotuloEvento(evento.tipo)}{evento.status_novo ? ` · ${STATUS_COLETA_LABELS[evento.status_novo] ?? evento.status_novo}` : ''}</p><p className="text-[11px] text-muted-foreground">{dataHoraClinica(new Date(evento.created_at))}{evento.profiles?.nome ? ` · ${evento.profiles.nome}` : ''}{evento.local ? ` · ${evento.local}` : ''}</p>{evento.detalhes?.motivo && <p className="mt-0.5 text-xs">{evento.detalhes.motivo}</p>}</div></li>)}</ol>
                ) : <p className="text-xs text-muted-foreground">Nenhuma movimentação registrada.</p>}
              </section>

              <form aria-label="Movimentação da amostra" onSubmit={event => { event.preventDefault(); void registrarEventoAmostra(); }} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
                <fieldset className="min-w-0 space-y-3" disabled={savingEvento}>
                <p className="text-sm font-semibold">Registrar movimentação</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="lab-amostra-evento">Evento</Label><Select value={eventoTipo} onValueChange={value => { setEventoTipo(value); setEventoMotivoCodigo(''); setEventoMotivo(''); setEventoLocal(''); }}><SelectTrigger id="lab-amostra-evento"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="recebida">Recebimento no laboratório</SelectItem><SelectItem value="transporte">Transporte</SelectItem><SelectItem value="armazenamento">Armazenamento</SelectItem><SelectItem value="observacao">Observação</SelectItem>
                    {(detailItem.status === 'coletado' || detailItem.status === 'em_analise') && <SelectItem value="rejeicao">Rejeitar amostra</SelectItem>}
                    {['coletado', 'em_analise', 'rejeitada'].includes(detailItem.status) && <SelectItem value="recoleta">Solicitar recoleta</SelectItem>}
                  </SelectContent></Select></div>
                  {['rejeicao', 'recoleta'].includes(eventoTipo) && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="lab-amostra-motivo-categoria">Motivo</Label>
                        <Select value={eventoMotivoCodigo} onValueChange={value => { setEventoMotivoCodigo(value); setEventoMotivo(''); }}>
                          <SelectTrigger id="lab-amostra-motivo-categoria"><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                          <SelectContent>
                            {SAMPLE_REJECTION_REASONS.map(reason => <SelectItem key={reason.code} value={reason.code}>{reason.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lab-amostra-motivo-detalhe">
                          {eventoMotivoCodigo === 'outro' ? 'Explique o motivo' : 'Detalhe adicional (opcional)'}
                        </Label>
                        <Input
                          id="lab-amostra-motivo-detalhe"
                          value={eventoMotivo}
                          onChange={event => setEventoMotivo(event.target.value)}
                          maxLength={300}
                          placeholder={eventoMotivoCodigo === 'outro' ? 'Mínimo de 5 caracteres' : 'Até 300 caracteres'}
                        />
                      </div>
                    </>
                  )}
                  {['transporte', 'armazenamento'].includes(eventoTipo) && <div className="space-y-1"><Label htmlFor="lab-amostra-local">Local</Label><Input id="lab-amostra-local" value={eventoLocal} onChange={(event) => setEventoLocal(event.target.value)} maxLength={120} placeholder="Ex.: setor de bioquímica" /></div>}
                  {eventoTipo === 'observacao' && <div className="space-y-1 sm:col-span-2"><Label htmlFor="lab-amostra-motivo">Observação</Label><Input id="lab-amostra-motivo" value={eventoMotivo} onChange={(event) => setEventoMotivo(event.target.value)} maxLength={500} placeholder="Descreva a ocorrência" /></div>}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4 scroll-mb-24"><span role="status" className="mr-auto text-xs text-muted-foreground">{savingEvento ? 'Registrando movimentação…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span><Button size="sm" type="submit" disabled={savingEvento} className="gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">{savingEvento && <Loader2 className="h-4 w-4 animate-spin" />} Registrar evento</Button></div>
              </fieldset></form>
            </div>
      </>}
    </div>
  </div>;
}
