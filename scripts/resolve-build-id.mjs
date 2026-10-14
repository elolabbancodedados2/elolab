import { execFileSync } from 'node:child_process';

function readGitMetadata() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  return { commit, dirty: Boolean(changes) };
}

export function resolveBuildId({
  env = process.env,
  readGitMetadata: readGit = readGitMetadata,
  now = () => new Date(),
} = {}) {
  const configured = env.APP_BUILD_ID || env.VITE_APP_BUILD_ID;
  if (configured) return configured;
  if (env.GIT_SHA) return env.GIT_SHA;

  try {
    const { commit, dirty } = readGit();
    if (!dirty) return commit;
    return `${commit}-dirty-${now().toISOString().replaceAll(/[-:.]/g, '')}`;
  } catch {
    return `local-${now().toISOString().replaceAll(/[-:.]/g, '')}`;
  }
}
