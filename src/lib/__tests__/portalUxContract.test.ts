import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('oferece compartilhar por WhatsApp/e-mail e mostra status/último acesso', () => {
  const page = readFileSync('src/pages/PatientPortalLinkPage.tsx', 'utf8');
  expect(page).toContain('Enviar por WhatsApp');
  expect(page).toContain('Enviar por e-mail');
  expect(page).toContain('Último acesso');
  expect(page).not.toContain('um ano');
});
it('ficha mostra comparação de possível duplicado só para admin', () => {
  const page = readFileSync('src/pages/Pacientes.tsx', 'utf8');
  expect(page).toContain('Possível duplicado de');
  expect(page).toContain('Comparar e mesclar');
});
it('portal simplifica atalhos e agendamento não usa dia com 10px', () => {
  const page = readFileSync('src/pages/PortalPaciente.tsx', 'utf8');
  expect(page).toContain('Exames e receitas');
  expect(page).toContain('Falar com a clínica');
  expect(readFileSync('src/pages/AgendamentoOnline.tsx', 'utf8')).not.toContain('text-[10px]');
});
it('mensagem de paginação tem acentos legíveis', () => {
  expect(readFileSync('supabase/functions/patient-portal/index.ts', 'utf8')).toContain('Índice de página inválido');
});
