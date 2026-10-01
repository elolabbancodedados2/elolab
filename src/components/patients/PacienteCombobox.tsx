import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useBuscaPacientes, usePacienteResumo, type PacienteResumo } from '@/hooks/useBuscaPacientes';

interface Props {
  value: string | null | undefined;
  onChange: (id: string, paciente: PacienteResumo) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Seletor de paciente com busca no servidor (nome, nome social, CPF, telefone
 * ou e-mail). Substitui os `<Select>` que listavam o cadastro inteiro — com
 * milhares de pacientes eles ficavam lentos e o PostgREST cortava a lista em
 * 1000 sem avisar.
 */
export function PacienteCombobox({ value, onChange, placeholder = 'Nome, CPF ou telefone...', disabled, className, id }: Props) {
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState('');
  const { data, isFetching, isPlaceholderData, isDebouncing, isError, refetch } = useBuscaPacientes(termo, { enabled: open });
  const { data: selecionado } = usePacienteResumo(value);
  const buscando = !isError && (isFetching || isPlaceholderData || isDebouncing);
  // Nunca ofereça um resultado anterior à busca atual: um clique rápido pode
  // associar consulta, exame ou prescrição ao paciente errado.
  const resultados = buscando ? [] : data?.pacientes ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selecionado && 'text-muted-foreground', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{selecionado ? (selecionado.nome_social || selecionado.nome) : placeholder}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(440px,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar paciente..." value={termo} onValueChange={setTermo} />
          <CommandList>
            {buscando ? (
              <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
              </div>
            ) : isError ? (
              <div role="alert" className="space-y-2 px-3 py-4 text-center text-sm text-muted-foreground">
                <p>Não foi possível buscar pacientes.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
              </div>
            ) : resultados.length === 0 ? (
              <CommandEmpty>
                {data?.incompleta ? 'Muitos resultados possíveis. Digite mais caracteres para refinar a busca.' : 'Nenhum paciente encontrado.'}
              </CommandEmpty>
            ) : (
              <CommandGroup heading={termo.trim() ? undefined : 'Cadastrados recentemente'}>
                {resultados.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => { onChange(p.id, p); setOpen(false); setTermo(''); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === p.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.nome_social || p.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[p.cpf && `CPF ${p.cpf}`, p.telefone, p.data_nascimento && new Date(`${p.data_nascimento}T12:00:00`).toLocaleDateString('pt-BR')]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!buscando && resultados.length > 0 && data?.incompleta && (
              <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">
                A busca pode ter mais resultados. Digite mais caracteres para refinar.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
