export interface ItemBackup {
  name: string
  metadata?: unknown
}

export interface StorageListResult {
  data: ItemBackup[] | null
  error: { message: string } | null
}

export interface StorageLister {
  from(bucket: string): {
    list(path: string, options?: Record<string, unknown>): Promise<StorageListResult>
  }
}

export interface ArquivoBackup {
  bucket: string
  caminho: string
}

export interface ColetaBackup {
  encontrados: ArquivoBackup[]
  falhasListagem: string[]
}

/**
 * Percorre uma pasta de backup e mantém erros de listagem como falhas explícitas.
 * Sem isso, uma subpasta inacessível pode fazer uma restauração incompleta
 * parecer concluída.
 */
export async function coletarArquivosBackup(
  storage: StorageLister,
  pasta: string,
): Promise<ColetaBackup> {
  const encontrados: ArquivoBackup[] = []
  const falhasListagem: string[] = []
  const filaDePastas = [pasta]

  while (filaDePastas.length > 0) {
    const atual = filaDePastas.shift()!
    const { data: itens, error } = await storage
      .from('backups-arquivos')
      .list(atual, { limit: 1000 })

    if (error) {
      falhasListagem.push(`backups-arquivos/${atual}: erro ao listar: ${error.message}`)
      continue
    }

    for (const item of itens ?? []) {
      const completo = `${atual}/${item.name}`
      if (!item.metadata) {
        filaDePastas.push(completo)
        continue
      }

      // O caminho é <carimbo>/<bucket>/<resto...>.
      const semCarimbo = completo.slice(pasta.length + 1)
      const barra = semCarimbo.indexOf('/')
      if (barra < 1) continue
      encontrados.push({
        bucket: semCarimbo.slice(0, barra),
        caminho: semCarimbo.slice(barra + 1),
      })
    }
  }

  return { encontrados, falhasListagem }
}

export function statusRestauracao(falhas: number): 'sucesso' | 'parcial' {
  return falhas === 0 ? 'sucesso' : 'parcial'
}
