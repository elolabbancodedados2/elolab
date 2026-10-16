/** Converts a user-agent string into a short, approximate device label. */
export function describeAccountDevice(userAgent: string | null): string {
  const agent = userAgent?.trim() ?? '';
  if (!agent) return 'Navegador desconhecido · Dispositivo desconhecido';

  const browser = /Edg(?:e|A|iOS)?\//i.test(agent)
    ? 'Edge'
    : /(?:Chrome|CriOS)\//i.test(agent)
      ? 'Chrome'
      : /Firefox\//i.test(agent)
        ? 'Firefox'
        : /Safari\//i.test(agent)
          ? 'Safari'
          : 'Navegador desconhecido';

  const device = /iPad/i.test(agent)
    ? 'iPad'
    : /iPhone|iPod/i.test(agent)
      ? 'iPhone'
      : /Android/i.test(agent)
        ? 'Android'
        : /Windows/i.test(agent)
          ? 'Windows'
          : /Macintosh|Mac OS X/i.test(agent)
            ? 'macOS'
            : /Linux/i.test(agent)
              ? 'Linux'
              : 'Dispositivo desconhecido';

  return `${browser} · ${device}`;
}

export type AccountSessionActivityInput = {
  userId: string | null;
  hasSession: boolean;
  isVisible: boolean;
  userAgent: string | null;
};

export type AccountSessionActivityDependencies = {
  updateLastAccess: (userId: string) => Promise<void>;
  touchSession: (userAgent: string) => Promise<void>;
};

/** Updates per-user and per-session activity only for a visible authenticated tab. */
export async function registerAccountSessionActivity(
  input: AccountSessionActivityInput,
  dependencies: AccountSessionActivityDependencies,
): Promise<boolean> {
  if (!input.userId || !input.hasSession || !input.isVisible) return false;

  const results = await Promise.allSettled([
    dependencies.updateLastAccess(input.userId),
    dependencies.touchSession(input.userAgent ?? ''),
  ]);

  return results.every((result) => result.status === 'fulfilled');
}
