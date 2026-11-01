import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { anosComPagamento, camposFichaPaciente, resumoDeclaracaoIR, secoesLegiveisExportacao } from '@/lib/pdfPacientes';
import { linkModeloWhatsApp, textoModeloWhatsApp } from '@/lib/modelosWhatsAppPaciente';

describe('declaração para o IR', () => {
  const cobrancas = [
    { data: '2025-03-10', status: 'pago', valor_pago: 200, descricao: 'Consulta' },
    { data: '2025-07-01', status: 'parcial', valor_pago: 50.1, descricao: null, categoria: 'Exame' },
    { data: '2025-08-01', status: 'cancelado', valor_pago: 300 },
    { data: '2024-12-31', status: 'pago', valor_pago: '120.5' },
    { data: '2026-01-02', status: 'pendente', valor_pago: 0 },
  ];

  it('lista os anos com pagamento, do mais recente', () => {
    expect(anosComPagamento(cobrancas)).toEqual([2025, 2024]);
  });

  it('soma só o pago do ano, sem cancelados', () => {
    expect(resumoDeclaracaoIR(cobrancas, 2025)).toEqual({
      itens: [
        { data: '2025-03-10', descricao: 'Consulta', valor: 200 },
        { data: '2025-07-01', descricao: 'Exame', valor: 50.1 },
      ],
      total: 250.1,
    });
  });
});

describe('ficha impressa', () => {
  it('monta os campos com CPF completo e idade por extenso', () => {
    const campos = Object.fromEntries(camposFichaPaciente({
      nome: 'Ana Souza', cpf: '12345678909', data_nascimento: '1990-01-01', sexo: 'F', alergias: ['Látex'],
      logradouro: 'Rua A', numero: '10', cidade: 'Santos', estado: 'SP',
    }, 'Particular'));
    expect(campos.CPF).toBe('123.456.789-09');
    expect(campos.Sexo).toBe('Feminino');
    expect(campos.Endereço).toBe('Rua A, 10 · Santos/SP');
    expect(campos.Alergias).toBe('Látex');
    expect(campos.Nascimento).toMatch(/^01\/01\/1990 \(\d+ anos\)$/);
  });
});

describe('exportação LGPD legível', () => {
  it('tira identificadores internos e arquivos e formata datas', () => {
    const secoes = secoesLegiveisExportacao({
      exportacao: { protocolo: 'X' },
      pacientes: [{ id: 'p1', clinica_id: 'c1', nome: 'Ana', cpf: '12345678909', data_nascimento: '1990-01-01', ativo: true }],
      anexos: [{ id: 'a1', conteudo_base64: 'AAAA', nome_arquivo: 'laudo.pdf' }],
      vazios: [],
    });
    expect(secoes.map(s => s.titulo)).toEqual(['Pacientes', 'Anexos']);
    expect(secoes[0].registros[0]).toEqual(['Nome: Ana', 'Cpf: ***.456.789-**', 'Data nascimento: 01/01/1990', 'Ativo: Sim']);
    expect(secoes[1].registros[0]).toEqual(['Nome arquivo: laudo.pdf']);
  });
});

describe('modelos de WhatsApp', () => {
  it('usa o nome social e a clínica', () => {
    expect(textoModeloWhatsApp('confirmar', { nome: 'João Silva', nome_social: 'Joana', clinica: 'Clínica Sol', proximaConsulta: '05/11 às 09:00' }))
      .toBe('Olá, Joana! Aqui é da Clínica Sol. Podemos confirmar sua consulta de 05/11 às 09:00?');
    expect(textoModeloWhatsApp('saudacao', { nome: '' })).toBe('Olá! Aqui é da clínica.');
  });

  it('não monta link sem telefone válido', () => {
    expect(linkModeloWhatsApp(null, 'retorno', { nome: 'Ana' })).toBeNull();
    expect(linkModeloWhatsApp('(11) 98765-4321', 'retorno', { nome: 'Ana' })).toContain('wa.me/');
  });
});
