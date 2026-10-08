import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Clock, Phone, Calendar, CheckCircle, XCircle , AlertTriangle, Users, Bell} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LoadingButton } from '@/components/ui/loading-button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, differenceInCalendarDays } from 'date-fns';
import { useMedicos } from '@/hooks/useSupabaseData';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { ErrorState } from '@/components/ErrorState';

const STATUS_COLORS: Record<string, string> = {
  aguardando: 'bg-warning/10 text-warning',
  notificado: 'bg-info/10 text-info',
  confirmado: 'bg-success/10 text-success',
  agendado: 'bg-primary/10 text-primary',
  desistiu: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  aguardando: 'Aguardando',
  notificado: 'Notificado',
  confirmado: 'Confirmado',
  agendado: 'Agendado',
  desistiu: 'Desistiu',
};

const PRIORIDADE_COLORS: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  preferencial: 'bg-info/10 text-info',
  urgente: 'bg-destructive/10 text-destructive',
};

const ESPECIALIDADES = [
  'Clínico Geral',
  'Cardiologia',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Ginecologia',
  'Neurologia',
  'Oftalmologia',
  'Ortopedia',
  'Pediatria',
  'Psiquiatria',
  'Urologia',
];

interface FormData {
  paciente_id: string;
  medico_id: string;
  especialidade: string;
  prioridade: string;
  motivo: string;
  preferencia_horario: string;
  observacoes: string;
}

const initialFormData: FormData = {
  paciente_id: '',
  medico_id: '',
  especialidade: '',
  prioridade: 'normal',
  motivo: '',
  preferencia_horario: '',
  observacoes: '',
};

export default function ListaEspera() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('aguardando');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [desistindo, setDesistindo] = useState<{ id: string; nome: string; status: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { user, profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const medicosQuery = useMedicos();
  const { data: medicos = [], isLoading: loadingMedicos } = medicosQuery;

  const listaQuery = useQuery({
    queryKey: ['lista_espera', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lista_espera')
        .select('*, pacientes(nome, nome_social, cpf, telefone, email), medicos(crm, especialidade)')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('data_cadastro', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const lista = listaQuery.data ?? [];

  const isLoading = listaQuery.isLoading || loadingMedicos;

  const filteredLista = useMemo(() => {
    return lista.filter(item => {
      const paciente = (item as any).pacientes;
      const matchesSearch = pacienteCorresponde(paciente || {}, searchTerm);
      const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [lista, searchTerm, statusFilter]);

  const handleOpenNew = () => {
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.paciente_id || !formData.especialidade) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }

    setIsSubmitting(true);
    try {
      let duplicadoQuery = supabase.from('lista_espera')
        .select('id, status')
        .eq('clinica_id', profile.clinica_id)
        .eq('paciente_id', formData.paciente_id)
        .eq('especialidade', formData.especialidade)
        .in('status', ['aguardando', 'notificado', 'confirmado']);
      duplicadoQuery = formData.medico_id
        ? duplicadoQuery.eq('medico_id', formData.medico_id)
        : duplicadoQuery.is('medico_id', null);
      const { data: existente, error: erroDuplicado } = await duplicadoQuery.limit(1).maybeSingle();
      if (erroDuplicado) throw erroDuplicado;
      if (existente) {
        toast.error('Este pedido já está na lista de espera.', {
          description: `Encontre a inscrição existente no filtro “Todos” (status: ${STATUS_LABELS[existente.status] || existente.status}).`,
        });
        return;
      }

      const { error } = await supabase.from('lista_espera').insert({
        paciente_id: formData.paciente_id,
        medico_id: formData.medico_id || null,
        especialidade: formData.especialidade,
        prioridade: formData.prioridade,
        motivo: formData.motivo || null,
        preferencia_horario: formData.preferencia_horario || null,
        observacoes: formData.observacoes || null,
        status: 'aguardando',
        data_cadastro: todaySaoPauloDateOnly(),
        clinica_id: profile.clinica_id,
      });

      if (error) throw error;
      
      toast.success('Paciente adicionado à lista de espera!');
      queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
      setIsDialogOpen(false);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao adicionar:', error);
      if (error?.code === '23505' && (
        error?.constraint === 'lista_espera_pedido_ativo_unico' ||
        String(error?.message || '').includes('já está na lista de espera')
      )) {
        void queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
        toast.error('Este pedido já está na lista de espera.', {
          description: 'Outro usuário adicionou o mesmo pedido agora. A lista será atualizada para você localizá-lo.',
        });
      } else {
        toast.error(error.message || 'Erro ao adicionar à lista');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, expectedStatus: string, newStatus: string) => {
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }
    if (updatingId) return;
    const transicoesPermitidas: Record<string, string[]> = {
      aguardando: ['notificado', 'desistiu'],
      notificado: ['confirmado', 'desistiu'],
      confirmado: ['desistiu'],
    };
    if (!transicoesPermitidas[expectedStatus]?.includes(newStatus)) {
      toast.error('Esta mudança de status não é permitida. Atualize a lista e tente novamente.');
      return;
    }
    setUpdatingId(id);
    try {
      const { data: atualizado, error } = await supabase
        .from('lista_espera')
        .update({ status: newStatus })
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .eq('status', expectedStatus)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!atualizado) throw new Error('O status foi alterado por outro fluxo. Atualize a lista antes de tentar novamente.');
      
      toast.success('Status atualizado!');
      queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao atualizar:', error);
      toast.error(error.message || 'Erro ao atualizar status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (isRemoving) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }
    setIsRemoving(true);
    try {
      const { data: removido, error } = await supabase
        .from('lista_espera')
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!removido) throw new Error('Este registro não existe mais ou você não tem permissão para removê-lo.');
      
      toast.success('Removido da lista de espera!');
      queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
      setRemoveId(null);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao remover:', error);
      toast.error(error.message || 'Erro ao remover');
    } finally {
      setIsRemoving(false);
    }
  };

  const getPacienteInfo = (item: any) => {
    const paciente = item.pacientes;
    return {
      nome: paciente?.nome_social || paciente?.nome || 'Desconhecido',
      telefone: paciente?.telefone || '-',
    };
  };

  const getDiasEspera = (dataCadastro: string | null) => {
    if (!dataCadastro) return 0;
    const data = parseDateOnly(dataCadastro);
    return data ? Math.max(0, differenceInCalendarDays(parseDateOnly(todaySaoPauloDateOnly())!, data)) : 0;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (listaQuery.isError) {
    return <ErrorState title="Não foi possível carregar a lista de espera" error={listaQuery.error} onRetry={() => void listaQuery.refetch()} />;
  }
  if (medicosQuery.isError) {
    return <ErrorState title="Não foi possível carregar os médicos para a lista de espera" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Lista de Espera</h1>
          <p className="text-muted-foreground">Gerencie pacientes aguardando agendamento</p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar à Lista
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              <div>
                <p className="text-2xl font-bold">{lista.filter(i => i.status === 'aguardando').length}</p>
                <p className="text-sm text-muted-foreground">Aguardando</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-info" />
              <div>
                <p className="text-2xl font-bold">{lista.filter(i => i.status === 'notificado').length}</p>
                <p className="text-sm text-muted-foreground">Notificados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-2xl font-bold">{lista.filter(i => i.status === 'agendado').length}</p>
                <p className="text-sm text-muted-foreground">Agendados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{lista.length}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle>Pacientes na Lista ({filteredLista.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome, CPF, telefone ou e-mail..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Especialidade</TableHead>
                  <TableHead className="hidden sm:table-cell">Dias Espera</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLista.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{lista.length === 0 ? 'Nenhum paciente na lista de espera' : 'Nenhum paciente corresponde à busca e ao status selecionado'}</p>
                      {lista.length > 0 && (
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => { setSearchTerm(''); setStatusFilter('todos'); }}>
                          Limpar filtros
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLista.map((item) => {
                    const { nome, telefone } = getPacienteInfo(item);
                    const diasEspera = getDiasEspera(item.data_cadastro);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{nome}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {telefone}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{item.especialidade || '-'}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className={cn(
                            diasEspera > 30 ? 'text-destructive font-medium' :
                            diasEspera > 14 ? 'text-warning' : ''
                          )}>
                            {diasEspera} dias
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(PRIORIDADE_COLORS[item.prioridade || 'normal'])}>
                            {item.prioridade || 'Normal'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(STATUS_COLORS[item.status || 'aguardando'])}>
                            {STATUS_LABELS[item.status || 'aguardando']}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {item.status === 'aguardando' && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                title="Altera o status; não envia mensagem ao paciente."
                                onClick={() => handleUpdateStatus(item.id, item.status || 'aguardando', 'notificado')}
                                disabled={updatingId !== null}
                              >
                                {updatingId === item.id ? 'Salvando...' : 'Marcar notificado'}
                              </Button>
                            )}
                            {item.status === 'notificado' && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleUpdateStatus(item.id, item.status || 'aguardando', 'confirmado')}
                                disabled={updatingId !== null}
                              >
                                {updatingId === item.id ? 'Salvando...' : 'Confirmar'}
                              </Button>
                            )}
                            {item.status === 'confirmado' && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => navigate(`/agenda?espera=${encodeURIComponent(item.id)}&paciente=${encodeURIComponent(item.paciente_id)}`)}
                                disabled={updatingId !== null}
                                title="Abre a agenda para criar a consulta; o status só muda após salvar."
                              >
                                Agendar consulta
                              </Button>
                            )}
                            {['aguardando', 'notificado', 'confirmado'].includes(item.status || '') && (
                              <Button
                                aria-label={`Marcar ${nome} como desistente`}
                                title={`Marcar ${nome} como desistente`}
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 shrink-0 text-muted-foreground"
                                onClick={() => setDesistindo({ id: item.id, nome, status: item.status || 'aguardando' })}
                                disabled={isRemoving || updatingId !== null}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              aria-label={`Remover ${nome} permanentemente da lista de espera`}
                              title={`Remover ${nome} permanentemente`}
                              variant="ghost" 
                              size="icon"
                              className="h-11 w-11 shrink-0"
                              onClick={() => setRemoveId(item.id)}
                              disabled={isRemoving || updatingId !== null}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
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

      {/* New Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (open || !isSubmitting) setIsDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar à Lista de Espera</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <PacienteCombobox
                value={formData.paciente_id || null}
                onChange={(id) => setFormData((form) => ({ ...form, paciente_id: id }))}
                placeholder="Buscar paciente por nome, CPF ou telefone..."
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Especialidade *</Label>
              <Select
                value={formData.especialidade}
                onValueChange={(v) => setFormData({ ...formData, especialidade: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a especialidade" />
                </SelectTrigger>
                <SelectContent>
                  {ESPECIALIDADES.map((esp) => (
                    <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Médico Preferencial</Label>
              <Select
                value={formData.medico_id || '__any__'}
                onValueChange={(v) => setFormData({ ...formData, medico_id: v === '__any__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer médico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Qualquer médico</SelectItem>
                  {medicos.filter((m) => m.ativo).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome || m.crm} - {m.especialidade || 'Clínico'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select
                  value={formData.prioridade}
                  onValueChange={(v) => setFormData({ ...formData, prioridade: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="preferencial">Preferencial</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferência de Horário</Label>
                <Select
                  value={formData.preferencia_horario || '__any__'}
                  onValueChange={(v) => setFormData({ ...formData, preferencia_horario: v === '__any__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qualquer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer horário</SelectItem>
                    <SelectItem value="manha">Manhã</SelectItem>
                    <SelectItem value="tarde">Tarde</SelectItem>
                    <SelectItem value="noite">Noite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                value={formData.motivo}
                onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Motivo da consulta..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <LoadingButton onClick={handleSave} isLoading={isSubmitting} loadingText="Salvando...">
              Adicionar
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preserve the request in history when the patient declines. */}
      <AlertDialog open={!!desistindo} onOpenChange={(open) => !open && !updatingId && setDesistindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar desistência?</AlertDialogTitle>
            <AlertDialogDescription>
              {desistindo?.nome} será marcado como desistente e permanecerá no histórico. O pedido deixará de contar como ativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingId !== null}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!desistindo || updatingId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (!desistindo) return;
                const pendente = desistindo;
                setDesistindo(null);
                void handleUpdateStatus(pendente.id, pendente.status, 'desistiu');
              }}
            >
              Confirmar desistência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm remove dialog */}
      <AlertDialog open={!!removeId} onOpenChange={(open) => !open && !isRemoving && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista de espera?</AlertDialogTitle>
            <AlertDialogDescription>
              O item será removido permanentemente da lista de espera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                if (removeId) void handleRemove(removeId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
