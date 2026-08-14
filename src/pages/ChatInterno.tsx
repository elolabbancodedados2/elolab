import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Search, Send, AlertTriangle, Loader2,
  CheckCheck, Check, Smile, ArrowLeft, Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useChatInterno, type ChatConversa, type ChatUsuario, type ChatMensagem } from '@/hooks/useChatInterno';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

// ─── Helpers ───────────────────────────────────────────────
const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const formatMsgDate = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ontem ' + format(date, 'HH:mm');
  return format(date, "dd/MM 'às' HH:mm", { locale: ptBR });
};

const formatConvDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ontem';
  return format(date, 'dd/MM', { locale: ptBR });
};

const isOnline = (ultimoAcesso: string | null) => {
  if (!ultimoAcesso) return false;
  return differenceInMinutes(new Date(), new Date(ultimoAcesso)) < 5;
};

const QUICK_EMOJIS = ['👍', '❤️', '😊', '👋', '🙏', '✅'];

// ─── Date separator ────────────────────────────────────────
function DateSeparator({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr);
  let label: string;
  if (isToday(date)) label = 'Hoje';
  else if (isYesterday(date)) label = 'Ontem';
  else label = format(date, "dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[10px] font-medium text-muted-foreground bg-background px-2">{label}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ─── Team member status info ───────────────────────────────
interface TeamMember {
  id: string;
  nome: string;
  email: string;
  avatar: string | null;
  ultimo_acesso: string | null;
  cargo?: string | null;
}

// ─── Sidebar: Team + Conversations ────────────────────────
function ChatSidebar({
  usuarios,
  conversas,
  teamMembers,
  onSelectUsuario,
  selectedConversaId,
}: {
  usuarios: ChatUsuario[];
  conversas: ChatConversa[];
  teamMembers: TeamMember[];
  onSelectUsuario: (u: ChatUsuario) => void;
  selectedConversaId: string | null;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'conversas' | 'equipe'>('conversas');

  const conversasComUsuarios = conversas
    .filter(c => c.outro_usuario)
    .sort((a, b) => {
      if (a.urgente_nao_lida && !b.urgente_nao_lida) return -1;
      if (!a.urgente_nao_lida && b.urgente_nao_lida) return 1;
      if (a.nao_lidas > 0 && b.nao_lidas === 0) return -1;
      if (a.nao_lidas === 0 && b.nao_lidas > 0) return 1;
      return 0;
    });

  const onlineMembers = teamMembers.filter(m => isOnline(m.ultimo_acesso));
  const offlineMembers = teamMembers.filter(m => !isOnline(m.ultimo_acesso));

  const filteredTeam = search
    ? teamMembers.filter(m => m.nome.toLowerCase().includes(search.toLowerCase()))
    : null;

  const filteredConversas = search
    ? conversasComUsuarios.filter(c =>
        c.outro_usuario?.nome.toLowerCase().includes(search.toLowerCase())
      )
    : conversasComUsuarios;

  const findUsuario = (memberId: string): ChatUsuario => ({
    id: memberId,
    user_id: memberId,
    nome: teamMembers.find(m => m.id === memberId)?.nome || '',
    email: teamMembers.find(m => m.id === memberId)?.email || '',
    avatar_url: teamMembers.find(m => m.id === memberId)?.avatar,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b border-border/25">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 h-9 text-sm rounded-xl"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/25">
        <button
          onClick={() => setTab('conversas')}
          className={cn(
            'flex-1 text-xs font-semibold py-2.5 transition-colors border-b-2',
            tab === 'conversas'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Conversas
        </button>
        <button
          onClick={() => setTab('equipe')}
          className={cn(
            'flex-1 text-xs font-semibold py-2.5 transition-colors border-b-2 flex items-center justify-center gap-1.5',
            tab === 'equipe'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Equipe
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
            {onlineMembers.length} online
          </Badge>
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5">
          {tab === 'conversas' && (
            <>
              {filteredConversas.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm text-muted-foreground">Nenhuma conversa</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Equipe" para iniciar</p>
                </div>
              ) : (
                filteredConversas.map(c => {
                  const member = teamMembers.find(m => m.id === c.outro_usuario?.id);
                  const online = member ? isOnline(member.ultimo_acesso) : false;
                  return (
                    <button
                      key={c.id}
                      onClick={() => c.outro_usuario && onSelectUsuario(c.outro_usuario)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all text-left',
                        selectedConversaId === c.id
                          ? 'bg-primary/10 border border-primary/20'
                          : c.urgente_nao_lida
                          ? 'bg-destructive/5 hover:bg-destructive/10'
                          : c.nao_lidas > 0
                          ? 'bg-primary/5 hover:bg-primary/10'
                          : 'hover:bg-muted/60',
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          {c.outro_usuario?.avatar_url && <AvatarImage src={c.outro_usuario.avatar_url} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {getInitials(c.outro_usuario?.nome ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
                          online ? 'bg-green-500' : 'bg-muted-foreground/30'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('text-sm truncate', c.nao_lidas > 0 ? 'font-bold' : 'font-medium')}>
                            {c.outro_usuario?.nome}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatConvDate(c.ultima_mensagem_em)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            'text-[11px] truncate',
                            c.nao_lidas > 0 ? 'text-foreground font-medium' : 'text-muted-foreground',
                          )}>
                            {c.urgente_nao_lida && '🔴 '}{c.preview || 'Sem mensagens'}
                          </p>
                          {c.nao_lidas > 0 && (
                            <Badge className={cn(
                              'h-5 min-w-[20px] flex items-center justify-center px-1.5 text-[10px] font-bold shrink-0',
                              c.urgente_nao_lida ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
                            )}>
                              {c.nao_lidas}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}

          {tab === 'equipe' && (
            <>
              {(filteredTeam || [...onlineMembers, ...offlineMembers]).length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
                </div>
              ) : filteredTeam ? (
                filteredTeam.map(m => (
                  <TeamMemberButton key={m.id} member={m} onSelect={() => onSelectUsuario(findUsuario(m.id))} />
                ))
              ) : (
                <>
                  {onlineMembers.length > 0 && (
                    <>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-green-600 px-3 py-2 flex items-center gap-1.5">
                        <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                        Online ({onlineMembers.length})
                      </p>
                      {onlineMembers.map(m => (
                        <TeamMemberButton key={m.id} member={m} onSelect={() => onSelectUsuario(findUsuario(m.id))} />
                      ))}
                    </>
                  )}
                  {offlineMembers.length > 0 && (
                    <>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 mt-2">
                        Offline ({offlineMembers.length})
                      </p>
                      {offlineMembers.map(m => (
                        <TeamMemberButton key={m.id} member={m} onSelect={() => onSelectUsuario(findUsuario(m.id))} />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TeamMemberButton({ member, onSelect }: { member: TeamMember; onSelect: () => void }) {
  const online = isOnline(member.ultimo_acesso);
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
    >
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9">
          {member.avatar && <AvatarImage src={member.avatar} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {getInitials(member.nome)}
          </AvatarFallback>
        </Avatar>
        <span className={cn(
          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
          online ? 'bg-green-500' : 'bg-muted-foreground/30'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{member.nome}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {online ? (
            <span className="text-green-600 font-medium">Online agora</span>
          ) : member.ultimo_acesso ? (
            `Visto ${formatConvDate(member.ultimo_acesso)}`
          ) : (
            member.email
          )}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 shrink-0">
        Conversar
      </Button>
    </button>
  );
}

// ─── Conversation View ─────────────────────────────────────
function ConversaView({
  conversa,
  mensagens,
  currentUserId,
  loading,
  onBack,
  onEnviar,
  teamMember,
}: {
  conversa: ChatConversa;
  mensagens: ChatMensagem[];
  currentUserId: string;
  loading: boolean;
  onBack: () => void;
  onEnviar: (texto: string, urgente: boolean) => void;
  teamMember?: TeamMember | null;
}) {
  const [texto, setTexto] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleEnviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    await onEnviar(texto.trim(), urgente);
    setTexto('');
    setUrgente(false);
    setShowEmojis(false);
    setEnviando(false);
    inputRef.current?.focus();
  };

  const outroNome = conversa.outro_usuario?.nome ?? 'Usuário';
  const online = teamMember ? isOnline(teamMember.ultimo_acesso) : false;

  const groupedMessages: { date: string; msgs: ChatMensagem[] }[] = [];
  mensagens.forEach(m => {
    const dateKey = format(new Date(m.created_at), 'yyyy-MM-dd');
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === dateKey) last.msgs.push(m);
    else groupedMessages.push({ date: dateKey, msgs: [m] });
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/25 bg-background/75 backdrop-blur-xl">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full md:hidden" aria-label="Voltar para conversas" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10">
            {conversa.outro_usuario?.avatar_url && <AvatarImage src={conversa.outro_usuario.avatar_url} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(outroNome)}
            </AvatarFallback>
          </Avatar>
          <span className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
            online ? 'bg-green-500' : 'bg-muted-foreground/30'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{outroNome}</p>
          <p className="text-[11px] text-muted-foreground">
            {online ? (
              <span className="text-green-600 font-medium flex items-center gap-1">
                <Circle className="h-1.5 w-1.5 fill-green-500 text-green-500" /> Online
              </span>
            ) : teamMember?.ultimo_acesso ? (
              `Visto ${formatConvDate(teamMember.ultimo_acesso)}`
            ) : (
              conversa.outro_usuario?.email
            )}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3" ref={scrollRef}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Carregando mensagens...</p>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
            <p className="text-xs text-muted-foreground mt-1">
              Envie uma mensagem para {outroNome.split(' ')[0]}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {groupedMessages.map(group => (
              <div key={group.date}>
                <DateSeparator dateStr={group.msgs[0].created_at} />
                {group.msgs.map((m, idx) => {
                  const isOwn = m.remetente_id === currentUserId;
                  const showTime = idx === group.msgs.length - 1
                    || group.msgs[idx + 1]?.remetente_id !== m.remetente_id
                    || new Date(group.msgs[idx + 1]?.created_at).getTime() - new Date(m.created_at).getTime() > 300000;

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
                    >
                      <div className={cn(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                        isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md',
                        m.urgente && !isOwn && 'border border-destructive/30 bg-destructive/5',
                      )}>
                        {m.urgente && (
                          <div className={cn(
                            'flex items-center gap-1 mb-1 text-[10px] font-bold',
                            isOwn ? 'text-primary-foreground/80' : 'text-destructive',
                          )}>
                            <AlertTriangle className="h-2.5 w-2.5" /> URGENTE
                          </div>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
                        {showTime && (
                          <div className={cn(
                            'flex items-center gap-1 mt-1 justify-end',
                            isOwn ? 'text-primary-foreground/50' : 'text-muted-foreground',
                          )}>
                            <span className="text-[10px]">{format(new Date(m.created_at), 'HH:mm')}</span>
                            {isOwn && (
                              m.lida_em
                                ? <CheckCheck className="h-3 w-3 text-blue-300" />
                                : <Check className="h-3 w-3" />
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/25 bg-background/75 backdrop-blur-xl space-y-1.5">
        <AnimatePresence>
          {showEmojis && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex gap-1 pb-1.5">
                {QUICK_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => setTexto(t => t + emoji)}
                    className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-base transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setUrgente(u => !u)}
                className={cn(
                  'flex items-center justify-center h-9 w-9 rounded-full transition-colors shrink-0',
                  urgente ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <AlertTriangle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {urgente ? 'Remover urgência' : 'Marcar como urgente'}
            </TooltipContent>
          </Tooltip>

          <button
            onClick={() => setShowEmojis(s => !s)}
            className={cn(
              'flex items-center justify-center h-9 w-9 rounded-full transition-colors shrink-0',
              showEmojis ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Smile className="h-4 w-4" />
          </button>

          <Input
            ref={inputRef}
            className="flex-1 h-10 text-sm rounded-xl"
            placeholder="Digite uma mensagem..."
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEnviar();
              }
            }}
          />

          <Button
            size="icon"
            className={cn(
              'h-10 w-10 shrink-0 rounded-full transition-all',
              texto.trim() ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function ChatInterno() {
  const { user, profile } = useSupabaseAuth();
  const {
    usuarios, conversas, mensagens, conversaAtiva, setConversaAtiva,
    loading, totalNaoLidas, iniciarConversa, enviarMensagem, fetchMensagens,
  } = useChatInterno();

  // Fetch team members with ultimo_acesso for online status
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members-chat', profile?.clinica_id],
    queryFn: async () => {
      if (!user || !profile?.clinica_id) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, email, avatar, ultimo_acesso')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true)
        .neq('id', user.id)
        .order('nome');
      return (data || []) as TeamMember[];
    },
    enabled: !!user && !!profile?.clinica_id,
    refetchInterval: 15000,
  });

  // Also fetch funcionarios to get cargo info
  const { data: funcionarios = [] } = useQuery({
    queryKey: ['funcionarios-chat', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data } = await supabase
        .from('funcionarios')
        .select('user_id, cargo, tipo_funcionario')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true);
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });

  const enrichedTeamMembers: TeamMember[] = teamMembers.map(m => {
    const func = funcionarios.find((f: any) => f.user_id === m.id);
    return { ...m, cargo: func?.cargo || null };
  });

  const handleSelectUsuario = async (u: ChatUsuario) => {
    const conversa = await iniciarConversa(u.user_id);
    if (conversa) {
      const conversaCompleta: ChatConversa = {
        ...conversa,
        outro_usuario: u,
        nao_lidas: 0,
        urgente_nao_lida: false,
      };
      setConversaAtiva(conversaCompleta);
      fetchMensagens(conversa.id);
    }
  };

  const currentTeamMember = conversaAtiva?.outro_usuario
    ? teamMembers.find(m => m.id === conversaAtiva.outro_usuario?.id) || null
    : null;

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="border-b border-border/25 bg-background/75 backdrop-blur-2xl px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Chat Interno</h1>
              <p className="text-sm text-muted-foreground">
                Comunicação da equipe • {teamMembers.filter(m => isOnline(m.ultimo_acesso)).length} online
              </p>
            </div>
          </div>
          {totalNaoLidas > 0 && (
            <Badge className="bg-primary text-primary-foreground">
              {totalNaoLidas} não lidas
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          'w-full md:w-80 border-r border-border/25 bg-muted/10 flex-shrink-0',
          conversaAtiva ? 'hidden md:flex md:flex-col' : 'flex flex-col',
        )}>
          <ChatSidebar
            usuarios={usuarios}
            conversas={conversas}
            teamMembers={enrichedTeamMembers}
            onSelectUsuario={handleSelectUsuario}
            selectedConversaId={conversaAtiva?.id || null}
          />
        </div>

        {/* Chat area */}
        <div className={cn(
          'flex-1 flex flex-col',
          !conversaAtiva ? 'hidden md:flex' : 'flex',
        )}>
          {conversaAtiva ? (
            <ConversaView
              conversa={conversaAtiva}
              mensagens={mensagens}
              currentUserId={user.id}
              loading={loading}
              onBack={() => setConversaAtiva(null)}
              onEnviar={enviarMensagem}
              teamMember={currentTeamMember}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-10 w-10 text-primary" />
                </div>
                <p className="text-lg font-semibold text-foreground">Selecione uma conversa</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Ou clique em "Equipe" para iniciar uma nova
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
