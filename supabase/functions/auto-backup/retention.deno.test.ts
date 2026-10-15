import { limparBackupsExpirados, type RetentionStorage } from "./retention.ts";

type Entry = { name: string; metadata?: unknown | null; created_at?: string };

function criarStorage(initial: Record<string, Entry[]>, failRemove?: string): {
  storage: RetentionStorage;
  objects: Set<string>;
  offsets: number[];
  removed: string[];
} {
  const directories = new Map(Object.entries(initial));
  const objects = new Set<string>();
  for (const [directory, entries] of directories) {
    const objectDirectory = directory.slice(directory.indexOf(":") + 1);
    for (const entry of entries) {
      if (entry.metadata) {
        objects.add(
          objectDirectory ? `${objectDirectory}/${entry.name}` : entry.name,
        );
      }
    }
  }
  const offsets: number[] = [];
  const removed: string[] = [];

  const storage = {
    from(bucket: string) {
      return {
        async list(path: string, options: { limit: number; offset: number }) {
          const key = `${bucket}:${path}`;
          offsets.push(options.offset);
          const all = directories.get(key) ?? [];
          return {
            data: all.slice(options.offset, options.offset + options.limit),
            error: null,
          };
        },
        async remove(paths: string[]) {
          const successes: Array<{ name: string }> = [];
          for (const path of paths) {
            if (path === failRemove) continue;
            if (objects.delete(path)) {
              removed.push(`${bucket}:${path}`);
              successes.push({ name: path });
            }
          }
          return {
            data: successes,
            error: failRemove && paths.includes(failRemove)
              ? { message: `failed to remove ${failRemove}` }
              : null,
          };
        },
      };
    },
  } as unknown as RetentionStorage;

  return { storage, objects, offsets, removed };
}

const limite = "2026-07-15T00:00:00.000Z";
const vencida = "2026-07-01T10-20-30-000Z";
const recente = "2026-09-01T10-20-30-000Z";

Deno.test("retention removes expired top-level and nested backup files, across pages", async () => {
  const initial: Record<string, Entry[]> = {
    "backups:": [
      { name: "old.json", metadata: {}, created_at: "2026-06-01T00:00:00Z" },
      { name: "recent.json", metadata: {}, created_at: "2026-08-01T00:00:00Z" },
      ...Array.from(
        { length: 1000 },
        (_, i) => ({ name: `filler-${i}`, metadata: {} }),
      ),
    ],
    "backups-arquivos:": [
      { name: vencida, metadata: null },
      { name: recente, metadata: null },
    ],
    [`backups-arquivos:${vencida}`]: [
      { name: "top.pdf", metadata: {} },
      { name: "subfolder", metadata: null },
    ],
    [`backups-arquivos:${vencida}/subfolder`]: [
      { name: "deep.pdf", metadata: {} },
    ],
    [`backups-arquivos:${recente}`]: [
      { name: "keep.pdf", metadata: {} },
    ],
  };
  const { storage, objects, offsets, removed } = criarStorage(initial);

  const result = await limparBackupsExpirados(storage, limite);

  if (result.falhas.length) {
    throw new Error(`unexpected failures: ${result.falhas.join("; ")}`);
  }
  if (result.tentados !== 3 || result.apagados !== 3) {
    throw new Error(
      `expected 3 confirmed deletions, got ${result.tentados} attempted / ${result.apagados} removed`,
    );
  }
  if (
    objects.has("old.json") || objects.has(`${vencida}/top.pdf`) ||
    objects.has(`${vencida}/subfolder/deep.pdf`)
  ) {
    throw new Error("expired leaf objects were not all removed");
  }
  if (!objects.has("recent.json") || !objects.has(`${recente}/keep.pdf`)) {
    throw new Error("a non-expired backup was removed");
  }
  if (!offsets.includes(1000)) {
    throw new Error("the root listing was not paginated");
  }
  if (
    removed.some((path) =>
      path.endsWith(":subfolder") || path.endsWith(`:${vencida}`)
    )
  ) {
    throw new Error(
      "a folder key was passed to remove instead of exact leaf object keys",
    );
  }
});

Deno.test("retention reports partial removal failure and counts only confirmed removals", async () => {
  const failedPath = `${vencida}/nested/fail.pdf`;
  const initial: Record<string, Entry[]> = {
    "backups:": [],
    "backups-arquivos:": [{ name: vencida, metadata: null }],
    [`backups-arquivos:${vencida}`]: [{ name: "nested", metadata: null }],
    [`backups-arquivos:${vencida}/nested`]: [
      { name: "ok.pdf", metadata: {} },
      { name: "fail.pdf", metadata: {} },
    ],
  };
  const { storage, objects } = criarStorage(initial, failedPath);

  const result = await limparBackupsExpirados(storage, limite);

  if (result.tentados !== 2 || result.apagados !== 1) {
    throw new Error(
      `expected one confirmed removal out of two attempts, got ${result.tentados}/${result.apagados}`,
    );
  }
  if (
    result.falhas.length === 0 ||
    !result.falhas.some((failure) => failure.includes("fail.pdf"))
  ) {
    throw new Error("the failed/partial cleanup was not observable");
  }
  if (objects.has(`${vencida}/nested/ok.pdf`) || !objects.has(failedPath)) {
    throw new Error("the fixture did not preserve the partial removal outcome");
  }
});
