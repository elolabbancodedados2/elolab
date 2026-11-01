import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Palette, RefreshCw } from '@/components/icons/elolabIcons';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseQuery, useMedicos } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { ColorCriterion, ColorScheme, PALETTE, useAgendaColorScheme } from '@/components/agenda/hooks/useAgendaColorScheme';
import { nomeMedico } from '@/lib/formatters';
import { STATUSES_AGENDA, TIPOS_FIXOS_CONSULTA } from '@/components/agenda/agendaStatus';
import { cn } from '@/lib/utils';

// Mesma lista do filtro da agenda: antes só 7 status tinham cor configurável.
const STATUS_OPTIONS: { key: string; label: string }[] = STATUSES_AGENDA.map(([key, label]) => ({ key, label }));
const TIPOS_FIXOS_OPTIONS: { key: string; label: string }[] = TIPOS_FIXOS_CONSULTA.map(([key, label]) => ({ key, label }));

type ReturnState = {
  returnTo?: string;
  agendaFilters?: { search?: string; status?: string[]; medicos?: string[] };
};

function isSafeAgendaPath(path: string | undefined): path is string {
  return !!path && (path === '/agenda' || path.startsWith('/agenda?') || path.startsWith('/agenda/'));
}

export default function AgendaColorSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnState = location.state as ReturnState | null;
  const { scheme, setScheme, isLoading: schemeLoading, loadError: schemeLoadError, reload: reloadScheme } = useAgendaColorScheme();
  const [criterion, setCriterion] = useState<ColorCriterion>(scheme.criterion);
  const [map, setMap] = useState<Record<string, string>>(scheme.map);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const { isMedicoOnly, medicoId, refetch: refetchCurrentMedico } = useCurrentMedico();
  const medicosQuery = useMedicos({ suppressGlobalErrorToast: true });
  const conveniosQuery = useSupabaseQuery<{ id: string; nome: string }>('convenios', {
    orderBy: { column: 'nome', ascending: true }, suppressGlobalErrorToast: true,
  });
  const tiposQuery = useSupabaseQuery<{ id: string; nome: string }>('tipos_consulta', {
    orderBy: { column: 'nome', ascending: true }, suppressGlobalErrorToast: true,
  });
  const visibleMedicos = useMemo(
    () => isMedicoOnly && medicoId ? (medicosQuery.data ?? []).filter(medico => medico.id === medicoId) : medicosQuery.data ?? [],
    [isMedicoOnly, medicoId, medicosQuery.data],
  );
  const isDirty = criterion !== scheme.criterion || JSON.stringify(map) !== JSON.stringify(scheme.map);

  useEffect(() => {
    if (!schemeLoading && !schemeLoadError) {
      setCriterion(scheme.criterion);
      setMap(scheme.map);
    }
  }, [scheme, schemeLoading, schemeLoadError]);

  const options = useMemo(() => {
    switch (criterion) {
      case 'status': return STATUS_OPTIONS;
      case 'medico': return visibleMedicos.map(medico => ({ key: medico.id, label: nomeMedico(medico.nome || medico.crm) }));
      case 'convenio': return [{ key: 'particular', label: 'Particular' }, ...(conveniosQuery.data ?? []).map(convenio => ({ key: convenio.id, label: convenio.nome }))];
      case 'tipo': {
        // Os cinco tipos fixos do formulário entram sempre; os cadastrados vêm depois, sem repetir.
        const fixos = new Set(TIPOS_FIXOS_OPTIONS.map(tipo => tipo.key));
        return [
          ...TIPOS_FIXOS_OPTIONS,
          ...(tiposQuery.data ?? []).filter(tipo => !fixos.has(tipo.nome)).map(tipo => ({ key: tipo.nome, label: tipo.nome })),
        ];
      }
    }
  }, [criterion, visibleMedicos, conveniosQuery.data, tiposQuery.data]);

  const returnToAgenda = () => {
    const path = isSafeAgendaPath(returnState?.returnTo) ? returnState.returnTo : '/agenda';
    const state = returnState?.agendaFilters ? { agendaFilters: returnState.agendaFilters } : undefined;
    navigate(path, { state });
  };

  const handleBack = () => {
    if (isDirty) setDiscardOpen(true);
    else returnToAgenda();
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty || saving || schemeLoading || schemeLoadError) return;
    setSaving(true);
    setSaveError('');
    try {
      await setScheme({ criterion, map });
      setSaveSuccess('Esquema de cores salvo. Esta preferência já está aplicada na agenda.');
    } catch {
      setSaveSuccess('');
      setSaveError('Não foi possível salvar as cores. Suas escolhas continuam nesta tela; tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const optionsError = (criterion === 'medico' && (medicosQuery.isError || (isMedicoOnly && !medicoId)))
    || (criterion === 'convenio' && conveniosQuery.isError)
    || (criterion === 'tipo' && tiposQuery.isError);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-6">
      <PageHeader
        title="Personalizar cores da agenda"
        description="Escolha como diferenciar consultas. As cores ficam salvas para sua conta e respeitam a paleta EloLab."
        icon={<Palette />}
        actions={<Button type="button" variant="outline" onClick={handleBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar à agenda</Button>}
      />

      {schemeLoadError && (
        <Alert variant="destructive">
          <AlertTitle>Preferência indisponível</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {schemeLoadError}
            <Button type="button" variant="outline" size="sm" onClick={reloadScheme} className="gap-2"><RefreshCw className="h-4 w-4" />Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}
      {saveError && <Alert variant="destructive"><AlertTitle>Não foi possível salvar</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
      {saveSuccess && <p role="status" className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-foreground">{saveSuccess}</p>}
      {optionsError && (
        <Alert variant="destructive">
          <AlertTitle>Lista de apoio indisponível</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            Atualize os dados para configurar cores por profissional, convênio ou tipo de consulta.
            <Button type="button" variant="outline" size="sm" onClick={() => {
              void medicosQuery.refetch();
              void conveniosQuery.refetch();
              void tiposQuery.refetch();
              void refetchCurrentMedico();
            }} className="gap-2"><RefreshCw className="h-4 w-4" />Atualizar listas</Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={save} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <fieldset disabled={schemeLoading || !!schemeLoadError || saving} className="space-y-5 border-0 p-0">
          {schemeLoading ? (
            <div role="status" className="flex min-h-32 items-center text-sm text-muted-foreground">Carregando esquema salvo…</div>
          ) : (
            <>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="agenda-color-criterion">Colorir consultas por</Label>
                <Select value={criterion} onValueChange={value => { setSaveSuccess(''); setCriterion(value as ColorCriterion); }}>
                  <SelectTrigger id="agenda-color-criterion"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="medico">Profissional</SelectItem>
                    <SelectItem value="convenio">Convênio</SelectItem>
                    <SelectItem value="tipo">Tipo de consulta</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">O rótulo de status permanece visível; a cor atua como apoio visual.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {options.map(option => {
                  const currentColor = map[option.key];
                  const isLegacyColor = !!currentColor && !PALETTE.some(color => color.value === currentColor);
                  const colors = isLegacyColor ? [{ label: 'Cor atual', value: currentColor }, ...PALETTE] : PALETTE;
                  return (
                    <section key={option.key} className="space-y-3 rounded-xl border border-border/80 p-3 sm:p-4" aria-label={option.label}>
                      <h2 className="truncate text-sm font-medium text-foreground">{option.label}</h2>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {colors.map(color => {
                          const selected = currentColor === color.value;
                          const action = color.label === 'Cor atual' ? `Manter cor atual ${color.value}` : `Usar ${color.label}`;
                          return (
                            <button
                              key={color.value}
                              type="button"
                              aria-label={`${action} para ${option.label}`}
                              aria-pressed={selected}
                              onClick={() => { setSaveSuccess(''); setMap(current => ({ ...current, [option.key]: color.value })); }}
                              className={cn('h-11 w-11 rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', selected ? 'border-foreground' : 'border-border/50 hover:border-foreground/40')}
                              style={{ backgroundColor: color.value }}
                              title={color.label}
                            />
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              {options.length === 0 && !optionsError && (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {criterion === 'status' ? 'Nenhum status disponível.' : 'Não há registros ativos para esta categoria.'}
                </p>
              )}
            </>
          )}
        </fieldset>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={!isDirty || saving || schemeLoading || !!schemeLoadError}>
            {saving ? 'Salvando…' : 'Salvar cores'}
          </Button>
        </div>
      </form>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar as cores?</AlertDialogTitle>
            <AlertDialogDescription>As alterações desta tela serão descartadas. O esquema já salvo na sua agenda permanece igual.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={returnToAgenda}>Sair sem salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
