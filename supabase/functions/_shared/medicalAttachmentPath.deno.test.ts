import {
  extrairCaminhoAnexoClinico,
  laudoPertenceAoPaciente,
} from "./medicalAttachmentPath.ts";

const pacienteId = "11111111-1111-4111-8111-111111111111";
const outraPessoaId = "22222222-2222-4222-8222-222222222222";
const clinicaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const outraClinicaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const prontuarioId = "33333333-3333-4333-8333-333333333333";
const supabaseUrl = "https://db.example";
const charts = new Set([prontuarioId]);

Deno.test("aceita layouts atuais e legados ligados ao paciente", () => {
  const paths = [
    `exames/${pacienteId}/1712345678_laudo.pdf`,
    `${clinicaId}/${pacienteId}/exame-1712345678.pdf`,
    `${prontuarioId}/laudo-antigo.pdf`,
  ];
  for (const path of paths) {
    if (!laudoPertenceAoPaciente(path, pacienteId, clinicaId, charts)) {
      throw new Error(`Layout válido recusado: ${path}`);
    }
  }
});

Deno.test("recusa caminho de outro paciente ou clínica", () => {
  const paths = [
    `exames/${outraPessoaId}/laudo.pdf`,
    `${outraClinicaId}/${pacienteId}/laudo.pdf`,
    `${clinicaId}/${outraPessoaId}/laudo.pdf`,
    "44444444-4444-4444-8444-444444444444/laudo.pdf",
  ];
  for (const path of paths) {
    if (laudoPertenceAoPaciente(path, pacienteId, clinicaId, charts)) {
      throw new Error(`Caminho fora do escopo aceito: ${path}`);
    }
  }
});

Deno.test("resolve URL interna de Storage sem aceitar URL externa", () => {
  const path = `exames/${pacienteId}/laudo.pdf`;
  const signedUrl =
    `${supabaseUrl}/storage/v1/object/sign/medical-attachments/${path}?token=secret`;
  if (extrairCaminhoAnexoClinico(signedUrl, supabaseUrl) !== path) {
    throw new Error(
      "URL assinada interna não foi resolvida para o caminho do objeto.",
    );
  }
  if (
    extrairCaminhoAnexoClinico(
      "https://other.example/storage/v1/object/sign/medical-attachments/" +
        path,
      supabaseUrl,
    ) !== null
  ) {
    throw new Error("URL de outro host foi aceita.");
  }
});

Deno.test("recusa URL com objeto de outro paciente, traversal ou encoding de separador", () => {
  const foreignPath = `exames/${outraPessoaId}/laudo.pdf`;
  const foreignUrl =
    `${supabaseUrl}/storage/v1/object/sign/medical-attachments/${foreignPath}?token=secret`;
  const traversalUrl =
    `${supabaseUrl}/storage/v1/object/sign/medical-attachments/exames/${pacienteId}/%2e%2e/${outraPessoaId}/laudo.pdf`;
  const encodedSlashUrl =
    `${supabaseUrl}/storage/v1/object/sign/medical-attachments/exames%2f${pacienteId}%2flaudo.pdf`;
  for (const value of [foreignUrl, traversalUrl, encodedSlashUrl]) {
    const path = extrairCaminhoAnexoClinico(value, supabaseUrl);
    if (path && laudoPertenceAoPaciente(path, pacienteId, clinicaId, charts)) {
      throw new Error(`URL malformada ou fora do escopo foi aceita: ${value}`);
    }
  }
});

Deno.test("recusa URL interna fora do bucket privado esperado", () => {
  const value =
    `${supabaseUrl}/storage/v1/object/sign/another-bucket/exames/${pacienteId}/laudo.pdf?token=secret`;
  if (extrairCaminhoAnexoClinico(value, supabaseUrl) !== null) {
    throw new Error("URL de bucket diferente foi aceita.");
  }
});
