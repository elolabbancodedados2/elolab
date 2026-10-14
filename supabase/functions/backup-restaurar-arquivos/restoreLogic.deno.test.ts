import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  coletarArquivosBackup,
  statusRestauracao,
  type StorageLister,
} from './restoreLogic.ts'

function storageFake(
  paginas: Record<string, { data: Array<{ name: string; metadata?: unknown }> | null; error?: { message: string } | null }>,
): StorageLister {
  return {
    from(bucket: string) {
      if (bucket !== 'backups-arquivos') throw new Error(`bucket inesperado: ${bucket}`)
      return {
        async list(path: string) {
          const pagina = paginas[path]
          if (!pagina) throw new Error(`listagem inesperada: ${path}`)
          return { data: pagina.data, error: pagina.error ?? null }
        },
      }
    },
  }
}

Deno.test('falha ao listar subpasta marca restauração como parcial', async () => {
  const coleta = await coletarArquivosBackup(storageFake({
    'backup-1': {
      data: [
        { name: 'medical-attachments' },
        { name: 'outro-bucket' },
      ],
    },
    'backup-1/medical-attachments': {
      data: [{ name: 'laudo.pdf', metadata: { size: 20 } }],
    },
    'backup-1/outro-bucket': {
      data: null,
      error: { message: 'temporariamente indisponível' },
    },
  }), 'backup-1')

  assertEquals(coleta.encontrados, [{ bucket: 'medical-attachments', caminho: 'laudo.pdf' }])
  assertEquals(coleta.falhasListagem, [
    'backups-arquivos/backup-1/outro-bucket: erro ao listar: temporariamente indisponível',
  ])
  assertEquals(statusRestauracao(coleta.falhasListagem.length), 'parcial')
  assertEquals(statusRestauracao(coleta.falhasListagem.length) === 'sucesso', false)
})

Deno.test('listagem completa sem falhas pode reportar sucesso', async () => {
  const coleta = await coletarArquivosBackup(storageFake({
    'backup-2': { data: [{ name: 'medical-attachments' }] },
    'backup-2/medical-attachments': {
      data: [{ name: 'exame.pdf', metadata: { size: 100 } }],
    },
  }), 'backup-2')

  assertEquals(coleta.encontrados, [{ bucket: 'medical-attachments', caminho: 'exame.pdf' }])
  assertEquals(coleta.falhasListagem, [])
  assertEquals(statusRestauracao(coleta.falhasListagem.length), 'sucesso')
})
