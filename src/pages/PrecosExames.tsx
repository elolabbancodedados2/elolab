import { salvarConfigClinica } from '@/lib/configClinica';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/ConfirmDialog';
import { AlertTriangle, DollarSign, Plus, Search, Edit, Trash2, Building2, Stethoscope, Loader2, ExternalLink } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { PageHeader } from '@/components/PageHeader';

const CATALOGO_EXAMES: { nome: string; tuss: string }[] = [
  { nome: 'Hemograma Completo', tuss: '40304361' },
  { nome: 'Coagulograma', tuss: '40304922' },
  { nome: 'Tempo de Protrombina (TP)', tuss: '40304590' },
  { nome: 'TTPA', tuss: '40304639' },
  { nome: 'VHS', tuss: '40304370' },
  { nome: 'Reticulócitos', tuss: '40304558' },
  { nome: 'Plaquetas', tuss: '' },
  { nome: 'Grupo Sanguíneo (ABO/Rh)', tuss: '40403173' },
  { nome: 'Coombs Direto', tuss: '40304108' },
  { nome: 'Coombs Indireto', tuss: '40304884' },
  { nome: 'Eletroforese de Hemoglobina', tuss: '40304353' },
  { nome: 'Ferro Sérico', tuss: '40301842' },
  { nome: 'Ferritina', tuss: '40316270' },
  { nome: 'Transferrina', tuss: '40302520' },
  { nome: 'TIBC', tuss: '' },
  { nome: 'Glicose em Jejum', tuss: '40302040' },
  { nome: 'Hemoglobina Glicada (HbA1c)', tuss: '40302733' },
  { nome: 'Curva Glicêmica (TOTG)', tuss: '40301680' },
  { nome: 'Insulina Basal', tuss: '40316360' },
  { nome: 'Peptídeo C', tuss: '40316394' },
  { nome: 'Colesterol Total', tuss: '40301605' },
  { nome: 'HDL Colesterol', tuss: '40301583' },
  { nome: 'LDL Colesterol', tuss: '40301591' },
  { nome: 'VLDL Colesterol', tuss: '40302695' },
  { nome: 'Triglicerídeos', tuss: '40302547' },
  { nome: 'Perfil Lipídico Completo', tuss: '40302750' },
  { nome: 'Ureia', tuss: '40302580' },
  { nome: 'Creatinina', tuss: '40301630' },
  { nome: 'Ácido Úrico', tuss: '40301150' },
  { nome: 'TGO (AST)', tuss: '40302504' },
  { nome: 'TGP (ALT)', tuss: '40302512' },
  { nome: 'Gama GT', tuss: '40301990' },
  { nome: 'Fosfatase Alcalina', tuss: '40301885' },
  { nome: 'Bilirrubinas Total e Frações', tuss: '40301397' },
  { nome: 'Proteínas Totais e Frações', tuss: '40302385' },
  { nome: 'Albumina', tuss: '40301222' },
  { nome: 'Amilase', tuss: '40301281' },
  { nome: 'Lipase', tuss: '40302199' },
  { nome: 'DHL', tuss: '40301729' },
  { nome: 'CPK', tuss: '40301648' },
  { nome: 'CPK-MB', tuss: '' },
  { nome: 'Troponina I', tuss: '' },
  { nome: 'BNP', tuss: '40302776' },
  { nome: 'PCR (Proteína C-Reativa)', tuss: '40308391' },
  { nome: 'PCR Ultrassensível', tuss: '' },
  { nome: 'Homocisteína', tuss: '40302113' },
  { nome: 'Sódio', tuss: '40302423' },
  { nome: 'Potássio', tuss: '40302318' },
  { nome: 'Cálcio Total', tuss: '40301400' },
  { nome: 'Cálcio Iônico', tuss: '40301419' },
  { nome: 'Magnésio', tuss: '40302237' },
  { nome: 'Fósforo', tuss: '40301931' },
  { nome: 'Cloro', tuss: '40301559' },
  { nome: 'Zinco', tuss: '40313328' },
  { nome: 'TSH', tuss: '40316521' },
  { nome: 'T3 Livre', tuss: '40316467' },
  { nome: 'T4 Livre', tuss: '40316491' },
  { nome: 'T3 Total', tuss: '40316556' },
  { nome: 'T4 Total', tuss: '40316548' },
  { nome: 'Anti-TPO', tuss: '40316157' },
  { nome: 'Anti-Tireoglobulina', tuss: '40316106' },
  { nome: 'Tireoglobulina', tuss: '40316530' },
  { nome: 'Cortisol Basal', tuss: '40316190' },
  { nome: 'ACTH', tuss: '40316041' },
  { nome: 'Prolactina', tuss: '40316416' },
  { nome: 'GH', tuss: '40316203' },
  { nome: 'IGF-1', tuss: '40316440' },
  { nome: 'LH', tuss: '40316335' },
  { nome: 'FSH', tuss: '40316289' },
  { nome: 'Estradiol', tuss: '40316246' },
  { nome: 'Progesterona', tuss: '40316408' },
  { nome: 'Testosterona Total', tuss: '40316513' },
  { nome: 'Testosterona Livre', tuss: '40316505' },
  { nome: 'DHEA-S', tuss: '' },
  { nome: 'Androstenediona', tuss: '40316076' },
  { nome: '17-OH Progesterona', tuss: '' },
  { nome: 'SHBG', tuss: '40316300' },
  { nome: 'Beta-HCG Quantitativo', tuss: '' },
  { nome: 'PTH (Paratormônio)', tuss: '40305465' },
  { nome: 'Calcitonina', tuss: '40316165' },
  { nome: 'Aldosterona', tuss: '40316050' },
  { nome: 'Renina', tuss: '40316432' },
  { nome: 'PSA Total', tuss: '40316149' },
  { nome: 'PSA Livre', tuss: '40316130' },
  { nome: 'CEA', tuss: '40316122' },
  { nome: 'CA 125', tuss: '40316378' },
  // CA 19-9 e CA 15-3 repetiam o código do CA 125; ficam sem TUSS até a conferência na tabela vigente.
  { nome: 'CA 19-9', tuss: '' },
  { nome: 'CA 15-3', tuss: '' },
  { nome: 'AFP', tuss: '40316068' },
  { nome: 'CA 72-4', tuss: '' },
  { nome: 'Urina Tipo I (EAS)', tuss: '' },
  { nome: 'Urocultura', tuss: '40310213' },
  { nome: 'Creatinina Urinária 24h', tuss: '' },
  { nome: 'Microalbuminúria', tuss: '' },
  { nome: 'Clearance de Creatinina', tuss: '' },
  { nome: 'Parasitológico de Fezes (EPF)', tuss: '' },
  { nome: 'Coprocultura', tuss: '' },
  { nome: 'Sangue Oculto nas Fezes', tuss: '' },
  { nome: 'Anti-HIV 1 e 2', tuss: '' },
  { nome: 'VDRL', tuss: '' },
  { nome: 'FTA-ABS IgG/IgM', tuss: '' },
  { nome: 'Hepatite A (Anti-HAV IgM)', tuss: '' },
  { nome: 'Hepatite B (HBsAg)', tuss: '' },
  { nome: 'Hepatite B (Anti-HBs)', tuss: '' },
  { nome: 'Hepatite B (Anti-HBc Total)', tuss: '' },
  { nome: 'Hepatite C (Anti-HCV)', tuss: '' },
  { nome: 'Toxoplasmose IgG', tuss: '' },
  { nome: 'Toxoplasmose IgM', tuss: '' },
  { nome: 'Rubéola IgG', tuss: '' },
  { nome: 'Rubéola IgM', tuss: '' },
  { nome: 'Citomegalovírus IgG', tuss: '' },
  { nome: 'Citomegalovírus IgM', tuss: '' },
  { nome: 'Dengue IgG/IgM', tuss: '' },
  { nome: 'COVID-19 IgG/IgM', tuss: '' },
  { nome: 'FAN', tuss: '' },
  { nome: 'Fator Reumatoide', tuss: '' },
  { nome: 'Anti-CCP', tuss: '' },
  { nome: 'IgE Total', tuss: '' },
  { nome: 'ASLO', tuss: '' },
  { nome: 'Vitamina D (25-OH)', tuss: '40302830' },
  { nome: 'Vitamina B12', tuss: '' },
  { nome: 'Ácido Fólico', tuss: '' },
  { nome: 'Radiografia de Tórax PA/Perfil', tuss: '' },
  { nome: 'Radiografia de Coluna Cervical', tuss: '' },
  { nome: 'Radiografia de Coluna Lombar', tuss: '' },
  { nome: 'Radiografia de Mão e Punho', tuss: '' },
  { nome: 'Radiografia de Joelho', tuss: '' },
  { nome: 'Radiografia de Seios da Face', tuss: '' },
  { nome: 'Ultrassom de Abdome Total', tuss: '' },
  { nome: 'Ultrassom de Abdome Superior', tuss: '' },
  { nome: 'Ultrassom Pélvico', tuss: '' },
  { nome: 'Ultrassom Transvaginal', tuss: '' },
  { nome: 'Ultrassom Obstétrico', tuss: '' },
  { nome: 'Ultrassom Morfológico', tuss: '' },
  { nome: 'Ultrassom de Tireoide', tuss: '' },
  { nome: 'Ultrassom de Mama Bilateral', tuss: '' },
  { nome: 'Ultrassom de Próstata', tuss: '' },
  { nome: 'Ultrassom Renal', tuss: '' },
  { nome: 'Ultrassom Doppler Carótidas', tuss: '' },
  { nome: 'Ultrassom Doppler Venoso MMII', tuss: '' },
  { nome: 'Ultrassom Doppler Arterial MMII', tuss: '' },
  { nome: 'Ultrassom de Partes Moles', tuss: '' },
  { nome: 'TC de Crânio', tuss: '' },
  { nome: 'TC de Tórax', tuss: '' },
  { nome: 'TC de Abdome Total', tuss: '' },
  { nome: 'TC de Coluna Lombar', tuss: '' },
  { nome: 'TC de Seios da Face', tuss: '' },
  { nome: 'Angiotomografia Coronariana', tuss: '' },
  { nome: 'RM de Crânio', tuss: '' },
  { nome: 'RM de Coluna Cervical', tuss: '' },
  { nome: 'RM de Coluna Lombar', tuss: '' },
  { nome: 'RM de Joelho', tuss: '' },
  { nome: 'RM de Ombro', tuss: '' },
  { nome: 'RM de Abdome', tuss: '' },
  { nome: 'RM de Pelve', tuss: '' },
  { nome: 'RM Cardíaca', tuss: '' },
  { nome: 'Mamografia Bilateral', tuss: '' },
  { nome: 'Densitometria Óssea', tuss: '' },
  { nome: 'Eletrocardiograma (ECG)', tuss: '40101010' },
  { nome: 'Ecocardiograma Transtorácico', tuss: '' },
  { nome: 'Ecocardiograma com Doppler', tuss: '' },
  { nome: 'Teste Ergométrico', tuss: '40101045' },
  { nome: 'Holter 24h', tuss: '' },
  { nome: 'MAPA 24h', tuss: '' },
  { nome: 'Eletroencefalograma (EEG)', tuss: '' },
  { nome: 'Eletroneuromiografia (ENMG)', tuss: '' },
  { nome: 'Espirometria', tuss: '' },
  { nome: 'Polissonografia', tuss: '' },
  { nome: 'Tonometria', tuss: '' },
  { nome: 'Campimetria Visual', tuss: '' },
  { nome: 'Retinografia', tuss: '' },
  { nome: 'OCT', tuss: '' },
  { nome: 'Mapeamento de Retina', tuss: '' },
  { nome: 'Audiometria Tonal e Vocal', tuss: '' },
  { nome: 'Impedanciometria', tuss: '' },
  { nome: 'Videolaringoscopia', tuss: '' },
  { nome: 'Papanicolaou', tuss: '' },
  { nome: 'Colposcopia', tuss: '' },
  { nome: 'Endoscopia Digestiva Alta', tuss: '' },
  { nome: 'Colonoscopia', tuss: '' },
  { nome: 'Biópsia de Pele', tuss: '' },
  { nome: 'Anatomopatológico', tuss: '' },
  { nome: 'Gasometria Arterial', tuss: '' },
  { nome: 'Hemoculturas', tuss: '' },
  { nome: 'Antibiograma', tuss: '' },
  { nome: 'D-Dímero', tuss: '' },
  { nome: 'Fibrinogênio', tuss: '' },
  { nome: 'Procalcitonina', tuss: '' },
  { nome: 'Cariótipo', tuss: '' },
];

function ExameCombobox({ value, onChange }: { value: string; onChange: (nome: string, tuss: string) => void }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm) return CATALOGO_EXAMES;
    const q = normalizarTexto(searchTerm.trim());
    return CATALOGO_EXAMES.filter(e => normalizarTexto(e.nome).includes(q) || e.tuss.includes(searchTerm.trim()));
  }, [searchTerm]);

  const isCustomName = searchTerm.trim() && !filtered.some(e => normalizarTexto(e.nome) === normalizarTexto(searchTerm.trim()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label="Nome do exame" aria-expanded={open}
          className={cn("w-full justify-between h-11 font-normal text-left", !value && "text-muted-foreground")}>
          <span className="truncate">{value || 'Selecione ou digite um nome de exame...'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar ou digitar nome do exame..." value={searchTerm} onValueChange={setSearchTerm} />
          <CommandList className="max-h-[280px]">
            {isCustomName && (
              <CommandGroup heading="Criar novo">
                <CommandItem
                  value={`__custom__${searchTerm}`}
                  onSelect={() => { onChange(searchTerm.trim(), ''); setOpen(false); setSearchTerm(''); }}
                  className="text-primary font-medium"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar "{searchTerm.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length === 0 && !isCustomName ? (
              <CommandEmpty>Nenhum exame encontrado.</CommandEmpty>
            ) : filtered.length > 0 ? (
              <CommandGroup heading="Catálogo TUSS">
                {filtered.map((e) => (
                  <CommandItem key={e.tuss + e.nome} value={e.nome}
                    onSelect={() => { onChange(e.nome, e.tuss); setOpen(false); setSearchTerm(''); }}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === e.nome ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 text-sm">{e.nome}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{e.tuss}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const parseMoney = (value: string | number) => {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
};
const temMaisDeDuasCasasDecimais = (valor: number) =>
  Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-7;

type PriceTask = 'particular-new' | 'particular-edit' | 'convenio-new' | 'convenio-edit';
const initialInternal = { nome: '', codigo_tuss: '', descricao: '', valor: '', custo: '' };
const initialAgreementPrice = { convenio_id: '', tipo_exame: '', codigo_tuss: '', descricao: '', valor_tabela: '', valor_filme: '', valor_custo: '', valor_repasse: '' };
// Legacy particular prices are a JSON array without IDs. Resolve by exact identity,
// never by row position; ambiguous or renamed records must be reopened from the list.
const internalIdentity = (item: { nome: string; codigo_tuss?: string }) => JSON.stringify([item.nome, item.codigo_tuss || '']);
function usePriceNavigation(tab: 'particular' | 'convenio', filters: Record<string, string>) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = typeof location.state?.examPriceReturn === 'string' && /^\/(?:precos-servicos|recepcao)(?:\?|$)/.test(location.state.examPriceReturn) ? location.state.examPriceReturn : '/precos-servicos';
  return {
    location,
    open: (path: string) => navigate(path, { state: { examPriceReturn: location.pathname + location.search, examPriceTab: tab, examPriceFilters: filters } }),
    leave: () => navigate(returnTo, { state: { ...location.state, examPriceTab: tab, cashTab: returnTo.startsWith('/recepcao') ? 'precos' : undefined } }),
  };
}

// ─── Internal/Particular Prices Tab ───
function PrecosInternos({ task }: { task?: PriceTask }) {
  const taskPage = !!task;
  const editingPage = task === 'particular-edit';
  const location = useLocation();
  const itemKey = new URLSearchParams(location.search).get('item');
  const completed = useRef(false);
  const initialized = useRef(false);
  const saveLock = useRef(false);
  const baseline = useRef(JSON.stringify(initialInternal));
  const loadedTable = useRef<{ items: any[]; updatedAt: string | null } | null>(null);
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(location.state?.examPriceFilters?.search ?? '');
  const navigation = usePriceNavigation('particular', { search });

  const [precoParaExcluir, setPrecoParaExcluir] = useState<{ idx: number; nome: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(initialInternal);

  const precosQuery = useQuery({
    queryKey: ['precos-exames-internos', user?.id, profile?.clinica_id],
    queryFn: async () => {
      if (!user?.id) return { items: [], updatedAt: null };
      let query = supabase
        .from('configuracoes_clinica')
        .select('valor, updated_at')
        .eq('chave', 'precos_exames_internos');

      query = profile?.clinica_id
        ? query.eq('clinica_id', profile.clinica_id)
        : query.eq('user_id', user.id).is('clinica_id', null);
      query = query.order('updated_at', { ascending: false }).limit(1);

      const { data, error } = await query;
      if (error) throw error;
      return {
        items: (data?.[0]?.valor as any[]) || [],
        updatedAt: data?.[0]?.updated_at ?? null,
      };
    },
    enabled: !!user?.id,
  });
  const source = taskPage && loadedTable.current ? loadedTable.current : precosQuery.data;
  const precos = source?.items ?? [];
  const matches = editingPage ? precos.map((item, index) => internalIdentity(item) === itemKey ? index : -1).filter(index => index >= 0) : [];
  const editIdx = editingPage && matches.length === 1 ? matches[0] : null;
  useEffect(() => {
    if (!taskPage || initialized.current || !precosQuery.data) return;
    loadedTable.current = precosQuery.data;
    const p = editingPage && editIdx !== null ? precosQuery.data.items[editIdx] : null;
    if (editingPage && !p) return;
    const value = p ? { nome: p.nome, codigo_tuss: p.codigo_tuss || '', descricao: p.descricao || '', valor: String(p.valor), custo: String(p.custo || '') } : initialInternal;
    baseline.current = JSON.stringify(value);
    initialized.current = true;
    setForm(value);
  }, [taskPage, editingPage, editIdx, precosQuery.data]);
  const { isLoading } = precosQuery;

  const saveAll = async (list: any[]) => {
    if (precosQuery.isError || precosQuery.isFetching) throw new Error('A tabela não foi carregada por completo. Atualize os dados antes de salvar para não substituir preços existentes.');
    if (!user?.id) throw new Error('Usuário não identificado');
    if (profile?.clinica_id) {
      // Tabela de preços é da clínica: uma linha só, compartilhada pela equipe.
      await salvarConfigClinica({
        clinicaId: profile.clinica_id,
        userId: user.id,
        chave: 'precos_exames_internos',
        valor: list,
        expectedUpdatedAt: source?.updatedAt ?? null,
      });
    } else {
      const { error } = await supabase.from('configuracoes_clinica').upsert({
        chave: 'precos_exames_internos',
        user_id: user.id,
        clinica_id: null,
        valor: list as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,chave' });
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ['precos-exames-internos'] });
  };

  const handleSave = async () => {
    if (saveLock.current) return;
    if (editingPage && editIdx === null) { toast.error('Reabra o exame pela tabela antes de editar.'); return; }
    const valor = parseMoney(form.valor);
    const custo = form.custo ? parseMoney(form.custo) : 0;
    if (!form.nome.trim() || !form.valor) { toast.error('Preencha nome e valor'); return; }
    if (!Number.isFinite(valor) || valor <= 0) { toast.error('Informe um valor válido maior que zero'); return; }
    if (!Number.isFinite(custo) || custo < 0) { toast.error('Informe um custo válido'); return; }
    if (temMaisDeDuasCasasDecimais(valor) || temMaisDeDuasCasasDecimais(custo)) { toast.error('Informe valor e custo com no máximo duas casas decimais.'); return; }
    const nomeNormalizado = normalizarTexto(form.nome.trim());
    const codigoNormalizado = form.codigo_tuss.trim().toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '');
    const duplicado = precos.some((preco: any, index: number) => index !== editIdx && (
      normalizarTexto(preco.nome) === nomeNormalizado ||
      (codigoNormalizado && String(preco.codigo_tuss || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '') === codigoNormalizado)
    ));
    if (duplicado) {
      toast.error('Este nome ou código já está cadastrado na tabela particular. Edite o preço existente para evitar cobranças ambíguas.');
      return;
    }
    const entry = { nome: form.nome.trim(), codigo_tuss: form.codigo_tuss.trim(), descricao: form.descricao.trim(), valor, custo };
    const list = [...precos];
    if (editIdx !== null) list[editIdx] = entry;
    else list.push(entry);
    try {
      saveLock.current = true;
      setIsSaving(true);
      await saveAll(list);
      toast.success(editIdx !== null ? 'Atualizado!' : 'Cadastrado!');
      completed.current = true;
      navigation.leave();
    } catch (error: any) {
      if (String(error?.message || '').includes('Outra pessoa')) {
        toast.error(error.message, { description: 'Seu preenchimento foi preservado. Volte à tabela e reabra o exame para comparar a versão atual.' });
      } else toast.error(error?.message || 'Erro ao salvar exame');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!precoParaExcluir) return;
    const list = precos.filter((_: any, i: number) => i !== precoParaExcluir.idx);
    setIsSaving(true);
    try {
      await saveAll(list);
      toast.success('Removido!');
      setPrecoParaExcluir(null);
    } catch (error: any) {
      if (String(error?.message || '').includes('Outra pessoa')) {
        await precosQuery.refetch();
        toast.error(error.message, { description: 'A tabela foi atualizada. Confira os valores atuais antes de tentar novamente.' });
      } else toast.error(error?.message || 'Erro ao remover exame');
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (idx: number) => navigation.open(`/precos-servicos/exames/particular/editar?${new URLSearchParams({ item: internalIdentity(precos[idx]) })}`);

  const filtered = useMemo(() => {
    const q = normalizarTexto(search.trim());
    if (!q) return precos;
    return precos.filter((p: any) => normalizarTexto(p.nome).includes(q) || normalizarTexto(p.codigo_tuss).includes(q));
  }, [precos, search]);

  return (
    <div className="space-y-4">
      {taskPage && <UnsavedChangesGuard dirty={JSON.stringify(form) !== baseline.current} busy={isSaving} completed={completed} />}
      {taskPage && <Button variant="outline" onClick={navigation.leave}>Voltar à tabela de preços</Button>}
      {!taskPage && <>
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar exame particular por nome ou TUSS" placeholder="Buscar exame..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-full pl-9" />
        </div>
        <Button onClick={() => navigation.open('/precos-servicos/exames/particular/novo')} className="min-h-11 gap-1.5 rounded-full">
          <Plus className="h-4 w-4" /> Novo exame
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exame</TableHead>
                <TableHead>TUSS</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor Particular</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {precosQuery.isError ? (
                <TableRow><TableCell colSpan={7} className="p-4"><ErrorState compact title="Não foi possível carregar a tabela particular" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} /></TableCell></TableRow>
              ) : isLoading ? (
                <TableRow><TableCell colSpan={7} className="p-0"><TableSkeleton rows={5} cols={5} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <span>{precos.length === 0 ? 'Nenhum exame cadastrado. Clique em “Novo Exame” para começar.' : <>Nenhum exame encontrado para esta busca. <Button variant="link" className="h-auto p-0" onClick={() => setSearch('')}>Limpar busca</Button></>}</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                filtered.map((p: any) => {
                  const originalIdx = precos.indexOf(p);
                  const margem = Number(p.custo) > 0 && Number(p.valor) > 0
                    ? ((Number(p.valor) - Number(p.custo)) / Number(p.valor) * 100)
                    : null;
                  return (
                    <TableRow key={`${p.nome}-${p.codigo_tuss || 'sem-tuss'}-${originalIdx}`}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_tuss || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{p.descricao || '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(p.valor)}</TableCell>
                      <TableCell className="text-right">{p.custo > 0 ? fmt(p.custo) : '—'}</TableCell>
                      <TableCell className="text-right">
                        {margem === null ? <span className="text-muted-foreground">—</span> : (
                          <Badge variant={margem >= 50 ? 'success' : margem >= 20 ? 'secondary' : 'destructive'} className="rounded-full text-xs">
                            {margem.toFixed(0)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button aria-label={`Editar preço de ${p.nome}`} size="icon" variant="ghost" className="h-11 w-11 rounded-full" onClick={() => openEdit(originalIdx)}><Edit className="h-4 w-4" /></Button>
                          <Button aria-label={`Excluir preço de ${p.nome}`} size="icon" variant="ghost" className="h-11 w-11 rounded-full text-destructive" disabled={isSaving} onClick={() => setPrecoParaExcluir({ idx: originalIdx, nome: p.nome })}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{filtered.length} exame(s)</span>
          <span>Média: {fmt(filtered.reduce((s: number, p: any) => s + (p.valor || 0), 0) / filtered.length)}</span>
        </div>
      )}

      </>}
      {taskPage && (precosQuery.isError ? <ErrorState title="Não foi possível abrir a tabela particular" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} />
        : isLoading ? <p role="status">Carregando tabela particular…</p>
        : editingPage && editIdx === null ? <p role="status">Exame não encontrado ou identificação ambígua. Volte à tabela e abra o registro novamente.</p>
        : <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-5 sm:p-8">
          <header className="space-y-2 border-b pb-5"><p className="text-sm text-muted-foreground">Preços de exames / Particular</p><h1 className="text-2xl font-semibold">{editingPage ? 'Editar Exame Particular' : 'Novo Exame Particular'}</h1></header>
          <fieldset disabled={isSaving} className="min-w-0">
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome do Exame *</Label>
              <ExameCombobox value={form.nome} onChange={(nome, tuss) => setForm(p => ({ ...p, nome, codigo_tuss: tuss }))} />
              <p className="text-xs text-muted-foreground">
                Só preenchemos códigos conferidos na tabela oficial. Nos demais casos, consulte e confirme a vigência na{' '}
                <a href="https://consulta-ocl.apps.sa-1a.mendixcloud.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                  consulta oficial TUSS da ANS <ExternalLink className="h-3 w-3" />
                </a>{' '}antes de faturar.
              </p>
            </div>
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
              <Label htmlFor="preco-exame-tuss" className="text-xs font-semibold">Código TUSS</Label>
                <div className="flex gap-1.5">
                  <Input id="preco-exame-tuss" value={form.codigo_tuss} onChange={(e) => setForm(p => ({ ...p, codigo_tuss: e.target.value }))}
                    placeholder="Ex: 40301630 ou livre" className="font-mono flex-1" />
                  <Button type="button" variant="outline" size="sm" className="h-9 px-2 text-xs whitespace-nowrap"
                    onClick={() => {
                      const auto = 'INT' + Date.now().toString().slice(-7);
                      setForm(p => ({ ...p, codigo_tuss: auto }));
                    }}
                    title="Gerar código interno automático"
                  >
                    Auto
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preco-exame-descricao" className="text-xs font-semibold">Descrição</Label>
                <Input id="preco-exame-descricao" value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Breve descrição" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="preco-exame-valor" className="text-xs font-semibold">Valor Particular (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                  <Input id="preco-exame-valor" type="number" step="0.01" min="0" value={form.valor}
                    onChange={(e) => setForm(p => ({ ...p, valor: e.target.value }))}
                    placeholder="0,00" className="pl-10 h-11 text-lg font-bold tabular-nums" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preco-exame-custo" className="text-xs font-semibold">Custo (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                  <Input id="preco-exame-custo" type="number" step="0.01" min="0" value={form.custo}
                    onChange={(e) => setForm(p => ({ ...p, custo: e.target.value }))}
                    placeholder="0,00" className="pl-10 h-11 tabular-nums" />
                </div>
              </div>
            </div>
            {form.valor && form.custo && Number(form.custo) > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Margem de lucro</span>
                <Badge variant={((Number(form.valor) - Number(form.custo)) / Number(form.valor) * 100) >= 50 ? 'default' : 'secondary'} className="rounded-full">
                  {(((Number(form.valor) - Number(form.custo)) / Number(form.valor)) * 100).toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button type="button" variant="outline" disabled={isSaving} onClick={navigation.leave}>Cancelar</Button>
            <Button type="submit" disabled={!form.nome || !form.valor || isSaving} className="gap-2 scroll-mb-24">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editIdx !== null ? 'Salvar Alterações' : 'Cadastrar Exame'}
            </Button>
          </div>
        </form>)}
      <DeleteConfirmDialog
        open={!!precoParaExcluir}
        onOpenChange={(open) => { if (!open && !isSaving) setPrecoParaExcluir(null); }}
        itemName={precoParaExcluir?.nome || ''}
        isLoading={isSaving}
        closeOnConfirm={false}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

// ─── Convênio Prices Tab ───
function PrecosConvenio({ task }: { task?: PriceTask }) {
  const taskPage = !!task;
  const { examPriceId } = useParams();
  const location = useLocation();
  const completed = useRef(false);
  const initialized = useRef(false);
  const saveLock = useRef(false);
  const baseline = useRef(JSON.stringify(initialAgreementPrice));
  const { profile } = useSupabaseAuth();
  const [search, setSearch] = useState(location.state?.examPriceFilters?.search ?? '');
  const [filterConvenio, setFilterConvenio] = useState(location.state?.examPriceFilters?.convenio ?? 'all');
  const navigation = usePriceNavigation('convenio', { search, convenio: filterConvenio });
  const [editing, setEditing] = useState<any>(null);
  /** Remover preço ficava a um clique, sem confirmar nem permitir desfazer. */
  const [precoParaExcluir, setPrecoParaExcluir] = useState<any>(null);
  const queryClient = useQueryClient();

  const conveniosQuery = useQuery({
    queryKey: ['convenios-precos', profile?.clinica_id ?? null],
    queryFn: async () => {
      // Inclui os inativos: um preço antigo de convênio inativo precisa continuar editável.
      let query = supabase.from('convenios').select('id, nome, codigo, ativo').order('nome');
      if (profile?.clinica_id) query = query.eq('clinica_id', profile.clinica_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const convenios = conveniosQuery.data ?? [];
  const nomeConvenio = (c: any) => c.ativo === false ? `${c.nome} (inativo)` : c.nome;
  const invalidarPrecos = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['precos-exames'] }),
    queryClient.invalidateQueries({ queryKey: ['precos-exames-convenio'] }),
  ]);

  const precosQuery = useQuery({
    queryKey: ['precos-exames', profile?.clinica_id],
    queryFn: async () => {
      return buscarEmBlocos<any>(() => supabase
        .from('precos_exames_convenio')
        .select('*, convenios(nome, codigo)')
        .eq('clinica_id', profile?.clinica_id)
        .order('tipo_exame').order('id'));
    },
    enabled: !!profile?.clinica_id,
  });
  const precos = precosQuery.data ?? [];
  const precosAtingiramLimite = precos.length >= LIMITE_BUSCA_EM_BLOCOS;
  const { isLoading } = precosQuery;

  const saveMutation = useMutation({
    mutationFn: async (form: any) => {
      const valorTabela = parseMoney(form.valor_tabela);
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
      if (conveniosQuery.isError || precosQuery.isError || conveniosQuery.isLoading || precosQuery.isLoading) throw new Error('Carregue convênios e preços antes de gravar.');
      if (precosAtingiramLimite) throw new Error('A lista de preços atingiu o limite de leitura. Não é possível validar duplicidade com segurança; revise a tabela antes de cadastrar.');
      if (!convenios.some((convenio: any) => convenio.id === form.convenio_id) || !form.tipo_exame?.trim() || !Number.isFinite(valorTabela) || valorTabela <= 0) {
        throw new Error('Preencha convênio, exame e valor válido maior que zero.');
      }
      const adicionais = ['valor_filme', 'valor_custo', 'valor_repasse'].map((key) => form[key] ? parseMoney(form[key]) : 0);
      if (adicionais.some((valor) => !Number.isFinite(valor) || valor < 0)) throw new Error('Filme, custo e repasse devem ser valores válidos iguais ou maiores que zero.');
      if ([valorTabela, ...adicionais].some(temMaisDeDuasCasasDecimais)) throw new Error('Informe os valores do convênio com no máximo duas casas decimais.');
      const nomeNormalizado = normalizarTexto(form.tipo_exame.trim());
      const codigoNormalizado = String(form.codigo_tuss || '').trim().toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '');
      const duplicado = precos.some((preco: any) => preco.id !== editing?.id && preco.convenio_id === form.convenio_id && (
        normalizarTexto(preco.tipo_exame) === nomeNormalizado ||
        (codigoNormalizado && String(preco.codigo_tuss || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '') === codigoNormalizado)
      ));
      if (duplicado) throw new Error('Este nome ou código já está cadastrado para o convênio selecionado. Edite o preço existente para evitar cobranças ambíguas.');
      const payload = {
        convenio_id: form.convenio_id, tipo_exame: form.tipo_exame.trim(), codigo_tuss: form.codigo_tuss?.trim() || null,
        descricao: form.descricao?.trim() || null, valor_tabela: valorTabela, valor_filme: form.valor_filme ? parseMoney(form.valor_filme) : 0,
        valor_custo: form.valor_custo ? parseMoney(form.valor_custo) : 0, valor_repasse: form.valor_repasse ? parseMoney(form.valor_repasse) : 0,
        clinica_id: profile.clinica_id,
      };
      if (editing) {
        if (!editing.updated_at) throw new Error('Não foi possível confirmar a versão deste preço. Feche e abra o registro novamente antes de editar.');
        const { data, error } = await supabase.from('precos_exames_convenio').update(payload)
          .eq('id', editing.id).eq('clinica_id', profile.clinica_id).eq('updated_at', editing.updated_at)
          .select('id, updated_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este preço foi alterado ou removido em outra sessão. Seus dados continuam no formulário; atualize a tabela e compare antes de salvar novamente.');
      } else {
        const { error } = await supabase.from('precos_exames_convenio').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void invalidarPrecos();
      toast.success(editing ? 'Preço atualizado!' : 'Preço cadastrado!');
      completed.current = true;
      navigation.leave();
    },
    onError: (e: any) => toast.error(e.message?.includes('unique') ? 'Já existe preço para este exame neste convênio' : (e.message || 'Erro ao salvar')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
      const { data, error } = await supabase.from('precos_exames_convenio').delete()
        .eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir.');
    },
    onSuccess: () => {
      void invalidarPrecos();
      toast.success('Preço removido.');
      setPrecoParaExcluir(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const filtered = precos?.filter((p: any) => {
    const q = normalizarTexto(search.trim());
    const matchSearch = normalizarTexto(p.tipo_exame).includes(q) ||
      normalizarTexto(p.codigo_tuss).includes(q);
    const matchConvenio = filterConvenio === 'all' || p.convenio_id === filterConvenio;
    return matchSearch && matchConvenio;
  });

  const [form, setForm] = useState(initialAgreementPrice);
  const recordQuery = useQuery({
    queryKey: ['preco-exame-pagina', profile?.clinica_id, examPriceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('precos_exames_convenio').select('*').eq('id', examPriceId!).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!examPriceId && !!profile?.clinica_id,
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!taskPage || initialized.current || (examPriceId && !recordQuery.data)) return;
    const p = recordQuery.data;
    const value = p ? {
      convenio_id: p.convenio_id, tipo_exame: p.tipo_exame, codigo_tuss: p.codigo_tuss || '',
      descricao: p.descricao || '', valor_tabela: String(p.valor_tabela), valor_filme: String(p.valor_filme || ''),
      valor_custo: String(p.valor_custo || ''), valor_repasse: String(p.valor_repasse || ''),
    } : initialAgreementPrice;
    baseline.current = JSON.stringify(value);
    initialized.current = true;
    setEditing(p ?? null);
    setForm(value);
  }, [taskPage, examPriceId, recordQuery.data]);
  const openEdit = (p: { id: string }) => navigation.open(`/precos-servicos/exames/convenios/${p.id}/editar`);
  const submit = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    try { await saveMutation.mutateAsync(form); } catch { /* Mutation presents the recoverable error. */ }
    finally { saveLock.current = false; }
  };

  return (
    <div className="space-y-4">
      {taskPage && <UnsavedChangesGuard dirty={JSON.stringify(form) !== baseline.current} busy={saveMutation.isPending} completed={completed} />}
      {taskPage && <Button variant="outline" onClick={navigation.leave}>Voltar à tabela de preços</Button>}
      {!taskPage && <>
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar exame ou código TUSS" placeholder="Buscar exame ou TUSS..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-full pl-9" />
        </div>
        <Select value={filterConvenio} onValueChange={setFilterConvenio}>
          <SelectTrigger aria-label="Filtrar por convênio" className="h-11 w-full rounded-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os convênios</SelectItem>
            {convenios?.map((c: any) => <SelectItem key={c.id} value={c.id}>{nomeConvenio(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => navigation.open('/precos-servicos/exames/convenios/novo')} className="min-h-11 gap-1.5 rounded-full">
          <Plus className="h-4 w-4" /> Novo preço
        </Button>
      </div>

      {precosAtingiramLimite && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>A lista de preços por convênio atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} itens.</p></div>}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Convênio</TableHead>
                <TableHead>Exame</TableHead>
                <TableHead className="hidden sm:table-cell">TUSS</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tabela</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Filme</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Custo</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Repasse</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[96px]"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conveniosQuery.isError ? (
                <TableRow><TableCell colSpan={9} className="p-4"><ErrorState compact title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} /></TableCell></TableRow>
              ) : precosQuery.isError ? (
                <TableRow><TableCell colSpan={9} className="p-4"><ErrorState compact title="Não foi possível carregar os preços" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} /></TableCell></TableRow>
              ) : isLoading || conveniosQuery.isLoading ? (
                <TableRow><TableCell colSpan={9} className="p-0"><TableSkeleton rows={5} cols={6} /></TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <span>{precos.length === 0 ? 'Nenhum preço cadastrado. Clique em “Novo Preço” para começar.' : <>Nenhum preço encontrado com estes filtros. <Button variant="link" className="h-auto p-0" onClick={() => { setSearch(''); setFilterConvenio('all'); }}>Limpar busca e convênio</Button></>}</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                filtered?.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell><Badge variant="outline" className="gap-1 rounded-full"><Building2 className="h-3 w-3" />{p.convenios?.nome}{convenios.find((c: any) => c.id === p.convenio_id)?.ativo === false && ' (inativo)'}</Badge></TableCell>
                    <TableCell className="font-medium">{p.tipo_exame}<span className="block font-mono text-xs text-muted-foreground sm:hidden">{p.codigo_tuss || ''}</span></TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">{p.codigo_tuss || '—'}</TableCell>
                    <TableCell className="hidden text-right md:table-cell">{fmt(p.valor_tabela)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{fmt(p.valor_filme || 0)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{fmt(p.valor_custo || 0)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{fmt(p.valor_repasse || 0)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(p.valor_total || p.valor_tabela)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button aria-label={`Editar preço de ${p.tipo_exame}`} size="icon" variant="ghost" className="h-11 w-11 rounded-full" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-11 w-11 rounded-full text-destructive" aria-label={`Remover preço de ${p.tipo_exame}`} onClick={() => setPrecoParaExcluir(p)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      </>}
      {taskPage && (examPriceId && recordQuery.isError ? <ErrorState title="Não foi possível abrir o preço" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />
        : examPriceId && recordQuery.isPending ? <p role="status">Carregando preço…</p>
        : examPriceId && !recordQuery.data ? <p role="status">Preço não encontrado na clínica atual.</p>
        : <form onSubmit={event => { event.preventDefault(); void submit(); }} className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-5 sm:p-8">
          <header className="space-y-2 border-b pb-5"><p className="text-sm text-muted-foreground">Preços de exames / Convênio</p><h1 className="text-2xl font-semibold">{examPriceId ? 'Editar Preço' : 'Novo Preço de Exame por Convênio'}</h1></header>
          {conveniosQuery.isError && <ErrorState compact title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />}
          {precosQuery.isError && <ErrorState compact title="Não foi possível carregar a tabela para conferir duplicidade" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} />}
          {precosAtingiramLimite && <p role="alert">A tabela atingiu o limite de leitura. Revise os registros antes de cadastrar.</p>}
          <fieldset disabled={saveMutation.isPending} className="min-w-0 space-y-4">
            <div>
              <Label htmlFor="preco-exame-convenio">Convênio *</Label>
              <Select value={form.convenio_id} onValueChange={(v) => setForm(p => ({ ...p, convenio_id: v }))}>
                <SelectTrigger id="preco-exame-convenio" aria-label="Convênio"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{convenios?.filter((c: any) => c.ativo !== false || c.id === form.convenio_id).map((c: any) => <SelectItem key={c.id} value={c.id}>{nomeConvenio(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="preco-convenio-tipo">Tipo de Exame *</Label><Input id="preco-convenio-tipo" value={form.tipo_exame} onChange={(e) => setForm(p => ({ ...p, tipo_exame: e.target.value }))} placeholder="Hemograma Completo" /></div>
              <div><Label htmlFor="preco-convenio-tuss">Código TUSS</Label><Input id="preco-convenio-tuss" value={form.codigo_tuss} onChange={(e) => setForm(p => ({ ...p, codigo_tuss: e.target.value }))} placeholder="40301630" /></div>
            </div>
            <div><Label htmlFor="preco-convenio-descricao">Descrição</Label><Input id="preco-convenio-descricao" value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="preco-convenio-valor">Valor Tabela (R$) *</Label><Input id="preco-convenio-valor" type="number" min="0" step="0.01" value={form.valor_tabela} onChange={(e) => setForm(p => ({ ...p, valor_tabela: e.target.value }))} /></div>
              <div><Label htmlFor="preco-convenio-filme">Valor Filme (R$)</Label><Input id="preco-convenio-filme" type="number" min="0" step="0.01" value={form.valor_filme} onChange={(e) => setForm(p => ({ ...p, valor_filme: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="preco-convenio-custo">Custo (R$)</Label><Input id="preco-convenio-custo" type="number" min="0" step="0.01" value={form.valor_custo} onChange={(e) => setForm(p => ({ ...p, valor_custo: e.target.value }))} /></div>
              <div><Label htmlFor="preco-convenio-repasse">Repasse (R$)</Label><Input id="preco-convenio-repasse" type="number" min="0" step="0.01" value={form.valor_repasse} onChange={(e) => setForm(p => ({ ...p, valor_repasse: e.target.value }))} /></div>
            </div>
            </fieldset>
            <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
              <Button variant="outline" type="button" disabled={saveMutation.isPending} onClick={navigation.leave}>Cancelar</Button>
              <Button type="submit" disabled={!form.convenio_id || !form.tipo_exame || !form.valor_tabela || saveMutation.isPending} className="scroll-mb-24">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editing ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </form>)}

      {precoParaExcluir && (
        <DeleteConfirmDialog
          open
          onOpenChange={(o) => { if (!o && !deleteMutation.isPending) setPrecoParaExcluir(null); }}
          itemName={precoParaExcluir.tipo_exame}
          isLoading={deleteMutation.isPending}
          closeOnConfirm={false}
          onConfirm={() => deleteMutation.mutate(precoParaExcluir.id)}
        />
      )}
    </div>
  );
}

// ─── Main Page ───
function usePrecosExamesCounts() {
  const { user, profile } = useSupabaseAuth();
  const internosQuery = useQuery({
    queryKey: ['precos-exames-internos', user?.id, profile?.clinica_id],
    queryFn: async () => {
      if (!user?.id) return { items: [], updatedAt: null };
      let query = supabase
        .from('configuracoes_clinica')
        .select('valor, updated_at')
        .eq('chave', 'precos_exames_internos');
      query = profile?.clinica_id
        ? query.eq('clinica_id', profile.clinica_id)
        : query.eq('user_id', user.id).is('clinica_id', null);
      query = query.order('updated_at', { ascending: false }).limit(1);
      const { data, error } = await query;
      if (error) throw error;
      return { items: (data?.[0]?.valor as any[]) || [], updatedAt: data?.[0]?.updated_at ?? null };
    },
    enabled: !!user?.id,
  });
  const convenioQuery = useQuery({
    queryKey: ['precos-exames', profile?.clinica_id],
    queryFn: async () => {
      return buscarEmBlocos<any>(() => supabase
        .from('precos_exames_convenio')
        .select('*, convenios(nome, codigo)')
        .eq('clinica_id', profile?.clinica_id)
        .order('tipo_exame').order('id'));
    },
    enabled: !!profile?.clinica_id,
  });
  return {
    particular: internosQuery.data?.items?.length ?? 0,
    convenio: convenioQuery.data?.length ?? 0,
  };
}

export default function PrecosExames({ task, embedded = false }: { task?: PriceTask; embedded?: boolean }) {
  const location = useLocation();
  if (task) return <div className="pb-24 lg:pb-8" key={location.pathname + location.search}>{task.startsWith('particular') ? <PrecosInternos task={task} /> : <PrecosConvenio task={task} />}</div>;
  return <PrecosExamesList embedded={embedded} />;
}

function PrecosExamesList({ embedded }: { embedded: boolean }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const counts = usePrecosExamesCounts();
  const description = `${counts.particular} exame(s) particular(es) · ${counts.convenio} preço(s) de convênio`;
  // A subaba fica na URL (?sub=) para o voltar do navegador e o link compartilhado abrirem no mesmo lugar.
  const sub = searchParams.get('sub') === 'convenio' || (!searchParams.get('sub') && location.state?.examPriceTab === 'convenio') ? 'convenio' : 'particular';
  const mudarSub = (valor: string) => { const next = new URLSearchParams(searchParams); next.set('sub', valor); setSearchParams(next, { replace: true }); };

  return (
    <div className="space-y-6 pb-8">
      {embedded ? <p className="text-sm text-muted-foreground">{description}</p> : <PageHeader
        title="Tabela de preços de exames"
        description={description}
        icon={<DollarSign />}
      />}

      <Tabs value={sub} onValueChange={mudarSub} className="space-y-4">
        <TabsList className="rounded-xl border border-border/60 bg-secondary p-1 text-muted-foreground">
          <TabsTrigger value="particular" className="gap-1.5 rounded-lg">
            <Stethoscope className="h-3.5 w-3.5" /> Particular / interno
          </TabsTrigger>
          <TabsTrigger value="convenio" className="gap-1.5 rounded-lg">
            <Building2 className="h-3.5 w-3.5" /> Por convênio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="particular">
          <PrecosInternos />
        </TabsContent>

        <TabsContent value="convenio">
          <PrecosConvenio />
        </TabsContent>
      </Tabs>
    </div>
  );
}
