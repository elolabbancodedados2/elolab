import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { 
  ArrowRightLeft, 
  Plus, 
  Eye, 
  Printer, 
  Send,
  FileCheck,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Cid10Search } from './Cid10Search';
import { parseDateOnly, todayDateOnly } from '@/lib/dateOnly';

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
  medicoOrigemId: string;
  encaminhamentos: Encaminhamento[];
  onEncaminhamentoCriado: () => void;
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
  medicoOrigemId,
  encaminhamentos,
  onEncaminhamentoCriado,
}: EncaminhamentoMedicoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isContraReferenciaOpen, setIsContraReferenciaOpen] = useState(false);
  const [selectedEncaminhamento, setSelectedEncaminhamento] = useState<Encaminhamento | null>(null);
  const [medicos, setMedicos] = useState<Medico[]>([]);
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
  const [contraReferencia, setContraReferencia] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadMedicos();
  }, []);

  const loadMedicos = async () => {
    const { data } = await supabase
      .from('medicos')
      .select('id, crm, especialidade')
      .eq('ativo', true);
    
    if (data) setMedicos(data);
  };

  const handleCreate = async () => {
    if (!formData.especialidade_destino || !formData.motivo) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a especialidade e o motivo do encaminhamento.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('encaminhamentos')
        .insert({
          paciente_id: pacienteId,
          prontuario_id: prontuarioId || null,
          medico_origem_id: medicoOrigemId,
          medico_destino_id: formData.medico_destino_id || null,
          especialidade_destino: formData.especialidade_destino,
          tipo: formData.tipo,
          urgencia: formData.urgencia,
          motivo: formData.motivo,
          hipotese_diagnostica: formData.hipotese_diagnostica || null,
          cid_principal: formData.cid_principal || null,
          exames_realizados: formData.exames_realizados || null,
          tratamento_atual: formData.tratamento_atual || null,
          informacoes_adicionais: formData.informacoes_adicionais || null,
          status: 'pendente',
          data_encaminhamento: todayDateOnly(),
        });

      if (error) throw error;

      toast({
        title: 'Encaminhamento criado',
        description: 'O encaminhamento foi registrado com sucesso.',
      });

      setIsOpen(false);
      resetForm();
      onEncaminhamentoCriado();
    } catch (error) {
      console.error('Erro ao criar encaminhamento:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar o encaminhamento.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddContraReferencia = async () => {
    if (!selectedEncaminhamento || !contraReferencia.trim()) {
      toast({
        title: 'Atenção',
        description: 'Preencha a contra-referência.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('encaminhamentos')
        .update({
          contra_referencia: contraReferencia,
          data_contra_referencia: todayDateOnly(),
          status: 'concluido',
          data_atendimento: todayDateOnly(),
        })
        .eq('id', selectedEncaminhamento.id);

      if (error) throw error;

      toast({
        title: 'Contra-referência registrada',
        description: 'O encaminhamento foi atualizado.',
      });

      setIsContraReferenciaOpen(false);
      setContraReferencia('');
      setSelectedEncaminhamento(null);
      onEncaminhamentoCriado();
    } catch (error) {
      console.error('Erro ao registrar contra-referência:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a contra-referência.',
        variant: 'destructive',
      });
    } finally {
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

  const referenciasEnviadas = encaminhamentos.filter(e => e.tipo === 'referencia');
  const referenciasRecebidas = encaminhamentos.filter(e => e.tipo === 'contra_referencia');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Encaminhamentos</CardTitle>
              {encaminhamentos.length > 0 && (
                <Badge variant="secondary">{encaminhamentos.length}</Badge>
              )}
            </div>
            <Button onClick={() => setIsOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Encaminhamento
            </Button>
          </div>
          <CardDescription>
            Referências e contra-referências para especialistas
          </CardDescription>
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
                            onClick={() => {
                              setSelectedEncaminhamento(enc);
                              setIsViewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {enc.status !== 'concluido' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedEncaminhamento(enc);
                                setIsContraReferenciaOpen(true);
                              }}
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
                    <div key={enc.id} className="border rounded-lg p-4">
                      {/* Similar structure for received referrals */}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog de Novo Encaminhamento */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Encaminhamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Especialidade *</Label>
                <Select
                  value={formData.especialidade_destino}
                  onValueChange={(v) => setFormData({ ...formData, especialidade_destino: v })}
                >
                  <SelectTrigger>
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
                <Label>Urgência</Label>
                <Select
                  value={formData.urgencia}
                  onValueChange={(v) => setFormData({ ...formData, urgencia: v })}
                >
                  <SelectTrigger>
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
              <Label>Médico de Destino (opcional)</Label>
              <Select
                value={formData.medico_destino_id}
                onValueChange={(v) => setFormData({ ...formData, medico_destino_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer médico da especialidade" />
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
              <Label>Motivo do Encaminhamento *</Label>
              <Textarea
                value={formData.motivo}
                onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Descreva o motivo do encaminhamento..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Hipótese Diagnóstica / CID</Label>
              <Cid10Search
                value={formData.cid_principal}
                onChange={(v) => setFormData({ ...formData, cid_principal: v, hipotese_diagnostica: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Exames Realizados</Label>
              <Textarea
                value={formData.exames_realizados}
                onChange={(e) => setFormData({ ...formData, exames_realizados: e.target.value })}
                placeholder="Liste os exames já realizados..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Tratamento Atual</Label>
              <Textarea
                value={formData.tratamento_atual}
                onChange={(e) => setFormData({ ...formData, tratamento_atual: e.target.value })}
                placeholder="Descreva o tratamento em andamento..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Informações Adicionais</Label>
              <Textarea
                value={formData.informacoes_adicionais}
                onChange={(e) => setFormData({ ...formData, informacoes_adicionais: e.target.value })}
                placeholder="Outras informações relevantes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Criando...' : 'Criar Encaminhamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Visualização */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Encaminhamento</DialogTitle>
          </DialogHeader>

          {selectedEncaminhamento && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Especialidade</Label>
                  <p className="font-medium">{selectedEncaminhamento.especialidade_destino}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedEncaminhamento.status)}</div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Motivo</Label>
                <p>{selectedEncaminhamento.motivo}</p>
              </div>

              {selectedEncaminhamento.hipotese_diagnostica && (
                <div>
                  <Label className="text-muted-foreground">Hipótese Diagnóstica</Label>
                  <p>{selectedEncaminhamento.hipotese_diagnostica}</p>
                </div>
              )}

              {selectedEncaminhamento.exames_realizados && (
                <div>
                  <Label className="text-muted-foreground">Exames Realizados</Label>
                  <p>{selectedEncaminhamento.exames_realizados}</p>
                </div>
              )}

              {selectedEncaminhamento.tratamento_atual && (
                <div>
                  <Label className="text-muted-foreground">Tratamento Atual</Label>
                  <p>{selectedEncaminhamento.tratamento_atual}</p>
                </div>
              )}

              {selectedEncaminhamento.contra_referencia && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <Label className="text-muted-foreground">Contra-referência</Label>
                  <p className="mt-1">{selectedEncaminhamento.contra_referencia}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Contra-Referência */}
      <Dialog open={isContraReferenciaOpen} onOpenChange={setIsContraReferenciaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Contra-Referência</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={contraReferencia}
              onChange={(e) => setContraReferencia(e.target.value)}
              placeholder="Descreva o resultado do atendimento, diagnóstico, tratamento realizado e recomendações..."
              rows={6}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContraReferenciaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddContraReferencia} disabled={loading}>
              {loading ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
