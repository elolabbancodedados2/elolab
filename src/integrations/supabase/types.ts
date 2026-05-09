export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          data: string
          hora_fim: string | null
          hora_inicio: string
          id: string
          medico_id: string | null
          observacoes: string | null
          paciente_id: string
          sala_id: string | null
          status: Database["public"]["Enums"]["status_agendamento"] | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          data: string
          hora_fim?: string | null
          hora_inicio: string
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id: string
          sala_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"] | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          data?: string
          hora_fim?: string | null
          hora_inicio?: string
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string
          sala_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"] | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos_prontuario: {
        Row: {
          categoria: string | null
          clinica_id: string | null
          created_at: string | null
          descricao: string | null
          id: string
          nome_arquivo: string
          paciente_id: string
          prontuario_id: string
          tamanho_bytes: number | null
          tipo_arquivo: string
          updated_at: string | null
          uploaded_by: string | null
          url_arquivo: string
        }
        Insert: {
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_arquivo: string
          paciente_id: string
          prontuario_id: string
          tamanho_bytes?: number | null
          tipo_arquivo: string
          updated_at?: string | null
          uploaded_by?: string | null
          url_arquivo: string
        }
        Update: {
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_arquivo?: string
          paciente_id?: string
          prontuario_id?: string
          tamanho_bytes?: number | null
          tipo_arquivo?: string
          updated_at?: string | null
          uploaded_by?: string | null
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "anexos_prontuario_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_prontuario_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_prontuario_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_prontuario_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_mercadopago: {
        Row: {
          checkout_url: string | null
          clinica_id: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          detalhes: Json | null
          dia_cobranca: number | null
          frequencia: string
          id: string
          mp_plan_id: string | null
          mp_preapproval_id: string | null
          nome_plano: string
          paciente_id: string | null
          proximo_pagamento: string | null
          status: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          checkout_url?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          detalhes?: Json | null
          dia_cobranca?: number | null
          frequencia?: string
          id?: string
          mp_plan_id?: string | null
          mp_preapproval_id?: string | null
          nome_plano: string
          paciente_id?: string | null
          proximo_pagamento?: string | null
          status?: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          checkout_url?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          detalhes?: Json | null
          dia_cobranca?: number | null
          frequencia?: string
          id?: string
          mp_plan_id?: string | null
          mp_preapproval_id?: string | null
          nome_plano?: string
          paciente_id?: string | null
          proximo_pagamento?: string | null
          status?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_mercadopago_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_mercadopago_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_plano: {
        Row: {
          created_at: string | null
          data_cancelamento: string | null
          data_fim: string | null
          data_inicio: string | null
          em_trial: boolean | null
          id: string
          mp_assinatura_id: string | null
          plano_id: string | null
          plano_slug: string
          status: string
          trial_fim: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_cancelamento?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          em_trial?: boolean | null
          id?: string
          mp_assinatura_id?: string | null
          plano_id?: string | null
          plano_slug: string
          status?: string
          trial_fim?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_cancelamento?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          em_trial?: boolean | null
          id?: string
          mp_assinatura_id?: string | null
          plano_id?: string | null
          plano_slug?: string
          status?: string
          trial_fim?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_plano_mp_assinatura_id_fkey"
            columns: ["mp_assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas_mercadopago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_plano_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      atestados: {
        Row: {
          cid: string | null
          clinica_id: string | null
          created_at: string | null
          data_emissao: string | null
          data_fim: string | null
          data_inicio: string | null
          dias: number | null
          id: string
          medico_id: string
          motivo: string | null
          observacoes: string | null
          paciente_id: string
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          cid?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_emissao?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dias?: number | null
          id?: string
          medico_id: string
          motivo?: string | null
          observacoes?: string | null
          paciente_id: string
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          cid?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_emissao?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dias?: number | null
          id?: string
          medico_id?: string
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atestados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atestados_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atestados_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          clinica_id: string | null
          collection: string
          id: string
          record_id: string
          record_name: string | null
          timestamp: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          clinica_id?: string | null
          collection: string
          id?: string
          record_id: string
          record_name?: string | null
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          clinica_id?: string | null
          collection?: string
          id?: string
          record_id?: string
          record_name?: string | null
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          detalhes: Json | null
          duracao_ms: number | null
          erro_mensagem: string | null
          executado_por: string | null
          id: string
          nome: string
          registros_erro: number | null
          registros_processados: number | null
          registros_sucesso: number | null
          status: string
          tipo: string
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          detalhes?: Json | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          executado_por?: string | null
          id?: string
          nome: string
          registros_erro?: number | null
          registros_processados?: number | null
          registros_sucesso?: number | null
          status: string
          tipo: string
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          detalhes?: Json | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          executado_por?: string | null
          id?: string
          nome?: string
          registros_erro?: number | null
          registros_processados?: number | null
          registros_sucesso?: number | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          ativo: boolean | null
          chave: string
          clinica_id: string | null
          descricao: string | null
          id: string
          updated_at: string | null
          valor: Json
        }
        Insert: {
          ativo?: boolean | null
          chave: string
          clinica_id?: string | null
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor: Json
        }
        Update: {
          ativo?: boolean | null
          chave?: string
          clinica_id?: string | null
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueios_agenda: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          dia_inteiro: boolean | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          medico_id: string
          motivo: string | null
          recorrente: boolean | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          dia_inteiro?: boolean | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          medico_id: string
          motivo?: string | null
          recorrente?: boolean | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          dia_inteiro?: boolean | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          medico_id?: string
          motivo?: string | null
          recorrente?: boolean | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_agenda_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_diario: {
        Row: {
          aberto: boolean
          clinica_id: string
          created_at: string | null
          data: string
          id: string
          observacoes: string | null
          operador_abertura: string | null
          operador_fechamento: string | null
          updated_at: string | null
          valor_abertura: number
          valor_fechamento: number | null
        }
        Insert: {
          aberto?: boolean
          clinica_id: string
          created_at?: string | null
          data: string
          id?: string
          observacoes?: string | null
          operador_abertura?: string | null
          operador_fechamento?: string | null
          updated_at?: string | null
          valor_abertura?: number
          valor_fechamento?: number | null
        }
        Update: {
          aberto?: boolean
          clinica_id?: string
          created_at?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          operador_abertura?: string | null
          operador_fechamento?: string | null
          updated_at?: string | null
          valor_abertura?: number
          valor_fechamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_diario_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          id: string
          participante_1_id: string
          participante_2_id: string
          preview: string | null
          ultima_mensagem_em: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          participante_1_id: string
          participante_2_id: string
          preview?: string | null
          ultima_mensagem_em?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          participante_1_id?: string
          participante_2_id?: string
          preview?: string | null
          ultima_mensagem_em?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          clinica_id: string | null
          conversa_id: string
          created_at: string | null
          destinatario_id: string
          id: string
          lida_em: string | null
          remetente_id: string
          texto: string
          urgente: boolean | null
        }
        Insert: {
          clinica_id?: string | null
          conversa_id: string
          created_at?: string | null
          destinatario_id: string
          id?: string
          lida_em?: string | null
          remetente_id: string
          texto: string
          urgente?: boolean | null
        }
        Update: {
          clinica_id?: string | null
          conversa_id?: string
          created_at?: string | null
          destinatario_id?: string
          id?: string
          lida_em?: string | null
          remetente_id?: string
          texto?: string
          urgente?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cid10: {
        Row: {
          categoria: string | null
          codigo: string
          created_at: string | null
          descricao: string
          id: string
          sexo_aplicavel: string | null
          subcategoria: string | null
        }
        Insert: {
          categoria?: string | null
          codigo: string
          created_at?: string | null
          descricao: string
          id?: string
          sexo_aplicavel?: string | null
          subcategoria?: string | null
        }
        Update: {
          categoria?: string | null
          codigo?: string
          created_at?: string | null
          descricao?: string
          id?: string
          sexo_aplicavel?: string | null
          subcategoria?: string | null
        }
        Relationships: []
      }
      clinicas: {
        Row: {
          cnpj: string | null
          created_at: string | null
          id: string
          nome: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      coletas_laboratorio: {
        Row: {
          categoria_exame: string | null
          cid: string | null
          clinica_id: string | null
          codigo_amostra: string
          coletado_por: string | null
          condicao_amostra: string[] | null
          convenio_id: string | null
          created_at: string | null
          data_coleta: string | null
          exame_id: string | null
          finalidade: string | null
          grupo: string | null
          id: string
          indicacao_clinica: string | null
          jejum_horas: number | null
          jejum_necessario: boolean | null
          lote_insumo: string | null
          material: string | null
          medico_solicitante_id: string | null
          numero_guia: string | null
          observacoes: string | null
          paciente_id: string
          procedimento_codigo: string | null
          sitio_coleta: string | null
          status: string
          tipo_amostra: string
          trouxe_material: boolean | null
          tubo: string | null
          updated_at: string | null
          urgente: boolean | null
          volume_ml: number | null
        }
        Insert: {
          categoria_exame?: string | null
          cid?: string | null
          clinica_id?: string | null
          codigo_amostra?: string
          coletado_por?: string | null
          condicao_amostra?: string[] | null
          convenio_id?: string | null
          created_at?: string | null
          data_coleta?: string | null
          exame_id?: string | null
          finalidade?: string | null
          grupo?: string | null
          id?: string
          indicacao_clinica?: string | null
          jejum_horas?: number | null
          jejum_necessario?: boolean | null
          lote_insumo?: string | null
          material?: string | null
          medico_solicitante_id?: string | null
          numero_guia?: string | null
          observacoes?: string | null
          paciente_id: string
          procedimento_codigo?: string | null
          sitio_coleta?: string | null
          status?: string
          tipo_amostra?: string
          trouxe_material?: boolean | null
          tubo?: string | null
          updated_at?: string | null
          urgente?: boolean | null
          volume_ml?: number | null
        }
        Update: {
          categoria_exame?: string | null
          cid?: string | null
          clinica_id?: string | null
          codigo_amostra?: string
          coletado_por?: string | null
          condicao_amostra?: string[] | null
          convenio_id?: string | null
          created_at?: string | null
          data_coleta?: string | null
          exame_id?: string | null
          finalidade?: string | null
          grupo?: string | null
          id?: string
          indicacao_clinica?: string | null
          jejum_horas?: number | null
          jejum_necessario?: boolean | null
          lote_insumo?: string | null
          material?: string | null
          medico_solicitante_id?: string | null
          numero_guia?: string | null
          observacoes?: string | null
          paciente_id?: string
          procedimento_codigo?: string | null
          sitio_coleta?: string | null
          status?: string
          tipo_amostra?: string
          trouxe_material?: boolean | null
          tubo?: string | null
          updated_at?: string | null
          urgente?: boolean | null
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coletas_laboratorio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coletas_laboratorio_coletado_por_fkey"
            columns: ["coletado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coletas_laboratorio_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coletas_laboratorio_exame_id_fkey"
            columns: ["exame_id"]
            isOneToOne: false
            referencedRelation: "exames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coletas_laboratorio_medico_solicitante_id_fkey"
            columns: ["medico_solicitante_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coletas_laboratorio_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_clinica: {
        Row: {
          chave: string
          clinica_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          valor: Json
        }
        Insert: {
          chave: string
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          valor?: Json
        }
        Update: {
          chave?: string
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_clinica_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos_lgpd: {
        Row: {
          aceito: boolean
          clinica_id: string | null
          created_at: string | null
          data_aceite: string | null
          data_revogacao: string | null
          documento_assinado_url: string | null
          id: string
          ip_aceite: string | null
          motivo_revogacao: string | null
          paciente_id: string
          revogado: boolean | null
          tipo_consentimento: string
          updated_at: string | null
          versao_termo: string
        }
        Insert: {
          aceito?: boolean
          clinica_id?: string | null
          created_at?: string | null
          data_aceite?: string | null
          data_revogacao?: string | null
          documento_assinado_url?: string | null
          id?: string
          ip_aceite?: string | null
          motivo_revogacao?: string | null
          paciente_id: string
          revogado?: boolean | null
          tipo_consentimento?: string
          updated_at?: string | null
          versao_termo?: string
        }
        Update: {
          aceito?: boolean
          clinica_id?: string | null
          created_at?: string | null
          data_aceite?: string | null
          data_revogacao?: string | null
          documento_assinado_url?: string | null
          id?: string
          ip_aceite?: string | null
          motivo_revogacao?: string | null
          paciente_id?: string
          revogado?: boolean | null
          tipo_consentimento?: string
          updated_at?: string | null
          versao_termo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_lgpd_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimentos_lgpd_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      convenios: {
        Row: {
          ativo: boolean | null
          carencia: number | null
          clinica_id: string | null
          cnpj: string | null
          codigo: string
          codigo_operadora: string | null
          created_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          nome: string
          portal_url: string | null
          prazo_retorno: number | null
          registro_ans: string | null
          responsavel_cargo: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          taxa_glosa: number | null
          telefone: string | null
          tipo_planos: string[] | null
          updated_at: string | null
          valor_consulta: number | null
          valor_retorno: number | null
          versao_tiss: string | null
          website: string | null
        }
        Insert: {
          ativo?: boolean | null
          carencia?: number | null
          clinica_id?: string | null
          cnpj?: string | null
          codigo: string
          codigo_operadora?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          portal_url?: string | null
          prazo_retorno?: number | null
          registro_ans?: string | null
          responsavel_cargo?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          taxa_glosa?: number | null
          telefone?: string | null
          tipo_planos?: string[] | null
          updated_at?: string | null
          valor_consulta?: number | null
          valor_retorno?: number | null
          versao_tiss?: string | null
          website?: string | null
        }
        Update: {
          ativo?: boolean | null
          carencia?: number | null
          clinica_id?: string | null
          cnpj?: string | null
          codigo?: string
          codigo_operadora?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          portal_url?: string | null
          prazo_retorno?: number | null
          registro_ans?: string | null
          responsavel_cargo?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          taxa_glosa?: number | null
          telefone?: string | null
          tipo_planos?: string[] | null
          updated_at?: string | null
          valor_consulta?: number | null
          valor_retorno?: number | null
          versao_tiss?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convenios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          clinica_id: string | null
          created_at: string
          email: string
          expires_at: string
          funcionario_id: string
          id: string
          roles: Database["public"]["Enums"]["app_role"][]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          clinica_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          funcionario_id: string
          id?: string
          roles?: Database["public"]["Enums"]["app_role"][]
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          clinica_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          funcionario_id?: string
          id?: string
          roles?: Database["public"]["Enums"]["app_role"][]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      encaminhamentos: {
        Row: {
          cid_principal: string | null
          clinica_id: string | null
          contra_referencia: string | null
          created_at: string | null
          data_atendimento: string | null
          data_contra_referencia: string | null
          data_encaminhamento: string | null
          especialidade_destino: string
          exames_realizados: string | null
          hipotese_diagnostica: string | null
          id: string
          informacoes_adicionais: string | null
          medico_destino_id: string | null
          medico_origem_id: string
          motivo: string
          paciente_id: string
          prontuario_id: string | null
          status: string | null
          tipo: string | null
          tratamento_atual: string | null
          updated_at: string | null
          urgencia: string | null
        }
        Insert: {
          cid_principal?: string | null
          clinica_id?: string | null
          contra_referencia?: string | null
          created_at?: string | null
          data_atendimento?: string | null
          data_contra_referencia?: string | null
          data_encaminhamento?: string | null
          especialidade_destino: string
          exames_realizados?: string | null
          hipotese_diagnostica?: string | null
          id?: string
          informacoes_adicionais?: string | null
          medico_destino_id?: string | null
          medico_origem_id: string
          motivo: string
          paciente_id: string
          prontuario_id?: string | null
          status?: string | null
          tipo?: string | null
          tratamento_atual?: string | null
          updated_at?: string | null
          urgencia?: string | null
        }
        Update: {
          cid_principal?: string | null
          clinica_id?: string | null
          contra_referencia?: string | null
          created_at?: string | null
          data_atendimento?: string | null
          data_contra_referencia?: string | null
          data_encaminhamento?: string | null
          especialidade_destino?: string
          exames_realizados?: string | null
          hipotese_diagnostica?: string | null
          id?: string
          informacoes_adicionais?: string | null
          medico_destino_id?: string | null
          medico_origem_id?: string
          motivo?: string
          paciente_id?: string
          prontuario_id?: string | null
          status?: string | null
          tipo?: string | null
          tratamento_atual?: string | null
          updated_at?: string | null
          urgencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encaminhamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encaminhamentos_medico_destino_id_fkey"
            columns: ["medico_destino_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encaminhamentos_medico_origem_id_fkey"
            columns: ["medico_origem_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encaminhamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encaminhamentos_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque: {
        Row: {
          categoria: string
          clinica_id: string | null
          codigo_ean: string | null
          created_at: string | null
          descricao: string | null
          dosagem: string | null
          fabricante: string | null
          fornecedor: string | null
          foto_url: string | null
          id: string
          localizacao: string | null
          lote: string | null
          nome: string
          ponto_pedido: number | null
          principio_ativo: string | null
          quantidade: number
          quantidade_maxima: number | null
          quantidade_minima: number | null
          unidade: string | null
          updated_at: string | null
          validade: string | null
          valor_unitario: number | null
          valor_venda: number | null
        }
        Insert: {
          categoria: string
          clinica_id?: string | null
          codigo_ean?: string | null
          created_at?: string | null
          descricao?: string | null
          dosagem?: string | null
          fabricante?: string | null
          fornecedor?: string | null
          foto_url?: string | null
          id?: string
          localizacao?: string | null
          lote?: string | null
          nome: string
          ponto_pedido?: number | null
          principio_ativo?: string | null
          quantidade?: number
          quantidade_maxima?: number | null
          quantidade_minima?: number | null
          unidade?: string | null
          updated_at?: string | null
          validade?: string | null
          valor_unitario?: number | null
          valor_venda?: number | null
        }
        Update: {
          categoria?: string
          clinica_id?: string | null
          codigo_ean?: string | null
          created_at?: string | null
          descricao?: string | null
          dosagem?: string | null
          fabricante?: string | null
          fornecedor?: string | null
          foto_url?: string | null
          id?: string
          localizacao?: string | null
          lote?: string | null
          nome?: string
          ponto_pedido?: number | null
          principio_ativo?: string | null
          quantidade?: number
          quantidade_maxima?: number | null
          quantidade_minima?: number | null
          unidade?: string | null
          updated_at?: string | null
          validade?: string | null
          valor_unitario?: number | null
          valor_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      exames: {
        Row: {
          arquivo_resultado: string | null
          categoria: string | null
          clinica_id: string | null
          created_at: string | null
          data_agendamento: string | null
          data_realizacao: string | null
          data_solicitacao: string | null
          descricao: string | null
          id: string
          laboratorio_id: string | null
          medico_solicitante_id: string | null
          observacoes: string | null
          paciente_id: string
          preco_custo: number | null
          preco_venda: number | null
          resultado: string | null
          status: Database["public"]["Enums"]["status_exame"] | null
          tipo_categorizado: string | null
          tipo_exame: string
          updated_at: string | null
        }
        Insert: {
          arquivo_resultado?: string | null
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_agendamento?: string | null
          data_realizacao?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          id?: string
          laboratorio_id?: string | null
          medico_solicitante_id?: string | null
          observacoes?: string | null
          paciente_id: string
          preco_custo?: number | null
          preco_venda?: number | null
          resultado?: string | null
          status?: Database["public"]["Enums"]["status_exame"] | null
          tipo_categorizado?: string | null
          tipo_exame: string
          updated_at?: string | null
        }
        Update: {
          arquivo_resultado?: string | null
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_agendamento?: string | null
          data_realizacao?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          id?: string
          laboratorio_id?: string | null
          medico_solicitante_id?: string | null
          observacoes?: string | null
          paciente_id?: string
          preco_custo?: number | null
          preco_venda?: number | null
          resultado?: string | null
          status?: Database["public"]["Enums"]["status_exame"] | null
          tipo_categorizado?: string | null
          tipo_exame?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exames_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exames_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exames_medico_solicitante_id_fkey"
            columns: ["medico_solicitante_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exames_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_nps: {
        Row: {
          agendamento_id: string | null
          categoria: string | null
          comentario: string | null
          created_at: string | null
          id: string
          medico_id: string | null
          nota: number
          paciente_id: string | null
        }
        Insert: {
          agendamento_id?: string | null
          categoria?: string | null
          comentario?: string | null
          created_at?: string | null
          id?: string
          medico_id?: string | null
          nota: number
          paciente_id?: string | null
        }
        Update: {
          agendamento_id?: string | null
          categoria?: string | null
          comentario?: string | null
          created_at?: string | null
          id?: string
          medico_id?: string | null
          nota?: number
          paciente_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_nps_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_nps_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_nps_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_atendimento: {
        Row: {
          agendamento_id: string
          clinica_id: string | null
          created_at: string | null
          horario_chegada: string | null
          id: string
          posicao: number
          prioridade: string | null
          sala_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agendamento_id: string
          clinica_id?: string | null
          created_at?: string | null
          horario_chegada?: string | null
          id?: string
          posicao: number
          prioridade?: string | null
          sala_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agendamento_id?: string
          clinica_id?: string | null
          created_at?: string | null
          horario_chegada?: string | null
          id?: string
          posicao?: number
          prioridade?: string | null
          sala_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fila_atendimento_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_atendimento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_atendimento_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          ativo: boolean | null
          carga_horaria: number | null
          cargo: string | null
          clinica_id: string | null
          cpf: string | null
          created_at: string | null
          data_admissao: string | null
          data_nascimento: string | null
          departamento: string | null
          email: string | null
          especialidade: string | null
          id: string
          nome: string
          pending_roles: Database["public"]["Enums"]["app_role"][]
          registro_profissional: string | null
          salario: number | null
          telefone: string | null
          tipo_funcionario: string | null
          tipo_registro: string | null
          turno: string | null
          uf_registro: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          carga_horaria?: number | null
          cargo?: string | null
          clinica_id?: string | null
          cpf?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_nascimento?: string | null
          departamento?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome: string
          pending_roles?: Database["public"]["Enums"]["app_role"][]
          registro_profissional?: string | null
          salario?: number | null
          telefone?: string | null
          tipo_funcionario?: string | null
          tipo_registro?: string | null
          turno?: string | null
          uf_registro?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          carga_horaria?: number | null
          cargo?: string | null
          clinica_id?: string | null
          cpf?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_nascimento?: string | null
          departamento?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          pending_roles?: Database["public"]["Enums"]["app_role"][]
          registro_profissional?: string | null
          salario?: number | null
          telefone?: string | null
          tipo_funcionario?: string | null
          tipo_registro?: string | null
          turno?: string | null
          uf_registro?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratorios: {
        Row: {
          ativo: boolean | null
          clinica_id: string
          cnpj: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          clinica_id: string
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laboratorios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          agendamento_id: string | null
          anexo_url: string | null
          categoria: string
          centro_custo: string | null
          clinica_id: string | null
          competencia: string | null
          created_at: string | null
          data: string
          data_emissao: string | null
          data_vencimento: string | null
          descricao: string
          forma_pagamento: string | null
          fornecedor: string | null
          frequencia_recorrencia: string | null
          id: string
          numero_documento: string | null
          observacoes: string | null
          paciente_id: string | null
          recorrente: boolean | null
          status: Database["public"]["Enums"]["status_pagamento"] | null
          tipo: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          agendamento_id?: string | null
          anexo_url?: string | null
          categoria?: string
          centro_custo?: string | null
          clinica_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          descricao: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          frequencia_recorrencia?: string | null
          id?: string
          numero_documento?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          recorrente?: boolean | null
          status?: Database["public"]["Enums"]["status_pagamento"] | null
          tipo: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          agendamento_id?: string | null
          anexo_url?: string | null
          categoria?: string
          centro_custo?: string | null
          clinica_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          descricao?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          frequencia_recorrencia?: string | null
          id?: string
          numero_documento?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          recorrente?: boolean | null
          status?: Database["public"]["Enums"]["status_pagamento"] | null
          tipo?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_espera: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          data_cadastro: string | null
          especialidade: string | null
          id: string
          medico_id: string | null
          motivo: string | null
          observacoes: string | null
          paciente_id: string
          preferencia_horario: string | null
          prioridade: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          data_cadastro?: string | null
          especialidade?: string | null
          id?: string
          medico_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          paciente_id: string
          preferencia_horario?: string | null
          prioridade?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          data_cadastro?: string | null
          especialidade?: string | null
          id?: string
          medico_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string
          preferencia_horario?: string | null
          prioridade?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_espera_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_disponibilidade: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          dia_semana: number
          duracao_consulta: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_consultas: number
          medico_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          dia_semana: number
          duracao_consulta?: number
          hora_fim: string
          hora_inicio: string
          id?: string
          intervalo_consultas?: number
          medico_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          dia_semana?: number
          duracao_consulta?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_consultas?: number
          medico_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_disponibilidade_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          ativo: boolean | null
          carimbo_url: string | null
          clinica_id: string | null
          cns: string | null
          cpf: string | null
          created_at: string | null
          crm: string
          crm_uf: string | null
          email: string | null
          especialidade: string | null
          foto_url: string | null
          id: string
          intervalo_consulta: number | null
          nome: string | null
          rqe: string | null
          telefone: string | null
          tipo_registro: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          carimbo_url?: string | null
          clinica_id?: string | null
          cns?: string | null
          cpf?: string | null
          created_at?: string | null
          crm: string
          crm_uf?: string | null
          email?: string | null
          especialidade?: string | null
          foto_url?: string | null
          id?: string
          intervalo_consulta?: number | null
          nome?: string | null
          rqe?: string | null
          telefone?: string | null
          tipo_registro?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          carimbo_url?: string | null
          clinica_id?: string | null
          cns?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string
          crm_uf?: string | null
          email?: string | null
          especialidade?: string | null
          foto_url?: string | null
          id?: string
          intervalo_consulta?: number | null
          nome?: string | null
          rqe?: string | null
          telefone?: string | null
          tipo_registro?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_webhook_logs: {
        Row: {
          created_at: string | null
          data_id: string | null
          erro_mensagem: string | null
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          processado: boolean | null
        }
        Insert: {
          created_at?: string | null
          data_id?: string | null
          erro_mensagem?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          processado?: boolean | null
        }
        Update: {
          created_at?: string | null
          data_id?: string | null
          erro_mensagem?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processado?: boolean | null
        }
        Relationships: []
      }
      movimentacoes_estoque: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          data: string | null
          id: string
          item_id: string
          motivo: string | null
          quantidade: number
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          data?: string | null
          id?: string
          item_id: string
          motivo?: string | null
          quantidade: number
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          data?: string | null
          id?: string
          item_id?: string
          motivo?: string | null
          quantidade?: number
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          agendado_para: string | null
          assunto: string | null
          clinica_id: string | null
          conteudo: string
          created_at: string | null
          dados_extras: Json | null
          destinatario_email: string | null
          destinatario_id: string | null
          destinatario_nome: string | null
          destinatario_telefone: string | null
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          max_tentativas: number | null
          status: string
          template_id: string | null
          tentativas: number | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          agendado_para?: string | null
          assunto?: string | null
          clinica_id?: string | null
          conteudo: string
          created_at?: string | null
          dados_extras?: Json | null
          destinatario_email?: string | null
          destinatario_id?: string | null
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number | null
          status?: string
          template_id?: string | null
          tentativas?: number | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          agendado_para?: string | null
          assunto?: string | null
          clinica_id?: string | null
          conteudo?: string
          created_at?: string | null
          dados_extras?: Json | null
          destinatario_email?: string | null
          destinatario_id?: string | null
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number | null
          status?: string
          template_id?: string | null
          tentativas?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          assunto: string | null
          ativo: boolean | null
          categoria: string
          clinica_id: string | null
          conteudo: string
          created_at: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string | null
          variaveis: string[] | null
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean | null
          categoria: string
          clinica_id?: string | null
          conteudo: string
          created_at?: string | null
          id?: string
          nome: string
          tipo: string
          updated_at?: string | null
          variaveis?: string[] | null
        }
        Update: {
          assunto?: string | null
          ativo?: boolean | null
          categoria?: string
          clinica_id?: string | null
          conteudo?: string
          created_at?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string | null
          variaveis?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      paciente_portal_tokens: {
        Row: {
          ativo: boolean | null
          clinica_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          paciente_id: string
          token: string
          ultimo_acesso: string | null
        }
        Insert: {
          ativo?: boolean | null
          clinica_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          paciente_id: string
          token?: string
          ultimo_acesso?: string | null
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          paciente_id?: string
          token?: string
          ultimo_acesso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paciente_portal_tokens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paciente_portal_tokens_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          alergias: string[] | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string | null
          complemento: string | null
          convenio_id: string | null
          cpf: string | null
          cpf_responsavel: string | null
          created_at: string | null
          data_nascimento: string | null
          email: string | null
          estado: string | null
          foto_url: string | null
          id: string
          logradouro: string | null
          nome: string
          nome_responsavel: string | null
          nome_social: string | null
          numero: string | null
          numero_carteira: string | null
          observacoes: string | null
          parentesco_responsavel: string | null
          sexo: string | null
          telefone: string | null
          updated_at: string | null
          validade_carteira: string | null
        }
        Insert: {
          alergias?: string[] | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string | null
          complemento?: string | null
          convenio_id?: string | null
          cpf?: string | null
          cpf_responsavel?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          nome_responsavel?: string | null
          nome_social?: string | null
          numero?: string | null
          numero_carteira?: string | null
          observacoes?: string | null
          parentesco_responsavel?: string | null
          sexo?: string | null
          telefone?: string | null
          updated_at?: string | null
          validade_carteira?: string | null
        }
        Update: {
          alergias?: string[] | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string | null
          complemento?: string | null
          convenio_id?: string | null
          cpf?: string | null
          cpf_responsavel?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          nome_responsavel?: string | null
          nome_social?: string | null
          numero?: string | null
          numero_carteira?: string | null
          observacoes?: string | null
          parentesco_responsavel?: string | null
          sexo?: string | null
          telefone?: string | null
          updated_at?: string | null
          validade_carteira?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_mercadopago: {
        Row: {
          acrescimo: number | null
          agendamento_id: string | null
          boleto_url: string | null
          checkout_url: string | null
          clinica_id: string | null
          cobranca_direta: boolean | null
          conta_destino: string | null
          contrato_url: string | null
          created_at: string | null
          data_aprovacao: string | null
          data_criacao: string | null
          data_expiracao: string | null
          data_recebimento: string | null
          data_vencimento: string | null
          desconto: number | null
          descricao: string | null
          detalhes_pagamento: Json | null
          id: string
          intervalo_parcelas: number | null
          lancamento_id: string | null
          metodo_pagamento: string | null
          moeda: string | null
          mp_external_reference: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          notificacao_webhook: Json | null
          numero_parcelas: number | null
          observacoes_caixa: string | null
          paciente_id: string | null
          parcela_atual: number | null
          parcelas: number | null
          qr_code_base64: string | null
          qr_code_pix: string | null
          status: string
          tipo: string
          updated_at: string | null
          valor: number
          valor_pago: number | null
        }
        Insert: {
          acrescimo?: number | null
          agendamento_id?: string | null
          boleto_url?: string | null
          checkout_url?: string | null
          clinica_id?: string | null
          cobranca_direta?: boolean | null
          conta_destino?: string | null
          contrato_url?: string | null
          created_at?: string | null
          data_aprovacao?: string | null
          data_criacao?: string | null
          data_expiracao?: string | null
          data_recebimento?: string | null
          data_vencimento?: string | null
          desconto?: number | null
          descricao?: string | null
          detalhes_pagamento?: Json | null
          id?: string
          intervalo_parcelas?: number | null
          lancamento_id?: string | null
          metodo_pagamento?: string | null
          moeda?: string | null
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notificacao_webhook?: Json | null
          numero_parcelas?: number | null
          observacoes_caixa?: string | null
          paciente_id?: string | null
          parcela_atual?: number | null
          parcelas?: number | null
          qr_code_base64?: string | null
          qr_code_pix?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          valor: number
          valor_pago?: number | null
        }
        Update: {
          acrescimo?: number | null
          agendamento_id?: string | null
          boleto_url?: string | null
          checkout_url?: string | null
          clinica_id?: string | null
          cobranca_direta?: boolean | null
          conta_destino?: string | null
          contrato_url?: string | null
          created_at?: string | null
          data_aprovacao?: string | null
          data_criacao?: string | null
          data_expiracao?: string | null
          data_recebimento?: string | null
          data_vencimento?: string | null
          desconto?: number | null
          descricao?: string | null
          detalhes_pagamento?: Json | null
          id?: string
          intervalo_parcelas?: number | null
          lancamento_id?: string | null
          metodo_pagamento?: string | null
          moeda?: string | null
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notificacao_webhook?: Json | null
          numero_parcelas?: number | null
          observacoes_caixa?: string | null
          paciente_id?: string | null
          parcela_atual?: number | null
          parcelas?: number | null
          qr_code_base64?: string | null
          qr_code_pix?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_mercadopago_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_mercadopago_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_mercadopago_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_mercadopago_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          destaque: boolean | null
          features: Json
          frequencia: string
          id: string
          nome: string
          ordem: number | null
          slug: string
          trial_dias: number | null
          updated_at: string | null
          valor: number
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          destaque?: boolean | null
          features?: Json
          frequencia?: string
          id?: string
          nome: string
          ordem?: number | null
          slug: string
          trial_dias?: number | null
          updated_at?: string | null
          valor: number
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          destaque?: boolean | null
          features?: Json
          frequencia?: string
          id?: string
          nome?: string
          ordem?: number | null
          slug?: string
          trial_dias?: number | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: []
      }
      precos_consulta_convenio: {
        Row: {
          ativo: boolean | null
          clinica_id: string | null
          convenio_id: string
          created_at: string | null
          id: string
          tipo_consulta_id: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          ativo?: boolean | null
          clinica_id?: string | null
          convenio_id: string
          created_at?: string | null
          id?: string
          tipo_consulta_id: string
          updated_at?: string | null
          valor?: number
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string | null
          convenio_id?: string
          created_at?: string | null
          id?: string
          tipo_consulta_id?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "precos_consulta_convenio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_consulta_convenio_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_consulta_convenio_tipo_consulta_id_fkey"
            columns: ["tipo_consulta_id"]
            isOneToOne: false
            referencedRelation: "tipos_consulta"
            referencedColumns: ["id"]
          },
        ]
      }
      precos_exames_convenio: {
        Row: {
          ativo: boolean | null
          clinica_id: string | null
          codigo_tuss: string | null
          convenio_id: string
          created_at: string | null
          descricao: string | null
          id: string
          tipo_exame: string
          updated_at: string | null
          valor_custo: number | null
          valor_filme: number | null
          valor_repasse: number | null
          valor_tabela: number
          valor_total: number | null
        }
        Insert: {
          ativo?: boolean | null
          clinica_id?: string | null
          codigo_tuss?: string | null
          convenio_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          tipo_exame: string
          updated_at?: string | null
          valor_custo?: number | null
          valor_filme?: number | null
          valor_repasse?: number | null
          valor_tabela?: number
          valor_total?: number | null
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string | null
          codigo_tuss?: string | null
          convenio_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          tipo_exame?: string
          updated_at?: string | null
          valor_custo?: number | null
          valor_filme?: number | null
          valor_repasse?: number | null
          valor_tabela?: number
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "precos_exames_convenio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_exames_convenio_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      prescricoes: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          data_emissao: string | null
          dosagem: string | null
          duracao: string | null
          id: string
          medicamento: string
          medico_id: string
          observacoes: string | null
          paciente_id: string
          posologia: string | null
          prontuario_id: string | null
          quantidade: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          data_emissao?: string | null
          dosagem?: string | null
          duracao?: string | null
          id?: string
          medicamento: string
          medico_id: string
          observacoes?: string | null
          paciente_id: string
          posologia?: string | null
          prontuario_id?: string | null
          quantidade?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          data_emissao?: string | null
          dosagem?: string | null
          duracao?: string | null
          id?: string
          medicamento?: string
          medico_id?: string
          observacoes?: string | null
          paciente_id?: string
          posologia?: string | null
          prontuario_id?: string | null
          quantidade?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescricoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescricoes_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescricoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescricoes_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean | null
          avatar: string | null
          clinica_id: string | null
          cpf_cnpj: string | null
          created_at: string | null
          email: string
          id: string
          nome: string
          telefone: string | null
          ultimo_acesso: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          avatar?: string | null
          clinica_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          email: string
          id: string
          nome: string
          telefone?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          avatar?: string | null
          clinica_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          email?: string
          id?: string
          nome?: string
          telefone?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      prontuarios: {
        Row: {
          agendamento_id: string | null
          alergias_relatadas: string | null
          clinica_id: string | null
          conduta: string | null
          created_at: string | null
          data: string
          diagnostico_principal: string | null
          diagnosticos_secundarios: string[] | null
          exame_abdomen: string | null
          exame_cabeca_pescoco: string | null
          exame_membros: string | null
          exame_neurologico: string | null
          exame_pele: string | null
          exame_torax: string | null
          exames_fisicos: string | null
          hipotese_diagnostica: string | null
          historia_doenca_atual: string | null
          historia_familiar: string | null
          historia_patologica_pregressa: string | null
          historia_social: string | null
          id: string
          medicamentos_em_uso: string | null
          medico_id: string
          observacoes_internas: string | null
          orientacoes_paciente: string | null
          paciente_id: string
          plano_terapeutico: string | null
          queixa_principal: string | null
          revisao_sistemas: string | null
          sinais_vitais: Json | null
          updated_at: string | null
        }
        Insert: {
          agendamento_id?: string | null
          alergias_relatadas?: string | null
          clinica_id?: string | null
          conduta?: string | null
          created_at?: string | null
          data?: string
          diagnostico_principal?: string | null
          diagnosticos_secundarios?: string[] | null
          exame_abdomen?: string | null
          exame_cabeca_pescoco?: string | null
          exame_membros?: string | null
          exame_neurologico?: string | null
          exame_pele?: string | null
          exame_torax?: string | null
          exames_fisicos?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca_atual?: string | null
          historia_familiar?: string | null
          historia_patologica_pregressa?: string | null
          historia_social?: string | null
          id?: string
          medicamentos_em_uso?: string | null
          medico_id: string
          observacoes_internas?: string | null
          orientacoes_paciente?: string | null
          paciente_id: string
          plano_terapeutico?: string | null
          queixa_principal?: string | null
          revisao_sistemas?: string | null
          sinais_vitais?: Json | null
          updated_at?: string | null
        }
        Update: {
          agendamento_id?: string | null
          alergias_relatadas?: string | null
          clinica_id?: string | null
          conduta?: string | null
          created_at?: string | null
          data?: string
          diagnostico_principal?: string | null
          diagnosticos_secundarios?: string[] | null
          exame_abdomen?: string | null
          exame_cabeca_pescoco?: string | null
          exame_membros?: string | null
          exame_neurologico?: string | null
          exame_pele?: string | null
          exame_torax?: string | null
          exames_fisicos?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca_atual?: string | null
          historia_familiar?: string | null
          historia_patologica_pregressa?: string | null
          historia_social?: string | null
          id?: string
          medicamentos_em_uso?: string | null
          medico_id?: string
          observacoes_internas?: string | null
          orientacoes_paciente?: string | null
          paciente_id?: string
          plano_terapeutico?: string | null
          queixa_principal?: string | null
          revisao_sistemas?: string | null
          sinais_vitais?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prontuarios_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prontuarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prontuarios_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prontuarios_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolos_clinicos: {
        Row: {
          ativo: boolean | null
          cid_relacionados: string[] | null
          clinica_id: string | null
          condicao: string
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          especialidade: string | null
          exames_sugeridos: string[] | null
          id: string
          medicamentos_sugeridos: Json | null
          nome: string
          orientacoes: string | null
          passos: Json
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cid_relacionados?: string[] | null
          clinica_id?: string | null
          condicao: string
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          especialidade?: string | null
          exames_sugeridos?: string[] | null
          id?: string
          medicamentos_sugeridos?: Json | null
          nome: string
          orientacoes?: string | null
          passos?: Json
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cid_relacionados?: string[] | null
          clinica_id?: string | null
          condicao?: string
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          especialidade?: string | null
          exames_sugeridos?: string[] | null
          id?: string
          medicamentos_sugeridos?: Json | null
          nome?: string
          orientacoes?: string | null
          passos?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocolos_clinicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_pendentes: {
        Row: {
          activated_at: string | null
          clinica: string | null
          codigo_convite: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          mp_payment_id: string | null
          nome: string
          plano_id: string | null
          plano_slug: string
          status: string
          telefone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          clinica?: string | null
          codigo_convite: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          mp_payment_id?: string | null
          nome: string
          plano_id?: string | null
          plano_slug: string
          status?: string
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          clinica?: string | null
          codigo_convite?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          mp_payment_id?: string | null
          nome?: string
          plano_id?: string | null
          plano_slug?: string
          status?: string
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_pendentes_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      resultados_laboratorio: {
        Row: {
          clinica_id: string | null
          coleta_id: string
          created_at: string | null
          data_liberacao: string | null
          data_validacao: string | null
          equipamento: string | null
          exame_id: string | null
          id: string
          liberado: boolean | null
          liberado_por: string | null
          metodo: string | null
          observacoes: string | null
          paciente_id: string
          parametro: string
          resultado: string
          status_resultado: string | null
          unidade: string | null
          updated_at: string | null
          validado_por: string | null
          valor_referencia_max: number | null
          valor_referencia_min: number | null
          valor_referencia_texto: string | null
        }
        Insert: {
          clinica_id?: string | null
          coleta_id: string
          created_at?: string | null
          data_liberacao?: string | null
          data_validacao?: string | null
          equipamento?: string | null
          exame_id?: string | null
          id?: string
          liberado?: boolean | null
          liberado_por?: string | null
          metodo?: string | null
          observacoes?: string | null
          paciente_id: string
          parametro: string
          resultado: string
          status_resultado?: string | null
          unidade?: string | null
          updated_at?: string | null
          validado_por?: string | null
          valor_referencia_max?: number | null
          valor_referencia_min?: number | null
          valor_referencia_texto?: string | null
        }
        Update: {
          clinica_id?: string | null
          coleta_id?: string
          created_at?: string | null
          data_liberacao?: string | null
          data_validacao?: string | null
          equipamento?: string | null
          exame_id?: string | null
          id?: string
          liberado?: boolean | null
          liberado_por?: string | null
          metodo?: string | null
          observacoes?: string | null
          paciente_id?: string
          parametro?: string
          resultado?: string
          status_resultado?: string | null
          unidade?: string | null
          updated_at?: string | null
          validado_por?: string | null
          valor_referencia_max?: number | null
          valor_referencia_min?: number | null
          valor_referencia_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resultados_laboratorio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_laboratorio_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "coletas_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_laboratorio_exame_id_fkey"
            columns: ["exame_id"]
            isOneToOne: false
            referencedRelation: "exames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_laboratorio_liberado_por_fkey"
            columns: ["liberado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_laboratorio_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_laboratorio_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retornos: {
        Row: {
          agendamento_id: string | null
          clinica_id: string | null
          created_at: string | null
          data_consulta_origem: string
          data_retorno_prevista: string
          id: string
          lembrete_enviado: boolean | null
          medico_id: string
          motivo: string | null
          observacoes: string | null
          paciente_id: string
          prontuario_id: string | null
          status: string | null
          tipo_retorno: string | null
          updated_at: string | null
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_consulta_origem?: string
          data_retorno_prevista: string
          id?: string
          lembrete_enviado?: boolean | null
          medico_id: string
          motivo?: string | null
          observacoes?: string | null
          paciente_id: string
          prontuario_id?: string | null
          status?: string | null
          tipo_retorno?: string | null
          updated_at?: string | null
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_consulta_origem?: string
          data_retorno_prevista?: string
          id?: string
          lembrete_enviado?: boolean | null
          medico_id?: string
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string
          prontuario_id?: string | null
          status?: string | null
          tipo_retorno?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retornos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      salas: {
        Row: {
          andar: string | null
          capacidade: number | null
          clinica_id: string | null
          cor: string | null
          created_at: string | null
          equipamentos: string[] | null
          genero: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          medico_responsavel: string | null
          nome: string
          numero_cama: string | null
          observacoes: string | null
          setor: string | null
          status: Database["public"]["Enums"]["status_sala"] | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          andar?: string | null
          capacidade?: number | null
          clinica_id?: string | null
          cor?: string | null
          created_at?: string | null
          equipamentos?: string[] | null
          genero?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          medico_responsavel?: string | null
          nome: string
          numero_cama?: string | null
          observacoes?: string | null
          setor?: string | null
          status?: Database["public"]["Enums"]["status_sala"] | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          andar?: string | null
          capacidade?: number | null
          clinica_id?: string | null
          cor?: string | null
          created_at?: string | null
          equipamentos?: string[] | null
          genero?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          medico_responsavel?: string | null
          nome?: string
          numero_cama?: string | null
          observacoes?: string | null
          setor?: string | null
          status?: Database["public"]["Enums"]["status_sala"] | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_medico_responsavel_fkey"
            columns: ["medico_responsavel"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          categoria: string | null
          clinica_id: string | null
          created_at: string | null
          criado_por: string | null
          data_conclusao: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          prioridade: string
          responsavel_id: string | null
          status: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_atestado: {
        Row: {
          cid: string | null
          clinica_id: string | null
          conteudo: string | null
          created_at: string | null
          criado_por: string | null
          dias_afastamento: number | null
          id: string
          nome: string
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          cid?: string | null
          clinica_id?: string | null
          conteudo?: string | null
          created_at?: string | null
          criado_por?: string | null
          dias_afastamento?: number | null
          id?: string
          nome: string
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          cid?: string | null
          clinica_id?: string | null
          conteudo?: string | null
          created_at?: string | null
          criado_por?: string | null
          dias_afastamento?: number | null
          id?: string
          nome?: string
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_atestado_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_prescricao: {
        Row: {
          clinica_id: string | null
          created_at: string | null
          criado_por: string | null
          id: string
          medicamentos: Json | null
          nome: string
          observacoes_gerais: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          medicamentos?: Json | null
          nome: string
          observacoes_gerais?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          medicamentos?: Json | null
          nome?: string
          observacoes_gerais?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_prescricao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_exames_catalog: {
        Row: {
          ativo: boolean | null
          categoria: string
          clinica_id: string
          codigo_tuss: string | null
          created_at: string | null
          descricao: string | null
          id: string
          laboratorio_id: string | null
          nome: string
          preco_custo: number | null
          preco_venda: number | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria: string
          clinica_id: string
          codigo_tuss?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          laboratorio_id?: string | null
          nome: string
          preco_custo?: number | null
          preco_venda?: number | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string
          clinica_id?: string
          codigo_tuss?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          laboratorio_id?: string | null
          nome?: string
          preco_custo?: number | null
          preco_venda?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipo_exames_catalog_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_exames_catalog_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_consulta: {
        Row: {
          ativo: boolean | null
          clinica_id: string | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          duracao_minutos: number | null
          id: string
          nome: string
          updated_at: string | null
          valor_particular: number | null
        }
        Insert: {
          ativo?: boolean | null
          clinica_id?: string | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          nome: string
          updated_at?: string | null
          valor_particular?: number | null
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          nome?: string
          updated_at?: string | null
          valor_particular?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_consulta_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_exame_custom: {
        Row: {
          categoria: string | null
          clinica_id: string | null
          created_at: string | null
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          nome: string
          user_id: string
        }
        Update: {
          categoria?: string | null
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_exame_custom_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      triagens: {
        Row: {
          agendamento_id: string | null
          altura: number | null
          classificacao_risco:
            | Database["public"]["Enums"]["classificacao_risco"]
            | null
          clinica_id: string | null
          created_at: string | null
          data_hora: string | null
          dor_escala: number | null
          enfermeiro_id: string
          frequencia_cardiaca: number | null
          frequencia_respiratoria: number | null
          glicemia: number | null
          id: string
          imc: number | null
          observacoes: string | null
          paciente_id: string
          peso: number | null
          pressao_arterial: string | null
          queixa_principal: string | null
          saturacao: number | null
          temperatura: number | null
          updated_at: string | null
        }
        Insert: {
          agendamento_id?: string | null
          altura?: number | null
          classificacao_risco?:
            | Database["public"]["Enums"]["classificacao_risco"]
            | null
          clinica_id?: string | null
          created_at?: string | null
          data_hora?: string | null
          dor_escala?: number | null
          enfermeiro_id: string
          frequencia_cardiaca?: number | null
          frequencia_respiratoria?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          observacoes?: string | null
          paciente_id: string
          peso?: number | null
          pressao_arterial?: string | null
          queixa_principal?: string | null
          saturacao?: number | null
          temperatura?: number | null
          updated_at?: string | null
        }
        Update: {
          agendamento_id?: string | null
          altura?: number | null
          classificacao_risco?:
            | Database["public"]["Enums"]["classificacao_risco"]
            | null
          clinica_id?: string | null
          created_at?: string | null
          data_hora?: string | null
          dor_escala?: number | null
          enfermeiro_id?: string
          frequencia_cardiaca?: number | null
          frequencia_respiratoria?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          observacoes?: string | null
          paciente_id?: string
          peso?: number | null
          pressao_arterial?: string | null
          queixa_principal?: string | null
          saturacao?: number | null
          temperatura?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "triagens_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triagens_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_panel_media: {
        Row: {
          ativo: boolean | null
          clinica_id: string | null
          created_at: string | null
          duracao_exibicao: number | null
          id: string
          nome: string
          ordem: number | null
          tipo: string
          updated_at: string | null
          url: string
        }
        Insert: {
          ativo?: boolean | null
          clinica_id?: string | null
          created_at?: string | null
          duracao_exibicao?: number | null
          id?: string
          nome: string
          ordem?: number | null
          tipo: string
          updated_at?: string | null
          url: string
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string | null
          created_at?: string | null
          duracao_exibicao?: number | null
          id?: string
          nome?: string
          ordem?: number | null
          tipo?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_panel_media_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_agent_actions: {
        Row: {
          clinica_id: string | null
          conversation_id: string | null
          created_at: string | null
          dados_entrada: Json | null
          dados_saida: Json | null
          duracao_ms: number | null
          erro_mensagem: string | null
          id: string
          sucesso: boolean | null
          tipo_acao: string
        }
        Insert: {
          clinica_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          dados_entrada?: Json | null
          dados_saida?: Json | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          id?: string
          sucesso?: boolean | null
          tipo_acao: string
        }
        Update: {
          clinica_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          dados_entrada?: Json | null
          dados_saida?: Json | null
          duracao_ms?: number | null
          erro_mensagem?: string | null
          id?: string
          sucesso?: boolean | null
          tipo_acao?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agent_actions_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_agent_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_agents: {
        Row: {
          atende_fora_horario: boolean | null
          ativo: boolean | null
          clinica_id: string | null
          created_at: string | null
          horario_atendimento_fim: string | null
          horario_atendimento_inicio: string | null
          humor: string
          id: string
          instrucoes_personalizadas: string | null
          max_tokens: number | null
          mensagem_boas_vindas: string | null
          mensagem_encerramento: string | null
          mensagem_fora_horario: string | null
          nome: string
          temperatura: number | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          atende_fora_horario?: boolean | null
          ativo?: boolean | null
          clinica_id?: string | null
          created_at?: string | null
          horario_atendimento_fim?: string | null
          horario_atendimento_inicio?: string | null
          humor?: string
          id?: string
          instrucoes_personalizadas?: string | null
          max_tokens?: number | null
          mensagem_boas_vindas?: string | null
          mensagem_encerramento?: string | null
          mensagem_fora_horario?: string | null
          nome: string
          temperatura?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          atende_fora_horario?: boolean | null
          ativo?: boolean | null
          clinica_id?: string | null
          created_at?: string | null
          horario_atendimento_fim?: string | null
          horario_atendimento_inicio?: string | null
          humor?: string
          id?: string
          instrucoes_personalizadas?: string | null
          max_tokens?: number | null
          mensagem_boas_vindas?: string | null
          mensagem_encerramento?: string | null
          mensagem_fora_horario?: string | null
          nome?: string
          temperatura?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agents_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          clinica_id: string | null
          contexto: Json | null
          created_at: string | null
          id: string
          paciente_id: string | null
          remote_jid: string
          session_id: string | null
          status: string | null
          ultima_mensagem_at: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          contexto?: Json | null
          created_at?: string | null
          id?: string
          paciente_id?: string | null
          remote_jid: string
          session_id?: string | null
          status?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          contexto?: Json | null
          created_at?: string | null
          id?: string
          paciente_id?: string | null
          remote_jid?: string
          session_id?: string | null
          status?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          clinica_id: string | null
          conteudo: string | null
          conversation_id: string | null
          created_at: string | null
          direcao: string
          id: string
          message_id: string | null
          metadata: Json | null
          status: string | null
          tipo: string | null
        }
        Insert: {
          clinica_id?: string | null
          conteudo?: string | null
          conversation_id?: string | null
          created_at?: string | null
          direcao: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          status?: string | null
          tipo?: string | null
        }
        Update: {
          clinica_id?: string | null
          conteudo?: string | null
          conversation_id?: string | null
          created_at?: string | null
          direcao?: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          status?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          agent_id: string | null
          clinica_id: string | null
          created_at: string | null
          id: string
          instance_id: string | null
          instance_name: string
          phone_number: string | null
          qr_code: string | null
          qr_code_expires_at: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          agent_id?: string | null
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string | null
          instance_name: string
          phone_number?: string | null
          qr_code?: string | null
          qr_code_expires_at?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          agent_id?: string | null
          clinica_id?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string
          phone_number?: string | null
          qr_code?: string | null
          qr_code_expires_at?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sessions_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      funcionarios_safe: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          clinica_id: string | null
          created_at: string | null
          data_admissao: string | null
          departamento: string | null
          email: string | null
          id: string | null
          nome: string | null
          salario: number | null
          telefone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          id?: string | null
          nome?: string | null
          salario?: never
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          clinica_id?: string | null
          created_at?: string | null
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          id?: string | null
          nome?: string | null
          salario?: never
          telefone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_resumo_mensal: {
        Row: {
          detratores: number | null
          media: number | null
          mes: string | null
          neutros: number | null
          nps_score: number | null
          promotores: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_employee_invitation:
        | { Args: { _token: string; _user_id: string }; Returns: Json }
        | { Args: { _token: string; _user_id: string }; Returns: Json }
      activate_public_registration: {
        Args: { _codigo_convite: string; _user_id: string }
        Returns: Json
      }
      can_access_clinical: { Args: { _user_id: string }; Returns: boolean }
      can_access_financial: { Args: { _user_id: string }; Returns: boolean }
      can_manage_data: { Args: { _user_id: string }; Returns: boolean }
      delete_all_app_data: { Args: never; Returns: undefined }
      expire_trials: { Args: never; Returns: undefined }
      get_my_clinica_id: { Args: never; Returns: string }
      get_user_plan: {
        Args: { _user_id: string }
        Returns: {
          em_trial: boolean
          plano_nome: string
          plano_slug: string
          status: string
          trial_fim: string
        }[]
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_enfermagem: { Args: { _user_id: string }; Returns: boolean }
      is_financeiro: { Args: { _user_id: string }; Returns: boolean }
      is_medico: { Args: { _user_id: string }; Returns: boolean }
      is_recepcao: { Args: { _user_id: string }; Returns: boolean }
      is_same_clinica: { Args: { record_clinica_id: string }; Returns: boolean }
      mask_cpf: { Args: { cpf_value: string }; Returns: string }
      normalize_cpf: { Args: { cpf_value: string }; Returns: string }
      start_free_trial: {
        Args: { _plano_slug: string; _user_id: string }
        Returns: Json
      }
      user_has_feature: {
        Args: { _feature: string; _user_id: string }
        Returns: boolean
      }
      user_in_same_clinica: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      validate_invitation_token: { Args: { _token: string }; Returns: Json }
      validate_invite_code: { Args: { _codigo: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "medico" | "recepcao" | "enfermagem" | "financeiro"
      classificacao_risco: "verde" | "amarelo" | "laranja" | "vermelho" | "azul"
      status_agendamento:
        | "agendado"
        | "confirmado"
        | "aguardando"
        | "em_atendimento"
        | "finalizado"
        | "cancelado"
        | "faltou"
      status_exame:
        | "solicitado"
        | "agendado"
        | "realizado"
        | "laudo_disponivel"
        | "cancelado"
      status_pagamento:
        | "pendente"
        | "pago"
        | "cancelado"
        | "estornado"
        | "atrasado"
      status_sala: "disponivel" | "ocupado" | "manutencao" | "limpeza"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "medico", "recepcao", "enfermagem", "financeiro"],
      classificacao_risco: ["verde", "amarelo", "laranja", "vermelho", "azul"],
      status_agendamento: [
        "agendado",
        "confirmado",
        "aguardando",
        "em_atendimento",
        "finalizado",
        "cancelado",
        "faltou",
      ],
      status_exame: [
        "solicitado",
        "agendado",
        "realizado",
        "laudo_disponivel",
        "cancelado",
      ],
      status_pagamento: [
        "pendente",
        "pago",
        "cancelado",
        "estornado",
        "atrasado",
      ],
      status_sala: ["disponivel", "ocupado", "manutencao", "limpeza"],
    },
  },
} as const
