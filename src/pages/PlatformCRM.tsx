/**
 * CRM da plataforma — a visão de quem vende o EloLab, não de quem o usa.
 *
 * O Painel Admin e a tela de Clínicas mostram contagens: quantos pacientes,
 * quantos médicos. Servem para saber o tamanho de cada cliente. Não respondem
 * as perguntas de quem toca o negócio:
 *
 *   quem vence esta semana e precisa de contato agora
 *   quanto entra por mês
 *   quem parou de usar — sinal de cancelamento antes de ele acontecer
 *
 * Ordenado por vencimento porque é isso que tem prazo. Uma clínica parada há
 * 60 dias com assinatura em dia não precisa de ação hoje; uma que vence amanhã,
 * sim.
 *
 * Acesso: só o dono da plataforma. A rota barra, e a função do banco recusa por
 * conta própria — duas travas, porque esconder o menu não protege nada.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import {
  Building2, Search, Mail, Phone, TrendingUp, AlertTriangle, CalendarClock, Moon,
} from 'lucide-react';

interface ClienteCRM {
  clinica_id: string;
  clinica_nome: string;
  cnpj: string | null;
  suspensa: boolean;
  cliente_desde: string;
  dono_nome: string | null;
  dono_email: string | null;
  dono_telefone: string | null;
  plano_nome: string | null;
  plano_valor: number | null;
  assinatura_status: string | null;
  em_trial: boolean;
  vence_em: string | null;
  dias_para_vencer: number | null;
  total_medicos: number;
  total_funcionarios: number;
  total_pacientes: number;
  total_agendamentos: number;
  ultima_atividade: string | null;
  dias_sem_uso: number | null;
}

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Dias até vencer, traduzido para o que a pessoa precisa decidir. */
function SinalVencimento({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-muted-foreground text-sm">sem assinatura</span>;
  if (dias < 0)
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />venceu há {Math.abs(dias)}d</Badge>;
  if (dias <= 7)
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1"><CalendarClock className="h-3 w-3" />vence em {dias}d</Badge>;
  return <span className="text-sm text-muted-foreground">em {dias} dias</span>;
}

/** Clínica que parou de usar cancela depois. O sinal vem antes do pedido. */
function SinalUso({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-sm text-muted-foreground">nunca usou</span>;
  if (dias >= 30)
    return <Badge variant="destructive" className="gap-1"><Moon className="h-3 w-3" />{dias}d parada</Badge>;
  if (dias >= 14)
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{dias}d sem uso</Badge>;
  return <span className="text-sm text-muted-foreground">há {dias}d</span>;
}

export default function PlatformCRM() {
  const [busca, setBusca] = useState('');

  const { data: clientes = [], isLoading, error, refetch } = useQuery({
    queryKey: ['platform-crm'],
    queryFn: async (): Promise<ClienteCRM[]> => {
      const { data, error } = await (supabase as any).rpc('platform_crm_overview');
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumo = useMemo(() => {
    // Receita conta só assinatura ativa: somar quem venceu inflaria o número e
    // é justamente o erro que faz alguém achar que está tudo bem.
    const ativos = clientes.filter(
      (c) => c.assinatura_status === 'ativa' && (c.dias_para_vencer ?? -1) >= 0
    );
    return {
      receitaMensal: ativos.reduce((s, c) => s + Number(c.plano_valor ?? 0), 0),
      pagantes: ativos.length,
      vencendo: clientes.filter((c) => (c.dias_para_vencer ?? 99) <= 7 && (c.dias_para_vencer ?? 99) >= 0).length,
      vencidos: clientes.filter((c) => (c.dias_para_vencer ?? 0) < 0).length,
      paradas: clientes.filter((c) => (c.dias_sem_uso ?? 0) >= 30 || c.dias_sem_uso === null).length,
      semAssinatura: clientes.filter((c) => c.assinatura_status === null).length,
    };
  }, [clientes]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return clientes;
    return clientes.filter(
      (c) =>
        c.clinica_nome?.toLowerCase().includes(t) ||
        c.dono_email?.toLowerCase().includes(t) ||
        c.dono_nome?.toLowerCase().includes(t)
    );
  }, [clientes, busca]);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-7 w-7 text-primary" />
          CRM da plataforma
        </h1>
        <p className="text-muted-foreground mt-1">
          Suas clínicas clientes: receita, vencimentos e quem parou de usar.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />Receita mensal
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{dinheiro(resumo.receitaMensal)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {resumo.pagantes} assinatura{resumo.pagantes === 1 ? '' : 's'} em dia
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vencendo em 7 dias</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{resumo.vencendo}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">contato antes de vencer</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Já vencidas</CardDescription>
            <CardTitle className="text-2xl text-red-600">{resumo.vencidos}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            bloqueiam após 7 dias de carência
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paradas há 30 dias+</CardDescription>
            <CardTitle className="text-2xl text-red-600">{resumo.paradas}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">risco de cancelamento</CardContent>
        </Card>
      </div>

      {resumo.semAssinatura > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              {resumo.semAssinatura} clínica{resumo.semAssinatura === 1 ? '' : 's'} sem assinatura registrada
            </CardTitle>
            <CardDescription>
              Usam o sistema e nunca são bloqueadas — a regra libera quem não tem registro de
              assinatura. Se a intenção é cobrar, elas precisam de um plano.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>Ordenados por vencimento — o que tem prazo vem primeiro.</CardDescription>
            </div>
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por clínica, dono ou e-mail"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clínica</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead className="text-right">Tamanho</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((c) => (
                    <TableRow key={c.clinica_id} className={c.suspensa ? 'opacity-60' : undefined}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          {c.clinica_nome}
                          {c.suspensa && <Badge variant="destructive" className="text-xs">suspensa</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          cliente desde {new Date(c.cliente_desde).toLocaleDateString('pt-BR')}
                        </div>
                      </TableCell>

                      <TableCell>
                        {c.dono_email ? (
                          <div className="space-y-0.5">
                            <div className="text-sm">{c.dono_nome ?? '—'}</div>
                            <a
                              href={`mailto:${c.dono_email}`}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Mail className="h-3 w-3" />{c.dono_email}
                            </a>
                            {c.dono_telefone && (
                              <a
                                href={`https://wa.me/55${c.dono_telefone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <Phone className="h-3 w-3" />{c.dono_telefone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">sem dono definido</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {c.plano_nome ? (
                          <div>
                            <div className="text-sm">{c.plano_nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.plano_valor ? dinheiro(Number(c.plano_valor)) + '/mês' : '—'}
                              {c.em_trial && ' · teste'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell><SinalVencimento dias={c.dias_para_vencer} /></TableCell>
                      <TableCell><SinalUso dias={c.dias_sem_uso} /></TableCell>

                      <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                        {c.total_pacientes} pac · {c.total_medicos} méd
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {visiveis.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">
                  {busca ? `Nenhuma clínica encontrada para "${busca}".` : 'Nenhuma clínica cadastrada.'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
