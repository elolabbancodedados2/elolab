import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, X, ArrowLeft, Send, AlertTriangle, Loader2, Search,
  CheckCheck, Check, Smile,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useChatInterno, type ChatConversa, type ChatUsuario, type ChatMensagem } from '@/hooks/useChatInterno';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

const QUICK_EMOJIS = ['👍', '❤️', '😊', '👋', '🙏', '✅'];

// ─── Lista de usuários/conversas ───────────────────────────
function ListaConversas({
  usuarios, conversas, onSelect, search, setSearch,
}: {
  usuarios: ChatUsuario[];
  conversas: ChatConversa[];
  onSelect: (user: ChatUsuario) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  // Sort: conversations with messages first, then by unread count
  const conversasComUsuarios = conversas
    .filter(c => c.outro_usuario)
    .sort((a, b) => {
      if (a.urgente_nao_lida && !b.urgente_nao_lida) return -1;
      if (!a.urgente_nao_lida && b.urgente_nao_lida) return 1;
      if (a.nao_lidas > 0 && b.nao_lidas === 0) return -1;
      if (a.nao_lidas === 0 && b.nao_lidas > 0) return 1;
      return 0;
    });

  const idsComConversa = new Set(conversasComUsuarios.map(c => c.outro_usuario?.id).filter(Boolean));
  const semConversa = usuarios.filter(u => !idsComConversa.has(u.id));

  const filtrados = search
    ? usuarios.filter(u => u.nome.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
            placeholder="Buscar usuário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1.5">
          {/* Search results */}
          {search && (
            <>
              {filtrados.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhum usuário encontrado
                </div>
              ) : filtrados.map(u => (
                <UserButton key={u.id} user={u} onSelect={onSelect} />
              ))}
            </>
          )}

          {/* Normal view: conversations then other users */}
          {!search && (
            <>
              {conversasComUsuarios.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
                    Conversas recentes
                  </p>
                  {conversasComUsuarios.map(c => (
                    <button
                      key={c.id}
                      onClick={() => c.outro_usuario && onSelect(c.outro_usuario)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all text-left group',
                        c.urgente_nao_lida
                          ? 'bg-destructive/5 hover:bg-destructive/10 border border-destructive/20'
                          : c.nao_lidas > 0
                          ? 'bg-primary/5 hover:bg-primary/10'
                          : 'hover:bg-muted/60',
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          {c.outro_usuario?.avatar_url && (
                            <AvatarImage src={c.outro_usuario.avatar_url} />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {getInitials(c.outro_usuario?.nome ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            'text-sm truncate',
                            c.nao_lidas > 0 ? 'font-bold' : 'font-medium',
                          )}>
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
                            {c.urgente_nao_lida && '🔴 '}
                            {c.preview || 'Sem mensagens'}
                          </p>
                          {c.nao_lidas > 0 && (
                            <Badge className={cn(
                              'h-5 min-w-[20px] flex items-center justify-center px-1.5 text-[10px] font-bold shrink-0',
                              c.urgente_nao_lida
                                ? 'bg-destructive text-destructive-foreground'
                                : 'bg-primary text-primary-foreground',
                            )}>
                              {c.nao_lidas}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {semConversa.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 mt-2">
                    Equipe
                  </p>
                  {semConversa.map(u => (
                    <UserButton key={u.id} user={u} onSelect={onSelect} />
                  ))}
                </>
              )}

              {conversasComUsuarios.length === 0 && semConversa.length === 0 && (
                <div className="text-center py-10 px-4">
                  <MessageCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum membro da equipe encontrado
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Convide sua equipe para começar a conversar
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function UserButton({ user, onSelect }: { user: ChatUsuario; onSelect: (u: ChatUsuario) => void }) {
  return (
    <button
      onClick={() => onSelect(user)}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
    >
      <Avatar className="h-9 w-9 shrink-0">
        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {getInitials(user.nome)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user.nome}</p>
        <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
      </div>
    </button>
  );
}

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
      <span className="text-[10px] font-medium text-muted-foreground bg-card px-2">{label}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ─── Visualização de conversa ──────────────────────────────
function ViewConversa({
  conversa,
  mensagens,
  currentUserId,
  loading,
  onBack,
  onEnviar,
}: {
  conversa: ChatConversa;
  mensagens: ChatMensagem[];
  currentUserId: string;
  loading: boolean;
  onBack: () => void;
  onEnviar: (texto: string, urgente: boolean) => void;
}) {
  const [texto, setTexto] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  // Group messages by date
  const groupedMessages: { date: string; msgs: ChatMensagem[] }[] = [];
  mensagens.forEach(m => {
    const dateKey = format(new Date(m.created_at), 'yyyy-MM-dd');
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === dateKey) {
      last.msgs.push(m);
    } else {
      groupedMessages.push({ date: dateKey, msgs: [m] });
    }
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b bg-card/80 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label="Voltar para conversas" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9 shrink-0">
          {conversa.outro_usuario?.avatar_url && (
            <AvatarImage src={conversa.outro_usuario.avatar_url} />
          )}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {getInitials(outroNome)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{outroNome}</p>
          <p className="text-[10px] text-muted-foreground">
            {conversa.outro_usuario?.email}
          </p>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-3 py-2" ref={scrollRef}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Carregando mensagens...</p>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="text-center py-10">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium">Nenhuma mensagem</p>
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
                        'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
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
      <div className="p-2.5 border-t bg-card/80 backdrop-blur-sm space-y-1.5">
        {/* Quick emoji bar */}
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
                  'flex items-center justify-center h-8 w-8 rounded-full transition-colors shrink-0',
                  urgente
                    ? 'bg-destructive/10 text-destructive'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {urgente ? 'Remover urgência' : 'Marcar como urgente'}
            </TooltipContent>
          </Tooltip>

          <button
            onClick={() => setShowEmojis(s => !s)}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-full transition-colors shrink-0',
              showEmojis
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>

          <Input
            ref={inputRef}
            className="flex-1 h-9 text-sm rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
            placeholder="Mensagem..."
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
              'h-9 w-9 shrink-0 rounded-full transition-all',
              texto.trim()
                ? 'bg-primary text-primary-foreground scale-100'
                : 'bg-muted text-muted-foreground scale-95',
            )}
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
          >
            {enviando
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Panel Principal ──────────────────────────────────
export function ChatPanel() {
  const { user } = useSupabaseAuth();
  const [aberto, setAberto] = useState(false);
  const [search, setSearch] = useState('');
  const {
    usuarios, conversas, mensagens, conversaAtiva, setConversaAtiva,
    loading, totalNaoLidas, iniciarConversa, enviarMensagem, fetchMensagens,
  } = useChatInterno();

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

  if (!user) return null;

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="icon"
          className={cn(
            'h-14 w-14 rounded-full shadow-xl relative transition-all duration-300',
            aberto && 'rotate-0',
            totalNaoLidas > 0 && !aberto && 'animate-bounce',
          )}
          onClick={() => {
            setAberto(o => !o);
            if (aberto) {
              setConversaAtiva(null);
              setSearch('');
            }
          }}
        >
          <AnimatePresence mode="wait">
            {aberto ? (
              <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X className="h-5 w-5" />
              </motion.div>
            ) : (
              <motion.div key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <MessageCircle className="h-5 w-5" />
              </motion.div>
            )}
          </AnimatePresence>
          {totalNaoLidas > 0 && !aberto && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-destructive text-[11px] font-bold text-white flex items-center justify-center shadow-md"
            >
              {totalNaoLidas > 9 ? '9+' : totalNaoLidas}
            </motion.span>
          )}
        </Button>
      </div>

      {/* Panel */}
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'fixed z-50 bg-card border shadow-2xl flex flex-col overflow-hidden',
              // Mobile: full screen
              'bottom-0 right-0 w-full h-[100dvh] rounded-none',
              // Desktop: floating panel
              'sm:bottom-[88px] sm:right-6 sm:w-96 sm:h-[520px] sm:rounded-2xl',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground">
              <div className="flex items-center gap-2.5">
                <MessageCircle className="h-5 w-5" />
                <span className="font-bold text-sm">Chat Interno</span>
                {totalNaoLidas > 0 && (
                  <Badge className="bg-white/20 text-white border-white/30 text-[10px] h-5 px-2 font-bold">
                    {totalNaoLidas}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary-foreground hover:bg-white/10 rounded-full sm:hidden"
                aria-label="Fechar chat"
                onClick={() => setAberto(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {conversaAtiva ? (
                  <motion.div
                    key="conversa"
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 40, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <ViewConversa
                      conversa={conversaAtiva}
                      mensagens={mensagens}
                      currentUserId={user.id}
                      loading={loading}
                      onBack={() => setConversaAtiva(null)}
                      onEnviar={enviarMensagem}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="lista"
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -40, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <ListaConversas
                      usuarios={usuarios}
                      conversas={conversas}
                      onSelect={handleSelectUsuario}
                      search={search}
                      setSearch={setSearch}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
