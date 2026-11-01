import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/Recepcao.tsx', 'utf8');
const encaixe = source.slice(source.indexOf('async function handleEncaixe()'), source.indexOf('// Render', source.indexOf('async function handleEncaixe()')));

describe('status inicial do encaixe da recepção', () => {
  it('cria o agendamento em um estado aceito e deixa o check-in avançá-lo', () => {
    expect(encaixe).toMatch(/\.insert\(\{[\s\S]*?status:\s*'agendado'/);
    expect(encaixe).toMatch(/await handleCheckin\(novo\.id/);
  });

  it('usa o horário escolhido e sugere a próxima vaga do mesmo médico no conflito', () => {
    expect(encaixe).toMatch(/encaixeHora \|\| horaDaClinica\(new Date\(\)\)/);
    expect(encaixe).toMatch(/hora_inicio:\s*horaInicioEncaixe/);
    expect(encaixe).toMatch(/proximaVagaLivre\(\{/);
    expect(encaixe).toMatch(/setSugestaoEncaixe\(sugestao\)/);
    expect(encaixe).not.toMatch(/escolha outro profissional\.'\)/);
  });
});
