/**
 * Quem entrou na clínica de qual cliente, quando, por quanto tempo e por quê.
 *
 * A tabela `platform_impersonation_log` existia desde sempre e ninguém escrevia
 * nela — zero linhas. Passei a gravar hoje; sem esta tela, continuaria sendo
 * auditoria que ninguém lê, que é quase o mesmo que não ter.
 *
 * Serve para duas perguntas reais: "vocês acessaram meu sistema?" (o cliente
 * pergunta, e a resposta precisa ser verificável) e "alguém ficou com uma
 * sessão aberta?" — sessão aberta é acesso a prontuário que ninguém fechou.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ShieldCheck, DoorOpen, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface Sessao {
  id: string;
  clinica_id: string;
  motivo: string;
  iniciado_em: string;
  encerrado_em: string | null;
  platform_admin_id: string;
}

function duracao(inicio: string, fim: string | null): string {
  const ms = (fim ? new Date(fim).getTime() : Date.now()) - new Date(inicio).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}min`;
}

export function LogDeAcessos() {
  const { data: sessoes = [], isLoading } = useQuery({
    queryKey: ['platform-log-acessos'],
    queryFn: async (): Promise<Sessao[]> => {
      const { data, error } = await (supabase as any)
        .from('platform_impersonation_log')
        .select('id, clinica_id, motivo, iniciado_em, encerrado_em, platform_admin_id')
        .order('iniciado_em', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Nome da clínica e de quem acessou vêm de tabelas separadas; buscar em
  // conjunto evita uma consulta por linha.
  const { data: nomes } = useQuery({
    queryKey: ['platform-log-nomes', sessoes.map(s => s.clinica_id).join(',')],
    enabled: sessoes.length > 0,
    queryFn: async () => {
      const clinicas = [...new Set(sessoes.map(s => s.clinica_id))];
      const admins = [...new Set(sessoes.map(s => s.platform_admin_id))];
      const [c, a] = await Promise.all([
        (supabase as any).from('clinicas').select('id, nome').in('id', clinicas),
        (supabase as any).from('profiles').select('id, nome, email').in('id', admins),
      ]);
      return {
        clinicas: Object.fromEntries(((c.data ?? []) as any[]).map(x => [x.id, x.nome])),
        admins: Object.fromEntries(((a.data ?? []) as any[]).map(x => [x.id, x.nome || x.email])),
      };
    },
  });

  const abertas = sessoes.filter(s => !s.encerrado_em).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Acessos às clínicas
          {abertas > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {abertas} em aberto
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Cada vez que alguém da plataforma entra na clínica de um cliente, fica
          registrado aqui com o motivo. É o que responde "vocês acessaram meu
          sistema?" com prova, e não com memória.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : sessoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum acesso registrado ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sessoes.map(s => (
              <div
                key={s.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border/50 px-3 py-2 text-xs"
              >
                <span className="font-semibold">
                  {nomes?.clinicas?.[s.clinica_id] ?? 'Clínica removida'}
                </span>
                <span className="text-muted-foreground">
                  {nomes?.admins?.[s.platform_admin_id] ?? '—'}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {format(new Date(s.iniciado_em), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                </span>
                {s.encerrado_em ? (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Clock className="h-2.5 w-2.5" />
                    {duracao(s.iniciado_em, s.encerrado_em)}
                  </Badge>
                ) : (
                  // Sessão aberta é acesso a prontuário que ninguém fechou.
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <DoorOpen className="h-2.5 w-2.5" />
                    aberta há {duracao(s.iniciado_em, null)}
                  </Badge>
                )}
                <span className="w-full truncate text-[11px] text-muted-foreground" title={s.motivo}>
                  {s.motivo}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
