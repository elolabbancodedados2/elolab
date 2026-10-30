import { nomeMedico } from '@/lib/formatters';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ordenarFilaPorPrioridade } from '@/lib/filaPrioridade';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/PageHeader';
import {
  ArrowLeft,
  Settings,
  Upload,
  Trash2,
  Image as ImageIcon,
  Video,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Monitor,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { canalUnico } from '@/lib/realtimeCanal';
import { chaveChamada, lerChamadasAnunciadas, salvarChamadasAnunciadas } from '@/lib/painelChamadas';
import { receptionTicketCode } from '@/lib/receptionTicket';

interface FilaItem {
  id: string;
  agendamento_id: string;
  posicao: number;
  status: string;
  sala_id: string | null;
  horario_chegada: string;
  prioridade: string | null;
  updated_at: string | null;
}

interface MediaItem {
  id: string;
  tipo: 'imagem' | 'video';
  nome: string;
  url: string;
  duracao_exibicao: number;
  ordem: number;
  ativo: boolean;
}

// ─── TTS Helper ────────────────────────────────────────────
function chamarPacienteVoz(senha: string, salaNome: string, repetir = 2): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();

  const texto = `Senha ${senha}, por favor dirija-se ${salaNome === 'Recepção' ? 'à Recepção' : `à ${salaNome}`}.`;
  return new Promise(resolve => {
    let terminou = false;
    const finalizar = () => {
      if (terminou) return;
      terminou = true;
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(finalizar, 20000);
    for (let i = 0; i < repetir; i++) {
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to use a Brazilian Portuguese voice
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt-BR')) || voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) utterance.voice = ptVoice;
      if (i === repetir - 1) {
        utterance.onend = finalizar;
        utterance.onerror = finalizar;
      }
      window.speechSynthesis.speak(utterance);
    }
  });
}

function criarFilaDeChamadas() {
  let fila = Promise.resolve();
  return (senha: string, salaNome: string) => {
    fila = fila
      .catch(() => undefined)
      .then(async () => {
        await playNotificationChime();
        await chamarPacienteVoz(senha, salaNome);
      });
    return fila;
  };
}

// Play a notification chime before TTS
function playNotificationChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Two-tone chime
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
      
      setTimeout(() => {
        ctx.close();
        resolve();
      }, 600);
    } catch {
      resolve();
    }
  });
}

export default function PainelTV() {
  const { isAdmin, profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMediaManagementPage = location.pathname === '/painel-tv/midias';
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [medicos, setMedicos] = useState<Record<string, string>>({});
  const [salas, setSalas] = useState<Record<string, string>>({});
  const [filaErro, setFilaErro] = useState<string | null>(null);
  const [filaCarregando, setFilaCarregando] = useState(true);
  const filaCarregadaUmaVez = useRef(false);
  const filaLoadSequence = useRef(0);
  const mediaLoadSequence = useRef(0);
  const clinicaAtualRef = useRef<string | null>(profile?.clinica_id ?? null);
  clinicaAtualRef.current = profile?.clinica_id ?? null;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [chamadoAtual, setChamadoAtual] = useState<string | null>(null);
  const [somAtivo, setSomAtivo] = useState(true);
  
  // Track which calls we've already announced
  // persisted per clinic so a reload of the TV does not re-announce old calls
  const announcedCallsRef = useRef<Set<string>>(new Set());
  const announcedClinicaRef = useRef<string | null>(null);
  const enfileirarChamadaRef = useRef<((pacienteNome: string, salaNome: string) => Promise<void>) | null>(null);
  if (!enfileirarChamadaRef.current) enfileirarChamadaRef.current = criarFilaDeChamadas();

  // Media state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const loadFilaRef = useRef<() => Promise<void>>(async () => {});
  const loadMediaRef = useRef<() => Promise<void>>(async () => {});

  // Load data
  useEffect(() => {
    if (!profile?.clinica_id) {
      filaLoadSequence.current += 1;
      filaCarregadaUmaVez.current = false;
      mediaLoadSequence.current += 1;
      setFila([]);
      setMedicos({});
      setSalas({});
      setAllMediaItems([]);
      setMediaItems([]);
      setMediaError('Clínica não identificada. Atualize a sessão para carregar as mídias.');
      setMediaLoading(false);
      setFilaCarregando(false);
      setFilaErro('Clínica não identificada. Atualize a sessão para carregar o painel.');
      return;
    }
    if (!isMediaManagementPage) {
      filaCarregadaUmaVez.current = false;
      setFila([]);
      setMedicos({});
      setSalas({});
      setFilaCarregando(true);
      setFilaErro(null);
      void loadFilaRef.current();
    }
    void loadMediaRef.current();

    // Preload voices
    if (!isMediaManagementPage && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    if (isMediaManagementPage) return;

    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    // Fallback polling every 10s (realtime is primary)
    const dataInterval = setInterval(() => { void loadFilaRef.current(); }, 10000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(dataInterval);
    };
  }, [profile?.clinica_id, isMediaManagementPage]);

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!profile?.clinica_id || isMediaManagementPage) return;
    const channel = supabase
      .channel(canalUnico('painel-tv-fila'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fila_atendimento', filter: `clinica_id=eq.${profile.clinica_id}` },
        () => {
      void loadFilaRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.clinica_id, isMediaManagementPage]);

  // Media carousel timer
  useEffect(() => {
    if (isMediaManagementPage || !isPlaying || mediaItems.length === 0) return;
    const currentMedia = mediaItems[currentMediaIndex];
    if (!currentMedia || currentMedia.tipo !== 'imagem') return;

    const duration = (currentMedia.duracao_exibicao || 10) * 1000;
    const timer = setTimeout(() => {
      setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length);
    }, duration);
    return () => clearTimeout(timer);
  }, [currentMediaIndex, isMediaManagementPage, isPlaying, mediaItems]);

  useEffect(() => {
    setCurrentMediaIndex((index) => mediaItems.length ? index % mediaItems.length : 0);
  }, [mediaItems.length]);

  const handleVideoEnded = useCallback(() => {
    setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length);
  }, [mediaItems.length]);

  // Announce new calls via TTS
  useEffect(() => {
    const clinicaId = profile?.clinica_id;
    // Sem a fila confirmada, a limpeza abaixo apagaria a memória da recarga.
    if (isMediaManagementPage || !somAtivo || !clinicaId || !filaCarregadaUmaVez.current) return;
    if (announcedClinicaRef.current !== clinicaId) {
      announcedClinicaRef.current = clinicaId;
      announcedCallsRef.current = lerChamadasAnunciadas(clinicaId);
    }

    const chamados = fila.filter((f) => f.status === 'chamado');

    for (const chamado of chamados) {
      const chave = chaveChamada(chamado);
      if (!announcedCallsRef.current.has(chave)) {
        announcedCallsRef.current.add(chave);
        setChamadoAtual(chamado.id);
        
        const senha = receptionTicketCode(chamado.id);
        const sala = chamado.sala_id ? (salas[chamado.sala_id] || 'Sala') : 'Recepção';

        void enfileirarChamadaRef.current?.(senha, sala);
      }
    }
    
    // Clean up old announced calls
    const currentIds = new Set(chamados.map(chaveChamada));
    announcedCallsRef.current.forEach(id => {
      if (!currentIds.has(id)) announcedCallsRef.current.delete(id);
    });
    salvarChamadasAnunciadas(clinicaId, announcedCallsRef.current);
  }, [fila, isMediaManagementPage, salas, somAtivo, profile?.clinica_id]);

  const loadFila = async () => {
    const clinicaId = profile?.clinica_id;
    const requestSequence = ++filaLoadSequence.current;
    if (!clinicaId) {
      setFila([]);
      setFilaCarregando(false);
      return;
    }
    if (!filaCarregadaUmaVez.current) setFilaCarregando(true);
    try {
      const { data: filaData, error: filaError } = await supabase
        .from('fila_atendimento')
        .select('*')
        .eq('clinica_id', clinicaId)
        .in('status', ['aguardando', 'chamado', 'em_atendimento'])
        .order('posicao');
      if (filaError) throw filaError;

      const linhasFila = (filaData ?? []) as FilaItem[];
      const agendamentoIds = linhasFila.map((f) => f.agendamento_id);
      let agendamentos: Array<{ id: string; medico_id: string | null; sala_id: string | null }> = [];
      if (agendamentoIds.length > 0) {
          const { data, error } = await supabase
            .from('agendamentos')
            .select('id, medico_id, sala_id')
            .eq('clinica_id', clinicaId)
            .in('id', agendamentoIds);
          if (error) throw error;
          agendamentos = data ?? [];
      }

      const medicoIds = [...new Set(agendamentos.map((a) => a.medico_id).filter(Boolean))] as string[];
      const filaSalaIds = linhasFila.map((f) => f.sala_id).filter(Boolean) as string[];
      const agSalaIds = agendamentos.map((a) => a.sala_id).filter(Boolean) as string[];
      const allSalaIds = [...new Set([...filaSalaIds, ...agSalaIds])];

      const mapaMedicos: Record<string, string> = {};
      if (medicoIds.length > 0) {
        const { data, error } = await supabase
          .from('medicos')
          .select('id, nome, crm, especialidade')
          .eq('clinica_id', clinicaId)
          .in('id', medicoIds);
        if (error) throw error;
        agendamentos.forEach((a) => {
          const medico = data?.find((m) => m.id === a.medico_id);
          if (medico) mapaMedicos[a.id] = medico.nome ? `${nomeMedico(medico.nome)}` : `Dr(a). CRM ${medico.crm}`;
        });
      }

      const mapaSalas: Record<string, string> = {};
      if (allSalaIds.length > 0) {
        const { data, error } = await supabase
          .from('salas')
          .select('id, nome')
          .eq('clinica_id', clinicaId)
          .in('id', allSalaIds);
        if (error) throw error;
        data?.forEach((sala) => { mapaSalas[sala.id] = sala.nome; });
      }

      if (requestSequence !== filaLoadSequence.current) return;
      setFila(linhasFila);
      setMedicos(mapaMedicos);
      setSalas(mapaSalas);
      filaCarregadaUmaVez.current = true;
      setFilaErro(null);
    } catch (error) {
      if (requestSequence !== filaLoadSequence.current) return;
      setFilaErro(filaCarregadaUmaVez.current
        ? 'Não foi possível atualizar a fila. Exibindo os últimos dados carregados.'
        : 'Não foi possível carregar a fila. Tente novamente ou aguarde a próxima atualização automática.');
      if (import.meta.env.DEV) console.error('Erro ao carregar fila:', error);
    } finally {
      if (requestSequence === filaLoadSequence.current) setFilaCarregando(false);
    }
  };
  loadFilaRef.current = loadFila;

  const loadMedia = async () => {
    const clinicaId = profile?.clinica_id;
    const requestSequence = ++mediaLoadSequence.current;
    if (!clinicaId) {
      setAllMediaItems([]);
      setMediaItems([]);
      setMediaError('Clínica não identificada. Atualize a sessão para carregar as mídias.');
      setMediaLoading(false);
      return;
    }
    setMediaLoading(true);
    setMediaError(null);
    try {
      const { data: allData, error: allError } = await supabase
        .from('tv_panel_media')
        .select('*')
        .eq('clinica_id', clinicaId)
        .order('ordem');
      if (allError) throw allError;
      if (requestSequence !== mediaLoadSequence.current || clinicaAtualRef.current !== clinicaId) return;
      setAllMediaItems((allData as MediaItem[]) || []);
      const activeItems = (allData as MediaItem[])?.filter(m => m.ativo) || [];
      setMediaItems(activeItems);
    } catch (error) {
      if (requestSequence !== mediaLoadSequence.current || clinicaAtualRef.current !== clinicaId) return;
      setMediaError('Não foi possível carregar as mídias. Tente novamente.');
      if (import.meta.env.DEV) console.error('Erro ao carregar mídias:', error);
    } finally {
      if (requestSequence === mediaLoadSequence.current && clinicaAtualRef.current === clinicaId) setMediaLoading(false);
    }
  };
  loadMediaRef.current = loadMedia;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      toast.error('Apenas imagens e vídeos são permitidos');
      return;
    }
    setUploading(true);
    let arquivoEnviado: string | null = null;
    try {
      // O arquivo passa a ficar numa pasta por clínica. Antes ia para a raiz do
      // bucket, o que tornava impossível escopar a listagem por clínica — uma
      // política baseada em pasta simplesmente não casava com nada.
      if (!profile?.clinica_id) {
        toast.error('Clínica não identificada. Recarregue a página.');
        return;
      }
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.clinica_id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('tv-panel-media').upload(fileName, file);
      if (uploadError) throw uploadError;
      arquivoEnviado = fileName;
      const { data: urlData } = supabase.storage.from('tv-panel-media').getPublicUrl(fileName);
      const { error: dbError } = await supabase.from('tv_panel_media').insert({
        clinica_id: profile.clinica_id,
        tipo: isVideo ? 'video' : 'imagem',
        nome: file.name,
        url: urlData.publicUrl,
        duracao_exibicao: 10,
        ordem: mediaItems.length,
        ativo: true,
      });
      if (dbError) throw dbError;
      arquivoEnviado = null;
      toast.success('Mídia adicionada com sucesso!');
      loadMedia();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro no upload:', error);
      if (arquivoEnviado) {
        try {
          const { error: cleanupError } = await supabase.storage.from('tv-panel-media').remove([arquivoEnviado]);
          if (cleanupError) throw cleanupError;
        } catch (cleanupError: any) {
          toast.warning('O cadastro da mídia falhou e o arquivo temporário não pôde ser removido.', {
            description: cleanupError?.message || 'Verifique o armazenamento do painel.',
          });
        }
      }
      toast.error(error.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteMedia = async (media: MediaItem) => {
    try {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      const { data, error } = await supabase.from('tv_panel_media').delete()
        .eq('id', media.id).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão para remover esta mídia.'); return; }

      // A URL agora contém a pasta da clínica; pegar só o último segmento
      // apagaria o caminho errado (ou nada). Extraímos tudo após o bucket.
      const depoisDoBucket = media.url.split('/tv-panel-media/')[1];
      const caminho = depoisDoBucket
        ? decodeURIComponent(depoisDoBucket.split('?')[0])
        : media.url.split('/').pop();
      if (caminho) {
        try {
          const { error: storageError } = await supabase.storage.from('tv-panel-media').remove([caminho]);
          if (storageError) throw storageError;
        } catch (storageError: any) {
          toast.warning('A mídia saiu do painel, mas o arquivo não foi removido do Storage.', {
            description: storageError?.message || 'Verifique o armazenamento do painel.',
          });
          loadMedia();
          return;
        }
      }
      toast.success('Mídia removida');
      loadMedia();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover mídia');
    }
  };

  const toggleMediaActive = async (media: MediaItem) => {
    try {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      const { data, error } = await supabase.from('tv_panel_media').update({ ativo: !media.ativo })
        .eq('id', media.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A mídia não pertence à clínica atual ou já foi removida.');
      void loadMedia();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar mídia');
    }
  };

  // Re-call patient manually (click on call banner)
  const rechamarPaciente = (chamado: FilaItem) => {
    const senha = receptionTicketCode(chamado.id);
    const sala = chamado.sala_id ? (salas[chamado.sala_id] || 'Sala') : 'Recepção';
    void enfileirarChamadaRef.current?.(senha, sala);
    toast.info(`Chamando novamente: ${senha}`);
  };

  const getMedicoNome = (agendamentoId: string) => medicos[agendamentoId] || '';
  const getSalaNome = (salaId: string | null) => {
    if (!salaId) return 'Recepção';
    return salas[salaId] || 'Sala';
  };

  const filaAguardando = ordenarFilaPorPrioridade(fila.filter((f) => f.status === 'aguardando'));
  const emAtendimento = fila.filter((f) => f.status === 'em_atendimento').sort((a, b) => a.posicao - b.posicao);
  const chamados = fila.filter((f) => f.status === 'chamado');
  const currentMedia = mediaItems[currentMediaIndex];

  if (isMediaManagementPage) {
    if (!isAdmin()) {
      return (
        <main className="min-h-screen bg-background px-4 py-10 text-foreground">
          <section className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6">
            <PageHeader title="Acesso restrito" description="Somente administradores da clínica podem gerenciar as mídias do painel." />
            <Button className="mt-6" variant="outline" onClick={() => navigate('/painel-tv')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao painel
            </Button>
          </section>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <PageHeader
            title="Mídias do Painel TV"
            description="Gerencie as imagens e os vídeos exibidos na sala de espera da sua clínica."
            icon={<Monitor />}
            actions={(
              <>
                <Button type="button" variant="outline" onClick={() => navigate('/painel-tv')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao painel
                </Button>
                <Button type="button" variant="outline" onClick={() => void loadMedia()} disabled={mediaLoading}>
                  <RefreshCw className={cn('mr-2 h-4 w-4', mediaLoading && 'animate-spin')} />
                  Atualizar
                </Button>
              </>
            )}
          />

          <section aria-labelledby="tv-media-upload-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Upload className="h-4 w-4" /></span>
              <div>
                <h2 id="tv-media-upload-title" className="font-semibold">Adicionar mídia</h2>
                <p className="mt-1 text-sm text-muted-foreground">Selecione uma imagem ou vídeo para disponibilizar no painel da sala de espera.</p>
              </div>
            </div>
            <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input id="tv-media-file" type="file" accept="image/*,video/*" onChange={handleFileUpload} disabled={uploading} className="peer absolute left-0 top-0 -z-10 opacity-0" style={{ width: 1, height: 1 }} />
              <Label
                htmlFor="tv-media-file"
                aria-disabled={uploading}
                className={cn(
                  'inline-flex min-h-10 w-fit cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
                  uploading && 'pointer-events-none opacity-60'
                )}
              >
                <Upload aria-hidden="true" className="mr-2 h-4 w-4" /> Escolher arquivo
              </Label>
              <span className="text-sm text-muted-foreground">A seleção inicia o envio.</span>
              {uploading && <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Enviando arquivo…</span>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Formatos aceitos: JPG, PNG, GIF, MP4 e WEBM.</p>
          </section>

          <section aria-labelledby="tv-media-list-title" className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2 id="tv-media-list-title" className="font-semibold">Mídias cadastradas</h2>
                <p className="mt-1 text-sm text-muted-foreground">Ative ou pause a exibição e remova arquivos da clínica.</p>
              </div>
              <Badge variant="secondary" aria-label={`${allMediaItems.length} mídias cadastradas`}>{allMediaItems.length}</Badge>
            </header>

            {mediaError ? (
              <div role="alert" className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:m-6">
                <p className="font-medium text-foreground">Lista indisponível</p>
                <p className="mt-1 text-sm text-muted-foreground">{mediaError}</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadMedia()} disabled={mediaLoading}>
                  <RefreshCw className={cn('mr-2 h-4 w-4', mediaLoading && 'animate-spin')} /> Tentar novamente
                </Button>
              </div>
            ) : mediaLoading && allMediaItems.length === 0 ? (
              <div role="status" className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Carregando mídias…</div>
            ) : allMediaItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <ImageIcon aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Nenhuma mídia cadastrada</p>
                <p className="mt-1 text-sm text-muted-foreground">Adicione uma imagem ou vídeo acima para começar.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {allMediaItems.map((media) => (
                  <li key={media.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:px-6">
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {media.tipo === 'imagem' ? <img src={media.url} alt={`Prévia: ${media.nome}`} className="h-full w-full object-cover" /> : <Video aria-hidden="true" className="h-6 w-6 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={media.nome}>{media.nome}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{media.tipo === 'video' ? 'Vídeo' : 'Imagem'}</Badge>
                        {media.tipo === 'imagem' && <span>{media.duracao_exibicao}s por exibição</span>}
                        <span className={cn('inline-flex items-center gap-1.5', media.ativo ? 'text-emerald-700' : 'text-muted-foreground')}>
                          <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', media.ativo ? 'bg-emerald-600' : 'bg-muted-foreground')} />
                          {media.ativo ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <Switch checked={media.ativo} onCheckedChange={() => toggleMediaActive(media)} aria-label={`Exibir ${media.nome} no painel`} />
                      <Button aria-label={`Excluir mídia ${media.nome}`} variant="ghost" size="icon" onClick={() => handleDeleteMedia(media)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#04182B] via-[#0A3558] to-[#062540] text-white relative overflow-hidden">
      {/* Background Media Carousel */}
      {mediaItems.length > 0 && currentMedia && (
        <div className="absolute inset-0 z-0">
          {currentMedia.tipo === 'imagem' ? (
            <img key={currentMedia.id} src={currentMedia.url} alt={currentMedia.nome} className="w-full h-full object-cover animate-fade-in" />
          ) : (
            <video key={currentMedia.id} src={currentMedia.url} autoPlay muted onEnded={handleVideoEnded} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#04182B]/95 via-[#0A3558]/75 to-[#062540]/55" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 min-h-screen p-6 md:p-8">
        {/* Header */}
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight">
              <span className="text-[#5BB4EE]">Elo</span>Lab
            </h1>
            <p className="text-lg md:text-xl text-white/60 mt-1">Painel de Atendimento</p>
          </div>
          <div className="text-right">
            <p className="text-5xl md:text-6xl font-bold font-display tracking-tight">
              {format(currentTime, 'HH:mm')}
            </p>
            <p className="text-lg md:text-xl text-white/60 capitalize">
              {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </header>

        {filaCarregando && !filaErro && (
          <div role="status" className="mb-4 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center text-white/80">
            <Loader2 aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" />
            Carregando a fila de atendimento…
          </div>
        )}
        {filaErro && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-warning/50 bg-[#04182B]/90 px-4 py-3 text-center text-white">
            <span>{filaErro}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              disabled={filaCarregando}
              onClick={() => { setFilaCarregando(true); void loadFila(); }}
            >
              {filaCarregando ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
              {filaCarregando ? 'Atualizando…' : 'Tentar novamente'}
            </Button>
          </div>
        )}

        {/* Admin Controls */}
        {isAdmin() && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
            {/* Sound toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSomAtivo(!somAtivo)}
              className={cn(
                'rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white',
                !somAtivo && 'opacity-50'
              )}
              title={somAtivo ? 'Som ativado' : 'Som desativado'}
              aria-label={somAtivo ? 'Desativar som' : 'Ativar som'}
            >
              {somAtivo ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            
            {/* Settings */}
            <Button aria-label="Configurar mídias do painel" variant="outline" size="icon" onClick={() => navigate('/painel-tv/midias')} className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Media Controls */}
        {isAdmin() && mediaItems.length > 1 && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#04182B]/70 backdrop-blur-sm rounded-full border border-white/10 px-3 py-2">
            <Button aria-label="Mídia anterior" variant="ghost" size="icon" onClick={() => setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length)} className="h-8 w-8 text-white hover:bg-white/20">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button aria-label={isPlaying ? 'Pausar mídia' : 'Reproduzir mídia'} variant="ghost" size="icon" onClick={() => setIsPlaying(!isPlaying)} className="h-8 w-8 text-white hover:bg-white/20">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button aria-label="Próxima mídia" variant="ghost" size="icon" onClick={() => setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length)} className="h-8 w-8 text-white hover:bg-white/20">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-white/60 ml-2">{currentMediaIndex + 1}/{mediaItems.length}</span>
          </div>
        )}

        {/* Chamada Atual - Destaque com animação pulsante */}
        <AnimatePresence>
          {chamados.length > 0 && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -20 }}
              className="mb-8"
            >
              {chamados.map((chamado) => (
                <motion.div
                  key={chamado.id}
                  animate={{ scale: [1, 1.01, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="bg-gradient-primary rounded-2xl p-6 md:p-8 shadow-[0_16px_48px_rgba(16,128,202,0.45)] ring-1 ring-white/20 cursor-pointer mb-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
                  onClick={() => rechamarPaciente(chamado)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); rechamarPaciente(chamado); } }}
                  role="button"
                  tabIndex={0}
                  title="Clique para chamar novamente"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Volume2 className="h-6 w-6 text-white/80 animate-pulse" />
                    <p className="text-xl md:text-2xl text-white/80">Chamando:</p>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-4xl md:text-5xl font-bold font-display">
                        Senha {receptionTicketCode(chamado.id)}
                      </p>
                      <p className="text-xl md:text-2xl text-white/80 mt-1">
                        {getMedicoNome(chamado.agendamento_id)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-2xl md:text-3xl font-bold bg-white text-[#0B4F7D] px-6 py-3 rounded-2xl inline-block shadow-lg">
                        {getSalaNome(chamado.sala_id)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Em Atendimento */}
          <div className="bg-white/[0.07] backdrop-blur-md rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between gap-3 bg-gradient-primary px-6 py-4">
              <h2 className="text-xl md:text-2xl font-bold font-display">Em Atendimento</h2>
              <span className="rounded-full bg-white/20 px-3 py-1 text-base font-bold tabular-nums">{emAtendimento.length}</span>
            </div>
            <div className="p-4 md:p-6">
              {emAtendimento.length === 0 ? (
                <p className="text-center text-white/50 py-8 text-lg">Nenhum atendimento em andamento</p>
              ) : (
                <div className="space-y-3">
                  {emAtendimento.map((item) => (
                    <div key={item.id} className="flex justify-between items-center gap-3 p-4 bg-[#1080CA]/20 rounded-xl border border-[#5BB4EE]/30">
                      <div>
                        <p className="text-lg md:text-xl font-semibold">Senha {receptionTicketCode(item.id)}</p>
                        <p className="text-white/60">{getMedicoNome(item.agendamento_id)}</p>
                      </div>
                      <div className="text-right">
                        <span className="bg-[#1080CA] px-4 py-2 rounded-full text-sm md:text-base font-semibold">
                          {getSalaNome(item.sala_id)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Aguardando */}
          <div className="bg-white/[0.07] backdrop-blur-md rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between gap-3 bg-white/10 px-6 py-4">
              <h2 className="text-xl md:text-2xl font-bold font-display">Aguardando</h2>
              <span className="rounded-full bg-white/15 px-3 py-1 text-base font-bold tabular-nums">{filaAguardando.length}</span>
            </div>
            <div className="p-4 md:p-6">
              {fila.length === 0 && filaErro ? (
                <p className="text-center text-white/70 py-8 text-lg">A lista de espera está indisponível.</p>
              ) : fila.length === 0 && filaCarregando ? (
                <p className="text-center text-white/50 py-8 text-lg">Carregando a lista de espera…</p>
              ) : filaAguardando.length === 0 ? (
                <p className="text-center text-white/50 py-8 text-lg">Nenhum paciente aguardando</p>
              ) : (
                <div className="space-y-2">
                  {filaAguardando.slice(0, 8).map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex justify-between items-center p-3 md:p-4 rounded-xl transition-colors',
                        index === 0
                          ? 'bg-[#1080CA]/25 border border-[#5BB4EE]/50'
                          : 'bg-white/5 border border-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <span className={cn(
                          'w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base',
                          index === 0 ? 'bg-white text-[#0B4F7D]' : 'bg-white/10'
                        )}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-base md:text-lg font-medium">Senha {receptionTicketCode(item.id)}</p>
                          <p className="text-sm text-white/50">{getMedicoNome(item.agendamento_id)}</p>
                        </div>
                      </div>
                      <span className="text-white/60 text-sm tabular-nums">
                        {format(new Date(item.horario_chegada), 'HH:mm')}
                      </span>
                    </div>
                  ))}
                  {filaAguardando.length > 8 && (
                    <p className="text-center text-white/40 mt-4">E mais {filaAguardando.length - 8} pacientes...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-8 text-center text-lg text-white/60">
          <p>Por favor, aguarde sua senha ser chamada e dirija-se ao local indicado.</p>
        </footer>
      </div>
    </div>
  );
}
