import { dateOnlyInTimeZone } from '@/lib/dateOnly';

export interface ClinicalDocumentSearchRow {
  id: string;
  nome_arquivo: string;
  tipo_arquivo: string;
  categoria: string | null;
  descricao: string | null;
  created_at: string | null;
  patient_name: string;
  author_name: string;
}

export interface ClinicalDocumentFilters {
  patient: string;
  type: string;
  author: string;
  from: string;
  to: string;
}

export function filterClinicalDocuments<T extends ClinicalDocumentSearchRow>(
  documents: T[],
  filters: ClinicalDocumentFilters,
): T[] {
  const patient = filters.patient.trim().toLocaleLowerCase('pt-BR');
  const author = filters.author.trim().toLocaleLowerCase('pt-BR');

  return documents.filter((document) => {
    if (patient && !document.patient_name.toLocaleLowerCase('pt-BR').includes(patient)) return false;
    if (filters.type && document.tipo_arquivo !== filters.type) return false;
    if (author && !document.author_name.toLocaleLowerCase('pt-BR').includes(author)) return false;
    if (!document.created_at) return !filters.from && !filters.to;

    const created = dateOnlyInTimeZone(new Date(document.created_at), 'America/Sao_Paulo');
    if (filters.from && created < filters.from) return false;
    if (filters.to && created > filters.to) return false;
    return true;
  });
}
