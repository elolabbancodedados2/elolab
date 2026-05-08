/**
 * CID10 Diagnosis Selector Component
 * Para seleção estruturada de diagnósticos
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Trash2, Plus, Search } from 'lucide-react';
import { searchCID10, getCID10ByCode, CID10_REFERENCE } from '@/lib/cid10Database';
import type { CID10Code } from '@/lib/cid10Database';

export interface DiagnosisEntry {
  codigo: string;
  descricao: string;
  tipo: 'principal' | 'secundario' | 'diferencial';
  confirmado?: boolean;
}

interface CID10DiagnosisSelectorProps {
  value: DiagnosisEntry[];
  onChange: (diagnoses: DiagnosisEntry[]) => void;
  diagnosticoPrincipalCod?: string;
}

export function CID10DiagnosisSelector({
  value,
  onChange,
  diagnosticoPrincipalCod,
}: CID10DiagnosisSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'principal' | 'secundario' | 'diferencial'>('principal');
  const [open, setOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<CID10Code[]>([]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setSearchResults(searchCID10(query));
    } else {
      setSearchResults([]);
    }
  }, []);

  const handleSelect = (code: CID10Code) => {
    // Verificar se já existe
    if (value.some(d => d.codigo === code.codigo)) {
      return;
    }

    const newDiagnosis: DiagnosisEntry = {
      codigo: code.codigo,
      descricao: code.nome,
      tipo: selectedType,
      confirmado: selectedType === 'principal',
    };

    onChange([...value, newDiagnosis]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemove = (codigo: string) => {
    onChange(value.filter(d => d.codigo !== codigo));
  };

  const handleTypeChange = (codigo: string, newType: DiagnosisEntry['tipo']) => {
    onChange(
      value.map(d =>
        d.codigo === codigo ? { ...d, tipo: newType, confirmado: newType === 'principal' } : d
      )
    );
  };

  const handleConfirm = (codigo: string) => {
    onChange(
      value.map(d =>
        d.codigo === codigo ? { ...d, confirmado: !d.confirmado } : d
      )
    );
  };

  const principalDiagnosis = value.find(d => d.tipo === 'principal');
  const secondaryDiagnoses = value.filter(d => d.tipo === 'secundario');
  const differentialDiagnoses = value.filter(d => d.tipo === 'diferencial');

  return (
    <div className="space-y-6">
      {/* Buscador e seletor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Diagnóstico
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Search className="mr-2 h-4 w-4" />
                    {searchQuery || 'Buscar diagnóstico...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Digite código CID-10 ou nome..." value={searchQuery} onValueChange={handleSearch} />
                    <CommandList>
                      {searchResults.length === 0 && searchQuery ? (
                        <CommandEmpty>Nenhum diagnóstico encontrado</CommandEmpty>
                      ) : null}
                      {searchResults.slice(0, 15).map(code => (
                        <CommandItem
                          key={code.codigo}
                          value={code.codigo}
                          onSelect={() => {
                            handleSelect(code);
                            setOpen(false);
                          }}
                          disabled={value.some(d => d.codigo === code.codigo)}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">{code.codigo} - {code.nome}</div>
                            {code.descricao && <div className="text-xs text-muted-foreground">{code.descricao}</div>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Select value={selectedType} onValueChange={(v: any) => setSelectedType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="principal">Principal</SelectItem>
                <SelectItem value="secundario">Secundário</SelectItem>
                <SelectItem value="diferencial">Diferencial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Diagnóstico Principal */}
      {principalDiagnosis && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-sm">🎯 Diagnóstico Principal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Badge className="mb-2 bg-green-600">Principal</Badge>
                <p className="font-semibold">{principalDiagnosis.codigo} - {principalDiagnosis.descricao}</p>
                <p className="text-xs text-muted-foreground mt-1">Diagnóstico confirmado e principal do paciente</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemove(principalDiagnosis.codigo)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnósticos Secundários */}
      {secondaryDiagnoses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">📋 Diagnósticos Secundários ({secondaryDiagnoses.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {secondaryDiagnoses.map(diagnosis => (
              <div key={diagnosis.codigo} className="flex items-start justify-between gap-3 p-3 rounded-lg border">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Secundário</Badge>
                    {diagnosis.confirmado && <Badge variant="secondary" className="text-xs">✓ Confirmado</Badge>}
                  </div>
                  <p className="font-medium">{diagnosis.codigo} - {diagnosis.descricao}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={diagnosis.confirmado ? 'default' : 'outline'}
                    onClick={() => handleConfirm(diagnosis.codigo)}
                    className="text-xs"
                  >
                    {diagnosis.confirmado ? '✓ Confirmado' : 'Confirmar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(diagnosis.codigo)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Diagnósticos Diferenciais */}
      {differentialDiagnoses.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Diagnósticos Diferenciais ({differentialDiagnoses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {differentialDiagnoses.map(diagnosis => (
              <div key={diagnosis.codigo} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-orange-200">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-orange-600">Diferencial</Badge>
                  </div>
                  <p className="font-medium text-sm">{diagnosis.codigo} - {diagnosis.descricao}</p>
                  <p className="text-xs text-muted-foreground">Diagnóstico considerado mas descartado</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(diagnosis.codigo)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {value.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="text-sm">Nenhum diagnóstico adicionado. Use a busca acima para adicionar.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Modal para gerenciar diagnósticos do paciente (comorbidades)
 */
interface ComorbidityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comorbidities: DiagnosisEntry[];
  onSave: (comorbidities: DiagnosisEntry[]) => Promise<void>;
  isLoading?: boolean;
}

export function ComorbidityModal({
  open,
  onOpenChange,
  comorbidities,
  onSave,
  isLoading = false,
}: ComorbidityModalProps) {
  const [localComorbidities, setLocalComorbidities] = useState<DiagnosisEntry[]>(comorbidities);

  const handleSave = async () => {
    await onSave(localComorbidities);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar Comorbidades</DialogTitle>
          <DialogDescription>
            Adicione doenças crônicas ou condições pré-existentes do paciente para melhorar a avaliação clínica.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <CID10DiagnosisSelector
            value={localComorbidities}
            onChange={setLocalComorbidities}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Salvando...' : 'Salvar Comorbidades'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
