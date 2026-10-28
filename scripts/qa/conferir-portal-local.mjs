// Confere se a edge function patient-portal está servida pelo Supabase local
// (habilita os testes do portal em tests/perfis-rbac.spec.ts).
// A implementação está em tests/fixtures/portalEdge.ts (Node 24 executa .ts).
// Uso: QA_SUPABASE_URL=... QA_SUPABASE_ANON_KEY=... node scripts/qa/conferir-portal-local.mjs
import { executarConferenciaPortal } from '../../tests/fixtures/portalEdge.ts';

process.exit(await executarConferenciaPortal());
