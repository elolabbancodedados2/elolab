const KEY = 'elolab_portal_aparelho_v1';
let sessionProof: string | undefined;
export function lerAparelhoPortal(): string | undefined {
  try { return localStorage.getItem(KEY) || sessionProof; } catch { return sessionProof; }
}
export function lembrarAparelhoPortal(proof: string) {
  sessionProof = proof;
  try { localStorage.setItem(KEY, proof); } catch { /* Navegador privado: lembrado só nesta aba. */ }
}
export function esquecerAparelhoPortal() {
  sessionProof = undefined;
  try { localStorage.removeItem(KEY); } catch { /* Armazenamento indisponível. */ }
}
