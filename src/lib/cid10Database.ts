/**
 * CID-10 Database - Diagnósticos Clínicos
 * Biblioteca de referência de códigos CID-10 mais comuns
 */

export interface CID10Code {
  codigo: string;
  nome: string;
  descricao?: string;
  categoria: string;
}

// CID-10 - Principais diagnósticos por categoria
export const CID10_REFERENCE: Record<string, CID10Code[]> = {
  // Capítulo I: A00–B99 Doenças Infecciosas e Parasitárias
  INFECTIOUS: [
    { codigo: 'A00', nome: 'Cólera', categoria: 'A00–B99', descricao: 'Cólera devido a Vibrio cholerae' },
    { codigo: 'A01', nome: 'Febre tifóide e paratifoide', categoria: 'A00–B99' },
    { codigo: 'A02', nome: 'Salmonelose', categoria: 'A00–B99' },
    { codigo: 'A03', nome: 'Shigelose', categoria: 'A00–B99' },
    { codigo: 'A04', nome: 'Infecção por E. coli', categoria: 'A00–B99' },
    { codigo: 'A05', nome: 'Outras intoxicações bacterianas', categoria: 'A00–B99' },
    { codigo: 'A06', nome: 'Amebíase', categoria: 'A00–B99' },
    { codigo: 'A07', nome: 'Outras doenças infecciosas do intestino', categoria: 'A00–B99' },
    { codigo: 'A08', nome: 'Gastroenterite viral', categoria: 'A00–B99' },
    { codigo: 'A09', nome: 'Diarréia e gastroenterite de origem infecciosa', categoria: 'A00–B99' },
    { codigo: 'A15', nome: 'Tuberculose respiratória', categoria: 'A00–B99' },
    { codigo: 'A19', nome: 'Tuberculose miliar', categoria: 'A00–B99' },
    { codigo: 'B20', nome: 'Doença pelo HIV/AIDS', categoria: 'A00–B99' },
  ],

  // Capítulo II: C00–D49 Neoplasias
  NEOPLASM: [
    { codigo: 'C34', nome: 'Neoplasia maligna da laringe', categoria: 'C00–D49' },
    { codigo: 'C50', nome: 'Neoplasia maligna da mama', categoria: 'C00–D49' },
    { codigo: 'C61', nome: 'Neoplasia maligna da próstata', categoria: 'C00–D49' },
    { codigo: 'C80', nome: 'Neoplasia maligna, localização não especificada', categoria: 'C00–D49' },
    { codigo: 'D10', nome: 'Neoplasia benigna da boca', categoria: 'C00–D49' },
  ],

  // Capítulo III: D50–D89 Doenças do Sangue
  BLOOD: [
    { codigo: 'D50', nome: 'Anemia por deficiência de ferro', categoria: 'D50–D89' },
    { codigo: 'D51', nome: 'Anemia por deficiência de vitamina B12', categoria: 'D50–D89' },
    { codigo: 'D52', nome: 'Anemia por deficiência de folato', categoria: 'D50–D89' },
    { codigo: 'D55', nome: 'Anemia hemolítica hereditária', categoria: 'D50–D89' },
    { codigo: 'D56', nome: 'Talassemia', categoria: 'D50–D89' },
  ],

  // Capítulo IV: E00–E89 Doenças Endócrinas
  ENDOCRINE: [
    { codigo: 'E01', nome: 'Hipotireoidismo por deficiência de iodo', categoria: 'E00–E89' },
    { codigo: 'E03', nome: 'Outros tipos de hipotireoidismo', categoria: 'E00–E89' },
    { codigo: 'E04', nome: 'Bócio não-tóxico', categoria: 'E00–E89' },
    { codigo: 'E05', nome: 'Tireotoxicose', categoria: 'E00–E89' },
    { codigo: 'E06', nome: 'Tireoidite', categoria: 'E00–E89' },
    { codigo: 'E10', nome: 'Diabetes mellitus tipo 1', categoria: 'E00–E89' },
    { codigo: 'E11', nome: 'Diabetes mellitus tipo 2', categoria: 'E00–E89' },
    { codigo: 'E12', nome: 'Diabetes mellitus relacionado à desnutrição', categoria: 'E00–E89' },
    { codigo: 'E13', nome: 'Outros tipos de diabetes mellitus', categoria: 'E00–E89' },
  ],

  // Capítulo V: F00–F99 Transtornos Mentais
  MENTAL: [
    { codigo: 'F10', nome: 'Transtornos mentais por álcool', categoria: 'F00–F99' },
    { codigo: 'F20', nome: 'Esquizofrenia', categoria: 'F00–F99' },
    { codigo: 'F32', nome: 'Episódio depressivo', categoria: 'F00–F99' },
    { codigo: 'F33', nome: 'Transtorno depressivo recorrente', categoria: 'F00–F99' },
    { codigo: 'F41', nome: 'Transtornos de ansiedade', categoria: 'F00–F99' },
    { codigo: 'F43', nome: 'Reação ao estresse grave e transtornos de adaptação', categoria: 'F00–F99' },
  ],

  // Capítulo VI: G00–G99 Doenças do Sistema Nervoso
  NERVOUS: [
    { codigo: 'G03', nome: 'Meningite', categoria: 'G00–G99' },
    { codigo: 'G10', nome: 'Coréia de Huntington', categoria: 'G00–G99' },
    { codigo: 'G20', nome: 'Doença de Parkinson', categoria: 'G00–G99' },
    { codigo: 'G30', nome: 'Doença de Alzheimer', categoria: 'G00–G99' },
    { codigo: 'G35', nome: 'Esclerose múltipla', categoria: 'G00–G99' },
    { codigo: 'G40', nome: 'Epilepsia', categoria: 'G00–G99' },
    { codigo: 'G50', nome: 'Transtornos do nervo trigêmeo', categoria: 'G00–G99' },
  ],

  // Capítulo VII: H00–H59 Doenças do Olho
  EYE: [
    { codigo: 'H10', nome: 'Conjuntivite', categoria: 'H00–H59' },
    { codigo: 'H25', nome: 'Catarata relacionada à idade', categoria: 'H00–H59' },
    { codigo: 'H26', nome: 'Outras cataratas', categoria: 'H00–H59' },
    { codigo: 'H40', nome: 'Glaucoma', categoria: 'H00–H59' },
    { codigo: 'H52', nome: 'Transtornos de refração e acomodação', categoria: 'H00–H59' },
  ],

  // Capítulo VIII: H60–H95 Doenças do Ouvido
  EAR: [
    { codigo: 'H61', nome: 'Inflamação do conduto auditivo externo', categoria: 'H60–H95' },
    { codigo: 'H66', nome: 'Otite média', categoria: 'H60–H95' },
    { codigo: 'H70', nome: 'Mastoidite', categoria: 'H60–H95' },
    { codigo: 'H80', nome: 'Otosclerose', categoria: 'H60–H95' },
  ],

  // Capítulo IX: I00–I99 Doenças do Aparelho Circulatório
  CIRCULATORY: [
    { codigo: 'I10', nome: 'Hipertensão essencial (primária)', categoria: 'I00–I99' },
    { codigo: 'I11', nome: 'Hipertensão renal', categoria: 'I00–I99' },
    { codigo: 'I12', nome: 'Nefropatia hipertensiva', categoria: 'I00–I99' },
    { codigo: 'I13', nome: 'Hipertensão renal e cardíaca', categoria: 'I00–I99' },
    { codigo: 'I20', nome: 'Angina', categoria: 'I00–I99' },
    { codigo: 'I21', nome: 'Infarto agudo do miocárdio', categoria: 'I00–I99' },
    { codigo: 'I22', nome: 'Infarto do miocárdio recorrente', categoria: 'I00–I99' },
    { codigo: 'I25', nome: 'Doença isquêmica crônica do coração', categoria: 'I00–I99' },
    { codigo: 'I30', nome: 'Pericardite aguda', categoria: 'I00–I99' },
    { codigo: 'I31', nome: 'Doença pericárdica', categoria: 'I00–I99' },
    { codigo: 'I50', nome: 'Insuficiência cardíaca', categoria: 'I00–I99' },
    { codigo: 'I60', nome: 'Hemorragia subaracnóidea', categoria: 'I00–I99' },
    { codigo: 'I61', nome: 'Hemorragia intracraniana', categoria: 'I00–I99' },
    { codigo: 'I63', nome: 'Infarto cerebral', categoria: 'I00–I99' },
    { codigo: 'I64', nome: 'Acidente vascular cerebral não especificado', categoria: 'I00–I99' },
    { codigo: 'I70', nome: 'Aterosclerose', categoria: 'I00–I99' },
  ],

  // Capítulo X: J00–J99 Doenças do Aparelho Respiratório
  RESPIRATORY: [
    { codigo: 'J00', nome: 'Resfriado comum', categoria: 'J00–J99' },
    { codigo: 'J01', nome: 'Sinusite aguda', categoria: 'J00–J99' },
    { codigo: 'J02', nome: 'Faringite aguda', categoria: 'J00–J99' },
    { codigo: 'J03', nome: 'Amigdalite aguda', categoria: 'J00–J99' },
    { codigo: 'J04', nome: 'Laringite aguda', categoria: 'J00–J99' },
    { codigo: 'J05', nome: 'Crupe e epiglotite aguda', categoria: 'J00–J99' },
    { codigo: 'J06', nome: 'Infecção aguda não especificada das vias respiratórias superiores', categoria: 'J00–J99' },
    { codigo: 'J10', nome: 'Influenza', categoria: 'J00–J99' },
    { codigo: 'J11', nome: 'Influenza causada por vírus identificado', categoria: 'J00–J99' },
    { codigo: 'J12', nome: 'Pneumonia viral', categoria: 'J00–J99' },
    { codigo: 'J13', nome: 'Pneumonia causada por Streptococcus pneumoniae', categoria: 'J00–J99' },
    { codigo: 'J18', nome: 'Pneumonia não especificada', categoria: 'J00–J99' },
    { codigo: 'J20', nome: 'Bronquite aguda', categoria: 'J00–J99' },
    { codigo: 'J21', nome: 'Bronquiolite aguda', categoria: 'J00–J99' },
    { codigo: 'J40', nome: 'Bronquite crônica', categoria: 'J00–J99' },
    { codigo: 'J41', nome: 'Enfisema', categoria: 'J00–J99' },
    { codigo: 'J44', nome: 'Doença pulmonar obstrutiva crônica', categoria: 'J00–J99' },
    { codigo: 'J45', nome: 'Asma', categoria: 'J00–J99' },
  ],

  // Capítulo XI: K00–K95 Doenças do Aparelho Digestivo
  DIGESTIVE: [
    { codigo: 'K05', nome: 'Gengivite e doenças periodontais', categoria: 'K00–K95' },
    { codigo: 'K20', nome: 'Esofagite', categoria: 'K00–K95' },
    { codigo: 'K21', nome: 'Refluxo gastroesofágico', categoria: 'K00–K95' },
    { codigo: 'K25', nome: 'Úlcera gástrica', categoria: 'K00–K95' },
    { codigo: 'K26', nome: 'Úlcera duodenal', categoria: 'K00–K95' },
    { codigo: 'K27', nome: 'Úlcera péptica', categoria: 'K00–K95' },
    { codigo: 'K29', nome: 'Gastrite e duodenite', categoria: 'K00–K95' },
    { codigo: 'K35', nome: 'Apendicite aguda', categoria: 'K00–K95' },
    { codigo: 'K40', nome: 'Hérnia inguinal', categoria: 'K00–K95' },
    { codigo: 'K42', nome: 'Hérnia umbilical', categoria: 'K00–K95' },
    { codigo: 'K43', nome: 'Hérnia ventral', categoria: 'K00–K95' },
    { codigo: 'K50', nome: 'Doença de Crohn', categoria: 'K00–K95' },
    { codigo: 'K51', nome: 'Colite ulcerativa', categoria: 'K00–K95' },
    { codigo: 'K55', nome: 'Isquemia mesentérica', categoria: 'K00–K95' },
    { codigo: 'K57', nome: 'Diverticulose', categoria: 'K00–K95' },
    { codigo: 'K59', nome: 'Disfunção do intestino', categoria: 'K00–K95' },
    { codigo: 'K70', nome: 'Doença alcoólica do fígado', categoria: 'K00–K95' },
    { codigo: 'K71', nome: 'Doença tóxica do fígado', categoria: 'K00–K95' },
    { codigo: 'K73', nome: 'Hepatite crônica', categoria: 'K00–K95' },
    { codigo: 'K74', nome: 'Cirrose hepática', categoria: 'K00–K95' },
    { codigo: 'K80', nome: 'Cálculos biliares', categoria: 'K00–K95' },
    { codigo: 'K81', nome: 'Colecistite', categoria: 'K00–K95' },
  ],

  // Capítulo XII: L00–L99 Doenças da Pele
  SKIN: [
    { codigo: 'L01', nome: 'Impetigo', categoria: 'L00–L99' },
    { codigo: 'L02', nome: 'Abscesso cutâneo', categoria: 'L00–L99' },
    { codigo: 'L03', nome: 'Celulite', categoria: 'L00–L99' },
    { codigo: 'L20', nome: 'Dermatite atópica', categoria: 'L00–L99' },
    { codigo: 'L21', nome: 'Dermatite seborreica', categoria: 'L00–L99' },
    { codigo: 'L23', nome: 'Dermatite alérgica de contato', categoria: 'L00–L99' },
    { codigo: 'L24', nome: 'Dermatite irritante de contato', categoria: 'L00–L99' },
    { codigo: 'L25', nome: 'Dermatite de contato não especificada', categoria: 'L00–L99' },
    { codigo: 'L30', nome: 'Outras dermatites', categoria: 'L00–L99' },
    { codigo: 'L40', nome: 'Psoríase', categoria: 'L00–L99' },
    { codigo: 'L50', nome: 'Urticária', categoria: 'L00–L99' },
    { codigo: 'L60', nome: 'Afeções das unhas', categoria: 'L00–L99' },
  ],

  // Capítulo XIII: M00–M99 Doenças do Aparelho Musculoesquelético
  MUSCULOSKELETAL: [
    { codigo: 'M05', nome: 'Artrite reumatóide', categoria: 'M00–M99' },
    { codigo: 'M10', nome: 'Gota', categoria: 'M00–M99' },
    { codigo: 'M15', nome: 'Poliartrósicas', categoria: 'M00–M99' },
    { codigo: 'M16', nome: 'Coxartrose', categoria: 'M00–M99' },
    { codigo: 'M17', nome: 'Gonartrose', categoria: 'M00–M99' },
    { codigo: 'M19', nome: 'Outras artroses', categoria: 'M00–M99' },
    { codigo: 'M20', nome: 'Deformidades adquiridas dos dedos', categoria: 'M00–M99' },
    { codigo: 'M25', nome: 'Outras transtornos articulares', categoria: 'M00–M99' },
    { codigo: 'M40', nome: 'Cifose', categoria: 'M00–M99' },
    { codigo: 'M41', nome: 'Escoliose', categoria: 'M00–M99' },
    { codigo: 'M42', nome: 'Espondilartrose', categoria: 'M00–M99' },
    { codigo: 'M43', nome: 'Outras espondiopatias', categoria: 'M00–M99' },
    { codigo: 'M50', nome: 'Cervicalgia', categoria: 'M00–M99' },
    { codigo: 'M54', nome: 'Dorsalgia', categoria: 'M00–M99' },
  ],

  // Capítulo XIV: N00–N99 Doenças do Aparelho Genitourinário
  GENITOURINARY: [
    { codigo: 'N01', nome: 'Síndrome nefrítica rápida progressiva', categoria: 'N00–N99' },
    { codigo: 'N02', nome: 'Hematúria recorrente e persistente', categoria: 'N00–N99' },
    { codigo: 'N03', nome: 'Hematúria crônica', categoria: 'N00–N99' },
    { codigo: 'N05', nome: 'Síndrome nefrótica', categoria: 'N00–N99' },
    { codigo: 'N18', nome: 'Insuficiência renal crônica', categoria: 'N00–N99' },
    { codigo: 'N19', nome: 'Insuficiência renal não especificada', categoria: 'N00–N99' },
    { codigo: 'N39', nome: 'Outros transtornos do sistema urinário', categoria: 'N00–N99' },
    { codigo: 'N40', nome: 'Hiperplasia da próstata', categoria: 'N00–N99' },
    { codigo: 'N41', nome: 'Inflamação da próstata', categoria: 'N00–N99' },
  ],

  // Capítulo XV: O00–O99 Gravidez, Parto e Puerpério
  PREGNANCY: [
    { codigo: 'O00', nome: 'Gravidez ectópica', categoria: 'O00–O99' },
    { codigo: 'O01', nome: 'Mola hidatiforme', categoria: 'O00–O99' },
    { codigo: 'O02', nome: 'Outros abortos precoces anormais', categoria: 'O00–O99' },
    { codigo: 'O03', nome: 'Aborto espontâneo', categoria: 'O00–O99' },
    { codigo: 'O04', nome: 'Aborto provocado por motivos legais', categoria: 'O00–O99' },
    { codigo: 'O10', nome: 'Hipertensão pré-existente', categoria: 'O00–O99' },
    { codigo: 'O11', nome: 'Hipertensão pré-existente com pré-eclampsia', categoria: 'O00–O99' },
    { codigo: 'O13', nome: 'Hipertensão gestacional', categoria: 'O00–O99' },
    { codigo: 'O14', nome: 'Pré-eclampsia', categoria: 'O00–O99' },
    { codigo: 'O15', nome: 'Eclampsia', categoria: 'O00–O99' },
  ],
};

// Função de busca
export function searchCID10(query: string): CID10Code[] {
  const q = query.toLowerCase().trim();
  const results: CID10Code[] = [];
  const maxResults = 20;

  // Buscar em todas as categorias
  for (const category of Object.values(CID10_REFERENCE)) {
    for (const code of category) {
      if (results.length >= maxResults) break;

      // Busca por código exato ou parcial
      if (code.codigo.toLowerCase().includes(q)) {
        results.push(code);
        continue;
      }

      // Busca por nome
      if (code.nome.toLowerCase().includes(q)) {
        results.push(code);
        continue;
      }

      // Busca por descrição
      if (code.descricao?.toLowerCase().includes(q)) {
        results.push(code);
      }
    }

    if (results.length >= maxResults) break;
  }

  return results;
}

// Obter código CID-10 por código
export function getCID10ByCode(codigo: string): CID10Code | null {
  for (const category of Object.values(CID10_REFERENCE)) {
    const found = category.find(c => c.codigo === codigo);
    if (found) return found;
  }
  return null;
}

// Obter todos os diagnósticos de uma categoria
export function getCID10Category(categoryKey: keyof typeof CID10_REFERENCE): CID10Code[] {
  return CID10_REFERENCE[categoryKey] || [];
}
