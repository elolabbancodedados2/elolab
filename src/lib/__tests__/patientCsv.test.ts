import { expect, it, vi } from 'vitest';
import { prepararCsvPacientes } from '../patientCsv';

const rows = [{ nome: '=Ana', cpf: '123.456.789-09', telefone: '11999999999' }];
it('recusa não-admin antes de gerar CSV ou auditar', async () => {
  const audit = vi.fn();
  await expect(prepararCsvPacientes(rows, false, false, audit)).rejects.toThrow(/administrador/);
  expect(audit).not.toHaveBeenCalled();
});
it('mascara CPF por padrão e audita quantidade antes de entregar o CSV', async () => {
  const audit = vi.fn().mockResolvedValue(true);
  const csv = await prepararCsvPacientes(rows, true, false, audit);
  expect(csv).toContain('***.***.***-09');
  expect(csv).not.toContain('123.456.789');
  expect(csv).toContain("'=Ana");
  expect(audit).toHaveBeenCalledWith(1, false);
  expect(await prepararCsvPacientes(rows, true, true, audit)).toContain('123.456.789-09');
});
it('não exporta se a auditoria não gravou', async () => {
  await expect(prepararCsvPacientes(rows, true, true, async () => false)).rejects.toThrow(/auditoria/);
});
