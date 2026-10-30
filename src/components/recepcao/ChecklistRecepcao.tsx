import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { receptionReadiness, type ReceptionPatientSummary } from '@/lib/receptionReadiness';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type Field = 'recepcao_cadastro_ok' | 'recepcao_documento_ok' | 'recepcao_convenio_ok';

interface ChecklistAppointment {
  id: string;
  clinica_id?: string | null;
  recepcao_cadastro_ok?: boolean;
  recepcao_documento_ok?: boolean;
  recepcao_convenio_ok?: boolean;
  recepcao_checklist_em?: string | null;
  recepcao_checklist_por?: string | null;
}

interface Props {
  appointment: ChecklistAppointment;
  patient: ReceptionPatientSummary | null | undefined;
  clinicId: string;
  today: string;
  onEditPatient: () => void;
}

const FIELDS: Array<{ key: Field; label: string }> = [
  { key: 'recepcao_cadastro_ok', label: 'Dados cadastrais conferidos' },
  { key: 'recepcao_documento_ok', label: 'Documento com foto conferido' },
  { key: 'recepcao_convenio_ok', label: 'Convênio e carteirinha conferidos' },
];

export function ChecklistRecepcao({ appointment, patient, clinicId, today, onEditPatient }: Props) {
  const { profile, hasAnyRole } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const podeConferir = hasAnyRole(['admin', 'recepcao']);
  const readiness = receptionReadiness(patient, today);
  const [values, setValues] = useState<Record<Field, boolean>>({
    recepcao_cadastro_ok: Boolean(appointment.recepcao_cadastro_ok),
    recepcao_documento_ok: Boolean(appointment.recepcao_documento_ok),
    recepcao_convenio_ok: Boolean(appointment.recepcao_convenio_ok),
  });
  const [saving, setSaving] = useState<Field | null>(null);

  useEffect(() => {
    setValues({
      recepcao_cadastro_ok: Boolean(appointment.recepcao_cadastro_ok),
      recepcao_documento_ok: Boolean(appointment.recepcao_documento_ok),
      recepcao_convenio_ok: Boolean(appointment.recepcao_convenio_ok),
    });
  }, [appointment.id, appointment.recepcao_cadastro_ok, appointment.recepcao_documento_ok, appointment.recepcao_convenio_ok]);

  const atualizar = async (field: Field, value: boolean) => {
    if (!podeConferir || !profile?.id || !clinicId || saving) return;
    const anterior = values[field];
    setSaving(field);
    setValues(current => ({ ...current, [field]: value }));
    try {
      const changes = field === 'recepcao_cadastro_ok'
        ? { recepcao_cadastro_ok: value }
        : field === 'recepcao_documento_ok'
          ? { recepcao_documento_ok: value }
          : { recepcao_convenio_ok: value };
      const { data, error } = await supabase.from('agendamentos')
        .update(changes)
        .eq('id', appointment.id)
        .eq('clinica_id', clinicId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Esta consulta não está mais disponível nesta clínica. Atualize a Recepção.');
      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    } catch (error) {
      setValues(current => ({ ...current, [field]: anterior }));
      toast.error('Não foi possível salvar a conferência.', {
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setSaving(null);
    }
  };

  const auditLabel = appointment.recepcao_checklist_em
    ? `Conferido ${format(new Date(appointment.recepcao_checklist_em), 'dd/MM HH:mm')}${appointment.recepcao_checklist_por === profile?.id ? ' por você' : ' pela equipe'}`
    : 'Ainda sem conferência';

  return (
    <section aria-label="Checklist da recepção" className="mt-3 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold"><ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5 text-primary" />Conferência administrativa</h4>
        <span className="text-[10px] text-muted-foreground">{auditLabel}</span>
      </div>
      {readiness.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 text-[11px] text-warning-foreground">
          <span className="font-medium">Cadastro:</span>
          <span>{readiness.missing.join(' · ')}</span>
          <Button type="button" size="sm" variant="link" className="h-auto min-h-7 px-1 text-xs" onClick={onEditPatient}>
            Corrigir
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="flex min-h-8 items-center gap-2">
            {key === 'recepcao_convenio_ok' && !readiness.insuranceRequired ? (
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />Particular — não se aplica
              </span>
            ) : (
              <>
                <Checkbox
                  id={`${appointment.id}-${key}`}
                  checked={values[key]}
                  disabled={!podeConferir || saving !== null}
                  onCheckedChange={checked => void atualizar(key, checked === true)}
                  aria-label={label}
                />
                <Label htmlFor={`${appointment.id}-${key}`} className="cursor-pointer text-[11px] text-muted-foreground">
                  {label}
                </Label>
              </>
            )}
            {saving === key && <Loader2 aria-label="Salvando conferência" className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">Conferência não bloqueia o atendimento. Não registre informações clínicas aqui.</p>
    </section>
  );
}
