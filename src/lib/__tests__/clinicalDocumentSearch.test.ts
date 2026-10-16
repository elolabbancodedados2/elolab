import { describe, expect, it } from 'vitest';
import { filterClinicalDocuments, type ClinicalDocumentSearchRow } from '@/lib/clinicalDocumentSearch';

const documents: ClinicalDocumentSearchRow[] = [
  { id: '1', nome_arquivo: 'hemograma.pdf', tipo_arquivo: 'application/pdf', categoria: 'exame', descricao: null, created_at: '2026-10-10T12:00:00-03:00', patient_name: 'João da Silva', author_name: 'Ana Costa' },
  { id: '2', nome_arquivo: 'foto.png', tipo_arquivo: 'image/png', categoria: 'imagem', descricao: null, created_at: '2026-10-12T12:00:00-03:00', patient_name: 'Maria Souza', author_name: 'Bruno Lima' },
  { id: '3', nome_arquivo: 'laudo.pdf', tipo_arquivo: 'application/pdf', categoria: 'laudo', descricao: null, created_at: '2026-10-15T12:00:00-03:00', patient_name: 'João da Silva', author_name: 'Bruno Lima' },
];

describe('filterClinicalDocuments', () => {
  it('combina paciente, tipo, autor e intervalo de datas', () => {
    expect(filterClinicalDocuments(documents, {
      patient: 'joão', type: 'application/pdf', author: 'ana', from: '2026-10-10', to: '2026-10-10',
    }).map(({ id }) => id)).toEqual(['1']);
  });

  it('mantém todos os resultados quando os filtros estão vazios', () => {
    expect(filterClinicalDocuments(documents, { patient: '', type: '', author: '', from: '', to: '' })).toEqual(documents);
  });

  it('não inclui datas fora do intervalo nem datas ausentes em uma busca por período', () => {
    const withMissingDate = [...documents, { ...documents[0], id: '4', created_at: null }];
    expect(filterClinicalDocuments(withMissingDate, {
      patient: '', type: '', author: '', from: '2026-10-11', to: '2026-10-14',
    })).toEqual([documents[1]]);
  });

  it('usa o dia de São Paulo para documentos próximos da meia-noite UTC', () => {
    const document = { ...documents[0], created_at: '2026-10-11T02:00:00.000Z' };
    expect(filterClinicalDocuments([document], {
      patient: '', type: '', author: '', from: '2026-10-10', to: '2026-10-10',
    })).toEqual([document]);
  });
});
