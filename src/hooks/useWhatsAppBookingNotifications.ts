import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface AgendamentoRow {
  id: string;
  origem: string;
  data: string;
  hora_inicio: string;
}

export function useWhatsAppBookingNotifications() {
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id;

  useEffect(() => {
    if (!clinicId) return;

    const channel = supabase
      .channel(`whatsapp-booking-toast:${clinicId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agendamentos',
        filter: `clinica_id=eq.${clinicId}`,
      }, (payload) => {
        const row = payload.new as AgendamentoRow;
        if (row.origem !== 'whatsapp_ia') return;
        const [ano, mes, dia] = row.data.split('-');
        toast.success('Agendamento feito pela IA do WhatsApp', {
          description: `${dia}/${mes}/${ano} às ${row.hora_inicio.slice(0, 5)}`,
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clinicId]);
}
