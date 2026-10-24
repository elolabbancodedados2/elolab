import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerOfx, previaImportacaoExtrato } from '../extratoBancario';

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>341<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261002120000[-3:BRT]<TRNAMT>150.00<FITID>A1<MEMO>PIX RECEBIDO MARIA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-89,90<FITID>A2<NAME>ALUGUEL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261002<TRNAMT>150.00<FITID>A1<MEMO>PIX RECEBIDO MARIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>10.00<FITID>A3<MEMO>TARIFA &amp; ESTORNO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('leitura de extrato OFX', () => {
  it('lê conta e transações em SGML, com sinal, data e texto', () => {
    const r = lerOfx(OFX_SGML);
    expect(r.conta).toBe('341-12345-6');
    expect(r.transacoes[0]).toEqual({ fitid: 'A1', data: '2026-10-02', valor: 150, descricao: 'PIX RECEBIDO MARIA' });
    expect(r.transacoes[1]).toEqual({ fitid: 'A2', data: '2026-10-03', valor: -89.9, descricao: 'ALUGUEL' });
    expect(r.transacoes[3].descricao).toBe('TARIFA & ESTORNO');
    expect(r.transacoes).toHaveLength(4);
  });

  it('lê OFX em XML e recusa arquivo sem transações', () => {
    const xml = '<OFX><BANKACCTFROM><BANKID>1</BANKID><ACCTID>9</ACCTID></BANKACCTFROM><STMTTRN><DTPOSTED>20261001</DTPOSTED><TRNAMT>5</TRNAMT><FITID>X</FITID><MEMO>Y</MEMO></STMTTRN></OFX>';
    expect(lerOfx(xml).transacoes).toEqual([{ fitid: 'X', data: '2026-10-01', valor: 5, descricao: 'Y' }]);
    expect(() => lerOfx('qualquer coisa')).toThrow(/Nenhuma transação/);
  });
});

describe('prévia da importação', () => {
  const { transacoes } = lerOfx(OFX_SGML);
  const lancamentos = [
    { id: 'l1', tipo: 'receita', descricao: 'Consulta Maria', valor: 150, valor_pago: 150, status: 'pago', data: '2026-10-01', data_pagamento: '2026-10-01', data_vencimento: '2026-10-01' },
    { id: 'l2', tipo: 'despesa', descricao: 'Aluguel', valor: 89.9, valor_pago: null, status: 'pendente', data: '2026-09-20', data_pagamento: null, data_vencimento: '2026-10-10' },
    { id: 'l3', tipo: 'despesa', descricao: 'Outra', valor: 150, valor_pago: 150, status: 'pago', data: '2026-10-02', data_pagamento: '2026-10-02', data_vencimento: null },
  ];

  it('marca repetidas no arquivo e já importadas, e sugere lançamentos por valor, sentido e data', () => {
    const p = previaImportacaoExtrato(transacoes, new Set(['A3']), lancamentos);
    expect(p.map(l => [l.fitid, l.situacao, l.correspondencias.map(c => c.id)])).toEqual([
      ['A1', 'nova', ['l1']],
      ['A2', 'nova', []],
      ['A1', 'repetida_no_arquivo', ['l1']],
      ['A3', 'ja_importada', []],
    ]);
  });
});

describe('migration do extrato bancário', () => {
  const sql = readFileSync('supabase/migrations/20261024134000_importacao_extrato_bancario.sql', 'utf8');
  it('impede duplicidade no banco e não cria lançamentos', () => {
    expect(sql).toMatch(/UNIQUE \(clinica_id, conta, fitid\)/);
    expect(sql).toMatch(/ON CONFLICT \(clinica_id, conta, fitid\) DO NOTHING/);
    expect(sql).not.toMatch(/INSERT INTO public\.lancamentos/);
    expect(sql).toMatch(/can_access_financial\(auth\.uid\(\)\)/);
  });
});
