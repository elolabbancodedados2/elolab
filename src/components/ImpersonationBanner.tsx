import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Crown, X } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export function ImpersonationBanner() {
  const { isPlatformAdmin, profile, refreshProfile } = useSupabaseAuth();
  const [loading, setLoading] = useState(false);

  // Only show when platform admin currently has a clinica_id (= impersonating)
  if (!isPlatformAdmin || !profile?.clinica_id) return null;

  const handleStop = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc('platform_stop_impersonation');
      if (error) throw error;
      await refreshProfile();
      toast.success('Impersonação encerrada');
      window.location.href = '/admin/clinicas';
    } catch (e: any) {
      toast.error(e.message || 'Erro ao encerrar impersonação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-warning/15 border-b border-warning/30 text-warning-foreground px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-warning" />
        <span>
          Você está visualizando o sistema como <strong>uma clínica específica</strong>. Todas as ações afetam dados reais.
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={handleStop} disabled={loading}>
        <X className="h-3.5 w-3.5 mr-1" /> Encerrar impersonação
      </Button>
    </div>
  );
}