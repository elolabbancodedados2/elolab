import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useEffect, useRef } from 'react';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';

import { 
  ArrowRightLeft, 
  Plus, 
  Eye, 
  Send,
  FileCheck,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { mensagemDeErro } from '@/lib/erros';
import { Cid10Search } from './Cid10Search';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

interface Encaminhamento {
  id: string;
  paciente_id: string;
  prontuario_id: string | null;
  medico_origem_id: string;
  medico_destino_id: string | null;
  especialidade_destino: string;
  tipo: string | null;
  urgencia: string | null;
  motivo: string;
  hipotese_diagnostica: string | null;
  cid_principal: string | null;
  exames_realizados: string | null;
  tratamento_atual: string | null;
  informacoes_adicionais: string | null;
  status: string | null;
  data_encaminhamento: string | null;
  data_atendimento: string | null;
  contra_referencia: string | null;
  data_contra_referencia: string | null;
  created_at: string | null;
}

interface Medico {
  id: string;
  crm: string;
  especialidade: string | null;
}

interface EncaminhamentoMedicoProps {
  pacienteId: string;
  pacienteNome: string;
  prontuarioId?: string;
  /** Consulta em que o encaminhamento foi feito. */
  agendamentoId?: string | null;
  medicoOrigemId: string;
  encaminhamentos: Encaminhamento[];
  onEncaminhamentoCriado: () => void;
  creationPage?: boolean;
  onNew: () => void;
  onView: (id: string) => void;
  onBack: () => void;
}

const ESPECIALIDADES = [
  'Cardiologia',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Ginecologia',
  'Neurologia',
  'Oftalmologia',
  'Ortopedia',
  'Otorrinolaringologia',
  'Pediatria',
  'Pneumologia',
  'Psiquiatria',
  'Reumatologia',
  'Urologia',
  'Cirurgia Geral',
  'Outras',
];

const URGENCIAS = [
  { value: 'eletivo', label: 'Eletivo', color: 'bg-blue-100 text-blue-800' },
  { value: 'normal', label: 'Normal', color: 'bg-green-100 text-green-800' },
  { value: 'urgente', label: 'Urgente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'emergencia', label: 'Emergência', color: 'bg-red-100 text-red-800' },
];

export function EncaminhamentoMedico({
  pacienteId,
  pacienteNome,
  prontuarioId,
  agendamentoId,
  medicoOrigemId,
  encaminhamentos,
  onEncaminhamentoCriado,
  creationPage = false, onNew, onView, onBack,
}: EncaminhamentoMedicoProps) {
  const completed = useRef(false);
  const saveLock = useRef(false);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [isLoadingMedicos, setIsLoadingMedicos] = useState(false);
  const [medicosError, setMedicosError] = useState<unknown>(null);
  const medicoOrigemAtivo = medicos.some(medico => medico.id === medicoOrigemId);
  const [medicosReloadKey, setMedicosReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    especialidade_destino: '',
    medico_destino_id: '',
    tipo: 'referencia',
    urgencia: 'normal',
    motivo: '',
    hipotese_diagnostica: '',
    cid_principal: '',
    exames_realizados: '',
    tratamento_atual: '',
    informacoes_adicionais: '',
  });
  const baseline = useRef(formData);
  const dirty = JSON.stringify(formData) !== JSON.stringify(baseline.current);
  const { toast } = useToast();
  const { profile } = useSupabaseAuth();

  useEffect(() => {
    let active = true;
    setFormData(current => ({ ...current, medico_destino_id: '' }));
    const loadMedicos = async () => {
      if (!profile?.clinica_id) {
        setMedicos([]);
        setMedicosError(new Error('Clínica não identificada.'));
        setIsLoadingMedicos(false);
        return;
      }

      setIsLoadingMedicos(true);
      setMedicosError(null);
      const { data, error } = await supabase
        .from('medicos')
        .select('id, crm, especialidade')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true)
        .order('crm');

      if (!active) return;
      if (error) {
        setMedicosError(error);
        setMedicos([]);
      } else {
        setMedicos(data || []);
      }
      setIsLoadingMedicos(false);
    };

    void loadMedicos();
    return () => { active = false; };
  }, [profile?.clinica_id, medicosReloadKey]);

  const handleCreate = async () => {
    if (saveLock.current) return;
    if (!formData.especialidade_destino || !formData.motivo.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a especialidade e o motivo do encaminhamento.',
        variant: 'destructive',
      });
      return;
    }
    if (!profile?.clinica_id) {
      toast({ title: 'Clínica não identificada', description: 'Atualize a página e tente novamente.', variant: 'destructive' });
      return;
    }
    if (!medicoOrigemId) {
      toast({ title: 'Médico de origem não identificado', description: 'Vincule seu usuário a um médico antes de criar encaminhamentos.', variant: 'destructive' });
      return;
    }
    if (!medicos.some(medico => medico.id === medicoOrigemId)) {
      toast({
        title: 'Médico de origem indisponível',
        description: 'O profissional precisa estar ativo nesta clínica para emitir encaminhamentos.',
        variant: 'destructive',
      });
      return;
    }
    if (formData.motivo.trim().length > 10000) {
      toast({ title: 'Motivo muito longo', description: 'Use no máximo 10.000 caracteres.', variant: 'destructive' });
      return;
    }

    saveLock.current = true;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('encaminhamentos')
        .insert({
          clinica_id: profile.clinica_id,
          paciente_id: pacienteId,
          prontuario_id: prontuarioId || null,
          ...(agendamentoId ? { agendamento_id: agendamentoId } : {}),
          medico_origem_id: medicoOrigemId,
          medico_destino_id: formData.medico_destino_id || null,
          especialidade_destino: formData.especialidade_destino,
          tipo: formData.tipo,
          urgencia: formData.urgencia,
          motivo: formData.motivo.trim(),
          hipotese_diagnostica: formData.hipotese_diagnostica.trim() || null,
          cid_principal: formData.cid_principal || null,
          exames_realizados: formData.exames_realizados.trim() || null,
          tratamento_atual: formData.tratamento_atual.trim() || null,
          informacoes_adicionais: formData.informacoes_adicionais.trim() || null,
          status: 'pendente',
          data_encaminhamento: todaySaoPauloDateOnly(),
        } as any);

      if (error) throw error;

      toast({
        title: 'Encaminhamento criado',
        description: 'O encaminhamento foi registrado com sucesso.',
      });

      completed.current = true;
      resetForm();
      onEncaminhamentoCriado();
    } catch (error) {
      toast({
        title: 'Erro',
        description: mensagemDeErro(error),
        variant: 'destructive',
      });
    } finally {
      saveLock.current = false;
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      especialidade_destino: '',
      medico_destino_id: '',
      tipo: 'referencia',
      urgencia: 'normal',
      motivo: '',
      hipotese_diagnostica: '',
      cid_principal: '',
      exames_realizados: '',
      tratamento_atual: '',
      informacoes_adicionais: '',
    });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'em_andamento':
        return <Badge className="bg-blue-100 text-blue-800"><Send className="h-3 w-3 mr-1" />Em Andamento</Badge>;
      case 'concluido':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Concluído</Badge>;
      case 'cancelado':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUrgenciaBadge = (urgencia: string | null) => {
    const config = URGENCIAS.find(u => u.value === urgencia) || URGENCIAS[1];
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const referenciasEnviadas = encaminhamentos.filter(e => e.medico_origem_id === medicoOrigemId);
  const referenciasRecebidas = encaminhamentos.filter(e => e.medico_destino_id === medicoOrigemId);

  return (
    <div className="space-y-4">
      {!creationPage && <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Encaminhamentos</CardTitle>
              {encaminhamentos.length > 0 && (
                <Badge variant="secondary">{encaminhamentos.length}</Badge>
              )}
            </div>
            <Button onClick={onNew} size="sm" disabled={isLoadingMedicos || (!medicosError && !medicoOrigemAtivo)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Encaminhamento
            </Button>
          </div>
          <CardDescription>
            Referências e contra-referências para especialistas
          </CardDescription>
          {!isLoadingMedicos && !medicosError && !medicoOrigemAtivo && (
            <p role="alert" className="text-xs text-warning-foreground">
              O médico de origem está inativo ou indisponível nesta clínica. Peça ao administrador para revisar o cadastro.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="enviados" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="enviados">
                Enviados ({referenciasEnviadas.length})
              </TabsTrigger>
              <TabsTrigger value="recebidos">
                Recebidos ({referenciasRecebidas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="enviados" className="mt-4">
              {referenciasEnviadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Send className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum encaminhamento enviado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referenciasEnviadas.map((enc) => (
                    <div
                      key={enc.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{enc.especialidade_destino}</p>
                            {getUrgenciaBadge(enc.urgencia)}
                            {getStatusBadge(enc.status)}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {enc.motivo}
                          </p>
                          {enc.data_encaminhamento && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Encaminhado em: {format(parseDateOnly(enc.data_encaminhamento)!, 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ver encaminhamento para ${enc.especialidade_destino}`}
                            onClick={() => onView(enc.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {enc.status !== 'concluido' && enc.status !== 'cancelado' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Registrar contra-referência para ${enc.especialidade_destino}`}
                              onClick={() => onView(enc.id)}
                            >
                              <FileCheck className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {enc.contra_referencia && (
                        <div className="mt-3 p-2 bg-green-50 rounded border border-green-200">
                          <p className="text-xs font-medium text-green-800">
                            Contra-referência ({enc.data_contra_referencia && format(parseDateOnly(enc.data_contra_referencia)!, 'dd/MM/yyyy')}):
                          </p>
                          <p className="text-sm text-green-700 mt-1">
                            {enc.contra_referencia}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recebidos" className="mt-4">
              {referenciasRecebidas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum encaminhamento recebido</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referenciasRecebidas.map((enc) => (
                    <div key={enc.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{enc.especialidade_destino}</p>
                            {getUrgenciaBadge(enc.urgencia)}
                            {getStatusBadge(enc.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">{enc.motivo}</p>
                          {enc.data_encaminhamento && (
                            <p className="text-xs text-muted-foreground">
                              Recebido em: {format(parseDateOnly(enc.data_encaminhamento)!, 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" aria-label="Ver encaminhamento recebido" onClick={() => onView(enc.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {enc.status !== 'concluido' && enc.status !== 'cancelado' && (
                            <Button variant="ghost" size="icon" aria-label="Registrar contra-referência" onClick={() => onView(enc.id)}>
                              <FileCheck className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {enc.contra_referencia && <p className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">Contra-referência: {enc.contra_referencia}</p>}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>}

      {creationPage && <section className="space-y-6">
        <UnsavedChangesGuard dirty={dirty} busy={loading} completed={completed} />
          <fieldset disabled={loading} className="min-w-0 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="encaminhamento-especialidade">Especialidade *</Label>
                <Select
                  value={formData.especialidade_destino}
                  onValueChange={(v) => setFormData({ ...formData, especialidade_destino: v, medico_destino_id: '' })}
                >
                  <SelectTrigger id="encaminhamento-especialidade">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPECIALIDADES.map((esp) => (
                      <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="encaminhamento-urgencia">Urgência</Label>
                <Select
                  value={formData.urgencia}
                  onValueChange={(v) => setFormData({ ...formData, urgencia: v })}
                >
                  <SelectTrigger id="encaminhamento-urgencia">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {URGENCIAS.map((urg) => (
                      <SelectItem key={urg.value} value={urg.value}>{urg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="encaminhamento-medico-destino">Médico de Destino (opcional)</Label>
              {medicosError && (
                <ErrorState
                  compact
                  title="Não foi possível carregar médicos"
                  error={medicosError}
                  onRetry={() => setMedicosReloadKey(key => key + 1)}
                />
              )}
              <Select
                value={formData.medico_destino_id}
                disabled={isLoadingMedicos || !!medicosError || !profile?.clinica_id}
                onValueChange={(v) => setFormData({ ...formData, medico_destino_id: v })}
              >
                <SelectTrigger id="encaminhamento-medico-destino">
                  <SelectValue placeholder={isLoadingMedicos ? 'Carregando médicos…' : 'Qualquer médico da especialidade'} />
                </SelectTrigger>
                <SelectContent>
                  {medicos
                    .filter(m => !formData.especialidade_destino || 
                      m.especialidade?.toLowerCase().includes(formData.especialidade_destino.toLowerCase()))
                    .map((med) => (
                      <SelectItem key={med.id} value={med.id}>
                        CRM {med.crm} - {med.especialidade}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="encaminhamento-motivo">Motivo do Encaminhamento *</Label>
              <Textarea
                id="encaminhamento-motivo"
                value={formData.motivo}
                onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Descreva o motivo do encaminhamento..."
                rows={3}
                maxLength={10000}
              />
              <p className="text-right text-xs text-muted-foreground">{formData.motivo.length}/10.000</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="encaminhamento-cid">Hipótese Diagnóstica / CID</Label>
              <Cid10Search
                id="encaminhamento-cid"
                value={formData.cid_principal}
                onChange={(v) => setFormData({ ...formData, cid_principal: v, hipotese_diagnostica: v })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="encaminhamento-exames">Exames Realizados</Label>
              <Textarea
                id="encaminhamento-exames"
                value={formData.exames_realizados}
                onChange={(e) => setFormData({ ...formData, exames_realizados: e.target.value })}
                placeholder="Liste os exames já realizados..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="encaminhamento-tratamento">Tratamento Atual</Label>
              <Textarea
                id="encaminhamento-tratamento"
                value={formData.tratamento_atual}
                onChange={(e) => setFormData({ ...formData, tratamento_atual: e.target.value })}
                placeholder="Descreva o tratamento em andamento..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="encaminhamento-informacoes">Informações Adicionais</Label>
              <Textarea
                id="encaminhamento-informacoes"
                value={formData.informacoes_adicionais}
                onChange={(e) => setFormData({ ...formData, informacoes_adicionais: e.target.value })}
                placeholder="Outras informações relevantes..."
                rows={2}
              />
            </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button variant="outline" onClick={onBack}>
              Voltar aos encaminhamentos
            </Button>
            <Button onClick={handleCreate} disabled={loading || isLoadingMedicos || !!medicosError || !medicoOrigemAtivo}>
              {loading ? 'Criando...' : 'Criar Encaminhamento'}
            </Button>
          </div>
      </section>}
    </div>
  );
}
