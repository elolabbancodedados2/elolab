import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { 
  ClipboardList, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Pill, 
  TestTube,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface ProtocolStep {
  ordem: number;
  acao: string;
}

interface ProtocolMedication {
  nome: string;
  posologia: string;
}

interface Protocol {
  id: string;
  nome: string;
  condicao: string;
  descricao: string | null;
  passos: ProtocolStep[];
  medicamentos_sugeridos: ProtocolMedication[];
  exames_sugeridos: string[];
  orientacoes: string | null;
  especialidade: string | null;
}

interface ClinicalProtocolsProps {
  onSelectProtocol?: (protocol: Protocol) => void;
  className?: string;
}

export function ClinicalProtocols({ onSelectProtocol, className }: ClinicalProtocolsProps) {
  const { user, profile } = useSupabaseAuth();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: protocols, isLoading } = useQuery({
    queryKey: ['clinical-protocols', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('protocolos_clinicos')
        .select('*')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      return (data || []) as unknown as Protocol[];
    },
    enabled: !!user && !!profile?.clinica_id,
  });

  const filteredProtocols = protocols?.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.condicao.toLowerCase().includes(search.toLowerCase()) ||
    p.especialidade?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Protocolos Clínicos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Protocolos Clínicos
          {protocols && (
            <Badge variant="outline" className="ml-auto">
              {protocols.length} protocolos
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar protocolo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {filteredProtocols?.map((protocol) => (
              <Collapsible
                key={protocol.id}
                open={expandedId === protocol.id}
                onOpenChange={(open) => setExpandedId(open ? protocol.id : null)}
              >
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{protocol.nome}</span>
                          {protocol.especialidade && (
                            <Badge variant="secondary" className="text-xs">
                              {protocol.especialidade}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {protocol.condicao}
                        </p>
                      </div>
                      {expandedId === protocol.id ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-0 space-y-4 border-t">
                      {protocol.descricao && (
                        <p className="text-sm text-muted-foreground pt-4">
                          {protocol.descricao}
                        </p>
                      )}

                      {/* Passos */}
                      {protocol.passos && protocol.passos.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Passos do Protocolo
                          </h4>
                          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                            {protocol.passos
                              .sort((a, b) => a.ordem - b.ordem)
                              .map((passo, idx) => (
                                <li key={idx}>{passo.acao}</li>
                              ))}
                          </ol>
                        </div>
                      )}

                      {/* Medicamentos */}
                      {protocol.medicamentos_sugeridos && protocol.medicamentos_sugeridos.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                            <Pill className="h-4 w-4 text-blue-500" />
                            Medicamentos Sugeridos
                          </h4>
                          <ul className="space-y-1 text-sm">
                            {protocol.medicamentos_sugeridos.map((med, idx) => (
                              <li key={idx} className="flex justify-between">
                                <span className="font-medium">{med.nome}</span>
                                <span className="text-muted-foreground">{med.posologia}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Exames */}
                      {protocol.exames_sugeridos && protocol.exames_sugeridos.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                            <TestTube className="h-4 w-4 text-purple-500" />
                            Exames Sugeridos
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {protocol.exames_sugeridos.map((exame, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {exame}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Orientações */}
                      {protocol.orientacoes && (
                        <div>
                          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-amber-500" />
                            Orientações ao Paciente
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {protocol.orientacoes}
                          </p>
                        </div>
                      )}

                      {onSelectProtocol && (
                        <Button
                          onClick={() => onSelectProtocol(protocol)}
                          className="w-full mt-4"
                        >
                          Aplicar Protocolo
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}

            {filteredProtocols?.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum protocolo encontrado.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
