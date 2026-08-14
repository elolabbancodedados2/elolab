import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
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
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';

interface FilaItem {
  id: string;
  agendamento_id: string;
  posicao: number;
  status: string;
  sala_id: string | null;
  horario_chegada: string;
  prioridade: string | null;
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
function chamarPacienteVoz(pacienteNome: string, salaNome: string, repetir = 2) {
  if (!('speechSynthesis' in window)) return;
  
  window.speechSynthesis.cancel();
  
  const texto = `Paciente ${pacienteNome}, por favor dirija-se ${salaNome === 'Recepção' ? 'à Recepção' : `à ${salaNome}`}.`;
  
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
    
    window.speechSynthesis.speak(utterance);
  }
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
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [pacientes, setPacientes] = useState<Record<string, string>>({});
  const [medicos, setMedicos] = useState<Record<string, string>>({});
  const [salas, setSalas] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [chamadoAtual, setChamadoAtual] = useState<string | null>(null);
  const [somAtivo, setSomAtivo] = useState(true);
  
  // Track which calls we've already announced
  const announcedCallsRef = useRef<Set<string>>(new Set());

  // Media state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load data
  useEffect(() => {
    loadFila();
    loadMedia();
    
    // Preload voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    // Fallback polling every 10s (realtime is primary)
    const dataInterval = setInterval(loadFila, 10000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(dataInterval);
    };
  }, []);

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel('painel-tv-fila')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fila_atendimento' },
        () => {
          loadFila();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Media carousel timer
  useEffect(() => {
    if (!isPlaying || mediaItems.length === 0) return;
    const currentMedia = mediaItems[currentMediaIndex];
    if (!currentMedia || currentMedia.tipo !== 'imagem') return;

    const duration = (currentMedia.duracao_exibicao || 10) * 1000;
    const timer = setTimeout(() => {
      setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length);
    }, duration);
    return () => clearTimeout(timer);
  }, [currentMediaIndex, isPlaying, mediaItems]);

  const handleVideoEnded = useCallback(() => {
    setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length);
  }, [mediaItems.length]);

  // Announce new calls via TTS
  useEffect(() => {
    if (!somAtivo) return;
    
    const chamados = fila.filter((f) => f.status === 'chamado');
    
    for (const chamado of chamados) {
      if (!announcedCallsRef.current.has(chamado.id)) {
        announcedCallsRef.current.add(chamado.id);
        setChamadoAtual(chamado.id);
        
        const nome = pacientes[chamado.agendamento_id] || 'Paciente';
        const sala = chamado.sala_id ? (salas[chamado.sala_id] || 'Sala') : 'Recepção';
        
        playNotificationChime().then(() => {
          chamarPacienteVoz(nome, sala);
        });
      }
    }
    
    // Clean up old announced calls
    const currentIds = new Set(fila.map(f => f.id));
    announcedCallsRef.current.forEach(id => {
      if (!currentIds.has(id)) announcedCallsRef.current.delete(id);
    });
  }, [fila, pacientes, salas, somAtivo]);

  const loadFila = async () => {
    try {
      const { data: filaData } = await supabase
        .from('fila_atendimento')
        .select('*')
        .in('status', ['aguardando', 'chamado', 'em_atendimento'])
        .order('posicao');

      if (filaData) {
        setFila(filaData);

        const agendamentoIds = filaData.map((f) => f.agendamento_id);
        if (agendamentoIds.length > 0) {
          const { data: agendamentos } = await supabase
            .from('agendamentos')
            .select('id, paciente_id, medico_id, sala_id')
            .in('id', agendamentoIds);

          if (agendamentos) {
            const pacienteIds = [...new Set(agendamentos.map((a) => a.paciente_id))];
            const medicoIds = [...new Set(agendamentos.map((a) => a.medico_id))];
            const filaSalaIds = filaData.map((f) => f.sala_id).filter(Boolean) as string[];
            const agSalaIds = agendamentos.map((a) => a.sala_id).filter(Boolean) as string[];
            const allSalaIds = [...new Set([...filaSalaIds, ...agSalaIds])];

            if (pacienteIds.length > 0) {
              const { data: pacientesData } = await supabase
                .from('pacientes')
                .select('id, nome')
                .in('id', pacienteIds);
              if (pacientesData) {
                const map: Record<string, string> = {};
                agendamentos.forEach((a) => {
                  const p = pacientesData.find((p) => p.id === a.paciente_id);
                  if (p) map[a.id] = p.nome;
                });
                setPacientes(map);
              }
            }

            if (medicoIds.length > 0) {
              const { data: medicosData } = await supabase
                .from('medicos')
                .select('id, nome, crm, especialidade')
                .in('id', medicoIds);
              if (medicosData) {
                const map: Record<string, string> = {};
                agendamentos.forEach((a) => {
                  const m = medicosData.find((m) => m.id === a.medico_id);
                  if (m) {
                    map[a.id] = m.nome ? `Dr(a). ${m.nome}` : `Dr(a). CRM ${m.crm}`;
                  }
                });
                setMedicos(map);
              }
            }

            if (allSalaIds.length > 0) {
              const { data: salasData } = await supabase
                .from('salas')
                .select('id, nome')
                .in('id', allSalaIds);
              if (salasData) {
                const map: Record<string, string> = {};
                salasData.forEach((s) => { map[s.id] = s.nome; });
                setSalas(map);
              }
            }
          }
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Erro ao carregar fila:', error);
    }
  };

  const loadMedia = async () => {
    try {
      const { data: allData, error: allError } = await supabase
        .from('tv_panel_media')
        .select('*')
        .order('ordem');
      if (allError) throw allError;
      setAllMediaItems((allData as MediaItem[]) || []);
      const activeItems = (allData as MediaItem[])?.filter(m => m.ativo) || [];
      setMediaItems(activeItems);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Erro ao carregar mídias:', error);
    }
  };

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
      const { data: urlData } = supabase.storage.from('tv-panel-media').getPublicUrl(fileName);
      const { error: dbError } = await supabase.from('tv_panel_media').insert({
        tipo: isVideo ? 'video' : 'imagem',
        nome: file.name,
        url: urlData.publicUrl,
        duracao_exibicao: 10,
        ordem: mediaItems.length,
        ativo: true,
      });
      if (dbError) throw dbError;
      toast.success('Mídia adicionada com sucesso!');
      loadMedia();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro no upload:', error);
      toast.error(error.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteMedia = async (media: MediaItem) => {
    try {
      // A URL agora contém a pasta da clínica; pegar só o último segmento
      // apagaria o caminho errado (ou nada). Extraímos tudo após o bucket.
      const depoisDoBucket = media.url.split('/tv-panel-media/')[1];
      const caminho = depoisDoBucket
        ? decodeURIComponent(depoisDoBucket.split('?')[0])
        : media.url.split('/').pop();
      if (caminho) {
        await supabase.storage.from('tv-panel-media').remove([caminho]);
      }
      const { data, error } = await supabase.from('tv_panel_media').delete().eq('id', media.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Sem permissão para remover esta mídia.'); return; }
      toast.success('Mídia removida');
      loadMedia();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover mídia');
    }
  };

  const toggleMediaActive = async (media: MediaItem) => {
    try {
      const { error } = await supabase.from('tv_panel_media').update({ ativo: !media.ativo }).eq('id', media.id);
      if (error) throw error;
      loadMedia();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar mídia');
    }
  };

  // Re-call patient manually (click on call banner)
  const rechamarPaciente = (chamado: FilaItem) => {
    const nome = pacientes[chamado.agendamento_id] || 'Paciente';
    const sala = chamado.sala_id ? (salas[chamado.sala_id] || 'Sala') : 'Recepção';
    playNotificationChime().then(() => {
      chamarPacienteVoz(nome, sala);
    });
    toast.info(`Chamando novamente: ${nome}`);
  };

  const getPacienteNome = (agendamentoId: string) => pacientes[agendamentoId] || 'Paciente';
  const getMedicoNome = (agendamentoId: string) => medicos[agendamentoId] || '';
  const getSalaNome = (salaId: string | null) => {
    if (!salaId) return 'Recepção';
    return salas[salaId] || 'Sala';
  };

  const filaAguardando = fila.filter((f) => f.status === 'aguardando').sort((a, b) => a.posicao - b.posicao);
  const emAtendimento = fila.filter((f) => f.status === 'em_atendimento').sort((a, b) => a.posicao - b.posicao);
  const chamados = fila.filter((f) => f.status === 'chamado');
  const currentMedia = mediaItems[currentMediaIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
      {/* Background Media Carousel */}
      {mediaItems.length > 0 && currentMedia && (
        <div className="absolute inset-0 z-0">
          {currentMedia.tipo === 'imagem' ? (
            <img key={currentMedia.id} src={currentMedia.url} alt={currentMedia.nome} className="w-full h-full object-cover animate-fade-in" />
          ) : (
            <video key={currentMedia.id} src={currentMedia.url} autoPlay muted onEnded={handleVideoEnded} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/70 to-slate-900/50" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 min-h-screen p-6 md:p-8">
        {/* Header */}
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight">
              <span className="text-primary">Elo</span>Lab
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

        {/* Admin Controls */}
        {isAdmin() && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
            {/* Sound toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSomAtivo(!somAtivo)}
              className={cn(
                'bg-white/10 border-white/20 text-white hover:bg-white/20',
                !somAtivo && 'opacity-50'
              )}
              title={somAtivo ? 'Som ativado' : 'Som desativado'}
            >
              {somAtivo ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            
            {/* Settings */}
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button aria-label="Configurar mídias do painel" variant="outline" size="icon" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <Settings className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Configurar Mídia do Painel
                  </DialogTitle>
                  <DialogDescription>Adicione imagens ou vídeos para exibir no painel da TV</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Adicionar Nova Mídia</Label>
                    <div className="flex gap-2">
                      <Input type="file" accept="image/*,video/*" onChange={handleFileUpload} disabled={uploading} className="flex-1" />
                      {uploading && <Loader2 className="h-5 w-5 animate-spin" />}
                    </div>
                    <p className="text-xs text-muted-foreground">Formatos aceitos: JPG, PNG, GIF, MP4, WEBM</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Mídias Cadastradas ({allMediaItems.length})</Label>
                    {allMediaItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhuma mídia cadastrada</p>
                        <p className="text-sm">Faça upload de imagens ou vídeos acima</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {allMediaItems.map((media) => (
                          <Card key={media.id} className="overflow-hidden">
                            <CardContent className="p-3 flex items-center gap-3">
                              <div className="h-16 w-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                {media.tipo === 'imagem' ? (
                                  <img src={media.url} alt={media.nome} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                    <Video className="h-6 w-6 text-white/60" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{media.nome}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={media.tipo === 'video' ? 'secondary' : 'outline'}>
                                    {media.tipo === 'video' ? <Video className="h-3 w-3 mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                                    {media.tipo}
                                  </Badge>
                                  {media.tipo === 'imagem' && (
                                    <span className="text-xs text-muted-foreground">{media.duracao_exibicao}s</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch checked={media.ativo} onCheckedChange={() => toggleMediaActive(media)} />
                                <Button aria-label={`Excluir mídia ${media.nome}`} variant="ghost" size="icon" onClick={() => handleDeleteMedia(media)} className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Media Controls */}
        {isAdmin() && mediaItems.length > 1 && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2">
            <Button aria-label="Mídia anterior" variant="ghost" size="icon" onClick={() => setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length)} className="h-8 w-8 text-white hover:bg-white/20">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsPlaying(!isPlaying)} className="h-8 w-8 text-white hover:bg-white/20">
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
                  className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 md:p-8 shadow-2xl shadow-primary/20 cursor-pointer mb-4"
                  onClick={() => rechamarPaciente(chamado)}
                  title="Clique para chamar novamente"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Volume2 className="h-6 w-6 text-white/80 animate-pulse" />
                    <p className="text-xl md:text-2xl text-white/80">Chamando:</p>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-4xl md:text-5xl font-bold font-display">
                        {getPacienteNome(chamado.agendamento_id)}
                      </p>
                      <p className="text-xl md:text-2xl text-white/80 mt-1">
                        {getMedicoNome(chamado.agendamento_id)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-2xl md:text-3xl font-bold bg-white/20 px-6 py-3 rounded-xl inline-block">
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
          <div className="bg-white/10 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10">
            <div className="bg-purple-600/80 px-6 py-4">
              <h2 className="text-xl md:text-2xl font-bold font-display">Em Atendimento</h2>
            </div>
            <div className="p-4 md:p-6">
              {emAtendimento.length === 0 ? (
                <p className="text-center text-white/50 py-8 text-lg">Nenhum atendimento em andamento</p>
              ) : (
                <div className="space-y-3">
                  {emAtendimento.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-4 bg-purple-500/20 rounded-xl border border-purple-500/30">
                      <div>
                        <p className="text-lg md:text-xl font-semibold">{getPacienteNome(item.agendamento_id)}</p>
                        <p className="text-white/60">{getMedicoNome(item.agendamento_id)}</p>
                      </div>
                      <div className="text-right">
                        <span className="bg-purple-600 px-4 py-2 rounded-full text-sm md:text-base font-medium">
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
          <div className="bg-white/10 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10">
            <div className="bg-white/10 px-6 py-4">
              <h2 className="text-xl md:text-2xl font-bold font-display">Aguardando</h2>
            </div>
            <div className="p-4 md:p-6">
              {filaAguardando.length === 0 ? (
                <p className="text-center text-white/50 py-8 text-lg">Nenhum paciente aguardando</p>
              ) : (
                <div className="space-y-2">
                  {filaAguardando.slice(0, 8).map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex justify-between items-center p-3 md:p-4 rounded-xl transition-colors',
                        index === 0
                          ? 'bg-yellow-500/20 border border-yellow-500/30'
                          : 'bg-white/5 border border-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <span className={cn(
                          'w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base',
                          index === 0 ? 'bg-yellow-500 text-slate-900' : 'bg-white/10'
                        )}>
                          {item.posicao}
                        </span>
                        <div>
                          <p className="text-base md:text-lg font-medium">{getPacienteNome(item.agendamento_id)}</p>
                          <p className="text-sm text-white/50">{getMedicoNome(item.agendamento_id)}</p>
                        </div>
                      </div>
                      <span className="text-white/40 text-sm">
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

        <footer className="mt-8 text-center text-white/40">
          <p>Por favor, aguarde seu nome ser chamado e dirija-se ao local indicado.</p>
        </footer>
      </div>
    </div>
  );
}
