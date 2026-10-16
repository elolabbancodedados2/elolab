import {
  assinarDocumentosPortal,
  documentoPortalSeguro,
  montarRespostaDocumentoPortal,
} from "./portalDocuments.ts";

const pacienteId = "11111111-1111-4111-8111-111111111111";
const clinicaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const prontuarioId = "33333333-3333-4333-8333-333333333333";
const supabaseUrl = "https://db.example";

function publication(overrides: Record<string, unknown> = {}) {
  return {
    anexo_id: "55555555-5555-4555-8555-555555555555",
    paciente_id: pacienteId,
    clinica_id: clinicaId,
    publicado: true,
    validade_ate: "2027-01-10",
    origem: "clinica",
    anexo: {
      id: "55555555-5555-4555-8555-555555555555",
      paciente_id: pacienteId,
      clinica_id: clinicaId,
      prontuario_id: prontuarioId,
      nome_arquivo: "resultado.pdf",
      tipo_arquivo: "application/pdf",
      categoria: "laudo",
      url_arquivo: `${prontuarioId}/resultado.pdf`,
    },
    ...overrides,
  };
}

Deno.test("prepara somente documento publicado, vigente e do paciente e clínica", () => {
  const document = documentoPortalSeguro(
    publication(),
    pacienteId,
    clinicaId,
    "2026-10-14",
    supabaseUrl,
  );
  if (!document || document.path !== `${prontuarioId}/resultado.pdf`) {
    throw new Error("Documento do próprio paciente deveria estar apto para assinatura.");
  }
});

Deno.test("recusa publicação revogada, expirada ou de outro paciente/clínica", () => {
  const cases = [
    publication({ publicado: false }),
    publication({ validade_ate: "2026-10-13" }),
    publication({ paciente_id: "22222222-2222-4222-8222-222222222222" }),
    publication({ clinica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
    publication({ anexo: { ...publication().anexo, paciente_id: "22222222-2222-4222-8222-222222222222" } }),
  ];
  for (const item of cases) {
    if (documentoPortalSeguro(item, pacienteId, clinicaId, "2026-10-14", supabaseUrl)) {
      throw new Error("Publicação revogada, vencida ou fora do tenant foi aceita.");
    }
  }
});

Deno.test("recusa URL externa, path fora do prontuário/paciente e valores malformados", () => {
  const paths = [
    "https://other.example/private.pdf",
    "exames/22222222-2222-4222-8222-222222222222/laudo.pdf",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/22222222-2222-4222-8222-222222222222/laudo.pdf",
    "../private.pdf",
    `${prontuarioId}/../private.pdf`,
  ];
  for (const path of paths) {
    const item = publication({ anexo: { ...publication().anexo, url_arquivo: path } });
    if (documentoPortalSeguro(item, pacienteId, clinicaId, "2026-10-14", supabaseUrl)) {
      throw new Error(`Path inseguro foi aceito: ${path}`);
    }
  }
});

Deno.test("resposta não vaza path e marca validade do link em cinco minutos", () => {
  const document = documentoPortalSeguro(
    publication({ validade_ate: null }),
    pacienteId,
    clinicaId,
    "2026-10-14",
    supabaseUrl,
  );
  if (!document) throw new Error("Documento vigente deveria ser aceito.");
  const expiresAt = "2026-10-14T15:05:00.000Z";
  const result = montarRespostaDocumentoPortal(
    document,
    `https://db.example/storage/v1/object/sign/medical-attachments/${prontuarioId}/resultado.pdf?token=secret`,
    "2026-10-14T15:00:00.000Z",
    expiresAt,
    supabaseUrl,
  );
  if (!result) throw new Error("URL assinada válida deveria ser aceita.");
  if (result.link_expira_em !== expiresAt || "path" in result || "url_arquivo" in result) {
    throw new Error("Resposta não respeitou o link temporário ou expôs path interno.");
  }
  if (montarRespostaDocumentoPortal(document, "", "2026-10-14T15:00:00.000Z", expiresAt, supabaseUrl) !== null) {
    throw new Error("Assinatura ausente deveria ser rejeitada.");
  }
});

Deno.test("assina somente documentos elegíveis por 300 segundos e ignora falha do Storage", async () => {
  const paths: string[] = [];
  const calls: number[] = [];
  const documents = await assinarDocumentosPortal(
    [
      publication(),
      publication({ publicado: false }),
      publication({ validade_ate: "2026-10-13" }),
    ],
    pacienteId,
    clinicaId,
    "2026-10-14",
    supabaseUrl,
    async (path, expiresIn) => {
      paths.push(path);
      calls.push(expiresIn);
      return {
        signedUrl: `https://db.example/storage/v1/object/sign/medical-attachments/${path}?token=temporary`,
      };
    },
    new Date("2026-10-14T15:00:00.000Z"),
  );
  if (documents.length !== 1 || paths.length !== 1 || calls[0] !== 300) {
    throw new Error("Somente a publicação vigente deveria receber URL assinada por cinco minutos.");
  }
  if (documents[0].link_expira_em !== "2026-10-14T15:05:00.000Z" || "path" in documents[0]) {
    throw new Error("Payload seguro deveria conter expiração sem o path privado.");
  }

  const failed = await assinarDocumentosPortal(
    [publication()],
    pacienteId,
    clinicaId,
    "2026-10-14",
    supabaseUrl,
    async () => ({ error: new Error("private storage details") }),
    new Date("2026-10-14T15:00:00.000Z"),
  );
  if (failed.length !== 0) throw new Error("Falha no Storage não deve produzir link parcial.");
});
