import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../badge';
import { Button } from '../button';
import { overridesBackgroundColor } from '../backgroundOverride';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '../alert-dialog';
import { ConfirmDialog } from '../../ConfirmDialog';

describe('overridesBackgroundColor', () => {
  it('detecta cores de fundo próprias', () => {
    expect(overridesBackgroundColor('mt-1 bg-amber-100 text-amber-800')).toBe(true);
    expect(overridesBackgroundColor('gap-2 bg-destructive text-destructive-foreground')).toBe(true);
    expect(overridesBackgroundColor('bg-[#5B47E0] text-white')).toBe(true);
    expect(overridesBackgroundColor('bg-card/60')).toBe(true);
  });

  it('ignora classes que não definem cor de fundo', () => {
    expect(overridesBackgroundColor(undefined)).toBe(false);
    expect(overridesBackgroundColor('h-10 px-4 hover:bg-primary/90')).toBe(false);
    expect(overridesBackgroundColor('bg-gradient-to-r from-violet-500 to-indigo-500 bg-white')).toBe(false);
    expect(overridesBackgroundColor('bg-[image:var(--gradient-hero)]')).toBe(false);
    expect(overridesBackgroundColor('bg-center bg-cover bg-no-repeat')).toBe(false);
  });
});

describe('Badge e Button com cor de fundo própria', () => {
  it('remove o gradiente padrão do Badge para manter a cor e o contraste definidos pela tela', () => {
    render(<Badge className="bg-amber-100 text-amber-800">Agendado</Badge>);
    const badge = screen.getByText('Agendado');
    expect(badge.className).toContain('bg-none');
    expect(badge.className).not.toContain('bg-[image:var(--gradient-primary)]');
  });

  it('mantém o gradiente do Badge padrão sem cor própria', () => {
    render(<Badge>Novo</Badge>);
    expect(screen.getByText('Novo').className).toContain('bg-[image:var(--gradient-primary)]');
  });

  it('exibe botão destrutivo sem gradiente da marca', () => {
    render(<Button className="bg-destructive text-destructive-foreground">Confirmar estorno</Button>);
    const button = screen.getByRole('button', { name: 'Confirmar estorno' });
    expect(button.className).toContain('bg-none');
    expect(button.className).toContain('bg-destructive');
  });

  it('removes the brand gradient from a destructive AlertDialogAction', async () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm action</AlertDialogTitle>
            <AlertDialogDescription>Check the button background.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction className="bg-destructive text-destructive-foreground">Delete item</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const action = await screen.findByRole('button', { name: 'Delete item' });
    expect(action.className).toContain('bg-none');
    expect(action.className).toContain('bg-destructive');
    expect(action.className).not.toContain('bg-[image:var(--gradient-primary)]');
  });

  it('uses a dark foreground for warning confirmations', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Confirm the warning action"
        description="This action needs a second confirmation."
        confirmLabel="Continue"
        onConfirm={() => {}}
        variant="warning"
      />,
    );
    const action = await screen.findByRole('button', { name: 'Continue' });
    expect(action.className).toContain('bg-warning');
    expect(action.className).toContain('bg-none');
    expect(action.className).toContain('text-warning-foreground');
    expect(action.className).not.toContain('text-primary-foreground');
  });

  it('keeps destructive confirmations on the destructive foreground', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Confirm delete"
        description="This action is irreversible."
        confirmLabel="Delete"
        onConfirm={() => {}}
        variant="destructive"
      />,
    );
    const action = await screen.findByRole('button', { name: 'Delete' });
    expect(action.className).toContain('bg-destructive');
    expect(action.className).toContain('bg-none');
    expect(action.className).toContain('text-destructive-foreground');
  });

  it('não altera variantes que já não usam gradiente', () => {
    render(<Button variant="outline" className="bg-white">Exportar</Button>);
    expect(screen.getByRole('button', { name: 'Exportar' }).className).not.toContain('bg-none');
  });
});
