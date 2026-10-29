export const PRESCRIPTION_TYPES: Record<string, string> = {
  simples: 'Receita Simples',
  controle_especial: 'Controle Especial',
  antimicrobiano: 'Antimicrobiano',
};

export const CERTIFICATE_TYPES: Record<string, string> = {
  comparecimento: 'Comparecimento',
  afastamento: 'Afastamento',
  aptidao: 'Aptidão',
  acompanhante: 'Acompanhante',
};

export type ClinicalTab = 'prescriptions' | 'certificates';

export interface PrescriptionTemplate {
  id: string;
  clinica_id: string | null;
  nome: string;
  tipo: string | null;
  medicamentos: unknown;
  observacoes_gerais: string | null;
  criado_por: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CertificateTemplate {
  id: string;
  clinica_id: string | null;
  nome: string;
  tipo: string | null;
  conteudo: string | null;
  cid: string | null;
  dias_afastamento: number | null;
  criado_por: string | null;
  created_at: string | null;
  updated_at: string | null;
}

