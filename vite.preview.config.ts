// TEMPORÁRIO (pré-visualização do redesign): ignora a pasta de relatórios do Playwright,
// cujos arquivos ficam travados no Windows e derrubam o watcher do Vite. Pode ser apagado.
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import base from './vite.config';

export default defineConfig(async (env: ConfigEnv) => {
  const resolved = (typeof base === 'function' ? await base(env) : base) as UserConfig;
  return mergeConfig(resolved, {
    server: { watch: { ignored: ['**/playwright-report/**', '**/test-results/**'] } },
  });
});
