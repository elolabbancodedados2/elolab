import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CalendarClock, CheckCircle2, Clock, Info, Loader2, Mail, MessageSquare, Phone, ArrowLeft, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';

import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { montarRespostaAutorizacao, type DecisaoAutorizacao } from '@/lib/autorizacaoConvenio';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';

interface AutorizacaoConvenioWorkspaceProps {
  onExit: () => void;
  pacienteId: string;
  pacienteNome: string;
  convenioId?: string;
  tipoServico?: string;
  procedimento?: string;
}

interface AutorizacaoConvenio {
  id: string;
  descricao: string | null;
  status: string;
  numero_autorizacao: string | null;
  data_solicitacao: string | null;
  data_autorizacao: string | null;
  data_expiracao: string | null;
  observacoes: string | null;
  convenios: { nome: string; telefone: string | null } | null;
}

interface ConvenioAtivo {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  carencia: number | null;
}

interface FormularioResposta { decisao: DecisaoAutorizacao; senha: string; validade: string; observacao: string }
const respostaVazia = (): FormularioResposta => ({ decisao: 'autorizada', senha: '', validade: '', observacao: '' });

export function AutorizacaoConvenioWorkspace({
  onExit,
  pacienteId,
  pacienteNome,
  convenioId,
  tipoServico = 'consulta',
  procedimento = 'Consulta médica',
}: AutorizacaoConvenioWorkspaceProps) {
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? '';
  const [autorizacoes, setAutorizacoes] = useState<AutorizacaoConvenio[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNewAuth, setShowNewAuth] = useState(false);
  const [convenios, setConvenios] = useState<ConvenioAtivo[]>([]);
  const [selectedConvenio, setSelectedConvenio] = useState(convenioId || '');
  const [descricao, setDescricao] = useState(procedimento);
  const [datosCarencia, setDadosCarencia] = useState('');
  const [respostaPara, setRespostaPara] = useState<string | null>(null);
  const [resposta, setResposta] = useState<FormularioResposta>(respostaVazia);
  const [salvandoResposta, setSalvandoResposta] = useState(false);
  const loadRequestId = useRef(0);
  const completed = useRef(false);
  const submitLock = useRef(false);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!clinicaId) { setAutorizacoes([]); setConvenios([]); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const { data: auths, error: errorAutorizacoes } = await supabase
        .from('autorizacoes_convenio')
        .select('*, convenios(nome, telefone)')
        .eq('clinica_id', clinicaId)
        .eq('paciente_id', pacienteId)
        .order('data_solicitacao', { ascending: false });
      if (errorAutorizacoes) throw errorAutorizacoes;
      if (requestId !== loadRequestId.current) return;

      setAutorizacoes((auths || []) as AutorizacaoConvenio[]);

      const { data: convs, error: errorConvenios } = await supabase
        .from('convenios')
        .select('id, nome, telefone, email, carencia')
        .eq('clinica_id', clinicaId)
        .eq('ativo', true)
        .order('nome');
      if (errorConvenios) throw errorConvenios;
      if (requestId !== loadRequestId.current) return;

      setConvenios(convs || []);
      // Só vem preenchido quando o paciente já tem esse convênio; senão a escolha é obrigatória.
      const convenioAtual = convenioId && convs?.some(c => c.id === convenioId) ? convenioId : '';
      setSelectedConvenio(convenioAtual);
    } catch (e) {
      if (requestId === loadRequestId.current) setLoadError(e);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [pacienteId, convenioId, clinicaId]);

  useEffect(() => {
    completed.current = false;
    setSelectedConvenio(convenioId || '');
    setDescricao(procedimento);
    setDadosCarencia('');
    setShowNewAuth(false);
    setRespostaPara(null);
    void loadData();
    return () => { loadRequestId.current += 1; };
  }, [pacienteId, convenioId, procedimento, loadData]);

  const convenioInicial = convenioId && convenios.some(c => c.id === convenioId) ? convenioId : '';
  const respostaPreenchida = respostaPara !== null && !!(resposta.senha.trim() || resposta.validade || resposta.observacao.trim());
  const dirty = (showNewAuth && (
    selectedConvenio !== convenioInicial || descricao.trim() !== procedimento.trim() || datosCarencia.trim().length > 0
  )) || respostaPreenchida;

  const handleSolicitarAutorizacao = async () => {
    if (submitLock.current) return;
    if (!selectedConvenio || !descricao.trim()) {
      toast.error('Escolha o convênio e descreva o procedimento.');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    try {
      const { data: auth, error } = await supabase.rpc('solicitar_autorizacao_convenio', {
        p_paciente_id: pacienteId,
        p_convenio_id: selectedConvenio,
        p_tipo_servico: tipoServico,
        p_descricao: descricao.trim(),
        p_observacoes: datosCarencia,
      });

      if (error) throw error;

      await loadData();
      setShowNewAuth(false);
      setDescricao(procedimento);
      setDadosCarencia('');
      completed.current = true;
      const emailEnfileirado = typeof auth === 'object' && auth !== null && !Array.isArray(auth)
        && 'email_enfileirado' in auth && auth.email_enfileirado === true;
      if (emailEnfileirado) {
        toast.success('Pedido enviado ao e-mail do convênio', { description: 'Ele fica pendente até você registrar a resposta da operadora.' });
      } else {
        toast.warning('Pedido registrado só no EloLab', { description: 'Este convênio não tem e-mail cadastrado. Faça o pedido pelo telefone ou portal da operadora e registre a resposta aqui.' });
      }
    } catch (e: unknown) {
      toast.error('Não foi possível registrar o pedido de autorização.', { description: mensagemDeErro(e) });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const salvarResposta = async (autorizacaoId: string) => {
    if (salvandoResposta || !clinicaId) return;
    const resultado = montarRespostaAutorizacao({ ...resposta, hoje: todaySaoPauloDateOnly() });
    if (resultado.erro) { toast.error(resultado.erro); return; }
    setSalvandoResposta(true);
    try {
      const { data, error } = await (supabase as any).from('autorizacoes_convenio')
        .update(resultado.payload)
        .eq('id', autorizacaoId).eq('clinica_id', clinicaId).eq('status', 'pendente')
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Esta autorização já recebeu resposta. Atualize a lista para conferir.');
      setRespostaPara(null);
      setResposta(respostaVazia());
      await loadData();
      toast.success(resultado.payload.status === 'autorizada' ? 'Autorização registrada.' : 'Negativa registrada.');
    } catch (e) {
      toast.error('Não foi possível registrar a resposta.', { description: mensagemDeErro(e) });
    } finally {
      setSalvandoResposta(false);
    }
  };

  const cancelarFormulario = () => {
    setShowNewAuth(false);
    setSelectedConvenio(convenioInicial);
    setDescricao(procedimento);
    setDadosCarencia('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'autorizada':
        return <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success"><CheckCircle2 className="h-3 w-3" /> Autorizada</Badge>;
      case 'negada':
        return <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive"><XCircle className="h-3 w-3" /> Negada</Badge>;
      case 'expirada':
        return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" /> Expirada</Badge>;
      default:
        return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>;
    }
  };

  const selectedConvenioData = convenios.find(c => c.id === selectedConvenio);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5" data-testid="patient-insurance-authorizations-page">
      <UnsavedChangesGuard dirty={dirty} busy={submitting || salvandoResposta} completed={completed} />
      <PageHeader
        title="Autorizações do convênio"
        description="Acompanhe os pedidos deste paciente, registre a resposta da operadora e faça um novo pedido sem sair do contexto."
        icon={<Phone />}
        actions={<Button variant="outline" onClick={onExit} disabled={submitting || salvandoResposta}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao paciente</Button>}
      />
      <section className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
        <div className="space-y-5">
          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <p className="text-sm font-medium">{pacienteNome}</p>
            <p className="text-xs text-muted-foreground">Paciente</p>
          </div>

          {!loading && !loadError && convenios.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" role="status">
              Nenhum convênio ativo está cadastrado. Cadastre ou ative um convênio antes de solicitar autorização.
            </p>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
              <p className="mb-3 text-destructive">Não foi possível carregar autorizações e convênios.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadData()}>
                Tentar novamente
              </Button>
            </div>
          ) : autorizacoes.length === 0 && !showNewAuth ? (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium text-sm">Nenhuma autorização solicitada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use "Solicitar autorização" para pedir a liberação ao convênio.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {autorizacoes.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Autorizações anteriores</Label>
                  {autorizacoes.map((auth) => (
                    <div key={auth.id} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{auth.convenios?.nome}</p>
                          <p className="text-xs text-muted-foreground">{auth.descricao}</p>
                        </div>
                        {getStatusBadge(auth.status)}
                      </div>

                      {auth.numero_autorizacao && (
                        <p className="text-xs font-mono bg-muted/50 p-1.5 rounded">
                          Senha: {auth.numero_autorizacao}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {auth.data_solicitacao && (
                          <span>Solicitado: {format(parseDateOnly(auth.data_solicitacao.slice(0, 10))!, 'dd/MM/yyyy')}</span>
                        )}
                        {auth.data_autorizacao && (
                          <span>Autorizado: {format(new Date(auth.data_autorizacao), 'dd/MM/yyyy')}</span>
                        )}
                        {auth.data_expiracao && auth.status === 'autorizada' && (
                          <span>Vence: {format(parseDateOnly(auth.data_expiracao)!, 'dd/MM/yyyy')}</span>
                        )}
                      </div>

                      {auth.observacoes && (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MessageSquare className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{auth.observacoes}</p>
                      )}

                      {auth.status === 'pendente' && respostaPara !== auth.id && (
                        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={salvandoResposta || submitting}
                          onClick={() => { setRespostaPara(auth.id); setResposta(respostaVazia()); }}>
                          Registrar resposta
                        </Button>
                      )}

                      {respostaPara === auth.id && (
                        <fieldset className="space-y-3 rounded-lg border border-border bg-secondary p-3" disabled={salvandoResposta}>
                          <legend className="px-1 text-xs font-semibold">Resposta da operadora</legend>
                          <div role="radiogroup" aria-label="Decisão da operadora" className="grid gap-2 sm:grid-cols-2">
                            {(['autorizada', 'negada'] as const).map(opcao => (
                              <label key={opcao} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-sm ${resposta.decisao === opcao ? 'border-foreground' : 'border-border'}`}>
                                <input type="radio" name={`decisao-${auth.id}`} value={opcao} checked={resposta.decisao === opcao} onChange={() => setResposta(atual => ({ ...atual, decisao: opcao }))} className="accent-foreground" />
                                {opcao === 'autorizada' ? 'Autorizada' : 'Negada'}
                              </label>
                            ))}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor={`senha-${auth.id}`} className="text-xs">{resposta.decisao === 'autorizada' ? 'Senha da autorização' : 'Protocolo (opcional)'}</Label>
                              <Input id={`senha-${auth.id}`} maxLength={40} autoComplete="off" value={resposta.senha} onChange={e => setResposta(atual => ({ ...atual, senha: e.target.value }))} />
                            </div>
                            {resposta.decisao === 'autorizada' && (
                              <div className="space-y-1.5">
                                <Label htmlFor={`validade-${auth.id}`} className="text-xs">Validade da senha (opcional)</Label>
                                <Input id={`validade-${auth.id}`} type="date" min={todaySaoPauloDateOnly()} value={resposta.validade} onChange={e => setResposta(atual => ({ ...atual, validade: e.target.value }))} />
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`obs-resposta-${auth.id}`} className="text-xs">{resposta.decisao === 'negada' ? 'Motivo da negativa' : 'Observação (opcional)'}</Label>
                            <Textarea id={`obs-resposta-${auth.id}`} maxLength={1000} className="h-16 resize-none" value={resposta.observacao} onChange={e => setResposta(atual => ({ ...atual, observacao: e.target.value }))} />
                          </div>
                          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" className="min-h-11" onClick={() => { setRespostaPara(null); setResposta(respostaVazia()); }}>Cancelar</Button>
                            <Button type="button" className="min-h-11 gap-2" onClick={() => void salvarResposta(auth.id)}>
                              {salvandoResposta && <Loader2 className="h-4 w-4 animate-spin" />}Salvar resposta
                            </Button>
                          </div>
                        </fieldset>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showNewAuth && (
                <div className="space-y-3 rounded-lg border border-border bg-secondary p-3">
                  <Label className="text-xs font-semibold">Nova solicitação</Label>

                  <div className="space-y-2">
                    <Label htmlFor="convenio" className="text-xs">Convênio</Label>
                    <Select value={selectedConvenio} onValueChange={setSelectedConvenio}>
                      <SelectTrigger id="convenio" aria-required="true">
                        <SelectValue placeholder="Escolha o convênio" />
                      </SelectTrigger>
                      <SelectContent>
                        {convenios.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedConvenioData && (
                    <div className="p-2 rounded bg-card text-xs space-y-1">
                      {(selectedConvenioData.carencia ?? 0) > 0 && (
                        <p className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Período de carência: {selectedConvenioData.carencia} dias</p>
                      )}
                      {selectedConvenioData.telefone && (
                        <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden="true" />Suporte: {selectedConvenioData.telefone}</p>
                      )}
                      {selectedConvenioData.email && (
                        <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" aria-hidden="true" />E-mail: {selectedConvenioData.email}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="descricao" className="text-xs">Descrição do procedimento</Label>
                    <Textarea
                      id="descricao"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex.: consulta de clínica geral, ressonância magnética, cirurgia..."
                      className="h-20 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dados-carencia" className="text-xs">Observações (dados de carência etc.)</Label>
                    <Textarea
                      id="dados-carencia"
                      value={datosCarencia}
                      onChange={(e) => setDadosCarencia(e.target.value)}
                      placeholder="Informações adicionais para análise..."
                      className="h-16 resize-none"
                    />
                  </div>

                  {selectedConvenioData && (
                    <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <p className="text-xs text-foreground">
                        {selectedConvenioData.email
                          ? `O pedido vai para o e-mail do convênio (${selectedConvenioData.email}). Quando a operadora responder, registre a resposta aqui.`
                          : 'Este convênio não tem e-mail cadastrado: o pedido fica registrado só no EloLab. Faça a solicitação pelo telefone ou portal da operadora e registre a resposta aqui.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          {!showNewAuth && (
            <Button
              onClick={() => setShowNewAuth(true)}
              disabled={submitting || loading || !!loadError || convenios.length === 0}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Solicitar autorização
            </Button>
          )}
          {showNewAuth && (
            <>
              <Button
                variant="outline"
                onClick={cancelarFormulario}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSolicitarAutorizacao}
                disabled={submitting || !selectedConvenio || !descricao.trim()}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                Enviar solicitação
              </Button>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
