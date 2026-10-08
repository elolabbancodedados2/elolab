import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Bot, Plus, Settings, Trash2, RefreshCw } from 'lucide-react';
import { WhatsAppAgent, NewAgentForm, defaultAgentForm } from './types';

interface AgentsTabProps {
  agents: WhatsAppAgent[];
  isLoading: boolean;
  onCreateAgent: (agent: NewAgentForm) => Promise<unknown>;
  onUpdateAgent: (agent: Partial<WhatsAppAgent> & { id: string }) => void;
  onDeleteAgent: (id: string) => void;
  isCreating: boolean;
}

export function AgentsTab({
  agents,
  isLoading,
  onCreateAgent,
  onUpdateAgent,
  onDeleteAgent,
  isCreating,
}: AgentsTabProps) {
  const [selectedAgent, setSelectedAgent] = useState<WhatsAppAgent | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [newAgentForm, setNewAgentForm] = useState<NewAgentForm>(defaultAgentForm);

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'geral':
        return <Badge variant="outline">Atendimento Geral</Badge>;
      case 'agendamento':
        return <Badge variant="secondary">Agendamento</Badge>;
      case 'triagem':
        return <Badge>Triagem</Badge>;
      default:
        return <Badge variant="outline">{tipo}</Badge>;
    }
  };

  const handleCreate = async () => {
    try {
      await onCreateAgent(newAgentForm);
      setNewAgentForm(defaultAgentForm);
      setIsCreatingAgent(false);
    } catch {
      // Mantém o formulário preenchido para corrigir ou tentar novamente.
    }
  };

  const handleUpdate = () => {
    if (!selectedAgent) return;
    onUpdateAgent(selectedAgent);
  };

  const handleDelete = () => {
    if (!selectedAgent) return;
    if (confirm('Deseja realmente excluir este agente?')) {
      onDeleteAgent(selectedAgent.id);
      setSelectedAgent(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Agentes de IA</h2>
        <Button onClick={() => setIsCreatingAgent(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      {/* Agent performance summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de Agentes', value: agents.length, accent: 'text-primary bg-primary/10' },
          { label: 'Ativos', value: agents.filter(a => a.ativo).length, accent: 'text-green-600 bg-green-500/10' },
          { label: 'Inativos', value: agents.filter(a => !a.ativo).length, accent: 'text-amber-600 bg-amber-500/10' },
          { label: 'Tipos', value: new Set(agents.map(a => a.tipo)).size, accent: 'text-blue-600 bg-blue-500/10' },
        ].map(s => (
          <Card key={s.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.accent}`}>
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Agentes */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8">Carregando agentes...</div>
          ) : agents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum agente criado</p>
              </CardContent>
            </Card>
          ) : (
              agents.map((agent) => (
              <Card
                key={agent.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedAgent?.id === agent.id ? 'border-primary ring-1 ring-primary/20' : ''
                }`}
                onClick={() => {
                  setSelectedAgent(agent);
                  setIsCreatingAgent(false);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${agent.ativo ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                        <h3 className="font-medium">{agent.nome}</h3>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {getTipoBadge(agent.tipo)}
                        <Badge variant="outline" className="text-[10px]">
                          {agent.humor === 'profissional' ? '🏢 Formal' : agent.humor === 'amigavel' ? '😊 Amigável' : '🎯 Objetivo'}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        🕐 {agent.horario_atendimento_inicio} - {agent.horario_atendimento_fim}
                        {agent.atende_fora_horario && ' • 24h'}
                      </p>
                    </div>
                    <Settings className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Editor de Agente */}
        <div className="lg:col-span-2">
          {isCreatingAgent ? (
            <Card>
              <CardHeader>
                <CardTitle>Criar Novo Agente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome do Agente</Label>
                    <Input
                      value={newAgentForm.nome}
                      onChange={(e) => setNewAgentForm({ ...newAgentForm, nome: e.target.value })}
                      placeholder="Ex: Assistente da Clínica"
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={newAgentForm.tipo}
                      onValueChange={(value) => setNewAgentForm({ ...newAgentForm, tipo: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geral">Atendimento Geral</SelectItem>
                        <SelectItem value="agendamento">Agendamento</SelectItem>
                        <SelectItem value="triagem">Triagem Inicial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Humor / Tom</Label>
                  <Select
                    value={newAgentForm.humor}
                    onValueChange={(value) => setNewAgentForm({ ...newAgentForm, humor: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profissional">Formal / Profissional</SelectItem>
                      <SelectItem value="amigavel">Amigável / Acolhedor</SelectItem>
                      <SelectItem value="objetivo">Objetivo / Direto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Instruções Personalizadas</Label>
                  <Textarea
                    value={newAgentForm.instrucoes_personalizadas}
                    onChange={(e) => setNewAgentForm({ ...newAgentForm, instrucoes_personalizadas: e.target.value })}
                    placeholder="Instruções adicionais para o agente..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Mensagem de Boas-vindas</Label>
                  <Textarea
                    value={newAgentForm.mensagem_boas_vindas}
                    onChange={(e) => setNewAgentForm({ ...newAgentForm, mensagem_boas_vindas: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Horário Início</Label>
                    <Input
                      type="time"
                      value={newAgentForm.horario_atendimento_inicio}
                      onChange={(e) => setNewAgentForm({ ...newAgentForm, horario_atendimento_inicio: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Horário Fim</Label>
                    <Input
                      type="time"
                      value={newAgentForm.horario_atendimento_fim}
                      onChange={(e) => setNewAgentForm({ ...newAgentForm, horario_atendimento_fim: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newAgentForm.atende_fora_horario}
                    onCheckedChange={(checked) => setNewAgentForm({ ...newAgentForm, atende_fora_horario: checked })}
                  />
                  <Label>Atender fora do horário</Label>
                </div>

                <div>
                  <Label>Temperatura da IA: {newAgentForm.temperatura}</Label>
                  <Slider
                    value={[newAgentForm.temperatura]}
                    onValueChange={([value]) => setNewAgentForm({ ...newAgentForm, temperatura: value })}
                    min={0}
                    max={1}
                    step={0.1}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Valores mais baixos = respostas mais precisas. Valores mais altos = respostas mais criativas.
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    className="flex-1"
                    onClick={handleCreate}
                    disabled={!newAgentForm.nome || isCreating}
                  >
                    {isCreating && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                    Criar Agente
                  </Button>
                  <Button variant="outline" onClick={() => setIsCreatingAgent(false)}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : selectedAgent ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Editar: {selectedAgent.nome}</CardTitle>
                  <div className="flex gap-2 items-center">
                    <Switch
                      checked={selectedAgent.ativo}
                      onCheckedChange={(checked) => {
                        onUpdateAgent({ id: selectedAgent.id, ativo: checked });
                        setSelectedAgent({ ...selectedAgent, ativo: checked });
                      }}
                    />
                    <Label>Ativo</Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome do Agente</Label>
                    <Input
                      value={selectedAgent.nome}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, nome: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={selectedAgent.tipo}
                      onValueChange={(value) => setSelectedAgent({ ...selectedAgent, tipo: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geral">Atendimento Geral</SelectItem>
                        <SelectItem value="agendamento">Agendamento</SelectItem>
                        <SelectItem value="triagem">Triagem Inicial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Humor / Tom</Label>
                  <Select
                    value={selectedAgent.humor}
                    onValueChange={(value) => setSelectedAgent({ ...selectedAgent, humor: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profissional">Formal / Profissional</SelectItem>
                      <SelectItem value="amigavel">Amigável / Acolhedor</SelectItem>
                      <SelectItem value="objetivo">Objetivo / Direto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Instruções Personalizadas</Label>
                  <Textarea
                    value={selectedAgent.instrucoes_personalizadas || ''}
                    onChange={(e) => setSelectedAgent({ ...selectedAgent, instrucoes_personalizadas: e.target.value })}
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Mensagem de Boas-vindas</Label>
                  <Textarea
                    value={selectedAgent.mensagem_boas_vindas}
                    onChange={(e) => setSelectedAgent({ ...selectedAgent, mensagem_boas_vindas: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Horário Início</Label>
                    <Input
                      type="time"
                      value={selectedAgent.horario_atendimento_inicio}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, horario_atendimento_inicio: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Horário Fim</Label>
                    <Input
                      type="time"
                      value={selectedAgent.horario_atendimento_fim}
                      onChange={(e) => setSelectedAgent({ ...selectedAgent, horario_atendimento_fim: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={selectedAgent.atende_fora_horario}
                    onCheckedChange={(checked) => setSelectedAgent({ ...selectedAgent, atende_fora_horario: checked })}
                  />
                  <Label>Atender fora do horário</Label>
                </div>

                <div>
                  <Label>Temperatura da IA: {selectedAgent.temperatura}</Label>
                  <Slider
                    value={[selectedAgent.temperatura]}
                    onValueChange={([value]) => setSelectedAgent({ ...selectedAgent, temperatura: value })}
                    min={0}
                    max={1}
                    step={0.1}
                    className="mt-2"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={handleUpdate}>
                    Salvar Alterações
                  </Button>
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Selecione um agente para editar ou crie um novo
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
