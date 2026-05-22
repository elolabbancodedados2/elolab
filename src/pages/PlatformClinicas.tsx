import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Building2, Search, Users, Stethoscope, CalendarRange, RefreshCw, Crown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClinicaOverview {
  clinica_id: string;
  clinica_nome: string;
  owner_id: string | null;
  owner_nome: string | null;
  owner_email: string | null;
  created_at: string;
  plano_slug: string | null;
  plano_nome: string | null;
  assinatura_status: string | null;
  em_trial: boolean | null;
  trial_fim: string | null;
  total_medicos: number;
  total_funcionarios: number;
  total_pacientes: number;
  total_agendamentos: number;
}

const STATUS_COLORS: Record<string, string> = {
  ativa: 'bg-success/10 text-success border-success/20',
  trial: 'bg-info/10 text-info border-info/20',
  expirada: 'bg-warning/10 text-warning border-warning/20',
  cancelada: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function PlatformClinicas() {
  const { isPlatformAdmin, isLoading: authLoading } = useSupabaseAuth();
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-clinicas-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_get_clinicas_overview');
      if (error) throw error;
      return (data ?? []) as ClinicaOverview[];
    },
    enabled: isPlatformAdmin,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.clinica_nome?.toLowerCase().includes(q) ||
      c.owner_email?.toLowerCase().includes(q) ||
      c.owner_nome?.toLowerCase().includes(q) ||
      c.plano_nome?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      clinicas: list.length,
      ativas: list.filter(c => c.assinatura_status === 'ativa').length,
      trial: list.filter(c => c.assinatura_status === 'trial').length,
      pacientes: list.reduce((s, c) => s + Number(c.total_pacientes || 0), 0),
    };
  }, [data]);

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="h-7 w-7 text-primary" /> Plataforma — Clínicas
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão global de todas as clínicas, assinaturas e uso. Restrito a administradores da plataforma.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" />Clínicas</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totals.clinicas}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Assinaturas Ativas</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-success">{totals.ativas}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Em Trial</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-info">{totals.trial}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Pacientes (total)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totals.pacientes}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Todas as Clínicas</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por clínica, dono ou plano..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma clínica encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clínica</TableHead>
                    <TableHead>Dono</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center"><Stethoscope className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-center"><Users className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-center">Pacientes</TableHead>
                    <TableHead className="text-center"><CalendarRange className="h-4 w-4 inline" /></TableHead>
                    <TableHead>Criada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.clinica_id}>
                      <TableCell className="font-medium">{c.clinica_nome}</TableCell>
                      <TableCell className="text-sm">
                        <div>{c.owner_nome || <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-xs text-muted-foreground">{c.owner_email || '—'}</div>
                      </TableCell>
                      <TableCell>
                        {c.plano_nome ? (
                          <Badge variant="outline">{c.plano_nome}</Badge>
                        ) : <span className="text-muted-foreground text-xs">sem plano</span>}
                      </TableCell>
                      <TableCell>
                        {c.assinatura_status ? (
                          <Badge className={STATUS_COLORS[c.assinatura_status] || ''} variant="outline">
                            {c.assinatura_status}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-center">{c.total_medicos}</TableCell>
                      <TableCell className="text-center">{c.total_funcionarios}</TableCell>
                      <TableCell className="text-center">{c.total_pacientes}</TableCell>
                      <TableCell className="text-center">{c.total_agendamentos}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR }) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}