import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DESTRUCTIVE = 'className="bg-destructive text-destructive-foreground hover:bg-destructive/90"';

function actionFor(path: string, label: string) {
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const actions = source.match(/<AlertDialogAction[\s\S]*?<\/AlertDialogAction>/g) ?? [];
  const action = actions.find((candidate) => candidate.includes(label));
  expect(action, `${path}: ${label}`).toBeDefined();
  return action!;
}

describe('confirmações destrutivas usam a cor destrutiva', () => {
  it.each([
    ['src/components/agenda/AppointmentDialog.tsx', 'Confirmar cancelamento'],
    ['src/pages/ListaEspera.tsx', 'Confirmar desistência'],
    ['src/pages/ListaEspera.tsx', "'Remover'"],
    ['src/components/recepcao/AtendimentosEmAberto.tsx', 'Confirmar cancelamento'],
    ['src/pages/PlatformComunicacao.tsx', 'Encerrar agora'],
  ])('%s → %s', (path, label) => {
    expect(actionFor(path, label)).toContain(DESTRUCTIVE);
  });

  it('mantém ações afirmativas no estilo primário', () => {
    expect(actionFor('src/components/agenda/AppointmentDialog.tsx', 'Agendar mesmo assim')).not.toContain('bg-destructive');
  });
});
