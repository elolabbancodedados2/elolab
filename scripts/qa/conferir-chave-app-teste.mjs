// Diz se o app em --mode test usa a chave sintética ou a do Supabase local (CLIN-QA-564).
// A implementação está em tests/fixtures/chaveAppTeste.ts (Node 24 executa .ts).
// Uso: node scripts/qa/conferir-chave-app-teste.mjs [http://127.0.0.1:4173]
import { executarConferencia } from '../../tests/fixtures/chaveAppTeste.ts';

process.exit(await executarConferencia(process.argv.slice(2)));
