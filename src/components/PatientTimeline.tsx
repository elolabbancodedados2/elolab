/**
 * Patient Timeline Component
 * Visualização completa da história clínica do paciente
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Calendar, Pill, FileText, Beaker, AlertCircle, Heart,
  CheckCircle2, Clock, TrendingUp, Paperclip, ChevronDown, ChevronUp,
  Search, Filter,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  id: string;
  type: 'consulta' | 'diagnostico' | 'prescricao' | 'exame' | 'alerta' | 'procedimento' | 'internacao';
  data: Date | string;
  titulo: string;
  descricao?: string;
  detalhe?: string;
  medico?: string;
  status?: 'pendente' | 'concluido' | 'em_progresso' | 'cancelado';
  prioridade?: 'baixa' | 'media' | 'alta' | 'critica';
  icone?: React.ReactNode;
  cor?: string;
  tags?: string[];
  expandavel?: boolean;
}

interface PatientTimelineProps {
  eventos: TimelineEvent[];
  isLoading?: boolean;
  filtroTipo?: string[];
  onEventClick?: (evento: TimelineEvent) => void;
}

const typeConfig: Record<TimelineEvent['type'], { icon: React.ReactNode; cor: string; label: string; bgColor: string }> = {
  consulta: { icon: <Calendar className="h-5 w-5" />, cor: 'text-blue-600', label: 'Consulta', bgColor: 'bg-blue-50 border-blue-200' },
  diagnostico: { icon: <AlertCircle className="h-5 w-5" />, cor: 'text-purple-600', label: 'Diagnóstico', bgColor: 'bg-purple-50 border-purple-200' },
  prescricao: { icon: <Pill className="h-5 w-5" />, cor: 'text-green-600', label: 'Prescrição', bgColor: 'bg-green-50 border-green-200' },
  exame: { icon: <Beaker className="h-5 w-5" />, cor: 'text-orange-600', label: 'Exame', bgColor: 'bg-orange-50 border-orange-200' },
  alerta: { icon: <AlertCircle className="h-5 w-5" />, cor: 'text-red-600', label: 'Alerta', bgColor: 'bg-red-50 border-red-200' },
  procedimento: { icon: <Heart className="h-5 w-5" />, cor: 'text-pink-600', label: 'Procedimento', bgColor: 'bg-pink-50 border-pink-200' },
  internacao: { icon: <FileText className="h-5 w-5" />, cor: 'text-red-700', label: 'Internação', bgColor: 'bg-red-100 border-red-300' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
  media: { label: 'Média', color: 'bg-yellow-100 text-yellow-800' },
  alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
  critica: { label: 'Crítica', color: 'bg-red-100 text-red-800' },
};

const statusConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  pendente: { label: 'Pendente', icon: <Clock className="h-4 w-4" /> },
  concluido: { label: 'Concluído', icon: <CheckCircle2 className="h-4 w-4" /> },
  em_progresso: { label: 'Em Progresso', icon: <TrendingUp className="h-4 w-4" /> },
  cancelado: { label: 'Cancelado', icon: <AlertCircle className="h-4 w-4" /> },
};

function TimelineEventCard({ evento, onEventClick }: { evento: TimelineEvent; onEventClick?: (e: TimelineEvent) => void }) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[evento.type];
  const priorityInfo = evento.prioridade ? priorityConfig[evento.prioridade] : null;
  const statusInfo = evento.status ? statusConfig[evento.status] : null;
  const dataFormatada = new Date(evento.data);

  return (
    <div className="relative">
      {/* Linha vertical */}
      <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200" />

      {/* Card do evento */}
      <div className="ml-20 mb-6">
        <Card className={cn(
          'cursor-pointer transition-all hover:shadow-md',
          config.bgColor,
          expanded && 'ring-2 ring-blue-400'
        )}>
          {/* Ponto na timeline */}
          <div className={cn(
            'absolute -left-8 top-6 h-5 w-5 rounded-full border-4 border-white',
            config.bgColor
          )} />

          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className={cn('p-2 rounded-lg bg-white', config.bgColor)}>
                  <div className={config.cor}>{config.icon}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-semibold">{evento.titulo}</CardTitle>
                    <Badge variant="outline" className="text-xs">{config.label}</Badge>
                    {priorityInfo && <Badge className={cn('text-xs', priorityInfo.color)}>{priorityInfo.label}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(dataFormatada, "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                    {' • '}
                    {formatDistanceToNow(dataFormatada, { locale: ptBR, addSuffix: true })}
                  </p>
                </div>
              </div>

              {/* Status */}
              {statusInfo && (
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {statusInfo.icon}
                  {statusInfo.label}
                </div>
              )}

              {/* Botão expandir */}
              {evento.expandavel && (evento.descricao || evento.detalhe) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardHeader>

          {/* Conteúdo expandível */}
          {expanded && (
            <CardContent className="space-y-3 border-t pt-3">
              {evento.descricao && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm">{evento.descricao}</p>
                </div>
              )}

              {evento.detalhe && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Detalhes</p>
                  <p className="text-sm whitespace-pre-wrap">{evento.detalhe}</p>
                </div>
              )}

              {evento.medico && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Profissional</p>
                  <p className="text-sm">{evento.medico}</p>
                </div>
              )}

              {evento.tags && evento.tags.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {evento.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {evento.type === 'prescricao' && (
                <Button size="sm" variant="outline" className="w-full text-xs">
                  <Pill className="h-3 w-3 mr-1" />
                  Ver Prescrição Completa
                </Button>
              )}

              {evento.type === 'exame' && (
                <Button size="sm" variant="outline" className="w-full text-xs">
                  <Beaker className="h-3 w-3 mr-1" />
                  Ver Resultado
                </Button>
              )}

              {evento.type === 'diagnostico' && (
                <Button size="sm" variant="outline" className="w-full text-xs">
                  <Paperclip className="h-3 w-3 mr-1" />
                  Ver Diagnósticos
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

export function PatientTimeline({
  eventos,
  isLoading = false,
  filtroTipo = [],
  onEventClick,
}: PatientTimelineProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<TimelineEvent['type']>>(new Set());

  // Filtrar e ordenar eventos
  const eventosFiltrados = useMemo(() => {
    let filtered = [...eventos];

    // Filtro por tipo
    if (filtroTipo.length > 0) {
      filtered = filtered.filter(e => filtroTipo.includes(e.type));
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.titulo.toLowerCase().includes(term) ||
        e.descricao?.toLowerCase().includes(term) ||
        e.detalhe?.toLowerCase().includes(term) ||
        e.tags?.some(t => t.toLowerCase().includes(term))
      );
    }

    // Ordenar por data decrescente
    return filtered.sort((a, b) => {
      const dateA = new Date(a.data).getTime();
      const dateB = new Date(b.data).getTime();
      return dateB - dateA;
    });
  }, [eventos, filtroTipo, searchTerm]);

  // Agrupar por tipo
  const eventosPorTipo = useMemo(() => {
    const grouped: Record<TimelineEvent['type'], TimelineEvent[]> = {
      consulta: [],
      diagnostico: [],
      prescricao: [],
      exame: [],
      alerta: [],
      procedimento: [],
      internacao: [],
    };

    eventosFiltrados.forEach(e => {
      grouped[e.type].push(e);
    });

    return grouped;
  }, [eventosFiltrados]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho com filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Histórico Clínico Completo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar em eventos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Resumo de eventos por tipo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(typeConfig).map(([type, config]) => {
              const count = eventosPorTipo[type as TimelineEvent['type']].length;
              return count > 0 ? (
                <div key={type} className="text-xs text-center p-2 rounded-lg bg-gray-50 border">
                  <div className={cn('mb-1', config.cor)}>{config.icon}</div>
                  <p className="font-semibold">{count}</p>
                  <p className="text-muted-foreground">{config.label}</p>
                </div>
              ) : null;
            })}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : eventosFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum evento encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(eventosPorTipo).map(([type, eventosDoTipo]) => {
            if (eventosDoTipo.length === 0) return null;

            const config = typeConfig[type as TimelineEvent['type']];
            const isExpanded = expandedTypes.has(type as TimelineEvent['type']);

            return (
              <div key={type}>
                {/* Cabeçalho da seção */}
                <div
                  className="flex items-center gap-3 mb-4 cursor-pointer group"
                  onClick={() => {
                    const newSet = new Set(expandedTypes);
                    if (isExpanded) {
                      newSet.delete(type as TimelineEvent['type']);
                    } else {
                      newSet.add(type as TimelineEvent['type']);
                    }
                    setExpandedTypes(newSet);
                  }}
                >
                  <div className={cn('p-2 rounded-lg', config.bgColor)}>
                    <div className={config.cor}>{config.icon}</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm group-hover:text-blue-600 transition">{config.label}</h3>
                    <p className="text-xs text-muted-foreground">{eventosDoTipo.length} evento(s)</p>
                  </div>
                  <div className="text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </div>

                {/* Lista de eventos */}
                {isExpanded && (
                  <div className="space-y-2">
                    {eventosDoTipo.map(evento => (
                      <div key={evento.id} onClick={() => onEventClick?.(evento)}>
                        <TimelineEventCard evento={evento} onEventClick={onEventClick} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
