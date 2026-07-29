import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronSecretOk, cronForbidden } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BACKUP_TABLES = [
  'pacientes', 'agendamentos', 'prontuarios', 'prescricoes', 'atestados',
  'lancamentos', 'estoque', 'convenios', 'salas', 'medicos', 'funcionarios',
  'exames', 'encaminhamentos', 'lista_espera', 'configuracoes_clinica',
  'templates_prescricao', 'templates_atestado',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Só o agendador. Antes bastava a chave anon, que é pública: qualquer
  // visitante conseguia disparar backups à vontade.
  if (!cronSecretOk(req)) return cronForbidden(corsHeaders)

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const backupData: Record<string, any> = {}
    let totalRecords = 0
    const errors: string[] = []

    for (const table of BACKUP_TABLES) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(10000)
        if (error) {
          errors.push(`${table}: ${error.message}`)
          continue
        }
        backupData[table] = data || []
        totalRecords += (data || []).length
      } catch (e) {
        errors.push(`${table}: ${(e as Error).message}`)
      }
    }

    const backup = {
      version: '2.0',
      createdAt: new Date().toISOString(),
      type: 'automatic',
      collections: backupData,
      metadata: {
        totalRecords,
        tablesCount: Object.keys(backupData).length,
        errors,
      },
    }

    // Store backup in Supabase Storage
    const fileName = `backup-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const backupJson = JSON.stringify(backup)

    // Try to upload - if bucket doesn't exist, just log
    const { error: uploadError } = await supabase.storage
      .from('medical-attachments')
      .upload(`backups/${fileName}`, new Blob([backupJson], { type: 'application/json' }), {
        cacheControl: '3600',
        upsert: false,
      })

    const duration = Date.now() - startTime

    // Log execution
    await supabase.from('automation_logs').insert({
      tipo: 'backup',
      nome: 'Backup Automático',
      status: uploadError ? 'erro' : 'sucesso',
      registros_processados: totalRecords,
      registros_sucesso: totalRecords,
      duracao_ms: duration,
      erro_mensagem: uploadError?.message || (errors.length > 0 ? errors.join('; ') : null),
      detalhes: {
        file: fileName,
        tables: Object.keys(backupData).length,
        total_records: totalRecords,
        size_bytes: backupJson.length,
      },
    })

    console.info(`Auto backup complete: ${totalRecords} records in ${duration}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        file: fileName,
        records: totalRecords,
        tables: Object.keys(backupData).length,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Auto backup error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})