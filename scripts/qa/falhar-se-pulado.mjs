// Atalho com o nome usado em docs/operations/ci-banco-efemero.md.
// Uso: node scripts/qa/falhar-se-pulado.mjs seguranca.json
import { executarGate } from '../../tests/fixtures/gateSkip.ts';

process.exit(executarGate(process.argv.slice(2)));
