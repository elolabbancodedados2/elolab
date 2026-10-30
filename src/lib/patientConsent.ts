import { formatWithDatePreference as format } from '@/lib/datePreference';

export interface Consentimento {
  id: string;
  tipo_consentimento: string;
  versao_termo: string;
  aceito: boolean;
  data_aceite: string | null;
  revogado: boolean;
  data_revogacao: string | null;
  motivo_revogacao: string | null;
}

export const TIPOS_CONSENTIMENTO = [
  {
    tipo: 'tratamento_dados',
    titulo: 'Tratamento de Dados Pessoais',
    descricao: 'Autorizo o tratamento dos meus dados pessoais para fins de atendimento médico, conforme a Lei Geral de Proteção de Dados (LGPD).',
  },
  {
    tipo: 'compartilhamento_convenio',
    titulo: 'Compartilhamento com Convênio',
    descricao: 'Autorizo o compartilhamento dos meus dados com o convênio de saúde para fins de faturamento e autorização de procedimentos.',
  },
  {
    tipo: 'comunicacao_marketing',
    titulo: 'Comunicações e Marketing',
    descricao: 'Autorizo o recebimento de comunicações sobre novos serviços, lembretes de consultas e mensagens de aniversário.',
  },
];

export const TERMO_LGPD = `
TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS

Em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD), este termo visa registrar a manifestação livre, informada e inequívoca do titular dos dados pessoais.

1. DADOS COLETADOS
Serão coletados dados pessoais necessários para a prestação de serviços de saúde, incluindo:
- Dados de identificação (nome, CPF, RG, data de nascimento)
- Dados de contato (telefone, e-mail, endereço)
- Dados de saúde (histórico médico, exames, prescrições)
- Dados de convênio (número da carteira, plano)

2. FINALIDADE DO TRATAMENTO
Os dados serão utilizados exclusivamente para:
- Prestação de serviços de saúde
- Agendamento e gestão de consultas
- Emissão de documentos médicos
- Faturamento e cobrança
- Comunicação sobre atendimentos

3. COMPARTILHAMENTO DE DADOS
Os dados poderão ser compartilhados com:
- Operadoras de planos de saúde (quando aplicável)
- Laboratórios e clínicas para exames
- Órgãos reguladores de saúde
- Autoridades judiciais (quando exigido por lei)

4. DIREITOS DO TITULAR
O paciente tem direito a:
- Solicitar acesso aos seus dados
- Corrigir dados incompletos ou incorretos
- Solicitar anonimização ou exclusão de dados
- Revogar este consentimento a qualquer momento

5. ARMAZENAMENTO E SEGURANÇA
Os dados são armazenados de forma segura, com acesso restrito a profissionais autorizados, pelo período mínimo exigido por lei (20 anos para prontuários médicos).

Versão do Termo: 1.0
Data de Vigência: ${format(new Date(), 'dd/MM/yyyy')}
`;
