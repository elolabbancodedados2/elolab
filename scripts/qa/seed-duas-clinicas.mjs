// Atalho com o nome usado em docs/operations/ci-banco-efemero.md.
// A implementação está em tests/fixtures/seed-duas-clinicas.ts (Node 24 executa .ts).
import { executarSeed } from '../../tests/fixtures/seed-duas-clinicas.ts';

executarSeed().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : 'Seed falhou.');
  process.exit(1);
});
