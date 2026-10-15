const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const SIGNED_OBJECT_PREFIXES = [
  "/storage/v1/object/sign/medical-attachments/",
  "/storage/v1/object/authenticated/medical-attachments/",
  "/storage/v1/object/public/medical-attachments/",
];

function validSegments(path: string): string[] | null {
  if (
    !path || path.length > 1024 || path.startsWith("/") || path.includes("\\")
  ) return null;
  const segments = path.split("/");
  if (
    segments.some((segment) =>
      !SAFE_STORAGE_SEGMENT.test(segment) || segment === "." || segment === ".."
    )
  ) return null;
  return segments;
}

/** Resolve an object path or a URL from this Supabase Storage bucket. */
export function extrairCaminhoAnexoClinico(
  value: unknown,
  supabaseUrl: string,
): string | null {
  if (typeof value !== "string" || !value) return null;
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const base = new URL(supabaseUrl);
    const fileUrl = new URL(value);
    if (
      fileUrl.origin !== base.origin || fileUrl.username || fileUrl.password ||
      fileUrl.hash ||
      /%2f|%5c/i.test(fileUrl.pathname)
    ) return null;

    const prefix = SIGNED_OBJECT_PREFIXES.find((candidate) =>
      fileUrl.pathname.startsWith(candidate)
    );
    if (!prefix) return null;
    const encodedPath = fileUrl.pathname.slice(prefix.length);
    const segments = encodedPath.split("/").map((segment) =>
      decodeURIComponent(segment)
    );
    return segments.join("/");
  } catch {
    return null;
  }
}

/**
 * Accept only known medical-attachments layouts tied to this patient's scope.
 * Service-role Storage clients bypass RLS, so callers must verify ownership.
 */
export function laudoPertenceAoPaciente(
  path: unknown,
  pacienteId: string,
  clinicaId: string,
  prontuarioIds: ReadonlySet<string>,
): path is string {
  if (typeof path !== "string") return false;
  const segments = validSegments(path);
  if (!segments) return false;

  // Current upload convention used by the Exams module.
  if (segments.length === 3 && segments[0] === "exames") {
    return segments[1] === pacienteId;
  }

  // Legacy uploads stored under clinic/patient/file.
  if (segments.length === 3 && segments[0] === clinicaId) {
    return segments[1] === pacienteId;
  }

  // Older clinical attachments stored under prontuario/file. RLS on the
  // patient's chart query determines which chart IDs are eligible here.
  if (segments.length === 2) {
    return prontuarioIds.has(segments[0]);
  }

  return false;
}
