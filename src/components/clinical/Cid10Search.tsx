import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Cid10 {
  id: string;
  codigo: string;
  descricao: string;
  categoria: string | null;
}

interface Cid10SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function Cid10Search({ value, onChange, placeholder = "Buscar CID-10...", className }: Cid10SearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Cid10[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCids, setSelectedCids] = useState<Cid10[]>([]);

  /**
   * A tabela `cid10` nunca foi carregada: a migration que a criou não trouxe
   * nenhum código. Toda busca voltava vazia e a tela dizia "Nenhum CID
   * encontrado" — o médico entendia que tinha errado o termo e tentava de novo,
   * indefinidamente, num catálogo que não existe.
   *
   * Saber que está vazia muda a mensagem: o problema não é a busca dele.
   */
  const [catalogoVazio, setCatalogoVazio] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase
      .from('cid10')
      .select('id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (ativo && !error) setCatalogoVazio((count ?? 0) === 0);
      });
    return () => { ativo = false; };
  }, []);

  // Parse initial value to extract CIDs (only on mount or when value changes externally)
  useEffect(() => {
    if (value) {
      const cidMatches = value.match(/[A-Z]\d{2}(\.\d)?/g);
      if (cidMatches) {
        fetchCidDetails(cidMatches);
      }
    }
  }, [value]);

  const fetchCidDetails = async (codes: string[]) => {
    const { data } = await supabase
      .from('cid10')
      .select('*')
      .in('codigo', codes);
    
    if (data) {
      setSelectedCids(data as Cid10[]);
    }
  };

  const searchCids = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cid10')
        .select('*')
        .or(`codigo.ilike.%${query}%,descricao.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      setResults((data as Cid10[]) || []);
    } catch (error) {
      console.error('Erro ao buscar CID-10:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchCids(search);
    }, 300);

    return () => clearTimeout(debounce);
  }, [search, searchCids]);

  const handleSelect = (cid: Cid10) => {
    const isAlreadySelected = selectedCids.some(c => c.codigo === cid.codigo);
    
    if (isAlreadySelected) {
      const newSelected = selectedCids.filter(c => c.codigo !== cid.codigo);
      setSelectedCids(newSelected);
      updateValue(newSelected);
    } else {
      const newSelected = [...selectedCids, cid];
      setSelectedCids(newSelected);
      updateValue(newSelected);
    }
    
    setSearch('');
  };

  const updateValue = (cids: Cid10[]) => {
    if (cids.length === 0) {
      onChange('');
    } else {
      const formattedValue = cids.map(c => `${c.codigo} - ${c.descricao}`).join('; ');
      onChange(formattedValue);
    }
  };

  const removeCid = (codigo: string) => {
    const newSelected = selectedCids.filter(c => c.codigo !== codigo);
    setSelectedCids(newSelected);
    updateValue(newSelected);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              className="pl-9 pr-10"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>
                {catalogoVazio
                  ? "A tabela de CID-10 está vazia — nenhum código foi carregado no sistema ainda. Não é a sua busca: avise o administrador da plataforma."
                  : search.length < 2
                  ? "Digite pelo menos 2 caracteres para buscar..."
                  : "Nenhum CID encontrado."
                }
              </CommandEmpty>
              <CommandGroup heading="Resultados">
                {results.map((cid) => {
                  const isSelected = selectedCids.some(c => c.codigo === cid.codigo);
                  return (
                    <CommandItem
                      key={cid.id}
                      value={cid.codigo}
                      onSelect={() => handleSelect(cid)}
                      className={cn(
                        "cursor-pointer",
                        isSelected && "bg-primary/10"
                      )}
                    >
                      <div className="flex items-start gap-2 w-full">
                        <Badge variant="outline" className="shrink-0 font-mono">
                          {cid.codigo}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{cid.descricao}</p>
                          {cid.categoria && (
                            <p className="text-xs text-muted-foreground">{cid.categoria}</p>
                          )}
                        </div>
                        {isSelected && (
                          <span className="text-primary text-xs">✓</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected CIDs */}
      {selectedCids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCids.map((cid) => (
            <Badge
              key={cid.codigo}
              variant="secondary"
              className="pl-2 pr-1 py-1 flex items-center gap-1"
            >
              <span className="font-mono font-semibold">{cid.codigo}</span>
              <span className="max-w-[150px] truncate">{cid.descricao}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-destructive/20"
                onClick={() => removeCid(cid.codigo)}
              >
                ×
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
