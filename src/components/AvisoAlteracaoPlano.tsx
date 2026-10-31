import { formatDate } from '@/lib/formatters';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Campo = { antes: number | null; depois: number | null };
type Aviso = {
  id: string;
  plano_nome: string;
  campos: Record<string, Campo>;
  alterado_em: string;
  efeito_preco: 'proximo_periodo' | 'valor_autorizado_mantido' | null;
  vigencia_preco: string | null;
};

const brl = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)));
const ROTULOS: Record<string, [string, (v: number | null) => string]> = {
  valor: ['Preço', brl],
  max_medicos: ['Médicos', String],
  max_recepcao: ['Recepção', String],
  max_funcionarios_total: ['Funcionários', String],
  max_storage_mb: ['Armazenamento (MB)', String],
};
const data = (v: string) => formatDate(new Date(v), 'short');

/** Alterações recentes de preço/limite do plano vigente, com o efeito para esta conta. */
export function AvisoAlteracaoPlano() {
  const { data: avisos } = useQuery({
    queryKey: ['avisos_alteracao_plano'],
    queryFn: async (): Promise<Aviso[]> => {
      const { data: rows, error } = await supabase.rpc('avisos_alteracao_plano');
      if (error) throw error;
      return (rows || []) as unknown as Aviso[];
    },
  });
  if (!avisos?.length) return null;

  return (
    <div role="status" className="space-y-3 rounded-xl border border-border bg-secondary p-4 text-sm">
      {avisos.map((aviso) => {
        const limites = Object.keys(aviso.campos).some((campo) => campo !== 'valor');
        return (
          <div key={aviso.id} className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">O plano {aviso.plano_nome} mudou em {data(aviso.alterado_em)}.</p>
              <ul className="list-disc pl-5">
                {Object.entries(aviso.campos).map(([campo, valores]) => {
                  const [rotulo, fmt] = ROTULOS[campo] ?? [campo, String];
                  return <li key={campo}>{rotulo}: de {fmt(valores.antes)} para {fmt(valores.depois)}.</li>;
                })}
              </ul>
              {aviso.efeito_preco === 'proximo_periodo' && aviso.vigencia_preco && (
                <p>O novo preço vale a partir do próximo período, depois de {data(aviso.vigencia_preco)}.</p>
              )}
              {aviso.efeito_preco === 'valor_autorizado_mantido' && (
                <p>Sua assinatura no cartão mantém o valor já autorizado no Mercado Pago.</p>
              )}
              {limites && <p>Os novos limites valem desde {data(aviso.alterado_em)}.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
