import {
  extrairCaminhoAnexoClinico,
  laudoPertenceAoPaciente,
} from "./medicalAttachmentPath.ts";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface DocumentoPortalSeguro {
  id: string;
  nome: string;
  tipo: string | null;
  categoria: string | null;
  origem: "clinica" | "externo";
  validade_ate: string | null;
  path: string;
}

/** Validate publication, tenant ownership, attachment ownership and private object path before signing. */
export function documentoPortalSeguro(
  publication: unknown,
  pacienteId: string,
  clinicaId: string,
  hoje: string,
  supabaseUrl: string,
): DocumentoPortalSeguro | null {
  if (!publication || typeof publication !== "object") return null;
  const item = publication as Record<string, any>;
  const attachment = item.anexo;
  if (!attachment || typeof attachment !== "object") return null;
  if (!ID.test(pacienteId) || !ID.test(clinicaId) || !DATE_ONLY.test(hoje)) return null;
  if (
    item.publicado !== true || item.paciente_id !== pacienteId ||
    item.clinica_id !== clinicaId || attachment.paciente_id !== pacienteId ||
    attachment.clinica_id !== clinicaId || item.anexo_id !== attachment.id ||
    !ID.test(String(item.anexo_id ?? ""))
  ) return null;
  if (item.origem !== "clinica" && item.origem !== "externo") return null;
  const validity = item.validade_ate;
  if (validity !== null && validity !== undefined) {
    if (typeof validity !== "string" || !DATE_ONLY.test(validity) || validity < hoje) return null;
    const date = new Date(`${validity}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== validity) return null;
  }
  if (typeof attachment.prontuario_id !== "string" || !ID.test(attachment.prontuario_id)) return null;
  const path = extrairCaminhoAnexoClinico(attachment.url_arquivo, supabaseUrl);
  if (!laudoPertenceAoPaciente(path, pacienteId, clinicaId, new Set([attachment.prontuario_id]))) return null;
  if (typeof attachment.nome_arquivo !== "string" || !attachment.nome_arquivo.trim()) return null;

  return {
    id: attachment.id,
    nome: attachment.nome_arquivo,
    tipo: typeof attachment.tipo_arquivo === "string" ? attachment.tipo_arquivo : null,
    categoria: typeof attachment.categoria === "string" ? attachment.categoria : null,
    origem: item.origem,
    validade_ate: validity ?? null,
    path,
  };
}

/** Return only portal-safe metadata and the short-lived signed URL; never return the private object path. */
export function montarRespostaDocumentoPortal(
  document: DocumentoPortalSeguro,
  signedUrl: string,
  geradoEm: string,
  expiraEm: string,
  supabaseUrl: string,
): Record<string, string | null> | null {
  if (!signedUrl) return null;
  try {
    const url = new URL(signedUrl);
    const expires = new Date(expiraEm);
    const generated = new Date(geradoEm);
    if (
      url.origin !== new URL(supabaseUrl).origin || url.protocol !== "https:" || url.username || url.password || url.hash ||
      expires.valueOf() - generated.valueOf() !== 300_000
    ) return null;
    const encodedPath = encodeURI(document.path).replace(/#/g, "%23");
    if (!url.pathname.includes(`/storage/v1/object/sign/medical-attachments/${encodedPath}`)) return null;
  } catch {
    return null;
  }
  return {
    id: document.id,
    nome: document.nome,
    tipo: document.tipo,
    categoria: document.categoria,
    origem: document.origem,
    validade_ate: document.validade_ate,
    url: signedUrl,
    link_expira_em: expiraEm,
  };
}

export async function assinarDocumentosPortal(
  publications: unknown[],
  pacienteId: string,
  clinicaId: string,
  hoje: string,
  supabaseUrl: string,
  criarLinkAssinado: (path: string, validadeSegundos: number) => Promise<{ signedUrl?: string; error?: unknown }>,
  agora: Date = new Date(),
): Promise<Record<string, string | null>[]> {
  const documentos: Record<string, string | null>[] = [];
  for (const publication of publications) {
    const document = documentoPortalSeguro(publication, pacienteId, clinicaId, hoje, supabaseUrl);
    if (!document) continue;
    try {
      const { signedUrl, error } = await criarLinkAssinado(document.path, 300);
      if (error || !signedUrl) continue;
      const geradoEm = agora.toISOString();
      const expiraEm = new Date(agora.getTime() + 300_000).toISOString();
      const resposta = montarRespostaDocumentoPortal(document, signedUrl, geradoEm, expiraEm, supabaseUrl);
      if (resposta) documentos.push(resposta);
    } catch {
      // A falha de storage não deve divulgar detalhes internos nem interromper os demais documentos.
    }
  }
  return documentos;
}
