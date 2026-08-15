/**
 * As duas regras do fluxo de atendimento, na tela da clínica.
 *
 * Elas moram em `clinicas`, não em `configuracoes_clinica` — esta última é por
 * `user_id`, e uma regra que decide se o paciente entra no consultório não pode
 * depender de qual recepcionista está logada.
 *
 * Por que existem como interruptor e não como constante: pagamento antes da
 * consulta é o fluxo padrão do produto, mas clínica que atende convênio e
 * fatura no fim do mês não tem o que cobrar no balcão. Ela desliga aqui, sem
 * precisar pedir para ninguém.
 *
 * O bloqueio de verdade é dos gatilhos `pagamento_antes_do_atendimento` e
 * `triagem_antes_do_atendimento`. Esta tela só liga e desliga.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Activity, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface Regra {
  coluna: 'exigir_pagamento_previo' | 'exigir_triagem';
  icone: typeof Wallet;
  titulo: string;
  descricao: string;
  ligado: string;
  desligado: string;
}

const REGRAS: Regra[] = [
  {
    coluna: 'exigir_pagamento_previo',
    icone: Wallet,
    titulo: 'Pagamento antes da consulta',
    descricao:
      'O paciente passa pelo balcão antes de entrar no consultório. Quem está devendo aparece na fila em separado, com o valor, em vez de sumir da tela.',
    ligado: 'O profissional não consegue iniciar o atendimento de quem tem saldo em aberto.',
    desligado:
      'Qualquer paciente pode ser chamado, pagando ou não. Use se a clínica fatura convênio no fim do mês.',
  },
  {
    coluna: 'exigir_triagem',
    icone: Activity,
    titulo: 'Triagem antes da fila',
    descricao:
      'Depois de pagar, o paciente passa pela enfermagem para os sinais vitais, e só então entra na fila do profissional.',
    ligado: 'O profissional não consegue iniciar o atendimento de quem não foi triado.',
    desligado: 'Do balcão o paciente vai direto para a fila. Clínica sem enfermagem deixa assim.',
  },
];

export function FluxoDoAtendimento() {
  const { profile, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [salvando, setSalvando] = useState<string | null>(null);

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['clinica-fluxo', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('clinicas')
        .select('owner_id, exigir_pagamento_previo, exigir_triagem')
        .eq('id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // A política `clinicas_update` do banco é `owner_id = auth.uid()`. Usar o
  // papel aqui mostraria o interruptor habilitado para um admin que não é o
  // dono, e o clique morreria em RLS — pior que deixar desabilitado.
  const podeEditar = !!clinica?.owner_id && clinica.owner_id === user?.id;

  async function alternar(regra: Regra, valor: boolean) {
    setSalvando(regra.coluna);
    try {
      const { error } = await (supabase as any)
        .from('clinicas')
        .update({ [regra.coluna]: valor })
        .eq('id', profile!.clinica_id!)
        .select('id')
        .single();
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['clinica-fluxo', profile?.clinica_id] });
      // A fila e a recepção leem estas chaves para decidir quem pode ser
      // chamado: sem invalidar, a tela do médico ficaria com a regra antiga.
      queryClient.invalidateQueries({ queryKey: ['clinica-exige-pagamento', profile?.clinica_id] });

      toast.success(valor ? `${regra.titulo}: ligado` : `${regra.titulo}: desligado`, {
        description: valor ? regra.ligado : regra.desligado,
        duration: 6000,
      });
    } catch (e: any) {
      toast.error('Não foi possível mudar a regra', {
        description: e?.message?.includes('row-level security')
          ? 'Seu perfil não tem permissão para alterar a configuração da clínica.'
          : e?.message || 'Tente novamente.',
      });
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-4">
      {REGRAS.map((regra, i) => {
        const Icone = regra.icone;
        const ligado = Boolean(clinica?.[regra.coluna]);
        return (
          <div key={regra.coluna}>
            {i > 0 && <Separator className="mb-4" />}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Icone className="h-4 w-4 text-primary shrink-0" />
                  {regra.titulo}
                </Label>
                <p className="text-xs text-muted-foreground">{regra.descricao}</p>
                <p className="text-[11px] text-muted-foreground/80">
                  {isLoading ? '—' : ligado ? regra.ligado : regra.desligado}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                {salvando === regra.coluna && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {!podeEditar && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                <Switch
                  checked={ligado}
                  disabled={!podeEditar || isLoading || salvando === regra.coluna}
                  onCheckedChange={v => alternar(regra, v)}
                  aria-label={regra.titulo}
                />
              </div>
            </div>
          </div>
        );
      })}

      {!podeEditar && !isLoading && (
        <p className="text-[11px] text-muted-foreground">
          Só o titular da conta da clínica muda estas regras.
        </p>
      )}
    </div>
  );
}
