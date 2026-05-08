// @ts-nocheck
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Clock, XCircle, Loader2, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface AutorizacaoConvenioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  pacienteNome: string;
  convenioId?: string;
  tipoServico?: string;
  procedimento?: string;
}

export function AutorizacaoConvenioModal({
  open,
  onOpenChange,
  pacienteId,
  pacienteNome,
  convenioId,
  tipoServico = 'consulta',
  procedimento = 'Consulta Médica',
}: AutorizacaoConvenioModalProps) {
  const [autorizacoes, setAutorizacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showNewAuth, setShowNewAuth] = useState(false);
  const [convenios, setConvenios] = useState<any[]>([]);
  const [selectedConvenio, setSelectedConvenio] = useState(convenioId || '');
  const [descricao, setDescricao] = useState(procedimento);
  const [datosCarencia, setDadosCarencia] = useState('');

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, pacienteId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load autorizacoes for this paciente
      const { data: auths } = await supabase
        .from('autorizacoes_convenio')
        .select('*, convenios(nome, telefone_suporte)')
        .eq('paciente_id', pacienteId)
        .order('data_solicitacao', { ascending: false });

      setAutorizacoes(auths || []);

      // Load available convenios
      const { data: convs } = await supabase
        .from('convenios')
        .select('id, nome, telefone_suporte, email_suporte, dias_carencia')
        .eq('ativo', true)
        .order('nome');

      setConvenios(convs || []);
      if (convs && convs.length > 0 && !selectedConvenio) {
        setSelectedConvenio(convs[0].id);
      }
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSolicitarAutorizacao = async () => {
    if (!selectedConvenio || !descricao.trim()) {
      toast.error('Preencha convênio e descrição do procedimento');
      return;
    }

    setSubmitting(true);
    try {
      const { data: auth, error } = await supabase
        .from('autorizacoes_convenio')
        .insert({
          paciente_id: pacienteId,
          convenio_id: selectedConvenio,
          tipo_servico: tipoServico,
          descricao: descricao.trim(),
          status: 'pendente',
          data_solicitacao: new Date().toISOString(),
          observacoes: datosCarencia,
        })
        .select()
        .single();

      if (error) throw error;

      // Reload data
      await loadData();
      setShowNewAuth(false);
      setDescricao(procedimento);
      setDadosCarencia('');
      toast.success('Solicitação de autorização enviada ao convênio!');
    } catch (e: any) {
      toast.error('Erro ao solicitar autorização: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'autorizada':
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" /> Autorizada</Badge>;
      case 'negada':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Negada</Badge>;
      case 'expirada':
        return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" /> Expirada</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const selectedConvenioData = convenios.find(c => c.id === selectedConvenio);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Autorização Convênio
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Patient info */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <p className="text-sm font-medium">{pacienteNome}</p>
            <p className="text-xs text-muted-foreground">
              Paciente
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : autorizacoes.length === 0 && !showNewAuth ? (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium text-sm">Nenhuma autorização solicitada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Clique em "Solicitar Autorização" para verificar cobertura
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Lista de autorizações */}
              {autorizacoes.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Autorizações Anteriores</Label>
                  {autorizacoes.map((auth) => (
                    <div key={auth.id} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{auth.convenios?.nome}</p>
                          <p className="text-xs text-muted-foreground">{auth.descricao}</p>
                        </div>
                        {getStatusBadge(auth.status)}
                      </div>

                      {auth.numero_autorizacao && (
                        <p className="text-xs font-mono bg-muted/50 p-1.5 rounded">
                          Nº: {auth.numero_autorizacao}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {auth.data_solicitacao && (
                          <span>Solicitado: {format(new Date(auth.data_solicitacao), 'dd/MM/yyyy')}</span>
                        )}
                        {auth.data_autorizacao && (
                          <span>Autorizado: {format(new Date(auth.data_autorizacao), 'dd/MM/yyyy')}</span>
                        )}
                        {auth.data_expiracao && auth.status === 'autorizada' && (
                          <span>Vence: {format(new Date(auth.data_expiracao), 'dd/MM/yyyy')}</span>
                        )}
                      </div>

                      {auth.observacoes && (
                        <p className="text-xs italic text-muted-foreground">💬 {auth.observacoes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Form nova autorização */}
              {showNewAuth && (
                <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <Label className="text-xs font-semibold">Nova Solicitação</Label>

                  <div className="space-y-2">
                    <Label htmlFor="convenio" className="text-xs">Convênio</Label>
                    <Select value={selectedConvenio} onValueChange={setSelectedConvenio}>
                      <SelectTrigger id="convenio">
                        <SelectValue />
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
                    <div className="p-2 rounded bg-muted/50 text-xs space-y-1">
                      {selectedConvenioData.dias_carencia > 0 && (
                        <p>📅 Período de carência: {selectedConvenioData.dias_carencia} dias</p>
                      )}
                      {selectedConvenioData.telefone_suporte && (
                        <p>📞 Suporte: {selectedConvenioData.telefone_suporte}</p>
                      )}
                      {selectedConvenioData.email_suporte && (
                        <p>✉️ Email: {selectedConvenioData.email_suporte}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="descricao" className="text-xs">Descrição do Procedimento</Label>
                    <Textarea
                      id="descricao"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex: Consulta de Clínica Geral, Ressonância Magnética, Cirurgia..."
                      className="h-20 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dados-carencia" className="text-xs">Observações (dados de carência, etc)</Label>
                    <Textarea
                      id="dados-carencia"
                      value={datosCarencia}
                      onChange={(e) => setDadosCarencia(e.target.value)}
                      placeholder="Informações adicionais para análise..."
                      className="h-16 resize-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      A solicitação será enviada ao convênio. Você receberá a resposta de autorização em breve.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!showNewAuth && (
            <Button
              onClick={() => setShowNewAuth(true)}
              disabled={submitting || loading}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Solicitar Autorização
            </Button>
          )}
          {showNewAuth && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowNewAuth(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSolicitarAutorizacao}
                disabled={submitting}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                Enviar Solicitação
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}