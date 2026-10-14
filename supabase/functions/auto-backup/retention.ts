const LIST_PAGE_SIZE = 1000;

type StorageEntry = {
  name: string;
  metadata?: unknown | null;
  created_at?: string | null;
};

type StorageListOptions = { limit: number; offset: number };

export type RetentionStorage = {
  from(bucket: string): {
    list(path: string, options: StorageListOptions): Promise<{
      data: StorageEntry[] | null;
      error: { message: string } | null;
    }>;
    remove(paths: string[]): Promise<{
      data: Array<{ name?: string }> | null;
      error: { message: string } | null;
    }>;
  };
};

export type RetentionResult = {
  tentados: number;
  apagados: number;
  falhas: string[];
};

function timestampDaPasta(name: string): string | null {
  const match = name.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/,
  );
  return match
    ? `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`
    : null;
}

async function listarTudo(
  storage: RetentionStorage,
  bucket: string,
  path: string,
  falhas: string[],
): Promise<StorageEntry[]> {
  const entradas: StorageEntry[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.from(bucket).list(path, {
      limit: LIST_PAGE_SIZE,
      offset,
    });
    if (error) {
      falhas.push(`${bucket}/${path}: ${error.message}`);
      break;
    }

    const pagina = data ?? [];
    entradas.push(...pagina);
    if (pagina.length < LIST_PAGE_SIZE) break;
    offset += pagina.length;
  }

  return entradas;
}

async function removerExato(
  storage: RetentionStorage,
  bucket: string,
  caminhos: string[],
  resultado: RetentionResult,
): Promise<void> {
  if (caminhos.length === 0) return;

  resultado.tentados += caminhos.length;
  const { data, error } = await storage.from(bucket).remove(caminhos);
  const removidos = new Set(
    (data ?? []).map((item) => item.name).filter((name): name is string =>
      !!name
    ),
  );
  resultado.apagados += removidos.size;

  if (error) resultado.falhas.push(`${bucket}: ${error.message}`);
  for (const caminho of caminhos) {
    if (!removidos.has(caminho)) {
      resultado.falhas.push(`${bucket}/${caminho}: remoção não confirmada`);
    }
  }
}

/** Retains only expired backup artifacts; primary buckets and user data are never visited. */
export async function limparBackupsExpirados(
  storage: RetentionStorage,
  limite: string,
): Promise<RetentionResult> {
  const resultado: RetentionResult = { tentados: 0, apagados: 0, falhas: [] };

  try {
    const backups = await listarTudo(storage, "backups", "", resultado.falhas);
    const arquivosAntigos = backups
      .filter((item) =>
        item.metadata && item.created_at && item.created_at < limite
      )
      .map((item) => item.name);
    await removerExato(storage, "backups", arquivosAntigos, resultado);
  } catch (error) {
    resultado.falhas.push(
      `backups: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const pastas = await listarTudo(
      storage,
      "backups-arquivos",
      "",
      resultado.falhas,
    );
    for (const pasta of pastas) {
      if (pasta.metadata) continue;
      const quando = timestampDaPasta(pasta.name);
      if (!quando || quando >= limite) continue;

      const paraVisitar = [`${pasta.name}`];
      const caminhos: string[] = [];
      while (paraVisitar.length > 0) {
        const diretorio = paraVisitar.pop()!;
        const itens = await listarTudo(
          storage,
          "backups-arquivos",
          diretorio,
          resultado.falhas,
        );
        for (const item of itens) {
          const caminho = `${diretorio}/${item.name}`;
          if (item.metadata) caminhos.push(caminho);
          else paraVisitar.push(caminho);
        }
      }
      await removerExato(storage, "backups-arquivos", caminhos, resultado);
    }
  } catch (error) {
    resultado.falhas.push(
      `backups-arquivos: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return resultado;
}
