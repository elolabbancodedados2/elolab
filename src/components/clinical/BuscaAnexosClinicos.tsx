import { formatDateInTimeZone } from '@/lib/datePreference';
import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Image as ImageIcon, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import { avisar as toast } from '@/lib/avisos';
import { filterClinicalDocuments, type ClinicalDocumentFilters, type ClinicalDocumentSearchRow } from '@/lib/clinicalDocumentSearch';

type AttachmentRow = ClinicalDocumentSearchRow & {
  tamanho_bytes: number | null;
  url_arquivo: string;
  paciente_id: string;
  pacientes: { nome: string } | { nome: string }[] | null;
  profiles: { nome: string } | { nome: string }[] | null;
};

const emptyFilters: ClinicalDocumentFilters = { patient: '', type: '', author: '', from: '', to: '' };
const resultLimit = 1000;
const knownTypes = ['application/pdf', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'];

function relationName(value: { nome: string } | { nome: string }[] | null | undefined): string {
  return (Array.isArray(value) ? value[0]?.nome : value?.nome) || 'Não informado';
}

function storagePath(stored: string): string {
  if (!stored.startsWith('http')) return stored;
  const bucketPath = stored.split('/medical-attachments/')[1];
  return bucketPath ? decodeURIComponent(bucketPath.split('?')[0]) : stored.split('/').slice(-2).join('/');
}

export function BuscaAnexosClinicos() {
  const [filters, setFilters] = useState(emptyFilters);
  const deferredFilters = useDeferredValue(filters);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['clinical-attachment-search', deferredFilters],
    enabled: !(deferredFilters.from && deferredFilters.to && deferredFilters.from > deferredFilters.to),
    queryFn: async () => {
      const patientRelation = 'pacientes:pacientes!anexos_prontuario_paciente_id_fkey!inner(nome)';
      const authorRelation = deferredFilters.author
        ? 'profiles:profiles!anexos_prontuario_uploaded_by_fkey!inner(nome)'
        : 'profiles:profiles!anexos_prontuario_uploaded_by_fkey(nome)';
      let request = supabase
        .from('anexos_prontuario')
        .select(`id,nome_arquivo,tipo_arquivo,tamanho_bytes,categoria,descricao,created_at,url_arquivo,paciente_id,${patientRelation},${authorRelation}`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(resultLimit);
      if (deferredFilters.patient.trim()) request = request.ilike('pacientes.nome', `%${deferredFilters.patient.trim()}%`);
      if (deferredFilters.author.trim()) request = request.ilike('profiles.nome', `%${deferredFilters.author.trim()}%`);
      if (deferredFilters.type) request = request.eq('tipo_arquivo', deferredFilters.type);
      if (deferredFilters.from) request = request.gte('created_at', `${deferredFilters.from}T03:00:00.000Z`);
      if (deferredFilters.to) {
        const nextDay = new Date(`${deferredFilters.to}T03:00:00.000Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        request = request.lt('created_at', nextDay.toISOString());
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        patient_name: relationName(row.pacientes),
        author_name: relationName(row.profiles),
      })) as AttachmentRow[];
    },
  });

  const filtered = useMemo(() => filterClinicalDocuments(query.data ?? [], filters), [filters, query.data]);
  const types = useMemo(() => [...new Set([...knownTypes, ...(query.data ?? []).map((item) => item.tipo_arquivo).filter(Boolean)])].sort(), [query.data]);

  const openFile = async (item: AttachmentRow) => {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    if (!tab) {
      toast({ title: 'Abertura bloqueada', description: 'Permita a abertura de uma nova aba para acessar este documento.', variant: 'destructive' });
      return;
    }
    setOpeningId(item.id);
    try {
      const { data, error } = await supabase.storage.from('medical-attachments').createSignedUrl(storagePath(item.url_arquivo), 3600);
      if (error || !data?.signedUrl) throw error ?? new Error('Link privado indisponível');
      tab.location.replace(data.signedUrl);
    } catch {
      tab.close();
      toast({ title: 'Documento indisponível', description: 'A permissão clínica ou o arquivo não permitiu abrir este anexo. Atualize a busca ou confira o acesso ao prontuário.', variant: 'destructive' });
    } finally {
      setOpeningId(null);
    }
  };

  if (query.isLoading) return <div role="status" className="flex items-center justify-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando documentos clínicos…</div>;
  if (query.error) return <ErrorState title="Não foi possível buscar documentos clínicos" error={query.error} onRetry={() => void query.refetch()} />;

  const setFilter = (key: keyof ClinicalDocumentFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const invalidDateRange = Boolean(filters.from && filters.to && filters.from > filters.to);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Buscar anexos do prontuário</CardTitle>
          <CardDescription>A lista usa as permissões clínicas da sua sessão. O arquivo continua privado e só abre se o Storage autorizar o acesso.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2"><Label htmlFor="attachment-patient-filter">Paciente</Label><Input id="attachment-patient-filter" value={filters.patient} onChange={(event) => setFilter('patient', event.target.value)} placeholder="Nome do paciente" /></div>
          <div className="space-y-2"><Label htmlFor="attachment-type-filter">Tipo</Label><select id="attachment-type-filter" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={filters.type} onChange={(event) => setFilter('type', event.target.value)}><option value="">Todos</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="attachment-author-filter">Autor</Label><Input id="attachment-author-filter" value={filters.author} onChange={(event) => setFilter('author', event.target.value)} placeholder="Nome de quem anexou" /></div>
          <div className="space-y-2"><Label htmlFor="attachment-from-filter">De</Label><Input id="attachment-from-filter" type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="attachment-to-filter">Até</Label><Input id="attachment-to-filter" type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} /></div>
        </CardContent>
      </Card>
      {invalidDateRange && <p role="alert" className="text-sm text-destructive">A data inicial deve ser anterior à data final.</p>}
      {!invalidDateRange && <p className="text-sm text-muted-foreground">{filtered.length} resultado(s){(query.data?.length ?? 0) === resultLimit ? ' · refine os filtros para reduzir a lista a até 1.000 anexos' : ''}</p>}
      {!invalidDateRange && query.isFetching && <p role="status" className="text-sm text-muted-foreground">Atualizando busca…</p>}
      {!invalidDateRange && filtered.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum anexo corresponde aos filtros.</CardContent></Card>}
      {!invalidDateRange && filtered.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {item.tipo_arquivo.startsWith('image/') ? <ImageIcon className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /> : <FileText className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />}
              <div className="min-w-0"><p className="truncate font-medium">{item.nome_arquivo}</p><p className="text-sm text-muted-foreground">{item.patient_name} · {item.author_name}</p><p className="text-xs text-muted-foreground">{item.tipo_arquivo}{item.categoria ? ` · ${item.categoria}` : ''}{item.created_at ? ` · ${formatDateInTimeZone(item.created_at)}` : ''}</p>{item.descricao && <p className="mt-1 line-clamp-2 text-sm">{item.descricao}</p>}</div>
            </div>
            <Button variant="outline" onClick={() => void openFile(item)} disabled={openingId !== null} aria-label={`Abrir ${item.nome_arquivo}`}>
              {openingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Abrir
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
