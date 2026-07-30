import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, Save, Plus, AlertCircle } from 'lucide-react';
import { LoadingButton } from '@/components/ui/loading-button';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

interface Availability {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  duracao_consulta: number;
  intervalo_consultas: number;
  ativo: boolean;
}

interface Props {
  medico_id: string;
  medico_nome: string;
}

// Helper to bypass strict typing for tables not yet in generated types
const db = supabase as any;

export function MedicoAvailabilityManager({ medico_id, medico_nome }: Props) {
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<Availability> | null>(null);

  const loadAvailability = async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from('medico_disponibilidade')
        .select('*')
        .eq('medico_id', medico_id)
        .order('dia_semana');

      if (error) throw error;
      setAvailabilities((data || []) as Availability[]);
    } catch {
      toast.error('Erro ao carregar disponibilidade');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editing?.dia_semana || !editing?.hora_inicio || !editing?.hora_fim) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      if (editing.id) {
        const { error } = await db
          .from('medico_disponibilidade')
          .update({
            hora_inicio: editing.hora_inicio,
            hora_fim: editing.hora_fim,
            duracao_consulta: editing.duracao_consulta || 30,
            intervalo_consultas: editing.intervalo_consultas || 5,
          })
          .eq('id', editing.id);

        if (error) throw error;
        toast.success('Disponibilidade atualizada');
      } else {
        const { error } = await db
          .from('medico_disponibilidade')
          .insert({
            medico_id,
            dia_semana: editing.dia_semana,
            hora_inicio: editing.hora_inicio,
            hora_fim: editing.hora_fim,
            duracao_consulta: editing.duracao_consulta || 30,
            intervalo_consultas: editing.intervalo_consultas || 5,
            ativo: true,
          });

        if (error) throw error;
        toast.success('Disponibilidade adicionada');
      }

      await loadAvailability();
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deletar este horário?')) return;

    try {
      const { error } = await db
        .from('medico_disponibilidade')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadAvailability();
      toast.success('Horário removido');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao deletar');
    }
  };

  const getDayLabel = (dayNum: number) => DAYS_OF_WEEK.find(d => d.value === dayNum)?.label || '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Horários de Disponibilidade — {medico_nome}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Dias e Horários Configurados</h4>
          {availabilities.length === 0 ? (
            <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Nenhuma disponibilidade configurada</span>
            </div>
          ) : (
            <div className="space-y-2">
              {availabilities.map(av => (
                <div key={av.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{getDayLabel(av.dia_semana)}</div>
                    <div className="text-xs text-muted-foreground">
                      {av.hora_inicio} — {av.hora_fim} ({av.duracao_consulta}min consulta + {av.intervalo_consultas}min intervalo)
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(av)}>Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(av.id)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editing && (
          <div className="p-4 bg-primary/5 rounded-lg space-y-4 border border-primary/20">
            <h4 className="font-semibold text-sm">
              {editing.id ? 'Editar Horário' : 'Adicionar Novo Horário'}
            </h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Dia da Semana</Label>
                <select
                  value={editing.dia_semana || ''}
                  onChange={(e) => setEditing({ ...editing, dia_semana: parseInt(e.target.value) })}
                  disabled={!!editing.id}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                >
                  <option value="">Selecionar dia</option>
                  {DAYS_OF_WEEK.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Horário de Início</Label>
                <input type="time" value={editing.hora_inicio || ''} onChange={(e) => setEditing({ ...editing, hora_inicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Horário de Término</Label>
                <input type="time" value={editing.hora_fim || ''} onChange={(e) => setEditing({ ...editing, hora_fim: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Duração da Consulta (min)</Label>
                <input type="number" min="15" max="120" step="15" value={editing.duracao_consulta || 30} onChange={(e) => setEditing({ ...editing, duracao_consulta: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Intervalo entre Consultas (min)</Label>
                <input type="number" min="0" max="30" step="5" value={editing.intervalo_consultas || 5} onChange={(e) => setEditing({ ...editing, intervalo_consultas: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
              <LoadingButton
                onClick={handleSave}
                disabled={loading}
                isLoading={loading}
                loadingText="Salvando..."
                className="flex-1 gap-2"
              >
                <Save className="h-4 w-4" />
                Salvar
              </LoadingButton>
            </div>
          </div>
        )}

        {!editing && (
          <Button onClick={() => setEditing({ duracao_consulta: 30, intervalo_consultas: 5 })} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Novo Horário
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
