// ── Catálogo de exames; TUSS só quando confirmado na tabela da ANS ──
export interface ExameCatalogo {
  nome: string;
  tuss: string;
  categoria: string;
}

export const CATALOGO_EXAMES: ExameCatalogo[] = [
  // Hematologia
  { nome: 'Hemograma Completo', tuss: '40304361', categoria: 'Hematologia' },
  { nome: 'Coagulograma', tuss: '40304922', categoria: 'Hematologia' },
  { nome: 'VHS', tuss: '40304370', categoria: 'Hematologia' },
  { nome: 'Reticulócitos', tuss: '40304558', categoria: 'Hematologia' },
  { nome: 'Tipagem Sanguínea (ABO/Rh)', tuss: '40403173', categoria: 'Hematologia' },
  { nome: 'Eletroforese de Hemoglobina', tuss: '40304353', categoria: 'Hematologia' },
  { nome: 'TAP (Tempo de Protrombina)', tuss: '40304590', categoria: 'Hematologia' },
  { nome: 'TTPA', tuss: '40304639', categoria: 'Hematologia' },
  { nome: 'INR', tuss: '', categoria: 'Hematologia' },
  { nome: 'Fibrinogênio', tuss: '', categoria: 'Hematologia' },
  { nome: 'D-Dímero', tuss: '', categoria: 'Hematologia' },
  // Bioquímica
  { nome: 'Glicemia em Jejum', tuss: '40302040', categoria: 'Bioquímica' },
  { nome: 'Hemoglobina Glicada (HbA1c)', tuss: '40302733', categoria: 'Bioquímica' },
  { nome: 'Curva Glicêmica (TOTG)', tuss: '40301680', categoria: 'Bioquímica' },
  { nome: 'Colesterol Total', tuss: '40301605', categoria: 'Bioquímica' },
  { nome: 'Colesterol HDL', tuss: '40301583', categoria: 'Bioquímica' },
  { nome: 'Colesterol LDL', tuss: '40301591', categoria: 'Bioquímica' },
  { nome: 'Perfil Lipídico Completo', tuss: '40302750', categoria: 'Bioquímica' },
  { nome: 'Triglicerídeos', tuss: '40302547', categoria: 'Bioquímica' },
  { nome: 'Ureia', tuss: '40302580', categoria: 'Bioquímica' },
  { nome: 'Creatinina', tuss: '40301630', categoria: 'Bioquímica' },
  { nome: 'Ácido Úrico', tuss: '40301150', categoria: 'Bioquímica' },
  { nome: 'TGO (AST)', tuss: '40302504', categoria: 'Bioquímica' },
  { nome: 'TGP (ALT)', tuss: '40302512', categoria: 'Bioquímica' },
  { nome: 'Gama GT', tuss: '40301990', categoria: 'Bioquímica' },
  { nome: 'Fosfatase Alcalina', tuss: '40301885', categoria: 'Bioquímica' },
  { nome: 'Bilirrubinas (Total e Frações)', tuss: '40301397', categoria: 'Bioquímica' },
  { nome: 'Proteínas Totais e Frações', tuss: '40302385', categoria: 'Bioquímica' },
  { nome: 'Albumina', tuss: '40301222', categoria: 'Bioquímica' },
  { nome: 'PCR (Proteína C Reativa)', tuss: '40308391', categoria: 'Bioquímica' },
  { nome: 'PCR Ultrassensível', tuss: '', categoria: 'Bioquímica' },
  { nome: 'Ferro Sérico', tuss: '40301842', categoria: 'Bioquímica' },
  { nome: 'Ferritina', tuss: '40316270', categoria: 'Bioquímica' },
  { nome: 'Transferrina', tuss: '40302520', categoria: 'Bioquímica' },
  { nome: 'Sódio', tuss: '40302423', categoria: 'Bioquímica' },
  { nome: 'Potássio', tuss: '40302318', categoria: 'Bioquímica' },
  { nome: 'Cálcio Total', tuss: '40301400', categoria: 'Bioquímica' },
  { nome: 'Cálcio Iônico', tuss: '40301419', categoria: 'Bioquímica' },
  { nome: 'Magnésio', tuss: '40302237', categoria: 'Bioquímica' },
  { nome: 'Fósforo', tuss: '40301931', categoria: 'Bioquímica' },
  { nome: 'Amilase', tuss: '40301281', categoria: 'Bioquímica' },
  { nome: 'Lipase', tuss: '40302199', categoria: 'Bioquímica' },
  { nome: 'CPK (Creatinoquinase)', tuss: '40301648', categoria: 'Bioquímica' },
  { nome: 'CPK-MB', tuss: '', categoria: 'Bioquímica' },
  { nome: 'Troponina I', tuss: '', categoria: 'Bioquímica' },
  { nome: 'LDH', tuss: '40301729', categoria: 'Bioquímica' },
  { nome: 'Lactato', tuss: '', categoria: 'Bioquímica' },
  // Hormônios
  { nome: 'TSH', tuss: '40316521', categoria: 'Hormônios' },
  { nome: 'T4 Livre', tuss: '40316491', categoria: 'Hormônios' },
  { nome: 'T3 Total', tuss: '40316556', categoria: 'Hormônios' },
  { nome: 'FSH', tuss: '40316289', categoria: 'Hormônios' },
  { nome: 'LH', tuss: '40316335', categoria: 'Hormônios' },
  { nome: 'Estradiol (E2)', tuss: '40316246', categoria: 'Hormônios' },
  { nome: 'Progesterona', tuss: '40316408', categoria: 'Hormônios' },
  { nome: 'Testosterona Total', tuss: '40316513', categoria: 'Hormônios' },
  { nome: 'Prolactina', tuss: '40316416', categoria: 'Hormônios' },
  { nome: 'Cortisol Basal', tuss: '40316190', categoria: 'Hormônios' },
  { nome: 'Insulina Basal', tuss: '40316360', categoria: 'Hormônios' },
  { nome: 'PTH (Paratormônio)', tuss: '40305465', categoria: 'Hormônios' },
  { nome: 'Vitamina D (25-OH)', tuss: '40302830', categoria: 'Hormônios' },
  { nome: 'Beta-HCG Quantitativo', tuss: '', categoria: 'Hormônios' },
  { nome: 'GH', tuss: '40316203', categoria: 'Hormônios' },
  { nome: 'IGF-1', tuss: '40316440', categoria: 'Hormônios' },
  { nome: 'DHEA-S', tuss: '', categoria: 'Hormônios' },
  // Urinálise
  { nome: 'EAS (Urina Tipo I)', tuss: '', categoria: 'Urinálise' },
  { nome: 'Urocultura', tuss: '40310213', categoria: 'Urinálise' },
  { nome: 'Microalbuminúria', tuss: '', categoria: 'Urinálise' },
  { nome: 'Proteinúria de 24h', tuss: '', categoria: 'Urinálise' },
  { nome: 'Clearance de Creatinina', tuss: '', categoria: 'Urinálise' },
  // Sorologia
  { nome: 'Anti-HIV (1 e 2)', tuss: '', categoria: 'Sorologia' },
  { nome: 'VDRL', tuss: '', categoria: 'Sorologia' },
  { nome: 'HBsAg (Hepatite B)', tuss: '', categoria: 'Sorologia' },
  { nome: 'Anti-HBs', tuss: '', categoria: 'Sorologia' },
  { nome: 'Anti-HBc Total', tuss: '', categoria: 'Sorologia' },
  { nome: 'Anti-HCV (Hepatite C)', tuss: '', categoria: 'Sorologia' },
  { nome: 'Toxoplasmose (IgG e IgM)', tuss: '', categoria: 'Sorologia' },
  { nome: 'Rubéola (IgG e IgM)', tuss: '', categoria: 'Sorologia' },
  { nome: 'CMV (IgG e IgM)', tuss: '', categoria: 'Sorologia' },
  { nome: 'Dengue (IgG e IgM)', tuss: '', categoria: 'Sorologia' },
  { nome: 'Covid-19 PCR (RT-PCR)', tuss: '', categoria: 'Sorologia' },
  // Imunologia
  { nome: 'FAN (Fator Antinuclear)', tuss: '', categoria: 'Imunologia' },
  { nome: 'Fator Reumatoide (FR)', tuss: '', categoria: 'Imunologia' },
  { nome: 'Anti-CCP', tuss: '', categoria: 'Imunologia' },
  { nome: 'ASLO', tuss: '', categoria: 'Imunologia' },
  { nome: 'Complemento C3', tuss: '', categoria: 'Imunologia' },
  { nome: 'Complemento C4', tuss: '', categoria: 'Imunologia' },
  { nome: 'IgE Total', tuss: '', categoria: 'Imunologia' },
  // Marcadores Tumorais
  { nome: 'PSA Total', tuss: '40316149', categoria: 'Marcadores Tumorais' },
  { nome: 'PSA Livre', tuss: '40316130', categoria: 'Marcadores Tumorais' },
  { nome: 'CEA', tuss: '40316122', categoria: 'Marcadores Tumorais' },
  { nome: 'CA 125', tuss: '40316378', categoria: 'Marcadores Tumorais' },
  { nome: 'CA 19-9', tuss: '', categoria: 'Marcadores Tumorais' },
  { nome: 'CA 15-3', tuss: '', categoria: 'Marcadores Tumorais' },
  { nome: 'AFP (Alfafetoproteína)', tuss: '40316068', categoria: 'Marcadores Tumorais' },
  // Vitaminas
  { nome: 'Vitamina B12', tuss: '', categoria: 'Vitaminas' },
  { nome: 'Ácido Fólico', tuss: '', categoria: 'Vitaminas' },
  { nome: 'Vitamina A', tuss: '', categoria: 'Vitaminas' },
  { nome: 'Zinco', tuss: '40313328', categoria: 'Vitaminas' },
  // Fezes
  { nome: 'Parasitológico de Fezes (EPF)', tuss: '', categoria: 'Fezes' },
  { nome: 'Sangue Oculto nas Fezes', tuss: '', categoria: 'Fezes' },
  { nome: 'Coprocultura', tuss: '', categoria: 'Fezes' },
  { nome: 'Calprotectina Fecal', tuss: '', categoria: 'Fezes' },
  // Imagem - Raio-X
  { nome: 'Raio-X Tórax PA', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Tórax PA e Perfil', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Coluna Cervical', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Coluna Lombar', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Abdome', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Seios da Face', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Joelho', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Ombro', tuss: '', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Mão', tuss: '', categoria: 'Imagem - RX' },
  // Imagem - Ultrassom
  { nome: 'Ultrassom Abdominal Total', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Pélvico', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Transvaginal', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom de Tireoide', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom de Mama', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Rins e Vias Urinárias', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Obstétrico', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Morfológico', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Doppler de Carótidas', tuss: '', categoria: 'Imagem - US' },
  { nome: 'Doppler Venoso MMII', tuss: '', categoria: 'Imagem - US' },
  // Imagem - Tomografia
  { nome: 'TC Crânio (sem contraste)', tuss: '', categoria: 'Imagem - TC' },
  { nome: 'TC Crânio (com contraste)', tuss: '', categoria: 'Imagem - TC' },
  { nome: 'TC Tórax', tuss: '', categoria: 'Imagem - TC' },
  { nome: 'TC Abdome Total', tuss: '', categoria: 'Imagem - TC' },
  { nome: 'TC Coluna Lombar', tuss: '', categoria: 'Imagem - TC' },
  { nome: 'Angiotomografia Coronariana', tuss: '', categoria: 'Imagem - TC' },
  { nome: 'Angiotomografia Pulmonar', tuss: '', categoria: 'Imagem - TC' },
  // Imagem - Ressonância
  { nome: 'RM Crânio', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Coluna Cervical', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Coluna Lombar', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Joelho', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Ombro', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Pelve', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Mama', tuss: '', categoria: 'Imagem - RM' },
  { nome: 'RM Cardíaca', tuss: '', categoria: 'Imagem - RM' },
  // Mamografia
  { nome: 'Mamografia Bilateral', tuss: '', categoria: 'Mamografia' },
  { nome: 'Densitometria Óssea', tuss: '', categoria: 'Mamografia' },
  // Cardiologia
  { nome: 'Eletrocardiograma (ECG)', tuss: '40101010', categoria: 'Cardiologia' },
  { nome: 'Ecocardiograma Transtorácico', tuss: '', categoria: 'Cardiologia' },
  { nome: 'Teste Ergométrico', tuss: '40101045', categoria: 'Cardiologia' },
  { nome: 'Holter 24h', tuss: '', categoria: 'Cardiologia' },
  { nome: 'MAPA 24h', tuss: '', categoria: 'Cardiologia' },
  // Endoscopia
  { nome: 'Endoscopia Digestiva Alta', tuss: '', categoria: 'Endoscopia' },
  { nome: 'Colonoscopia', tuss: '', categoria: 'Endoscopia' },
  // Pneumologia
  { nome: 'Espirometria', tuss: '', categoria: 'Pneumologia' },
  { nome: 'Polissonografia', tuss: '', categoria: 'Pneumologia' },
  // Neurologia
  { nome: 'Eletroencefalograma (EEG)', tuss: '', categoria: 'Neurologia' },
  { nome: 'Eletroneuromiografia', tuss: '', categoria: 'Neurologia' },
  // Otorrino
  { nome: 'Audiometria Tonal', tuss: '', categoria: 'Otorrino' },
  { nome: 'Impedanciometria', tuss: '', categoria: 'Otorrino' },
  // Oftalmologia
  { nome: 'Tonometria', tuss: '', categoria: 'Oftalmologia' },
  { nome: 'Campimetria Visual', tuss: '', categoria: 'Oftalmologia' },
  { nome: 'OCT (Tomografia Óptica)', tuss: '', categoria: 'Oftalmologia' },
  // Ginecologia
  { nome: 'Citopatológico (Papanicolau)', tuss: '', categoria: 'Ginecologia' },
  { nome: 'Colposcopia', tuss: '', categoria: 'Ginecologia' },
  // Gasometria
  { nome: 'Gasometria Arterial', tuss: '', categoria: 'Gasometria' },
  // Microbiologia
  { nome: 'Hemocultura', tuss: '', categoria: 'Microbiologia' },
  { nome: 'Cultura de Secreção', tuss: '', categoria: 'Microbiologia' },
  { nome: 'Antibiograma', tuss: '', categoria: 'Microbiologia' },
  { nome: 'BAAR', tuss: '', categoria: 'Microbiologia' },
];

export type TipoCategorizadoExame = 'laboratorial' | 'imagem' | 'ultrassom' | 'cardiologia' | 'endoscopia' | 'outro';

const CATEGORIAS_LABORATORIAIS = new Set([
  'hematologia', 'bioquimica', 'hormonios', 'urinalise', 'sorologia', 'imunologia',
  'marcadores tumorais', 'vitaminas', 'fezes', 'gasometria', 'microbiologia',
]);

const semAcento = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Tipo de cada exame a partir da categoria do catálogo.
 *
 * A guia inteira recebia um único tipo (o padrão era "laboratorial"), então
 * um raio-X pedido junto do hemograma também abria coleta no laboratório.
 * Categoria desconhecida ou personalizada mantém o comportamento antigo.
 */
export function tipoCategorizadoDaCategoria(categoria?: string | null): TipoCategorizadoExame {
  const chave = semAcento(categoria ?? '');
  if (!chave || chave === 'personalizado') return 'laboratorial';
  if (CATEGORIAS_LABORATORIAIS.has(chave)) return 'laboratorial';
  if (chave === 'imagem - us') return 'ultrassom';
  if (chave.startsWith('imagem') || chave === 'mamografia') return 'imagem';
  if (chave === 'cardiologia') return 'cardiologia';
  if (chave === 'endoscopia') return 'endoscopia';
  if (['pneumologia', 'neurologia', 'otorrino', 'oftalmologia', 'ginecologia'].includes(chave)) return 'outro';
  return 'laboratorial';
}

/**
 * Reconstrói o exame do catálogo a partir do texto gravado em `tipo_exame`
 * ("40304361 - Hemograma Completo" ou só o nome). Usado para repetir pedidos.
 */
export function exameDoTipoGravado(tipoExame: string, catalogo: ExameCatalogo[] = CATALOGO_EXAMES): ExameCatalogo {
  const texto = tipoExame.trim();
  const inteiro = catalogo.find(item => semAcento(item.nome) === semAcento(texto));
  if (inteiro) return inteiro;
  const comCodigo = /^([A-Za-z0-9.]+)\s+-\s+(.+)$/.exec(texto);
  const nome = (comCodigo ? comCodigo[2] : texto).trim();
  const tuss = comCodigo ? comCodigo[1] : '';
  const doCatalogo = catalogo.find(item => semAcento(item.nome) === semAcento(nome));
  if (doCatalogo) return doCatalogo;
  return { nome, tuss, categoria: 'Personalizado' };
}
