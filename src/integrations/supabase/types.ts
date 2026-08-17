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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_acoes: {
        Row: {
          acao: string
          alvo_email: string
          alvo_id: string | null
          ator_email: string
          ator_id: string | null
          criado_em: string
          detalhe: Json
          erro: string | null
          id: string
          ip: string | null
          motivo: string | null
          sucesso: boolean
        }
        Insert: {
          acao: string
          alvo_email: string
          alvo_id?: string | null
          ator_email: string
          ator_id?: string | null
          criado_em?: string
          detalhe?: Json
          erro?: string | null
          id?: string
          ip?: string | null
          motivo?: string | null
          sucesso?: boolean
        }
        Update: {
          acao?: string
          alvo_email?: string
          alvo_id?: string | null
          ator_email?: string
          ator_id?: string | null
          criado_em?: string
          detalhe?: Json
          erro?: string | null
          id?: string
          ip?: string | null
          motivo?: string | null
          sucesso?: boolean
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          clinica_id: string | null
          convenio_id: string | null
          created_at: string | null
          data: string
          exige_pagamento_previo: boolean
          exige_triagem: boolean
          hora_fim: string | null
          hora_inicio: string
          id: string
          liberado_sem_pagamento: boolean
          liberado_sem_pagamento_em: string | null
          liberado_sem_pagamento_por: string | null
          liberado_sem_triagem: boolean
          liberado_sem_triagem_em: string | null
          liberado_sem_triagem_motivo: string | null
          liberado_sem_triagem_por: string | null
          medico_id: string | null
          motivo_liberacao: string | null
          observacoes: string | null
          paciente_id: string
          sala_id: string | null
          status: Database["public"]["Enums"]["status_agendamento"] | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id?: string | null
          convenio_id?: string | null
          created_at?: string | null
          data: string
          exige_pagamento_previo?: boolean
          exige_triagem?: boolean
          hora_fim?: string | null
          hora_inicio: string
          id?: string
          liberado_sem_pagamento?: boolean
          liberado_sem_pagamento_em?: string | null
          liberado_sem_pagamento_por?: string | null
          liberado_sem_triagem?: boolean
          liberado_sem_triagem_em?: string | null
          liberado_sem_triagem_motivo?: string | null
          liberado_sem_triagem_por?: string | null
          medico_id?: string | null
          motivo_liberacao?: string | null
          observacoes?: string | null
          paciente_id: string
          sala_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"] | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string | null
          convenio_id?: string | null
          created_at?: string | null
          data?: string
          exige_pagamento_previo?: boolean
          exige_triagem?: boolean
          hora_fim?: string | null
          hora_inicio?: string
          id?: string
          liberado_sem_pagamento?: boolean
          liberado_sem_pagamento_em?: string | null
          liberado_sem_pagamento_por?: string | null
          liberado_sem_triagem?: boolean
          liberado_sem_triagem_em?: string | null
          liberado_sem_triagem_motivo?: string | null
          liberado_sem_triagem_por?: string | null
          medico_id?: string | null
          motivo_liberacao?: string | null
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
            foreignKeyName: "agendamentos_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_liberado_sem_pagamento_por_fkey"
            columns: ["liberado_sem_pagamento_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_liberado_sem_triagem_por_fkey"
            columns: ["liberado_sem_triagem_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          medico_id: string | null
          motivo: string | null
          observacoes: string | null
          paciente_id: string | null
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
          medico_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string | null
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
          medico_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string | null
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
      autorizacoes_convenio: {
        Row: {
          clinica_id: string | null
          convenio_id: string
          created_at: string
          data_autorizacao: string | null
          data_expiracao: string | null
          data_solicitacao: string
          descricao: string | null
          id: string
          numero_autorizacao: string | null
          observacoes: string | null
          paciente_id: string
          status: string
          tipo_servico: string
        }
        Insert: {
          clinica_id?: string | null
          convenio_id: string
          created_at?: string
          data_autorizacao?: string | null
          data_expiracao?: string | null
          data_solicitacao?: string
          descricao?: string | null
          id?: string
          numero_autorizacao?: string | null
          observacoes?: string | null
          paciente_id: string
          status?: string
          tipo_servico: string
        }
        Update: {
          clinica_id?: string | null
          convenio_id?: string
          created_at?: string
          data_autorizacao?: string | null
          data_expiracao?: string | null
          data_solicitacao?: string
          descricao?: string | null
          id?: string
          numero_autorizacao?: string | null
          observacoes?: string | null
          paciente_id?: string
          status?: string
          tipo_servico?: string
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_convenio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_convenio_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_convenio_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
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
          arquivada: boolean
          arquivada_em: string | null
          arquivada_motivo: string | null
          arquivada_por: string | null
          cnpj: string | null
          created_at: string | null
          exigir_pagamento_previo: boolean
          exigir_triagem: boolean
          id: string
          nome: string
          owner_id: string | null
          plano_id: string | null
          suspensa: boolean
          suspensa_em: string | null
          suspensa_motivo: string | null
          updated_at: string | null
        }
        Insert: {
          arquivada?: boolean
          arquivada_em?: string | null
          arquivada_motivo?: string | null
          arquivada_por?: string | null
          cnpj?: string | null
          created_at?: string | null
          exigir_pagamento_previo?: boolean
          exigir_triagem?: boolean
          id?: string
          nome?: string
          owner_id?: string | null
          plano_id?: string | null
          suspensa?: boolean
          suspensa_em?: string | null
          suspensa_motivo?: string | null
          updated_at?: string | null
        }
        Update: {
          arquivada?: boolean
          arquivada_em?: string | null
          arquivada_motivo?: string | null
          arquivada_por?: string | null
          cnpj?: string | null
          created_at?: string | null
          exigir_pagamento_previo?: boolean
          exigir_triagem?: boolean
          id?: string
          nome?: string
          owner_id?: string | null
          plano_id?: string | null
          suspensa?: boolean
          suspensa_em?: string | null
          suspensa_motivo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinicas_arquivada_por_fkey"
            columns: ["arquivada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinicas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
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
      convites_funcionario: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          clinica_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          nome: string
          roles: string[]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          clinica_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          nome: string
          roles: string[]
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          clinica_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          nome?: string
          roles?: string[]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_funcionario_clinica_id_fkey"
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
          medico_origem_id: string | null
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
          medico_origem_id?: string | null
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
          medico_origem_id?: string | null
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
      especialidades_destino: {
        Row: {
          ativo: boolean
          clinica_id: string | null
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          clinica_id?: string | null
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string | null
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "especialidades_destino_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
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
          paciente_id: string | null
          preco_custo: number | null
          preco_venda: number | null
          resultado: string | null
          resultado_em: string | null
          resultado_por: string | null
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
          paciente_id?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          resultado?: string | null
          resultado_em?: string | null
          resultado_por?: string | null
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
          paciente_id?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          resultado?: string | null
          resultado_em?: string | null
          resultado_por?: string | null
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
          {
            foreignKeyName: "exames_resultado_por_fkey"
            columns: ["resultado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_nps: {
        Row: {
          agendamento_id: string | null
          categoria: string | null
          clinica_id: string | null
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
          clinica_id?: string | null
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
          clinica_id?: string | null
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
            foreignKeyName: "feedbacks_nps_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
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
      guias_externas: {
        Row: {
          agendamento_id: string | null
          anexo_nome: string | null
          anexo_url: string | null
          clinica_id: string | null
          convenio_id: string | null
          convenio_nome: string | null
          created_at: string
          data_agendamento: string | null
          data_recebimento: string
          exames_solicitados: Json
          hora_agendamento: string | null
          id: string
          medico_externo_contato: string | null
          medico_externo_crm: string | null
          medico_externo_especialidade: string | null
          medico_externo_nome: string | null
          medico_externo_uf: string | null
          numero_autorizacao: string | null
          observacoes: string | null
          origem: string
          paciente_cpf: string | null
          paciente_email: string | null
          paciente_id: string | null
          paciente_nascimento: string | null
          paciente_nome: string
          paciente_sexo: string | null
          paciente_telefone: string | null
          registrado_por: string | null
          status: string
          updated_at: string
          validade_autorizacao: string | null
        }
        Insert: {
          agendamento_id?: string | null
          anexo_nome?: string | null
          anexo_url?: string | null
          clinica_id?: string | null
          convenio_id?: string | null
          convenio_nome?: string | null
          created_at?: string
          data_agendamento?: string | null
          data_recebimento?: string
          exames_solicitados?: Json
          hora_agendamento?: string | null
          id?: string
          medico_externo_contato?: string | null
          medico_externo_crm?: string | null
          medico_externo_especialidade?: string | null
          medico_externo_nome?: string | null
          medico_externo_uf?: string | null
          numero_autorizacao?: string | null
          observacoes?: string | null
          origem?: string
          paciente_cpf?: string | null
          paciente_email?: string | null
          paciente_id?: string | null
          paciente_nascimento?: string | null
          paciente_nome: string
          paciente_sexo?: string | null
          paciente_telefone?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
          validade_autorizacao?: string | null
        }
        Update: {
          agendamento_id?: string | null
          anexo_nome?: string | null
          anexo_url?: string | null
          clinica_id?: string | null
          convenio_id?: string | null
          convenio_nome?: string | null
          created_at?: string
          data_agendamento?: string | null
          data_recebimento?: string
          exames_solicitados?: Json
          hora_agendamento?: string | null
          id?: string
          medico_externo_contato?: string | null
          medico_externo_crm?: string | null
          medico_externo_especialidade?: string | null
          medico_externo_nome?: string | null
          medico_externo_uf?: string | null
          numero_autorizacao?: string | null
          observacoes?: string | null
          origem?: string
          paciente_cpf?: string | null
          paciente_email?: string | null
          paciente_id?: string | null
          paciente_nascimento?: string | null
          paciente_nome?: string
          paciente_sexo?: string | null
          paciente_telefone?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
          validade_autorizacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guias_externas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_externas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_externas_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_externas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
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
      lancamento_itens: {
        Row: {
          categoria: string
          clinica_id: string | null
          created_at: string
          criado_por: string | null
          descricao: string
          id: string
          lancamento_id: string
          origem: string
          prontuario_id: string | null
          quantidade: number
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          categoria?: string
          clinica_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao: string
          id?: string
          lancamento_id: string
          origem?: string
          prontuario_id?: string | null
          quantidade?: number
          valor_total?: number | null
          valor_unitario: number
        }
        Update: {
          categoria?: string
          clinica_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string
          id?: string
          lancamento_id?: string
          origem?: string
          prontuario_id?: string | null
          quantidade?: number
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_itens_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_itens_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_itens_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          acrescimo: number
          agendamento_id: string | null
          anexo_url: string | null
          categoria: string
          centro_custo: string | null
          clinica_id: string | null
          competencia: string | null
          created_at: string | null
          data: string
          data_emissao: string | null
          data_emprestimo: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          desconto: number
          descricao: string
          forma_pagamento: string | null
          fornecedor: string | null
          frequencia_pagamento: string | null
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
          valor_pago: number | null
        }
        Insert: {
          acrescimo?: number
          agendamento_id?: string | null
          anexo_url?: string | null
          categoria?: string
          centro_custo?: string | null
          clinica_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string
          data_emissao?: string | null
          data_emprestimo?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          desconto?: number
          descricao: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          frequencia_pagamento?: string | null
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
          valor_pago?: number | null
        }
        Update: {
          acrescimo?: number
          agendamento_id?: string | null
          anexo_url?: string | null
          categoria?: string
          centro_custo?: string | null
          clinica_id?: string | null
          competencia?: string | null
          created_at?: string | null
          data?: string
          data_emissao?: string | null
          data_emprestimo?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          desconto?: number
          descricao?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          frequencia_pagamento?: string | null
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
          valor_pago?: number | null
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
      lgpd_access_request_log: {
        Row: {
          clinica_id: string | null
          created_at: string
          fulfillment_date: string | null
          id: string
          notes: string | null
          paciente_id: string
          request_type: string
          requested_at: string
          status: string
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          fulfillment_date?: string | null
          id?: string
          notes?: string | null
          paciente_id: string
          request_type: string
          requested_at?: string
          status?: string
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          fulfillment_date?: string | null
          id?: string
          notes?: string | null
          paciente_id?: string
          request_type?: string
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_access_request_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lgpd_access_request_log_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_consent_log: {
        Row: {
          accepted: boolean
          clinica_id: string | null
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          paciente_id: string
          timestamp: string
          user_agent: string | null
        }
        Insert: {
          accepted: boolean
          clinica_id?: string | null
          consent_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          paciente_id: string
          timestamp?: string
          user_agent?: string | null
        }
        Update: {
          accepted?: boolean
          clinica_id?: string | null
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          paciente_id?: string
          timestamp?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_consent_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lgpd_consent_log_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_deletion_log: {
        Row: {
          clinica_id: string | null
          created_at: string
          deleted_at: string
          deleted_by: string | null
          id: string
          paciente_id: string
          reason: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          paciente_id: string
          reason?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          paciente_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_deletion_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
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
          oferta_agendamento_id: string | null
          oferta_expira_em: string | null
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
          oferta_agendamento_id?: string | null
          oferta_expira_em?: string | null
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
          oferta_agendamento_id?: string | null
          oferta_expira_em?: string | null
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
            foreignKeyName: "lista_espera_oferta_agendamento_id_fkey"
            columns: ["oferta_agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
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
      monitor_saude: {
        Row: {
          alvo: string
          erro: string | null
          id: string
          ms: number | null
          ok: boolean
          status_code: number | null
          verificado_em: string
          virada: boolean
        }
        Insert: {
          alvo: string
          erro?: string | null
          id?: string
          ms?: number | null
          ok: boolean
          status_code?: number | null
          verificado_em?: string
          virada?: boolean
        }
        Update: {
          alvo?: string
          erro?: string | null
          id?: string
          ms?: number | null
          ok?: boolean
          status_code?: number | null
          verificado_em?: string
          virada?: boolean
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
          prontuario_id: string | null
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
          prontuario_id?: string | null
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
          prontuario_id?: string | null
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
          {
            foreignKeyName: "movimentacoes_estoque_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
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
          iniciado_em: string | null
          max_tentativas: number | null
          status: string
          template_id: string | null
          tentativas: number | null
          tipo: string
          ultimo_erro_em: string | null
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
          iniciado_em?: string | null
          max_tentativas?: number | null
          status?: string
          template_id?: string | null
          tentativas?: number | null
          tipo: string
          ultimo_erro_em?: string | null
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
          iniciado_em?: string | null
          max_tentativas?: number | null
          status?: string
          template_id?: string | null
          tentativas?: number | null
          tipo?: string
          ultimo_erro_em?: string | null
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
      paciente_comorbidades: {
        Row: {
          ativo: boolean
          clinica_id: string | null
          codigo_cid: string | null
          created_at: string
          data_diagnostico: string | null
          descricao: string
          id: string
          observacoes: string | null
          paciente_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id?: string | null
          codigo_cid?: string | null
          created_at?: string
          data_diagnostico?: string | null
          descricao: string
          id?: string
          observacoes?: string | null
          paciente_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string | null
          codigo_cid?: string | null
          created_at?: string
          data_diagnostico?: string | null
          descricao?: string
          id?: string
          observacoes?: string | null
          paciente_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paciente_comorbidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paciente_comorbidades_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
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
          amamentando: boolean
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
          gestante: boolean
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
          amamentando?: boolean
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
          gestante?: boolean
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
          amamentando?: boolean
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
          gestante?: boolean
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
      pagamentos: {
        Row: {
          chave_idempotencia: string | null
          clinica_id: string | null
          created_at: string
          data_pagamento: string
          estornado_em: string | null
          estornado_por: string | null
          forma_pagamento: string
          id: string
          lancamento_id: string
          motivo_estorno: string | null
          observacoes: string | null
          parcelas: number
          recebido_por: string | null
          valor: number
        }
        Insert: {
          chave_idempotencia?: string | null
          clinica_id?: string | null
          created_at?: string
          data_pagamento?: string
          estornado_em?: string | null
          estornado_por?: string | null
          forma_pagamento: string
          id?: string
          lancamento_id: string
          motivo_estorno?: string | null
          observacoes?: string | null
          parcelas?: number
          recebido_por?: string | null
          valor: number
        }
        Update: {
          chave_idempotencia?: string | null
          clinica_id?: string | null
          created_at?: string
          data_pagamento?: string
          estornado_em?: string | null
          estornado_por?: string | null
          forma_pagamento?: string
          id?: string
          lancamento_id?: string
          motivo_estorno?: string | null
          observacoes?: string | null
          parcelas?: number
          recebido_por?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_estornado_por_fkey"
            columns: ["estornado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          max_funcionarios_total: number
          max_medicos: number
          max_recepcao: number
          max_storage_mb: number
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
          max_funcionarios_total?: number
          max_medicos?: number
          max_recepcao?: number
          max_storage_mb?: number
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
          max_funcionarios_total?: number
          max_medicos?: number
          max_recepcao?: number
          max_storage_mb?: number
          nome?: string
          ordem?: number | null
          slug?: string
          trial_dias?: number | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: []
      }
      plataforma_estado: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          id: boolean
          manutencao: boolean
          mensagem: string
          previsao_retorno: string | null
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          id?: boolean
          manutencao?: boolean
          mensagem?: string
          previsao_retorno?: string | null
          titulo?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          id?: boolean
          manutencao?: boolean
          mensagem?: string
          previsao_retorno?: string | null
          titulo?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          impersonating_clinica_id: string | null
          nivel: string
          notes: string | null
          original_clinica_id: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          impersonating_clinica_id?: string | null
          nivel: string
          notes?: string | null
          original_clinica_id?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          impersonating_clinica_id?: string | null
          nivel?: string
          notes?: string | null
          original_clinica_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_impersonating_clinica_id_fkey"
            columns: ["impersonating_clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_impersonation_log: {
        Row: {
          acoes: Json
          clinica_id: string
          encerrado_em: string | null
          id: string
          iniciado_em: string
          motivo: string
          platform_admin_id: string
        }
        Insert: {
          acoes?: Json
          clinica_id: string
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string
          motivo: string
          platform_admin_id: string
        }
        Update: {
          acoes?: Json
          clinica_id?: string
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string
          motivo?: string
          platform_admin_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_impersonation_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_guias_tokens: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          expires_at: string
          id: string
          token: string
          ultimo_uso: string | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          expires_at?: string
          id?: string
          token?: string
          ultimo_uso?: string | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          expires_at?: string
          id?: string
          token?: string
          ultimo_uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_guias_tokens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
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
      predicoes_no_show: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          id: string
          motivos_risco: string[]
          paciente_id: string
          probabilidade_no_show: number
          recomendacoes: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          motivos_risco?: string[]
          paciente_id: string
          probabilidade_no_show: number
          recomendacoes?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          motivos_risco?: string[]
          paciente_id?: string
          probabilidade_no_show?: number
          recomendacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predicoes_no_show_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predicoes_no_show_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predicoes_no_show_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      prescricoes: {
        Row: {
          clinica_id: string
          created_at: string | null
          data_emissao: string | null
          dosagem: string | null
          duracao: string | null
          id: string
          medicamento: string
          medico_id: string | null
          observacoes: string | null
          paciente_id: string | null
          posologia: string | null
          prontuario_id: string | null
          quantidade: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          clinica_id: string
          created_at?: string | null
          data_emissao?: string | null
          dosagem?: string | null
          duracao?: string | null
          id?: string
          medicamento: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          posologia?: string | null
          prontuario_id?: string | null
          quantidade?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string | null
          data_emissao?: string | null
          dosagem?: string | null
          duracao?: string | null
          id?: string
          medicamento?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
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
      prontuario_acessos: {
        Row: {
          acao: string
          clinica_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          justificativa: string | null
          paciente_id: string | null
          prontuario_id: string | null
          user_agent: string | null
          user_crm: string | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          acao: string
          clinica_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          justificativa?: string | null
          paciente_id?: string | null
          prontuario_id?: string | null
          user_agent?: string | null
          user_crm?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          acao?: string
          clinica_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          justificativa?: string | null
          paciente_id?: string | null
          prontuario_id?: string | null
          user_agent?: string | null
          user_crm?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prontuario_acessos_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      prontuario_adendos: {
        Row: {
          clinica_id: string | null
          created_at: string
          crm: string
          hash: string | null
          id: string
          medico_id: string | null
          medico_nome: string
          motivo: string
          prontuario_id: string
          texto: string
          tipo: string
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          crm: string
          hash?: string | null
          id?: string
          medico_id?: string | null
          medico_nome: string
          motivo: string
          prontuario_id: string
          texto: string
          tipo: string
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          crm?: string
          hash?: string | null
          id?: string
          medico_id?: string | null
          medico_nome?: string
          motivo?: string
          prontuario_id?: string
          texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prontuario_adendos_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      prontuarios: {
        Row: {
          agendamento_id: string | null
          alergias_relatadas: string | null
          assinado: boolean
          assinado_em: string | null
          assinado_por: string | null
          clinica_id: string | null
          conduta: string | null
          created_at: string | null
          crm_assinante: string | null
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
          hash_conteudo: string | null
          hipotese_diagnostica: string | null
          historia_doenca_atual: string | null
          historia_familiar: string | null
          historia_patologica_pregressa: string | null
          historia_social: string | null
          id: string
          medicamentos_em_uso: string | null
          medico_id: string | null
          observacoes_internas: string | null
          orientacoes_paciente: string | null
          paciente_id: string
          plano_terapeutico: string | null
          queixa_principal: string | null
          revisao_sistemas: string | null
          sinais_vitais: Json | null
          tipo_assinatura: string | null
          updated_at: string | null
        }
        Insert: {
          agendamento_id?: string | null
          alergias_relatadas?: string | null
          assinado?: boolean
          assinado_em?: string | null
          assinado_por?: string | null
          clinica_id?: string | null
          conduta?: string | null
          created_at?: string | null
          crm_assinante?: string | null
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
          hash_conteudo?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca_atual?: string | null
          historia_familiar?: string | null
          historia_patologica_pregressa?: string | null
          historia_social?: string | null
          id?: string
          medicamentos_em_uso?: string | null
          medico_id?: string | null
          observacoes_internas?: string | null
          orientacoes_paciente?: string | null
          paciente_id: string
          plano_terapeutico?: string | null
          queixa_principal?: string | null
          revisao_sistemas?: string | null
          sinais_vitais?: Json | null
          tipo_assinatura?: string | null
          updated_at?: string | null
        }
        Update: {
          agendamento_id?: string | null
          alergias_relatadas?: string | null
          assinado?: boolean
          assinado_em?: string | null
          assinado_por?: string | null
          clinica_id?: string | null
          conduta?: string | null
          created_at?: string | null
          crm_assinante?: string | null
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
          hash_conteudo?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca_atual?: string | null
          historia_familiar?: string | null
          historia_patologica_pregressa?: string | null
          historia_social?: string | null
          id?: string
          medicamentos_em_uso?: string | null
          medico_id?: string | null
          observacoes_internas?: string | null
          orientacoes_paciente?: string | null
          paciente_id?: string
          plano_terapeutico?: string | null
          queixa_principal?: string | null
          revisao_sistemas?: string | null
          sinais_vitais?: Json | null
          tipo_assinatura?: string | null
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
      rate_limit_counters: {
        Row: {
          chave: string
          contagem: number
          janela: string
        }
        Insert: {
          chave: string
          contagem?: number
          janela: string
        }
        Update: {
          chave?: string
          contagem?: number
          janela?: string
        }
        Relationships: []
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
          reminder_count: number
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
          reminder_count?: number
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
          reminder_count?: number
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
      relatorios_salvos: {
        Row: {
          ativo: boolean | null
          clinica_id: string
          config: Json
          created_at: string
          dataset: string
          descricao: string | null
          destinatarios: string[] | null
          dia_mes: number | null
          dia_semana: number | null
          formato: string | null
          frequencia: string | null
          hora: string | null
          id: string
          nome: string
          proxima_execucao: string | null
          ultima_execucao: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          clinica_id: string
          config?: Json
          created_at?: string
          dataset: string
          descricao?: string | null
          destinatarios?: string[] | null
          dia_mes?: number | null
          dia_semana?: number | null
          formato?: string | null
          frequencia?: string | null
          hora?: string | null
          id?: string
          nome: string
          proxima_execucao?: string | null
          ultima_execucao?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string
          config?: Json
          created_at?: string
          dataset?: string
          descricao?: string | null
          destinatarios?: string[] | null
          dia_mes?: number | null
          dia_semana?: number | null
          formato?: string | null
          frequencia?: string | null
          hora?: string | null
          id?: string
          nome?: string
          proxima_execucao?: string | null
          ultima_execucao?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "resultados_laboratorio_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "fila_alertas_lab_esquecido"
            referencedColumns: ["coleta_id"]
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
          agendamento_retorno_id: string | null
          clinica_id: string | null
          confirmado_em: string | null
          created_at: string | null
          data_consulta_origem: string
          data_retorno_prevista: string
          historico: Json
          id: string
          lembrete_enviado: boolean | null
          lembretes_enviados: number
          medico_id: string | null
          motivo: string | null
          observacoes: string | null
          paciente_id: string | null
          prontuario_id: string | null
          status: string | null
          tipo_retorno: string | null
          updated_at: string | null
        }
        Insert: {
          agendamento_id?: string | null
          agendamento_retorno_id?: string | null
          clinica_id?: string | null
          confirmado_em?: string | null
          created_at?: string | null
          data_consulta_origem?: string
          data_retorno_prevista: string
          historico?: Json
          id?: string
          lembrete_enviado?: boolean | null
          lembretes_enviados?: number
          medico_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          prontuario_id?: string | null
          status?: string | null
          tipo_retorno?: string | null
          updated_at?: string | null
        }
        Update: {
          agendamento_id?: string | null
          agendamento_retorno_id?: string | null
          clinica_id?: string | null
          confirmado_em?: string | null
          created_at?: string | null
          data_consulta_origem?: string
          data_retorno_prevista?: string
          historico?: Json
          id?: string
          lembrete_enviado?: boolean | null
          lembretes_enviados?: number
          medico_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string | null
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
            foreignKeyName: "retornos_agendamento_retorno_id_fkey"
            columns: ["agendamento_retorno_id"]
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
      fila_alertas_lab_esquecido: {
        Row: {
          clinica_id: string | null
          coleta_id: string | null
          created_at: string | null
          exame_id: string | null
          paciente_id: string | null
          paciente_nome: string | null
          parado_ha: string | null
          status: string | null
          tipo_exame: string | null
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
            foreignKeyName: "coletas_laboratorio_exame_id_fkey"
            columns: ["exame_id"]
            isOneToOne: false
            referencedRelation: "exames"
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
          clinica_id: string | null
          detratores: number | null
          media: number | null
          mes: string | null
          neutros: number | null
          nps_score: number | null
          promotores: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_nps_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_saude_agregada: {
        Row: {
          agendamentos_no_mes: number | null
          audits_ultimos_7d: number | null
          clinicas_arquivadas: number | null
          clinicas_ativas: number | null
          clinicas_em_trial: number | null
          total_clinicas: number | null
          total_pacientes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_employee_invitation: {
        Args: { _token: string; _user_id: string }
        Returns: Json
      }
      aceitar_oferta_lista_espera: {
        Args: { p_lista_espera_id: string; p_paciente_id: string }
        Returns: string
      }
      activate_public_registration: {
        Args: { _codigo_convite: string; _user_id: string }
        Returns: Json
      }
      admin_encerrar_sessoes: { Args: { p_user_id: string }; Returns: number }
      admin_situacao_contas: {
        Args: never
        Returns: {
          bloqueado: boolean
          bloqueado_ate: string
          email_confirmado: boolean
          sessoes_abertas: number
          ultimo_login: string
          user_id: string
        }[]
      }
      atualizar_predicoes_no_show: { Args: never; Returns: number }
      automacoes_padrao: {
        Args: never
        Returns: {
          chave: string
          descricao: string
        }[]
      }
      can_access_clinical: { Args: { _user_id: string }; Returns: boolean }
      can_access_financial: { Args: { _user_id: string }; Returns: boolean }
      can_manage_data: { Args: { _user_id: string }; Returns: boolean }
      cancelar_coletas_pendentes_antigas: {
        Args: { p_dias: number; p_motivo: string }
        Returns: number
      }
      checar_rate_limit: {
        Args: { p_chave: string; p_janela_segundos?: number; p_limite: number }
        Returns: boolean
      }
      clinica_acesso_bloqueado: { Args: never; Returns: boolean }
      current_clinica_id: { Args: never; Returns: string }
      delete_all_app_data: { Args: never; Returns: undefined }
      enfileirar_lembrete_risco: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      enfileirar_lembretes_retorno: { Args: never; Returns: number }
      estornar_pagamento: {
        Args: { p_motivo: string; p_pagamento_id: string }
        Returns: Json
      }
      exame_e_de_laboratorio: { Args: { p_tipo: string }; Returns: boolean }
      expirar_ofertas_lista_espera: { Args: never; Returns: number }
      expire_trials: { Args: never; Returns: undefined }
      finalizar_atendimento_atomico: {
        Args: {
          p_agendamento_id: string
          p_agendar_retorno?: boolean
          p_dias_retorno?: number
          p_fila_id?: string
          p_tipo_exame?: string
        }
        Returns: {
          cobranca_criada: boolean
          retorno_id: string
          status_agendamento: string
        }[]
      }
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
      is_clinica_owner: { Args: { p_clinica_id: string }; Returns: boolean }
      is_enfermagem: { Args: { _user_id: string }; Returns: boolean }
      is_financeiro: { Args: { _user_id: string }; Returns: boolean }
      is_medico: { Args: { _user_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_recepcao: { Args: { _user_id: string }; Returns: boolean }
      is_same_clinica: { Args: { record_clinica_id: string }; Returns: boolean }
      lancar_item_no_atendimento: {
        Args: {
          p_agendamento_id: string
          p_categoria?: string
          p_descricao: string
          p_prontuario_id?: string
          p_quantidade?: number
          p_valor_unitario: number
        }
        Returns: Json
      }
      liberar_resultados_laboratorio: {
        Args: { p_coleta_id: string; p_resultado_ids: string[] }
        Returns: {
          id: string
        }[]
      }
      limpar_logs_antigos: { Args: never; Returns: number }
      limpar_rate_limit_antigos: { Args: never; Returns: number }
      link_portal_paciente: { Args: { p_paciente_id: string }; Returns: string }
      mask_cpf: { Args: { cpf_value: string }; Returns: string }
      normalize_cpf: { Args: { cpf_value: string }; Returns: string }
      ordem_de_restauracao: { Args: never; Returns: string[] }
      platform_arquivar_clinica: {
        Args: { _clinica_id: string; _motivo?: string }
        Returns: Json
      }
      platform_conteudo_da_clinica: {
        Args: { _clinica_id: string }
        Returns: Json
      }
      platform_crm_overview: {
        Args: never
        Returns: {
          assinatura_status: string
          cliente_desde: string
          clinica_id: string
          clinica_nome: string
          cnpj: string
          dias_para_vencer: number
          dias_sem_uso: number
          dono_email: string
          dono_nome: string
          dono_telefone: string
          em_trial: boolean
          plano_nome: string
          plano_valor: number
          suspensa: boolean
          total_agendamentos: number
          total_funcionarios: number
          total_medicos: number
          total_pacientes: number
          ultima_atividade: string
          vence_em: string
        }[]
      }
      platform_desarquivar_clinica: {
        Args: { _clinica_id: string }
        Returns: Json
      }
      platform_excluir_clinica_vazia: {
        Args: { _clinica_id: string; _confirmacao: string }
        Returns: Json
      }
      platform_get_clinicas_overview: {
        Args: never
        Returns: {
          arquivada: boolean
          arquivada_em: string
          arquivada_motivo: string
          assinatura_status: string
          clinica_id: string
          clinica_nome: string
          created_at: string
          em_trial: boolean
          owner_email: string
          owner_id: string
          owner_nome: string
          plano_nome: string
          plano_slug: string
          total_agendamentos: number
          total_funcionarios: number
          total_medicos: number
          total_pacientes: number
          trial_fim: string
        }[]
      }
      platform_get_clinicas_saude: {
        Args: never
        Returns: {
          agendamentos_em_atendimento: number
          arquivada: boolean
          assinatura_status: string
          audits_no_mes: number
          clinica_id: string
          clinica_nome: string
          coletas_esquecidas: number
          contas_a_receber_valor: number
          contas_a_receber_vencidas: number
          criada_em: string
          em_trial: boolean
          exames_solicitados_ha_7d: number
          plano_nome: string
          suspensa: boolean
          total_agendamentos_no_mes: number
          total_pacientes: number
          ultima_atividade: string
          ultima_atividade_ha_dias: number
        }[]
      }
      platform_start_impersonation: {
        Args: { _motivo?: string; _target_clinica_id: string }
        Returns: Json
      }
      platform_stop_impersonation: { Args: never; Returns: Json }
      recalcular_conta: {
        Args: { p_lancamento_id: string }
        Returns: undefined
      }
      registrar_baixa_estoque: {
        Args: {
          p_item_id: string
          p_motivo?: string
          p_prontuario_id?: string
          p_quantidade: number
          p_usuario_id?: string
        }
        Returns: {
          item_id: string
          ja_baixado: boolean
          quantidade_anterior: number
          quantidade_nova: number
        }[]
      }
      registrar_pagamento: {
        Args: {
          p_acrescimo?: number
          p_chave_idempotencia?: string
          p_desconto?: number
          p_lancamento_id: string
          p_observacoes?: string
          p_pagamentos: Json
        }
        Returns: Json
      }
      reivindicar_notificacoes: {
        Args: { p_clinica_id?: string; p_limite?: number }
        Returns: {
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
          iniciado_em: string | null
          max_tentativas: number | null
          status: string
          template_id: string | null
          tentativas: number | null
          tipo: string
          ultimo_erro_em: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resend_activation_manual: {
        Args: { _registro_id: string }
        Returns: Json
      }
      saldo_devedor_do_agendamento: {
        Args: { p_agendamento_id: string }
        Returns: number
      }
      start_free_trial: {
        Args: { _plano_slug: string; _user_id: string }
        Returns: Json
      }
      storage_med_attach_allowed: { Args: { _name: string }; Returns: boolean }
      storage_patient_photo_allowed: {
        Args: { _name: string }
        Returns: boolean
      }
      substituir_prescricoes_do_prontuario: {
        Args: { p_prescricoes?: Json; p_prontuario_id: string }
        Returns: number
      }
      tabelas_para_backup: { Args: never; Returns: string[] }
      tem_triagem: { Args: { p_agendamento_id: string }; Returns: boolean }
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
      verificar_saude_clinicas_e_alertar: {
        Args: never
        Returns: {
          clinica_id: string
          enfileirada: boolean
          motivo: string
        }[]
      }
      watchdog_atendimento_travado: { Args: never; Returns: number }
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
        | "aguardando_pagamento"
        | "pago"
        | "aguardando_triagem"
        | "em_triagem"
        | "atendimento_finalizado"
        | "aguardando_pagamento_adicional"
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
        | "parcial"
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
  graphql_public: {
    Enums: {},
  },
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
        "aguardando_pagamento",
        "pago",
        "aguardando_triagem",
        "em_triagem",
        "atendimento_finalizado",
        "aguardando_pagamento_adicional",
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
        "parcial",
      ],
      status_sala: ["disponivel", "ocupado", "manutencao", "limpeza"],
    },
  },
} as const
