
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "account_session_activity": {
                  Row: {
                    "created_at": string,"last_activity_at": string,"session_id": string,"user_agent": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"last_activity_at"?: string,"session_id": string,"user_agent"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"last_activity_at"?: string,"session_id"?: string,"user_agent"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admin_acoes": {
                  Row: {
                    "acao": string,"alvo_email": string,"alvo_id": string | null,"ator_email": string,"ator_id": string | null,"criado_em": string,"detalhe": NonNullable<Json>,"erro": string | null,"id": string,"ip": string | null,"motivo": string | null,"sucesso": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"alvo_email": string,"alvo_id"?: string | null,"ator_email": string,"ator_id"?: string | null,"criado_em"?: string,"detalhe"?: NonNullable<Json>,"erro"?: string | null,"id"?: string,"ip"?: string | null,"motivo"?: string | null,"sucesso"?: boolean
                  }
                  Update: {
                    "acao"?: string,"alvo_email"?: string,"alvo_id"?: string | null,"ator_email"?: string,"ator_id"?: string | null,"criado_em"?: string,"detalhe"?: NonNullable<Json>,"erro"?: string | null,"id"?: string,"ip"?: string | null,"motivo"?: string | null,"sucesso"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"agendamentos": {
                  Row: {
                    "clinica_id": string | null,"convenio_id": string | null,"created_at": string | null,"data": string,"exige_pagamento_previo": boolean,"exige_triagem": boolean,"hora_fim": string | null,"hora_inicio": string,"id": string,"jornada_finalizada_em": string | null,"jornada_versao": number,"liberado_sem_pagamento": boolean,"liberado_sem_pagamento_em": string | null,"liberado_sem_pagamento_por": string | null,"liberado_sem_triagem": boolean,"liberado_sem_triagem_em": string | null,"liberado_sem_triagem_motivo": string | null,"liberado_sem_triagem_por": string | null,"medico_id": string | null,"motivo_cancelamento": string | null,"motivo_liberacao": string | null,"observacoes": string | null,"origem": string,"paciente_id": string,"sala_id": string | null,"status": Database["public"]['Enums']["status_agendamento"] | null,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"convenio_id"?: string | null,"created_at"?: string | null,"data": string,"exige_pagamento_previo"?: boolean,"exige_triagem"?: boolean,"hora_fim"?: string | null,"hora_inicio": string,"id"?: string,"jornada_finalizada_em"?: string | null,"jornada_versao"?: number,"liberado_sem_pagamento"?: boolean,"liberado_sem_pagamento_em"?: string | null,"liberado_sem_pagamento_por"?: string | null,"liberado_sem_triagem"?: boolean,"liberado_sem_triagem_em"?: string | null,"liberado_sem_triagem_motivo"?: string | null,"liberado_sem_triagem_por"?: string | null,"medico_id"?: string | null,"motivo_cancelamento"?: string | null,"motivo_liberacao"?: string | null,"observacoes"?: string | null,"origem"?: string,"paciente_id": string,"sala_id"?: string | null,"status"?: Database["public"]['Enums']["status_agendamento"] | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"convenio_id"?: string | null,"created_at"?: string | null,"data"?: string,"exige_pagamento_previo"?: boolean,"exige_triagem"?: boolean,"hora_fim"?: string | null,"hora_inicio"?: string,"id"?: string,"jornada_finalizada_em"?: string | null,"jornada_versao"?: number,"liberado_sem_pagamento"?: boolean,"liberado_sem_pagamento_em"?: string | null,"liberado_sem_pagamento_por"?: string | null,"liberado_sem_triagem"?: boolean,"liberado_sem_triagem_em"?: string | null,"liberado_sem_triagem_motivo"?: string | null,"liberado_sem_triagem_por"?: string | null,"medico_id"?: string | null,"motivo_cancelamento"?: string | null,"motivo_liberacao"?: string | null,"observacoes"?: string | null,"origem"?: string,"paciente_id"?: string,"sala_id"?: string | null,"status"?: Database["public"]['Enums']["status_agendamento"] | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agendamentos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamentos_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamentos_liberado_sem_pagamento_por_fkey"
      columns: ["liberado_sem_pagamento_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamentos_liberado_sem_triagem_por_fkey"
      columns: ["liberado_sem_triagem_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamentos_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamentos_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamentos_sala_id_fkey"
      columns: ["sala_id"]
isOneToOne: false
      referencedRelation: "salas"
      referencedColumns: ["id"]
    }
                  ]
                },"anexos_prontuario": {
                  Row: {
                    "categoria": string | null,"clinica_id": string | null,"created_at": string | null,"descricao": string | null,"id": string,"nome_arquivo": string,"paciente_id": string,"prontuario_id": string,"tamanho_bytes": number | null,"tipo_arquivo": string,"updated_at": string | null,"uploaded_by": string | null,"url_arquivo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"id"?: string,"nome_arquivo": string,"paciente_id": string,"prontuario_id": string,"tamanho_bytes"?: number | null,"tipo_arquivo": string,"updated_at"?: string | null,"uploaded_by"?: string | null,"url_arquivo": string
                  }
                  Update: {
                    "categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"id"?: string,"nome_arquivo"?: string,"paciente_id"?: string,"prontuario_id"?: string,"tamanho_bytes"?: number | null,"tipo_arquivo"?: string,"updated_at"?: string | null,"uploaded_by"?: string | null,"url_arquivo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "anexos_prontuario_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anexos_prontuario_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anexos_prontuario_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anexos_prontuario_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"assinaturas_mercadopago": {
                  Row: {
                    "checkout_url": string | null,"clinica_id": string | null,"created_at": string | null,"data_fim": string | null,"data_inicio": string | null,"descricao": string | null,"detalhes": Json | null,"dia_cobranca": number | null,"frequencia": string,"id": string,"mp_plan_id": string | null,"mp_preapproval_id": string | null,"nome_plano": string,"paciente_id": string | null,"proximo_pagamento": string | null,"status": string,"updated_at": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "checkout_url"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_fim"?: string | null,"data_inicio"?: string | null,"descricao"?: string | null,"detalhes"?: Json | null,"dia_cobranca"?: number | null,"frequencia"?: string,"id"?: string,"mp_plan_id"?: string | null,"mp_preapproval_id"?: string | null,"nome_plano": string,"paciente_id"?: string | null,"proximo_pagamento"?: string | null,"status"?: string,"updated_at"?: string | null,"valor": number
                  }
                  Update: {
                    "checkout_url"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_fim"?: string | null,"data_inicio"?: string | null,"descricao"?: string | null,"detalhes"?: Json | null,"dia_cobranca"?: number | null,"frequencia"?: string,"id"?: string,"mp_plan_id"?: string | null,"mp_preapproval_id"?: string | null,"nome_plano"?: string,"paciente_id"?: string | null,"proximo_pagamento"?: string | null,"status"?: string,"updated_at"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "assinaturas_mercadopago_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assinaturas_mercadopago_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"assinaturas_plano": {
                  Row: {
                    "cobranca_modalidade": string | null,"created_at": string | null,"data_cancelamento": string | null,"data_fim": string | null,"data_inicio": string | null,"em_trial": boolean | null,"id": string,"mp_assinatura_id": string | null,"plano_id": string | null,"plano_slug": string,"status": string,"trial_fim": string | null,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cobranca_modalidade"?: string | null,"created_at"?: string | null,"data_cancelamento"?: string | null,"data_fim"?: string | null,"data_inicio"?: string | null,"em_trial"?: boolean | null,"id"?: string,"mp_assinatura_id"?: string | null,"plano_id"?: string | null,"plano_slug": string,"status"?: string,"trial_fim"?: string | null,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "cobranca_modalidade"?: string | null,"created_at"?: string | null,"data_cancelamento"?: string | null,"data_fim"?: string | null,"data_inicio"?: string | null,"em_trial"?: boolean | null,"id"?: string,"mp_assinatura_id"?: string | null,"plano_id"?: string | null,"plano_slug"?: string,"status"?: string,"trial_fim"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assinaturas_plano_mp_assinatura_id_fkey"
      columns: ["mp_assinatura_id"]
isOneToOne: false
      referencedRelation: "assinaturas_mercadopago"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assinaturas_plano_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "planos"
      referencedColumns: ["id"]
    }
                  ]
                },"atestados": {
                  Row: {
                    "cid": string | null,"clinica_id": string | null,"created_at": string | null,"criado_por": string | null,"data_emissao": string | null,"data_fim": string | null,"data_inicio": string | null,"dias": number | null,"id": string,"medico_id": string | null,"modelo_atestado_atualizado_em": string | null,"modelo_atestado_id": string | null,"modelo_atestado_nome": string | null,"motivo": string | null,"observacoes": string | null,"paciente_id": string | null,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cid"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_emissao"?: string | null,"data_fim"?: string | null,"data_inicio"?: string | null,"dias"?: number | null,"id"?: string,"medico_id"?: string | null,"modelo_atestado_atualizado_em"?: string | null,"modelo_atestado_id"?: string | null,"modelo_atestado_nome"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "cid"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_emissao"?: string | null,"data_fim"?: string | null,"data_inicio"?: string | null,"dias"?: number | null,"id"?: string,"medico_id"?: string | null,"modelo_atestado_atualizado_em"?: string | null,"modelo_atestado_id"?: string | null,"modelo_atestado_nome"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "atestados_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "atestados_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "atestados_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"changes": Json | null,"clinica_id": string | null,"collection": string,"id": string,"record_id": string,"record_name": string | null,"timestamp": string | null,"user_id": string | null,"user_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"changes"?: Json | null,"clinica_id"?: string | null,"collection": string,"id"?: string,"record_id": string,"record_name"?: string | null,"timestamp"?: string | null,"user_id"?: string | null,"user_name"?: string | null
                  }
                  Update: {
                    "action"?: string,"changes"?: Json | null,"clinica_id"?: string | null,"collection"?: string,"id"?: string,"record_id"?: string,"record_name"?: string | null,"timestamp"?: string | null,"user_id"?: string | null,"user_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_delivery_claims": {
                  Row: {
                    "atualizado_em": string,"chave": string,"clinica_id": string,"criado_em": string,"estado": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"chave": string,"clinica_id": string,"criado_em"?: string,"estado"?: string,"id"?: string
                  }
                  Update: {
                    "atualizado_em"?: string,"chave"?: string,"clinica_id"?: string,"criado_em"?: string,"estado"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_delivery_claims_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_logs": {
                  Row: {
                    "clinica_id": string | null,"created_at": string | null,"detalhes": Json | null,"duracao_ms": number | null,"erro_mensagem": string | null,"executado_por": string | null,"id": string,"nome": string,"registros_erro": number | null,"registros_processados": number | null,"registros_sucesso": number | null,"status": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"detalhes"?: Json | null,"duracao_ms"?: number | null,"erro_mensagem"?: string | null,"executado_por"?: string | null,"id"?: string,"nome": string,"registros_erro"?: number | null,"registros_processados"?: number | null,"registros_sucesso"?: number | null,"status": string,"tipo": string
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"detalhes"?: Json | null,"duracao_ms"?: number | null,"erro_mensagem"?: string | null,"executado_por"?: string | null,"id"?: string,"nome"?: string,"registros_erro"?: number | null,"registros_processados"?: number | null,"registros_sucesso"?: number | null,"status"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_logs_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_settings": {
                  Row: {
                    "ativo": boolean | null,"chave": string,"clinica_id": string | null,"descricao": string | null,"id": string,"updated_at": string | null,"valor": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"chave": string,"clinica_id"?: string | null,"descricao"?: string | null,"id"?: string,"updated_at"?: string | null,"valor": NonNullable<Json>
                  }
                  Update: {
                    "ativo"?: boolean | null,"chave"?: string,"clinica_id"?: string | null,"descricao"?: string | null,"id"?: string,"updated_at"?: string | null,"valor"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_settings_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"autorizacoes_convenio": {
                  Row: {
                    "clinica_id": string | null,"convenio_id": string,"created_at": string,"data_autorizacao": string | null,"data_expiracao": string | null,"data_solicitacao": string,"descricao": string | null,"id": string,"numero_autorizacao": string | null,"observacoes": string | null,"paciente_id": string,"status": string,"tipo_servico": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"convenio_id": string,"created_at"?: string,"data_autorizacao"?: string | null,"data_expiracao"?: string | null,"data_solicitacao"?: string,"descricao"?: string | null,"id"?: string,"numero_autorizacao"?: string | null,"observacoes"?: string | null,"paciente_id": string,"status"?: string,"tipo_servico": string
                  }
                  Update: {
                    "clinica_id"?: string | null,"convenio_id"?: string,"created_at"?: string,"data_autorizacao"?: string | null,"data_expiracao"?: string | null,"data_solicitacao"?: string,"descricao"?: string | null,"id"?: string,"numero_autorizacao"?: string | null,"observacoes"?: string | null,"paciente_id"?: string,"status"?: string,"tipo_servico"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "autorizacoes_convenio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "autorizacoes_convenio_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "autorizacoes_convenio_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"bloqueios_agenda": {
                  Row: {
                    "clinica_id": string | null,"created_at": string | null,"data_fim": string,"data_inicio": string,"dia_inteiro": boolean | null,"hora_fim": string | null,"hora_inicio": string | null,"id": string,"medico_id": string,"motivo": string | null,"recorrente": boolean | null,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"data_fim": string,"data_inicio": string,"dia_inteiro"?: boolean | null,"hora_fim"?: string | null,"hora_inicio"?: string | null,"id"?: string,"medico_id": string,"motivo"?: string | null,"recorrente"?: boolean | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"data_fim"?: string,"data_inicio"?: string,"dia_inteiro"?: boolean | null,"hora_fim"?: string | null,"hora_inicio"?: string | null,"id"?: string,"medico_id"?: string,"motivo"?: string | null,"recorrente"?: boolean | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bloqueios_agenda_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bloqueios_agenda_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    }
                  ]
                },"caixa_diario": {
                  Row: {
                    "aberto": boolean,"clinica_id": string,"created_at": string | null,"data": string,"id": string,"observacoes": string | null,"operador_abertura": string | null,"operador_fechamento": string | null,"updated_at": string | null,"valor_abertura": number,"valor_fechamento": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aberto"?: boolean,"clinica_id": string,"created_at"?: string | null,"data": string,"id"?: string,"observacoes"?: string | null,"operador_abertura"?: string | null,"operador_fechamento"?: string | null,"updated_at"?: string | null,"valor_abertura"?: number,"valor_fechamento"?: number | null
                  }
                  Update: {
                    "aberto"?: boolean,"clinica_id"?: string,"created_at"?: string | null,"data"?: string,"id"?: string,"observacoes"?: string | null,"operador_abertura"?: string | null,"operador_fechamento"?: string | null,"updated_at"?: string | null,"valor_abertura"?: number,"valor_fechamento"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "caixa_diario_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"caixa_diario_eventos": {
                  Row: {
                    "caixa_id": string,"clinica_id": string,"created_at": string,"fechamento_anterior_em": string | null,"fechamento_anterior_observacoes": string | null,"fechamento_anterior_operador": string | null,"fechamento_anterior_valor": number | null,"id": string,"motivo": string | null,"tipo": string,"user_id": string | null,"user_nome": string | null,"valor_apurado": number | null,"valor_informado": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "caixa_id": string,"clinica_id": string,"created_at"?: string,"fechamento_anterior_em"?: string | null,"fechamento_anterior_observacoes"?: string | null,"fechamento_anterior_operador"?: string | null,"fechamento_anterior_valor"?: number | null,"id"?: string,"motivo"?: string | null,"tipo": string,"user_id"?: string | null,"user_nome"?: string | null,"valor_apurado"?: number | null,"valor_informado"?: number | null
                  }
                  Update: {
                    "caixa_id"?: string,"clinica_id"?: string,"created_at"?: string,"fechamento_anterior_em"?: string | null,"fechamento_anterior_observacoes"?: string | null,"fechamento_anterior_operador"?: string | null,"fechamento_anterior_valor"?: number | null,"id"?: string,"motivo"?: string | null,"tipo"?: string,"user_id"?: string | null,"user_nome"?: string | null,"valor_apurado"?: number | null,"valor_informado"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "caixa_diario_eventos_caixa_id_fkey"
      columns: ["caixa_id"]
isOneToOne: false
      referencedRelation: "caixa_diario"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "caixa_diario_eventos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "caixa_diario_eventos_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"caixa_vendas_pos_idempotencia": {
                  Row: {
                    "chave": string,"clinica_id": string,"created_at": string,"id": string,"lancamento_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"clinica_id": string,"created_at"?: string,"id"?: string,"lancamento_id"?: string | null
                  }
                  Update: {
                    "chave"?: string,"clinica_id"?: string,"created_at"?: string,"id"?: string,"lancamento_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "caixa_vendas_pos_idempotencia_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "caixa_vendas_pos_idempotencia_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_conversations": {
                  Row: {
                    "clinica_id": string | null,"created_at": string | null,"id": string,"participante_1_id": string,"participante_2_id": string,"preview": string | null,"ultima_mensagem_em": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"participante_1_id": string,"participante_2_id": string,"preview"?: string | null,"ultima_mensagem_em"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"participante_1_id"?: string,"participante_2_id"?: string,"preview"?: string | null,"ultima_mensagem_em"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_conversations_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "clinica_id": string | null,"conversa_id": string,"created_at": string | null,"destinatario_id": string,"id": string,"lida_em": string | null,"remetente_id": string,"texto": string,"urgente": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"conversa_id": string,"created_at"?: string | null,"destinatario_id": string,"id"?: string,"lida_em"?: string | null,"remetente_id": string,"texto": string,"urgente"?: boolean | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"conversa_id"?: string,"created_at"?: string | null,"destinatario_id"?: string,"id"?: string,"lida_em"?: string | null,"remetente_id"?: string,"texto"?: string,"urgente"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_messages_conversa_id_fkey"
      columns: ["conversa_id"]
isOneToOne: false
      referencedRelation: "chat_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"cid10": {
                  Row: {
                    "categoria": string | null,"codigo": string,"created_at": string | null,"descricao": string,"id": string,"sexo_aplicavel": string | null,"subcategoria": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string | null,"codigo": string,"created_at"?: string | null,"descricao": string,"id"?: string,"sexo_aplicavel"?: string | null,"subcategoria"?: string | null
                  }
                  Update: {
                    "categoria"?: string | null,"codigo"?: string,"created_at"?: string | null,"descricao"?: string,"id"?: string,"sexo_aplicavel"?: string | null,"subcategoria"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"cid10_codigos": {
                  Row: {
                    "ativo": boolean | null,"categoria": string | null,"codigo": string,"created_at": string,"descricao": string | null,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"categoria"?: string | null,"codigo": string,"created_at"?: string,"descricao"?: string | null,"id"?: string,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean | null,"categoria"?: string | null,"codigo"?: string,"created_at"?: string,"descricao"?: string | null,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    
                  ]
                },"client_error_events": {
                  Row: {
                    "clinica_id": string | null,"created_at": string,"fingerprint": string | null,"id": string,"mensagem": string,"navegador": string | null,"origem": string | null,"release": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"rota": string | null,"status": string,"tipo": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string,"fingerprint"?: string | null,"id"?: string,"mensagem": string,"navegador"?: string | null,"origem"?: string | null,"release"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"rota"?: string | null,"status"?: string,"tipo": string,"user_id"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string,"fingerprint"?: string | null,"id"?: string,"mensagem"?: string,"navegador"?: string | null,"origem"?: string | null,"release"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"rota"?: string | null,"status"?: string,"tipo"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_error_events_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_equipment_assets": {
                  Row: {
                    "acquired_on": string | null,"asset_tag": string | null,"block_room_when_unavailable": boolean,"calibration_due": string | null,"category": string,"clinic_id": string,"created_at": string,"created_by": string,"id": string,"maintenance_interval_days": number | null,"manufacturer": string | null,"model": string | null,"name": string,"responsible_user_id": string | null,"room_id": string | null,"serial_number": string | null,"status": string,"updated_at": string,"updated_by": string,"warranty_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_on"?: string | null,"asset_tag"?: string | null,"block_room_when_unavailable"?: boolean,"calibration_due"?: string | null,"category": string,"clinic_id": string,"created_at"?: string,"created_by": string,"id"?: string,"maintenance_interval_days"?: number | null,"manufacturer"?: string | null,"model"?: string | null,"name": string,"responsible_user_id"?: string | null,"room_id"?: string | null,"serial_number"?: string | null,"status"?: string,"updated_at"?: string,"updated_by": string,"warranty_until"?: string | null
                  }
                  Update: {
                    "acquired_on"?: string | null,"asset_tag"?: string | null,"block_room_when_unavailable"?: boolean,"calibration_due"?: string | null,"category"?: string,"clinic_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"maintenance_interval_days"?: number | null,"manufacturer"?: string | null,"model"?: string | null,"name"?: string,"responsible_user_id"?: string | null,"room_id"?: string | null,"serial_number"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string,"warranty_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_equipment_assets_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_assets_responsible_user_id_fkey"
      columns: ["responsible_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_assets_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "salas"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_equipment_audit": {
                  Row: {
                    "action": string,"actor_id": string | null,"asset_id": string | null,"clinic_id": string,"created_at": string,"details": NonNullable<Json>,"document_id": string | null,"id": number,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"asset_id"?: string | null,"clinic_id": string,"created_at"?: string,"details"?: NonNullable<Json>,"document_id"?: string | null,"id"?: never,"work_order_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"asset_id"?: string | null,"clinic_id"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"document_id"?: string | null,"id"?: never,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_equipment_audit_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "clinic_equipment_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_audit_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_audit_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "clinic_equipment_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_audit_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "clinic_equipment_work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_equipment_documents": {
                  Row: {
                    "asset_id": string,"byte_size": number,"clinic_id": string,"content_type": string,"created_at": string,"file_name": string,"id": string,"storage_path": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"byte_size": number,"clinic_id": string,"content_type": string,"created_at"?: string,"file_name": string,"id"?: string,"storage_path": string,"uploaded_by": string
                  }
                  Update: {
                    "asset_id"?: string,"byte_size"?: number,"clinic_id"?: string,"content_type"?: string,"created_at"?: string,"file_name"?: string,"id"?: string,"storage_path"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_equipment_documents_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "clinic_equipment_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_documents_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_equipment_work_orders": {
                  Row: {
                    "asset_id": string,"assigned_to": string | null,"clinic_id": string,"completed_at": string | null,"completion_note": string | null,"created_at": string,"description": string | null,"due_on": string | null,"id": string,"kind": string,"opened_by": string,"priority": string,"status": string,"title": string,"updated_at": string,"updated_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"assigned_to"?: string | null,"clinic_id": string,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"description"?: string | null,"due_on"?: string | null,"id"?: string,"kind": string,"opened_by": string,"priority"?: string,"status"?: string,"title": string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "asset_id"?: string,"assigned_to"?: string | null,"clinic_id"?: string,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"description"?: string | null,"due_on"?: string | null,"id"?: string,"kind"?: string,"opened_by"?: string,"priority"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_equipment_work_orders_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "clinic_equipment_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_work_orders_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_equipment_work_orders_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_onboarding_state": {
                  Row: {
                    "clinica_id": string,"completed_at": string | null,"last_opened_at": string,"started_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"completed_at"?: string | null,"last_opened_at"?: string,"started_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string,"completed_at"?: string | null,"last_opened_at"?: string,"started_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_onboarding_state_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: true
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"clinical_safety_access_audit": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"clinic_id": string,"created_at": string,"id": number,"report_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"clinic_id": string,"created_at"?: string,"id"?: never,"report_id": string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"clinic_id"?: string,"created_at"?: string,"id"?: never,"report_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinical_safety_access_audit_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinical_safety_access_audit_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "clinical_safety_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"clinical_safety_correction_requests": {
                  Row: {
                    "clinic_id": string,"created_at": string,"id": string,"previous_immediate_action": string,"previous_summary": string,"proposed_immediate_action": string,"proposed_summary": string,"reason": string,"report_id": string,"report_updated_at": string,"requester_user_id": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic_id": string,"created_at"?: string,"id"?: string,"previous_immediate_action": string,"previous_summary": string,"proposed_immediate_action"?: string,"proposed_summary": string,"reason": string,"report_id": string,"report_updated_at": string,"requester_user_id"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "clinic_id"?: string,"created_at"?: string,"id"?: string,"previous_immediate_action"?: string,"previous_summary"?: string,"proposed_immediate_action"?: string,"proposed_summary"?: string,"reason"?: string,"report_id"?: string,"report_updated_at"?: string,"requester_user_id"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinical_safety_correction_requests_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinical_safety_correction_requests_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "clinical_safety_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"clinical_safety_reports": {
                  Row: {
                    "assigned_to": string | null,"category": string,"clinic_id": string,"closed_at": string | null,"created_at": string,"due_at": string | null,"id": string,"immediate_action": string,"location_label": string,"occurred_at": string,"reporter_confidential": boolean,"reporter_user_id": string | null,"severity": string,"status": string,"summary": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"category": string,"clinic_id": string,"closed_at"?: string | null,"created_at"?: string,"due_at"?: string | null,"id"?: string,"immediate_action"?: string,"location_label"?: string,"occurred_at": string,"reporter_confidential"?: boolean,"reporter_user_id"?: string | null,"severity": string,"status"?: string,"summary": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"category"?: string,"clinic_id"?: string,"closed_at"?: string | null,"created_at"?: string,"due_at"?: string | null,"id"?: string,"immediate_action"?: string,"location_label"?: string,"occurred_at"?: string,"reporter_confidential"?: boolean,"reporter_user_id"?: string | null,"severity"?: string,"status"?: string,"summary"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinical_safety_reports_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"clinical_safety_updates": {
                  Row: {
                    "actor_user_id": string | null,"clinic_id": string,"corrective_action": string,"created_at": string,"from_status": string | null,"id": string,"report_id": string,"review_note": string,"to_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_user_id"?: string | null,"clinic_id": string,"corrective_action"?: string,"created_at"?: string,"from_status"?: string | null,"id"?: string,"report_id": string,"review_note": string,"to_status": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"clinic_id"?: string,"corrective_action"?: string,"created_at"?: string,"from_status"?: string | null,"id"?: string,"report_id"?: string,"review_note"?: string,"to_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinical_safety_updates_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinical_safety_updates_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "clinical_safety_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"clinicas": {
                  Row: {
                    "arquivada": boolean,"arquivada_em": string | null,"arquivada_motivo": string | null,"arquivada_por": string | null,"ativo": boolean | null,"cnpj": string | null,"created_at": string | null,"exigir_pagamento_previo": boolean,"exigir_triagem": boolean,"id": string,"nome": string,"owner_id": string | null,"plano_id": string | null,"suspensa": boolean,"suspensa_em": string | null,"suspensa_motivo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivada"?: boolean,"arquivada_em"?: string | null,"arquivada_motivo"?: string | null,"arquivada_por"?: string | null,"ativo"?: never,"cnpj"?: string | null,"created_at"?: string | null,"exigir_pagamento_previo"?: boolean,"exigir_triagem"?: boolean,"id"?: string,"nome"?: string,"owner_id"?: string | null,"plano_id"?: string | null,"suspensa"?: boolean,"suspensa_em"?: string | null,"suspensa_motivo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "arquivada"?: boolean,"arquivada_em"?: string | null,"arquivada_motivo"?: string | null,"arquivada_por"?: string | null,"ativo"?: never,"cnpj"?: string | null,"created_at"?: string | null,"exigir_pagamento_previo"?: boolean,"exigir_triagem"?: boolean,"id"?: string,"nome"?: string,"owner_id"?: string | null,"plano_id"?: string | null,"suspensa"?: boolean,"suspensa_em"?: string | null,"suspensa_motivo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinicas_arquivada_por_fkey"
      columns: ["arquivada_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinicas_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "planos"
      referencedColumns: ["id"]
    }
                  ]
                },"cobranca_inadimplente_claims": {
                  Row: {
                    "claimed_until": string,"clinica_id": string,"completed_at": string | null,"created_at": string,"dias_atraso": number,"lancamento_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimed_until": string,"clinica_id": string,"completed_at"?: string | null,"created_at"?: string,"dias_atraso": number,"lancamento_id": string
                  }
                  Update: {
                    "claimed_until"?: string,"clinica_id"?: string,"completed_at"?: string | null,"created_at"?: string,"dias_atraso"?: number,"lancamento_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cobranca_inadimplente_claims_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobranca_inadimplente_claims_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    }
                  ]
                },"coletas_laboratorio": {
                  Row: {
                    "categoria_exame": string | null,"cid": string | null,"clinica_id": string | null,"codigo_amostra": string,"coletado_por": string | null,"condicao_amostra": (string)[] | null,"convenio_id": string | null,"created_at": string | null,"data_coleta": string | null,"exame_id": string | null,"finalidade": string | null,"grupo": string | null,"id": string,"indicacao_clinica": string | null,"jejum_horas": number | null,"jejum_necessario": boolean | null,"local_atual": string | null,"lote_insumo": string | null,"material": string | null,"medico_solicitante_id": string | null,"numero_guia": string | null,"observacoes": string | null,"paciente_id": string,"procedimento_codigo": string | null,"recoleta_de_id": string | null,"rejeicao_motivo": string | null,"setor_id": string | null,"sitio_coleta": string | null,"status": string,"tipo_amostra": string,"trouxe_material": boolean | null,"tubo": string | null,"updated_at": string | null,"urgente": boolean | null,"volume_ml": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria_exame"?: string | null,"cid"?: string | null,"clinica_id"?: string | null,"codigo_amostra"?: string,"coletado_por"?: string | null,"condicao_amostra"?: (string)[] | null,"convenio_id"?: string | null,"created_at"?: string | null,"data_coleta"?: string | null,"exame_id"?: string | null,"finalidade"?: string | null,"grupo"?: string | null,"id"?: string,"indicacao_clinica"?: string | null,"jejum_horas"?: number | null,"jejum_necessario"?: boolean | null,"local_atual"?: string | null,"lote_insumo"?: string | null,"material"?: string | null,"medico_solicitante_id"?: string | null,"numero_guia"?: string | null,"observacoes"?: string | null,"paciente_id": string,"procedimento_codigo"?: string | null,"recoleta_de_id"?: string | null,"rejeicao_motivo"?: string | null,"setor_id"?: string | null,"sitio_coleta"?: string | null,"status"?: string,"tipo_amostra"?: string,"trouxe_material"?: boolean | null,"tubo"?: string | null,"updated_at"?: string | null,"urgente"?: boolean | null,"volume_ml"?: number | null
                  }
                  Update: {
                    "categoria_exame"?: string | null,"cid"?: string | null,"clinica_id"?: string | null,"codigo_amostra"?: string,"coletado_por"?: string | null,"condicao_amostra"?: (string)[] | null,"convenio_id"?: string | null,"created_at"?: string | null,"data_coleta"?: string | null,"exame_id"?: string | null,"finalidade"?: string | null,"grupo"?: string | null,"id"?: string,"indicacao_clinica"?: string | null,"jejum_horas"?: number | null,"jejum_necessario"?: boolean | null,"local_atual"?: string | null,"lote_insumo"?: string | null,"material"?: string | null,"medico_solicitante_id"?: string | null,"numero_guia"?: string | null,"observacoes"?: string | null,"paciente_id"?: string,"procedimento_codigo"?: string | null,"recoleta_de_id"?: string | null,"rejeicao_motivo"?: string | null,"setor_id"?: string | null,"sitio_coleta"?: string | null,"status"?: string,"tipo_amostra"?: string,"trouxe_material"?: boolean | null,"tubo"?: string | null,"updated_at"?: string | null,"urgente"?: boolean | null,"volume_ml"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "coletas_laboratorio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_coletado_por_fkey"
      columns: ["coletado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_exame_id_fkey"
      columns: ["exame_id"]
isOneToOne: false
      referencedRelation: "exames"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_medico_solicitante_id_fkey"
      columns: ["medico_solicitante_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_recoleta_de_id_fkey"
      columns: ["recoleta_de_id"]
isOneToOne: false
      referencedRelation: "coletas_laboratorio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_recoleta_de_id_fkey"
      columns: ["recoleta_de_id"]
isOneToOne: false
      referencedRelation: "fila_alertas_lab_esquecido"
      referencedColumns: ["coleta_id"]
    },{
      foreignKeyName: "coletas_laboratorio_setor_id_fkey"
      columns: ["setor_id"]
isOneToOne: false
      referencedRelation: "laboratorio_setores"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracoes_clinica": {
                  Row: {
                    "chave": string,"clinica_id": string | null,"created_at": string | null,"id": string,"updated_at": string | null,"user_id": string,"valor": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"updated_at"?: string | null,"user_id": string,"valor"?: NonNullable<Json>
                  }
                  Update: {
                    "chave"?: string,"clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"updated_at"?: string | null,"user_id"?: string,"valor"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "configuracoes_clinica_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracoes_clinica_versoes": {
                  Row: {
                    "alterado_por": string | null,"chave": string,"clinica_id": string,"criado_em": string,"id": string,"operacao": string,"restaurada_de": string | null,"valor": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "alterado_por"?: string | null,"chave": string,"clinica_id": string,"criado_em"?: string,"id"?: string,"operacao"?: string,"restaurada_de"?: string | null,"valor": NonNullable<Json>
                  }
                  Update: {
                    "alterado_por"?: string | null,"chave"?: string,"clinica_id"?: string,"criado_em"?: string,"id"?: string,"operacao"?: string,"restaurada_de"?: string | null,"valor"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "configuracoes_clinica_versoes_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "configuracoes_clinica_versoes_restaurada_de_fkey"
      columns: ["restaurada_de"]
isOneToOne: false
      referencedRelation: "configuracoes_clinica_versoes"
      referencedColumns: ["id"]
    }
                  ]
                },"consentimentos_lgpd": {
                  Row: {
                    "aceito": boolean,"clinica_id": string | null,"created_at": string | null,"data_aceite": string | null,"data_revogacao": string | null,"documento_assinado_url": string | null,"id": string,"ip_aceite": string | null,"motivo_revogacao": string | null,"paciente_id": string,"revogado": boolean | null,"tipo_consentimento": string,"updated_at": string | null,"versao_termo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aceito"?: boolean,"clinica_id"?: string | null,"created_at"?: string | null,"data_aceite"?: string | null,"data_revogacao"?: string | null,"documento_assinado_url"?: string | null,"id"?: string,"ip_aceite"?: string | null,"motivo_revogacao"?: string | null,"paciente_id": string,"revogado"?: boolean | null,"tipo_consentimento"?: string,"updated_at"?: string | null,"versao_termo"?: string
                  }
                  Update: {
                    "aceito"?: boolean,"clinica_id"?: string | null,"created_at"?: string | null,"data_aceite"?: string | null,"data_revogacao"?: string | null,"documento_assinado_url"?: string | null,"id"?: string,"ip_aceite"?: string | null,"motivo_revogacao"?: string | null,"paciente_id"?: string,"revogado"?: boolean | null,"tipo_consentimento"?: string,"updated_at"?: string | null,"versao_termo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consentimentos_lgpd_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consentimentos_lgpd_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"convenios": {
                  Row: {
                    "ativo": boolean | null,"carencia": number | null,"clinica_id": string | null,"cnpj": string | null,"codigo": string,"codigo_operadora": string | null,"created_at": string | null,"email": string | null,"id": string,"logo_url": string | null,"nome": string,"portal_url": string | null,"prazo_retorno": number | null,"registro_ans": string | null,"responsavel_cargo": string | null,"responsavel_nome": string | null,"responsavel_telefone": string | null,"taxa_glosa": number | null,"telefone": string | null,"tipo_planos": (string)[] | null,"updated_at": string | null,"valor_consulta": number | null,"valor_retorno": number | null,"versao_tiss": string | null,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"carencia"?: number | null,"clinica_id"?: string | null,"cnpj"?: string | null,"codigo": string,"codigo_operadora"?: string | null,"created_at"?: string | null,"email"?: string | null,"id"?: string,"logo_url"?: string | null,"nome": string,"portal_url"?: string | null,"prazo_retorno"?: number | null,"registro_ans"?: string | null,"responsavel_cargo"?: string | null,"responsavel_nome"?: string | null,"responsavel_telefone"?: string | null,"taxa_glosa"?: number | null,"telefone"?: string | null,"tipo_planos"?: (string)[] | null,"updated_at"?: string | null,"valor_consulta"?: number | null,"valor_retorno"?: number | null,"versao_tiss"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"carencia"?: number | null,"clinica_id"?: string | null,"cnpj"?: string | null,"codigo"?: string,"codigo_operadora"?: string | null,"created_at"?: string | null,"email"?: string | null,"id"?: string,"logo_url"?: string | null,"nome"?: string,"portal_url"?: string | null,"prazo_retorno"?: number | null,"registro_ans"?: string | null,"responsavel_cargo"?: string | null,"responsavel_nome"?: string | null,"responsavel_telefone"?: string | null,"taxa_glosa"?: number | null,"telefone"?: string | null,"tipo_planos"?: (string)[] | null,"updated_at"?: string | null,"valor_consulta"?: number | null,"valor_retorno"?: number | null,"versao_tiss"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "convenios_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"convites_funcionario": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"clinica_id": string,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string,"nome": string,"roles": (string)[],"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"clinica_id": string,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by": string,"nome": string,"roles": (string)[],"token": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"clinica_id"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"nome"?: string,"roles"?: (string)[],"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "convites_funcionario_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"documentos_portal_paciente": {
                  Row: {
                    "anexo_id": string,"atualizado_em": string,"clinica_id": string,"id": string,"origem": string,"paciente_id": string,"publicado": boolean,"publicado_em": string | null,"publicado_por": string | null,"revogado_em": string | null,"revogado_por": string | null,"validade_ate": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anexo_id": string,"atualizado_em"?: string,"clinica_id": string,"id"?: string,"origem": string,"paciente_id": string,"publicado"?: boolean,"publicado_em"?: string | null,"publicado_por"?: string | null,"revogado_em"?: string | null,"revogado_por"?: string | null,"validade_ate"?: string | null
                  }
                  Update: {
                    "anexo_id"?: string,"atualizado_em"?: string,"clinica_id"?: string,"id"?: string,"origem"?: string,"paciente_id"?: string,"publicado"?: boolean,"publicado_em"?: string | null,"publicado_por"?: string | null,"revogado_em"?: string | null,"revogado_por"?: string | null,"validade_ate"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documentos_portal_paciente_anexo_id_fkey"
      columns: ["anexo_id"]
isOneToOne: true
      referencedRelation: "anexos_prontuario"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documentos_portal_paciente_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documentos_portal_paciente_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_invitations": {
                  Row: {
                    "accepted_at": string | null,"clinica_id": string | null,"created_at": string,"email": string,"expires_at": string,"funcionario_id": string,"id": string,"roles": (Database["public"]['Enums']["app_role"])[],"status": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"funcionario_id": string,"id"?: string,"roles"?: (Database["public"]['Enums']["app_role"])[],"status"?: string,"token": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"funcionario_id"?: string,"id"?: string,"roles"?: (Database["public"]['Enums']["app_role"])[],"status"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_invitations_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employee_invitations_funcionario_id_fkey"
      columns: ["funcionario_id"]
isOneToOne: false
      referencedRelation: "funcionarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employee_invitations_funcionario_id_fkey"
      columns: ["funcionario_id"]
isOneToOne: false
      referencedRelation: "funcionarios_safe"
      referencedColumns: ["id"]
    }
                  ]
                },"encaminhamento_status_history": {
                  Row: {
                    "comentario": string | null,"data_mudanca": string,"encaminhamento_id": string,"id": string,"status_anterior": string | null,"status_novo": string,"usuario_id": string | null,"usuario_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comentario"?: string | null,"data_mudanca"?: string,"encaminhamento_id": string,"id"?: string,"status_anterior"?: string | null,"status_novo": string,"usuario_id"?: string | null,"usuario_nome"?: string | null
                  }
                  Update: {
                    "comentario"?: string | null,"data_mudanca"?: string,"encaminhamento_id"?: string,"id"?: string,"status_anterior"?: string | null,"status_novo"?: string,"usuario_id"?: string | null,"usuario_nome"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "encaminhamento_status_history_encaminhamento_id_fkey"
      columns: ["encaminhamento_id"]
isOneToOne: false
      referencedRelation: "encaminhamentos"
      referencedColumns: ["id"]
    }
                  ]
                },"encaminhamentos": {
                  Row: {
                    "cid_principal": string | null,"clinica_id": string | null,"contra_referencia": string | null,"created_at": string | null,"criado_por": string | null,"data_atendimento": string | null,"data_contra_referencia": string | null,"data_encaminhamento": string | null,"especialidade_destino": string,"exames_realizados": string | null,"hipotese_diagnostica": string | null,"id": string,"informacoes_adicionais": string | null,"medico_destino_id": string | null,"medico_origem_id": string | null,"motivo": string,"paciente_id": string,"prontuario_id": string | null,"status": string | null,"tipo": string | null,"tratamento_atual": string | null,"updated_at": string | null,"urgencia": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cid_principal"?: string | null,"clinica_id"?: string | null,"contra_referencia"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_atendimento"?: string | null,"data_contra_referencia"?: string | null,"data_encaminhamento"?: string | null,"especialidade_destino": string,"exames_realizados"?: string | null,"hipotese_diagnostica"?: string | null,"id"?: string,"informacoes_adicionais"?: string | null,"medico_destino_id"?: string | null,"medico_origem_id"?: string | null,"motivo": string,"paciente_id": string,"prontuario_id"?: string | null,"status"?: string | null,"tipo"?: string | null,"tratamento_atual"?: string | null,"updated_at"?: string | null,"urgencia"?: string | null
                  }
                  Update: {
                    "cid_principal"?: string | null,"clinica_id"?: string | null,"contra_referencia"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_atendimento"?: string | null,"data_contra_referencia"?: string | null,"data_encaminhamento"?: string | null,"especialidade_destino"?: string,"exames_realizados"?: string | null,"hipotese_diagnostica"?: string | null,"id"?: string,"informacoes_adicionais"?: string | null,"medico_destino_id"?: string | null,"medico_origem_id"?: string | null,"motivo"?: string,"paciente_id"?: string,"prontuario_id"?: string | null,"status"?: string | null,"tipo"?: string | null,"tratamento_atual"?: string | null,"updated_at"?: string | null,"urgencia"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "encaminhamentos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encaminhamentos_medico_destino_id_fkey"
      columns: ["medico_destino_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encaminhamentos_medico_origem_id_fkey"
      columns: ["medico_origem_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encaminhamentos_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encaminhamentos_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"especialidades_destino": {
                  Row: {
                    "ativo": boolean,"clinica_id": string | null,"codigo": string,"created_at": string,"descricao": string | null,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"clinica_id"?: string | null,"codigo": string,"created_at"?: string,"descricao"?: string | null,"id"?: string,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean,"clinica_id"?: string | null,"codigo"?: string,"created_at"?: string,"descricao"?: string | null,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "especialidades_destino_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque": {
                  Row: {
                    "categoria": string,"chave_cadastro": string | null,"clinica_id": string | null,"codigo_ean": string | null,"created_at": string | null,"descricao": string | null,"dosagem": string | null,"fabricante": string | null,"fornecedor": string | null,"foto_url": string | null,"id": string,"localizacao": string | null,"lote": string | null,"nome": string,"ponto_pedido": number | null,"principio_ativo": string | null,"quantidade": number,"quantidade_maxima": number | null,"quantidade_minima": number | null,"unidade": string | null,"updated_at": string | null,"validade": string | null,"valor_unitario": number | null,"valor_venda": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria": string,"chave_cadastro"?: string | null,"clinica_id"?: string | null,"codigo_ean"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"dosagem"?: string | null,"fabricante"?: string | null,"fornecedor"?: string | null,"foto_url"?: string | null,"id"?: string,"localizacao"?: string | null,"lote"?: string | null,"nome": string,"ponto_pedido"?: number | null,"principio_ativo"?: string | null,"quantidade"?: number,"quantidade_maxima"?: number | null,"quantidade_minima"?: number | null,"unidade"?: string | null,"updated_at"?: string | null,"validade"?: string | null,"valor_unitario"?: number | null,"valor_venda"?: number | null
                  }
                  Update: {
                    "categoria"?: string,"chave_cadastro"?: string | null,"clinica_id"?: string | null,"codigo_ean"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"dosagem"?: string | null,"fabricante"?: string | null,"fornecedor"?: string | null,"foto_url"?: string | null,"id"?: string,"localizacao"?: string | null,"lote"?: string | null,"nome"?: string,"ponto_pedido"?: number | null,"principio_ativo"?: string | null,"quantidade"?: number,"quantidade_maxima"?: number | null,"quantidade_minima"?: number | null,"unidade"?: string | null,"updated_at"?: string | null,"validade"?: string | null,"valor_unitario"?: number | null,"valor_venda"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "estoque_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"exames": {
                  Row: {
                    "arquivo_resultado": string | null,"categoria": string | null,"clinica_id": string | null,"created_at": string | null,"data_agendamento": string | null,"data_realizacao": string | null,"data_solicitacao": string | null,"descricao": string | null,"id": string,"laboratorio_id": string | null,"medico_solicitante_id": string | null,"observacoes": string | null,"paciente_id": string | null,"pedido_laboratorio_id": string | null,"preco_custo": number | null,"preco_venda": number | null,"prontuario_id": string | null,"resultado": string | null,"resultado_em": string | null,"resultado_por": string | null,"status": Database["public"]['Enums']["status_exame"] | null,"tipo_categorizado": string | null,"tipo_exame": string,"tipo_exame_catalog_id": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo_resultado"?: string | null,"categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_agendamento"?: string | null,"data_realizacao"?: string | null,"data_solicitacao"?: string | null,"descricao"?: string | null,"id"?: string,"laboratorio_id"?: string | null,"medico_solicitante_id"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"pedido_laboratorio_id"?: string | null,"preco_custo"?: number | null,"preco_venda"?: number | null,"prontuario_id"?: string | null,"resultado"?: string | null,"resultado_em"?: string | null,"resultado_por"?: string | null,"status"?: Database["public"]['Enums']["status_exame"] | null,"tipo_categorizado"?: string | null,"tipo_exame": string,"tipo_exame_catalog_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "arquivo_resultado"?: string | null,"categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_agendamento"?: string | null,"data_realizacao"?: string | null,"data_solicitacao"?: string | null,"descricao"?: string | null,"id"?: string,"laboratorio_id"?: string | null,"medico_solicitante_id"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"pedido_laboratorio_id"?: string | null,"preco_custo"?: number | null,"preco_venda"?: number | null,"prontuario_id"?: string | null,"resultado"?: string | null,"resultado_em"?: string | null,"resultado_por"?: string | null,"status"?: Database["public"]['Enums']["status_exame"] | null,"tipo_categorizado"?: string | null,"tipo_exame"?: string,"tipo_exame_catalog_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exames_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_laboratorio_id_fkey"
      columns: ["laboratorio_id"]
isOneToOne: false
      referencedRelation: "laboratorios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_medico_solicitante_id_fkey"
      columns: ["medico_solicitante_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_pedido_laboratorio_id_fkey"
      columns: ["pedido_laboratorio_id"]
isOneToOne: false
      referencedRelation: "pedidos_laboratorio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_resultado_por_fkey"
      columns: ["resultado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exames_tipo_exame_catalog_id_fkey"
      columns: ["tipo_exame_catalog_id"]
isOneToOne: false
      referencedRelation: "tipo_exames_catalog"
      referencedColumns: ["id"]
    }
                  ]
                },"extrato_bancario_transacoes": {
                  Row: {
                    "clinica_id": string,"conta": string,"data": string,"descricao": string | null,"fitid": string,"id": string,"importado_em": string,"importado_por": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"conta": string,"data": string,"descricao"?: string | null,"fitid": string,"id"?: string,"importado_em"?: string,"importado_por": string,"valor": number
                  }
                  Update: {
                    "clinica_id"?: string,"conta"?: string,"data"?: string,"descricao"?: string | null,"fitid"?: string,"id"?: string,"importado_em"?: string,"importado_por"?: string,"valor"?: number
                  }
                  Relationships: [
                    
                  ]
                },"feedbacks_nps": {
                  Row: {
                    "agendamento_id": string | null,"categoria": string | null,"clinica_id": string | null,"comentario": string | null,"created_at": string | null,"id": string,"medico_id": string | null,"nota": number,"paciente_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"categoria"?: string | null,"clinica_id"?: string | null,"comentario"?: string | null,"created_at"?: string | null,"id"?: string,"medico_id"?: string | null,"nota": number,"paciente_id"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"categoria"?: string | null,"clinica_id"?: string | null,"comentario"?: string | null,"created_at"?: string | null,"id"?: string,"medico_id"?: string | null,"nota"?: number,"paciente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedbacks_nps_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedbacks_nps_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedbacks_nps_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedbacks_nps_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"fila_atendimento": {
                  Row: {
                    "agendamento_id": string,"clinica_id": string | null,"cobranca_estado": string,"created_at": string | null,"horario_chegada": string | null,"id": string,"posicao": number,"prioridade": string | null,"sala_id": string | null,"status": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id": string,"clinica_id"?: string | null,"cobranca_estado"?: string,"created_at"?: string | null,"horario_chegada"?: string | null,"id"?: string,"posicao": number,"prioridade"?: string | null,"sala_id"?: string | null,"status"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string,"clinica_id"?: string | null,"cobranca_estado"?: string,"created_at"?: string | null,"horario_chegada"?: string | null,"id"?: string,"posicao"?: number,"prioridade"?: string | null,"sala_id"?: string | null,"status"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fila_atendimento_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fila_atendimento_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fila_atendimento_sala_id_fkey"
      columns: ["sala_id"]
isOneToOne: false
      referencedRelation: "salas"
      referencedColumns: ["id"]
    }
                  ]
                },"fila_atendimento_eventos": {
                  Row: {
                    "agendamento_id": string | null,"atendimento_reaberto": boolean,"clinica_id": string,"fila_id": string,"id": string,"motivo": string,"ocorreu_em": string,"paciente_id": string | null,"removido_por": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"atendimento_reaberto"?: boolean,"clinica_id": string,"fila_id": string,"id"?: string,"motivo": string,"ocorreu_em"?: string,"paciente_id"?: string | null,"removido_por": string
                  }
                  Update: {
                    "agendamento_id"?: string | null,"atendimento_reaberto"?: boolean,"clinica_id"?: string,"fila_id"?: string,"id"?: string,"motivo"?: string,"ocorreu_em"?: string,"paciente_id"?: string | null,"removido_por"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fila_atendimento_eventos_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fila_atendimento_eventos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fila_atendimento_eventos_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"funcionarios": {
                  Row: {
                    "ativo": boolean | null,"carga_horaria": number | null,"cargo": string | null,"clinica_id": string | null,"cpf": string | null,"created_at": string | null,"data_admissao": string | null,"data_nascimento": string | null,"departamento": string | null,"edit_version": number,"email": string | null,"especialidade": string | null,"id": string,"nome": string,"pending_roles": (Database["public"]['Enums']["app_role"])[],"registro_profissional": string | null,"salario": number | null,"telefone": string | null,"tipo_funcionario": string | null,"tipo_registro": string | null,"turno": string | null,"uf_registro": string | null,"updated_at": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"carga_horaria"?: number | null,"cargo"?: string | null,"clinica_id"?: string | null,"cpf"?: string | null,"created_at"?: string | null,"data_admissao"?: string | null,"data_nascimento"?: string | null,"departamento"?: string | null,"edit_version"?: number,"email"?: string | null,"especialidade"?: string | null,"id"?: string,"nome": string,"pending_roles"?: (Database["public"]['Enums']["app_role"])[],"registro_profissional"?: string | null,"salario"?: number | null,"telefone"?: string | null,"tipo_funcionario"?: string | null,"tipo_registro"?: string | null,"turno"?: string | null,"uf_registro"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"carga_horaria"?: number | null,"cargo"?: string | null,"clinica_id"?: string | null,"cpf"?: string | null,"created_at"?: string | null,"data_admissao"?: string | null,"data_nascimento"?: string | null,"departamento"?: string | null,"edit_version"?: number,"email"?: string | null,"especialidade"?: string | null,"id"?: string,"nome"?: string,"pending_roles"?: (Database["public"]['Enums']["app_role"])[],"registro_profissional"?: string | null,"salario"?: number | null,"telefone"?: string | null,"tipo_funcionario"?: string | null,"tipo_registro"?: string | null,"turno"?: string | null,"uf_registro"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "funcionarios_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"glosa_recurso_documentos": {
                  Row: {
                    "byte_size": number,"clinica_id": string,"content_type": string,"created_at": string,"enviado_por": string,"file_name": string,"glosa_id": string,"id": string,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "byte_size": number,"clinica_id": string,"content_type": string,"created_at"?: string,"enviado_por": string,"file_name": string,"glosa_id": string,"id"?: string,"storage_path": string
                  }
                  Update: {
                    "byte_size"?: number,"clinica_id"?: string,"content_type"?: string,"created_at"?: string,"enviado_por"?: string,"file_name"?: string,"glosa_id"?: string,"id"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    
                  ]
                },"glosas_convenio": {                  Row: {
                    "chave_idempotencia": string | null,"clinica_id": string,"codigo_glosa": string,"created_at": string,"criado_por": string | null,"guia_referencia": string | null,"id": string,"lote_id": string,"motivo": string,"recurso_enviado_em": string | null,"recurso_justificativa": string | null,"recurso_prazo": string | null,"recurso_responsavel_id": string | null,"resolvido_em": string | null,"status": string,"updated_at": string,"valor_glosado": number,"valor_recuperado": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_idempotencia"?: string | null,"clinica_id": string,"codigo_glosa": string,"created_at"?: string,"criado_por"?: string | null,"guia_referencia"?: string | null,"id"?: string,"lote_id": string,"motivo": string,"recurso_enviado_em"?: string | null,"recurso_justificativa"?: string | null,"recurso_prazo"?: string | null,"recurso_responsavel_id"?: string | null,"resolvido_em"?: string | null,"status"?: string,"updated_at"?: string,"valor_glosado": number,"valor_recuperado"?: number
                  }
                  Update: {
                    "chave_idempotencia"?: string | null,"clinica_id"?: string,"codigo_glosa"?: string,"created_at"?: string,"criado_por"?: string | null,"guia_referencia"?: string | null,"id"?: string,"lote_id"?: string,"motivo"?: string,"recurso_enviado_em"?: string | null,"recurso_justificativa"?: string | null,"recurso_prazo"?: string | null,"recurso_responsavel_id"?: string | null,"resolvido_em"?: string | null,"status"?: string,"updated_at"?: string,"valor_glosado"?: number,"valor_recuperado"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "glosas_convenio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "glosas_convenio_lote_id_fkey"
      columns: ["lote_id"]
isOneToOne: false
      referencedRelation: "lotes_tiss"
      referencedColumns: ["id"]
    }
                  ]
                },"guias_externas": {
                  Row: {
                    "agendamento_id": string | null,"anexo_nome": string | null,"anexo_url": string | null,"clinica_id": string | null,"convenio_id": string | null,"convenio_nome": string | null,"created_at": string,"custo_laboratorio": number | null,"data_agendamento": string | null,"data_envio_laboratorio": string | null,"data_recebimento": string,"data_retorno_laboratorio": string | null,"exames_solicitados": NonNullable<Json>,"hora_agendamento": string | null,"id": string,"laboratorio_id": string | null,"laudo_externo_nome": string | null,"laudo_externo_url": string | null,"medico_externo_contato": string | null,"medico_externo_crm": string | null,"medico_externo_especialidade": string | null,"medico_externo_nome": string | null,"medico_externo_uf": string | null,"numero_autorizacao": string | null,"observacoes": string | null,"origem": string,"paciente_cpf": string | null,"paciente_email": string | null,"paciente_id": string | null,"paciente_nascimento": string | null,"paciente_nome": string,"paciente_sexo": string | null,"paciente_telefone": string | null,"prazo_laboratorio": string | null,"registrado_por": string | null,"status": string,"status_terceirizacao": string,"updated_at": string,"validade_autorizacao": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"anexo_nome"?: string | null,"anexo_url"?: string | null,"clinica_id"?: string | null,"convenio_id"?: string | null,"convenio_nome"?: string | null,"created_at"?: string,"custo_laboratorio"?: number | null,"data_agendamento"?: string | null,"data_envio_laboratorio"?: string | null,"data_recebimento"?: string,"data_retorno_laboratorio"?: string | null,"exames_solicitados"?: NonNullable<Json>,"hora_agendamento"?: string | null,"id"?: string,"laboratorio_id"?: string | null,"laudo_externo_nome"?: string | null,"laudo_externo_url"?: string | null,"medico_externo_contato"?: string | null,"medico_externo_crm"?: string | null,"medico_externo_especialidade"?: string | null,"medico_externo_nome"?: string | null,"medico_externo_uf"?: string | null,"numero_autorizacao"?: string | null,"observacoes"?: string | null,"origem"?: string,"paciente_cpf"?: string | null,"paciente_email"?: string | null,"paciente_id"?: string | null,"paciente_nascimento"?: string | null,"paciente_nome": string,"paciente_sexo"?: string | null,"paciente_telefone"?: string | null,"prazo_laboratorio"?: string | null,"registrado_por"?: string | null,"status"?: string,"status_terceirizacao"?: string,"updated_at"?: string,"validade_autorizacao"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"anexo_nome"?: string | null,"anexo_url"?: string | null,"clinica_id"?: string | null,"convenio_id"?: string | null,"convenio_nome"?: string | null,"created_at"?: string,"custo_laboratorio"?: number | null,"data_agendamento"?: string | null,"data_envio_laboratorio"?: string | null,"data_recebimento"?: string,"data_retorno_laboratorio"?: string | null,"exames_solicitados"?: NonNullable<Json>,"hora_agendamento"?: string | null,"id"?: string,"laboratorio_id"?: string | null,"laudo_externo_nome"?: string | null,"laudo_externo_url"?: string | null,"medico_externo_contato"?: string | null,"medico_externo_crm"?: string | null,"medico_externo_especialidade"?: string | null,"medico_externo_nome"?: string | null,"medico_externo_uf"?: string | null,"numero_autorizacao"?: string | null,"observacoes"?: string | null,"origem"?: string,"paciente_cpf"?: string | null,"paciente_email"?: string | null,"paciente_id"?: string | null,"paciente_nascimento"?: string | null,"paciente_nome"?: string,"paciente_sexo"?: string | null,"paciente_telefone"?: string | null,"prazo_laboratorio"?: string | null,"registrado_por"?: string | null,"status"?: string,"status_terceirizacao"?: string,"updated_at"?: string,"validade_autorizacao"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guias_externas_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guias_externas_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guias_externas_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guias_externas_laboratorio_id_fkey"
      columns: ["laboratorio_id"]
isOneToOne: false
      referencedRelation: "laboratorios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guias_externas_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"guias_externas_eventos_lab": {
                  Row: {
                    "ator_id": string | null,"clinica_id": string,"created_at": string,"detalhes": NonNullable<Json>,"guia_id": string,"id": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ator_id"?: string | null,"clinica_id": string,"created_at"?: string,"detalhes"?: NonNullable<Json>,"guia_id": string,"id"?: string,"tipo": string
                  }
                  Update: {
                    "ator_id"?: string | null,"clinica_id"?: string,"created_at"?: string,"detalhes"?: NonNullable<Json>,"guia_id"?: string,"id"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guias_externas_eventos_lab_ator_id_fkey"
      columns: ["ator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guias_externas_eventos_lab_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guias_externas_eventos_lab_guia_id_fkey"
      columns: ["guia_id"]
isOneToOne: false
      referencedRelation: "guias_externas"
      referencedColumns: ["id"]
    }
                  ]
                },"integraciones": {
                  Row: {
                    "chave": string,"chave_secreta": string | null,"clinica_id": string | null,"config_data": Json | null,"created_at": string,"id": string,"nome": string,"status": string | null,"teste_resultado": string | null,"tipo": string,"ultimo_teste": string | null,"updated_at": string,"webhook_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"chave_secreta"?: string | null,"clinica_id"?: string | null,"config_data"?: Json | null,"created_at"?: string,"id"?: string,"nome": string,"status"?: string | null,"teste_resultado"?: string | null,"tipo": string,"ultimo_teste"?: string | null,"updated_at"?: string,"webhook_url"?: string | null
                  }
                  Update: {
                    "chave"?: string,"chave_secreta"?: string | null,"clinica_id"?: string | null,"config_data"?: Json | null,"created_at"?: string,"id"?: string,"nome"?: string,"status"?: string | null,"teste_resultado"?: string | null,"tipo"?: string,"ultimo_teste"?: string | null,"updated_at"?: string,"webhook_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integraciones_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"integracoes_clinica": {
                  Row: {
                    "clinica_id": string,"conectado_em": string,"conectado_por": string | null,"config": NonNullable<Json>,"id": string,"provedor": string,"referencia_id": string | null,"segredo_cifrado": string | null,"segredo_dica": string | null,"status": string,"ultimo_erro": string | null,"ultimo_teste_em": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"conectado_em"?: string,"conectado_por"?: string | null,"config"?: NonNullable<Json>,"id"?: string,"provedor": string,"referencia_id"?: string | null,"segredo_cifrado"?: string | null,"segredo_dica"?: string | null,"status"?: string,"ultimo_erro"?: string | null,"ultimo_teste_em"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "clinica_id"?: string,"conectado_em"?: string,"conectado_por"?: string | null,"config"?: NonNullable<Json>,"id"?: string,"provedor"?: string,"referencia_id"?: string | null,"segredo_cifrado"?: string | null,"segredo_dica"?: string | null,"status"?: string,"ultimo_erro"?: string | null,"ultimo_teste_em"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integracoes_clinica_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"interoperability_exports": {
                  Row: {
                    "clinica_id": string,"created_at": string,"exportado_por": string,"formato": string,"id": string,"paciente_id": string,"quantidade_recursos": number
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"exportado_por": string,"formato": string,"id"?: string,"paciente_id": string,"quantidade_recursos": number
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"exportado_por"?: string,"formato"?: string,"id"?: string,"paciente_id"?: string,"quantidade_recursos"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "interoperability_exports_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interoperability_exports_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"laboratorio_controles_qualidade": {
                  Row: {
                    "analito": string,"aprovado": boolean | null,"clinica_id": string,"created_at": string,"equipamento_id": string | null,"id": string,"limite_inferior": number | null,"limite_superior": number | null,"lote_insumo_id": string | null,"nivel": string | null,"observacoes": string | null,"realizado_em": string,"realizado_por": string | null,"resultado": number,"setor_id": string | null,"unidade": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analito": string,"aprovado"?: never,"clinica_id": string,"created_at"?: string,"equipamento_id"?: string | null,"id"?: string,"limite_inferior"?: number | null,"limite_superior"?: number | null,"lote_insumo_id"?: string | null,"nivel"?: string | null,"observacoes"?: string | null,"realizado_em"?: string,"realizado_por"?: string | null,"resultado": number,"setor_id"?: string | null,"unidade"?: string | null
                  }
                  Update: {
                    "analito"?: string,"aprovado"?: never,"clinica_id"?: string,"created_at"?: string,"equipamento_id"?: string | null,"id"?: string,"limite_inferior"?: number | null,"limite_superior"?: number | null,"lote_insumo_id"?: string | null,"nivel"?: string | null,"observacoes"?: string | null,"realizado_em"?: string,"realizado_por"?: string | null,"resultado"?: number,"setor_id"?: string | null,"unidade"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "laboratorio_controles_qualidade_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_controles_qualidade_equipamento_id_fkey"
      columns: ["equipamento_id"]
isOneToOne: false
      referencedRelation: "laboratorio_equipamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_controles_qualidade_lote_insumo_id_fkey"
      columns: ["lote_insumo_id"]
isOneToOne: false
      referencedRelation: "laboratorio_lotes_insumos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_controles_qualidade_realizado_por_fkey"
      columns: ["realizado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_controles_qualidade_setor_id_fkey"
      columns: ["setor_id"]
isOneToOne: false
      referencedRelation: "laboratorio_setores"
      referencedColumns: ["id"]
    }
                  ]
                },"laboratorio_equipamentos": {
                  Row: {
                    "calibracao_vencimento": string | null,"calibrado_em": string | null,"clinica_id": string,"created_at": string,"fabricante": string | null,"id": string,"identificador_interno": string | null,"modelo": string | null,"nome": string,"numero_serie": string | null,"observacoes": string | null,"setor_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calibracao_vencimento"?: string | null,"calibrado_em"?: string | null,"clinica_id": string,"created_at"?: string,"fabricante"?: string | null,"id"?: string,"identificador_interno"?: string | null,"modelo"?: string | null,"nome": string,"numero_serie"?: string | null,"observacoes"?: string | null,"setor_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "calibracao_vencimento"?: string | null,"calibrado_em"?: string | null,"clinica_id"?: string,"created_at"?: string,"fabricante"?: string | null,"id"?: string,"identificador_interno"?: string | null,"modelo"?: string | null,"nome"?: string,"numero_serie"?: string | null,"observacoes"?: string | null,"setor_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "laboratorio_equipamentos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_equipamentos_setor_id_fkey"
      columns: ["setor_id"]
isOneToOne: false
      referencedRelation: "laboratorio_setores"
      referencedColumns: ["id"]
    }
                  ]
                },"laboratorio_eventos_amostra": {
                  Row: {
                    "ator_id": string | null,"clinica_id": string,"coleta_id": string,"created_at": string,"detalhes": NonNullable<Json>,"id": string,"local": string | null,"status_anterior": string | null,"status_novo": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ator_id"?: string | null,"clinica_id": string,"coleta_id": string,"created_at"?: string,"detalhes"?: NonNullable<Json>,"id"?: string,"local"?: string | null,"status_anterior"?: string | null,"status_novo"?: string | null,"tipo": string
                  }
                  Update: {
                    "ator_id"?: string | null,"clinica_id"?: string,"coleta_id"?: string,"created_at"?: string,"detalhes"?: NonNullable<Json>,"id"?: string,"local"?: string | null,"status_anterior"?: string | null,"status_novo"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "laboratorio_eventos_amostra_ator_id_fkey"
      columns: ["ator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_eventos_amostra_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_eventos_amostra_coleta_id_fkey"
      columns: ["coleta_id"]
isOneToOne: false
      referencedRelation: "coletas_laboratorio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_eventos_amostra_coleta_id_fkey"
      columns: ["coleta_id"]
isOneToOne: false
      referencedRelation: "fila_alertas_lab_esquecido"
      referencedColumns: ["coleta_id"]
    }
                  ]
                },"laboratorio_lotes_insumos": {
                  Row: {
                    "clinica_id": string,"created_at": string,"estoque_id": string | null,"fabricante": string | null,"id": string,"lote": string,"nome": string,"observacoes": string | null,"quantidade": number,"recebido_em": string | null,"status": string,"tipo": string,"unidade": string | null,"updated_at": string,"validade": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"estoque_id"?: string | null,"fabricante"?: string | null,"id"?: string,"lote": string,"nome": string,"observacoes"?: string | null,"quantidade"?: number,"recebido_em"?: string | null,"status"?: string,"tipo"?: string,"unidade"?: string | null,"updated_at"?: string,"validade"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"estoque_id"?: string | null,"fabricante"?: string | null,"id"?: string,"lote"?: string,"nome"?: string,"observacoes"?: string | null,"quantidade"?: number,"recebido_em"?: string | null,"status"?: string,"tipo"?: string,"unidade"?: string | null,"updated_at"?: string,"validade"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "laboratorio_lotes_insumos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "laboratorio_lotes_insumos_estoque_id_fkey"
      columns: ["estoque_id"]
isOneToOne: false
      referencedRelation: "estoque"
      referencedColumns: ["id"]
    }
                  ]
                },"laboratorio_setores": {
                  Row: {
                    "ativo": boolean,"clinica_id": string,"created_at": string,"descricao": string | null,"id": string,"nome": string,"sla_alerta_horas": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"clinica_id": string,"created_at"?: string,"descricao"?: string | null,"id"?: string,"nome": string,"sla_alerta_horas"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"clinica_id"?: string,"created_at"?: string,"descricao"?: string | null,"id"?: string,"nome"?: string,"sla_alerta_horas"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "laboratorio_setores_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"laboratorios": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string,"cnpj": string | null,"created_at": string | null,"email": string | null,"endereco": string | null,"id": string,"nome": string,"telefone": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id": string,"cnpj"?: string | null,"created_at"?: string | null,"email"?: string | null,"endereco"?: string | null,"id"?: string,"nome": string,"telefone"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string,"cnpj"?: string | null,"created_at"?: string | null,"email"?: string | null,"endereco"?: string | null,"id"?: string,"nome"?: string,"telefone"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "laboratorios_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"lancamento_itens": {
                  Row: {
                    "categoria": string,"clinica_id": string | null,"created_at": string,"criado_por": string | null,"descricao": string,"id": string,"lancamento_id": string,"origem": string,"prontuario_id": string | null,"quantidade": number,"valor_total": number | null,"valor_unitario": number
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string,"clinica_id"?: string | null,"created_at"?: string,"criado_por"?: string | null,"descricao": string,"id"?: string,"lancamento_id": string,"origem"?: string,"prontuario_id"?: string | null,"quantidade"?: number,"valor_total"?: never,"valor_unitario": number
                  }
                  Update: {
                    "categoria"?: string,"clinica_id"?: string | null,"created_at"?: string,"criado_por"?: string | null,"descricao"?: string,"id"?: string,"lancamento_id"?: string,"origem"?: string,"prontuario_id"?: string | null,"quantidade"?: number,"valor_total"?: never,"valor_unitario"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamento_itens_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamento_itens_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamento_itens_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamento_itens_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"lancamentos": {
                  Row: {
                    "acrescimo": number,"agendamento_id": string | null,"anexo_url": string | null,"categoria": string,"centro_custo": string | null,"clinica_id": string | null,"competencia": string | null,"created_at": string | null,"data": string,"data_emissao": string | null,"data_emprestimo": string | null,"data_pagamento": string | null,"data_vencimento": string | null,"desconto": number,"descricao": string,"forma_pagamento": string | null,"fornecedor": string | null,"frequencia_pagamento": string | null,"frequencia_recorrencia": string | null,"id": string,"lote_tiss_id": string | null,"numero_documento": string | null,"observacoes": string | null,"paciente_id": string | null,"recorrencia_origem_id": string | null,"recorrente": boolean | null,"status": Database["public"]['Enums']["status_pagamento"] | null,"tipo": string,"updated_at": string | null,"valor": number,"valor_pago": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acrescimo"?: number,"agendamento_id"?: string | null,"anexo_url"?: string | null,"categoria"?: string,"centro_custo"?: string | null,"clinica_id"?: string | null,"competencia"?: string | null,"created_at"?: string | null,"data"?: string,"data_emissao"?: string | null,"data_emprestimo"?: string | null,"data_pagamento"?: string | null,"data_vencimento"?: string | null,"desconto"?: number,"descricao": string,"forma_pagamento"?: string | null,"fornecedor"?: string | null,"frequencia_pagamento"?: string | null,"frequencia_recorrencia"?: string | null,"id"?: string,"lote_tiss_id"?: string | null,"numero_documento"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"recorrencia_origem_id"?: string | null,"recorrente"?: boolean | null,"status"?: Database["public"]['Enums']["status_pagamento"] | null,"tipo": string,"updated_at"?: string | null,"valor": number,"valor_pago"?: number | null
                  }
                  Update: {
                    "acrescimo"?: number,"agendamento_id"?: string | null,"anexo_url"?: string | null,"categoria"?: string,"centro_custo"?: string | null,"clinica_id"?: string | null,"competencia"?: string | null,"created_at"?: string | null,"data"?: string,"data_emissao"?: string | null,"data_emprestimo"?: string | null,"data_pagamento"?: string | null,"data_vencimento"?: string | null,"desconto"?: number,"descricao"?: string,"forma_pagamento"?: string | null,"fornecedor"?: string | null,"frequencia_pagamento"?: string | null,"frequencia_recorrencia"?: string | null,"id"?: string,"lote_tiss_id"?: string | null,"numero_documento"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"recorrencia_origem_id"?: string | null,"recorrente"?: boolean | null,"status"?: Database["public"]['Enums']["status_pagamento"] | null,"tipo"?: string,"updated_at"?: string | null,"valor"?: number,"valor_pago"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamentos_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_lote_tiss_id_fkey"
      columns: ["lote_tiss_id"]
isOneToOne: false
      referencedRelation: "lotes_tiss"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"lgpd_access_request_log": {
                  Row: {
                    "base_legal": string | null,"clinica_id": string | null,"created_at": string,"escopo": (string)[] | null,"evidencia": string | null,"fulfillment_date": string | null,"id": string,"notes": string | null,"paciente_id": string,"prazo_em": string | null,"protocolo": string | null,"request_type": string,"requested_at": string,"responsavel_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_legal"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"escopo"?: (string)[] | null,"evidencia"?: string | null,"fulfillment_date"?: string | null,"id"?: string,"notes"?: string | null,"paciente_id": string,"prazo_em"?: string | null,"protocolo"?: string | null,"request_type": string,"requested_at"?: string,"responsavel_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "base_legal"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"escopo"?: (string)[] | null,"evidencia"?: string | null,"fulfillment_date"?: string | null,"id"?: string,"notes"?: string | null,"paciente_id"?: string,"prazo_em"?: string | null,"protocolo"?: string | null,"request_type"?: string,"requested_at"?: string,"responsavel_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lgpd_access_request_log_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lgpd_access_request_log_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"lgpd_consent_log": {
                  Row: {
                    "accepted": boolean,"clinica_id": string | null,"consent_type": string,"created_at": string,"id": string,"ip_address": string | null,"paciente_id": string,"timestamp": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted": boolean,"clinica_id"?: string | null,"consent_type": string,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"paciente_id": string,"timestamp"?: string,"user_agent"?: string | null
                  }
                  Update: {
                    "accepted"?: boolean,"clinica_id"?: string | null,"consent_type"?: string,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"paciente_id"?: string,"timestamp"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lgpd_consent_log_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lgpd_consent_log_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"lgpd_deletion_log": {
                  Row: {
                    "clinica_id": string | null,"created_at": string,"deleted_at": string,"deleted_by": string | null,"id": string,"paciente_id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string,"deleted_at"?: string,"deleted_by"?: string | null,"id"?: string,"paciente_id": string,"reason"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string,"deleted_at"?: string,"deleted_by"?: string | null,"id"?: string,"paciente_id"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lgpd_deletion_log_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"lista_espera": {
                  Row: {
                    "clinica_id": string | null,"created_at": string | null,"data_cadastro": string | null,"especialidade": string | null,"id": string,"medico_id": string | null,"motivo": string | null,"observacoes": string | null,"oferta_agendamento_id": string | null,"oferta_expira_em": string | null,"paciente_id": string,"preferencia_horario": string | null,"prioridade": string | null,"status": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"data_cadastro"?: string | null,"especialidade"?: string | null,"id"?: string,"medico_id"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"oferta_agendamento_id"?: string | null,"oferta_expira_em"?: string | null,"paciente_id": string,"preferencia_horario"?: string | null,"prioridade"?: string | null,"status"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"data_cadastro"?: string | null,"especialidade"?: string | null,"id"?: string,"medico_id"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"oferta_agendamento_id"?: string | null,"oferta_expira_em"?: string | null,"paciente_id"?: string,"preferencia_horario"?: string | null,"prioridade"?: string | null,"status"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lista_espera_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lista_espera_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lista_espera_oferta_agendamento_id_fkey"
      columns: ["oferta_agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lista_espera_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"lote_tiss_guias": {
                  Row: {
                    "autorizacao_id": string | null,"clinica_id": string,"codigo_procedimento": string,"created_at": string,"criado_por": string | null,"data_atendimento": string,"id": string,"lote_id": string,"numero_carteira": string | null,"numero_guia": string,"paciente_id": string | null,"quantidade": number,"tipo_servico": string,"valor_total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "autorizacao_id"?: string | null,"clinica_id": string,"codigo_procedimento": string,"created_at"?: string,"criado_por"?: string | null,"data_atendimento": string,"id"?: string,"lote_id": string,"numero_carteira"?: string | null,"numero_guia": string,"paciente_id"?: string | null,"quantidade": number,"tipo_servico": string,"valor_total": number
                  }
                  Update: {
                    "autorizacao_id"?: string | null,"clinica_id"?: string,"codigo_procedimento"?: string,"created_at"?: string,"criado_por"?: string | null,"data_atendimento"?: string,"id"?: string,"lote_id"?: string,"numero_carteira"?: string | null,"numero_guia"?: string,"paciente_id"?: string | null,"quantidade"?: number,"tipo_servico"?: string,"valor_total"?: number
                  }
                  Relationships: [

                  ]
                },"lotes_tiss": {
                  Row: {
                    "clinica_id": string,"competencia": string,"convenio_id": string,"created_at": string,"criado_por": string | null,"enviado_em": string | null,"id": string,"numero_lote": string,"observacoes": string | null,"protocolo_operadora": string | null,"quantidade_guias": number,"retorno_em": string | null,"status": string,"updated_at": string,"valor_apresentado": number,"valor_conciliado_financeiro": number,"valor_pago": number,"versao_tiss": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"competencia": string,"convenio_id": string,"created_at"?: string,"criado_por"?: string | null,"enviado_em"?: string | null,"id"?: string,"numero_lote": string,"observacoes"?: string | null,"protocolo_operadora"?: string | null,"quantidade_guias"?: number,"retorno_em"?: string | null,"status"?: string,"updated_at"?: string,"valor_apresentado"?: number,"valor_conciliado_financeiro"?: number,"valor_pago"?: number,"versao_tiss": string
                  }
                  Update: {
                    "clinica_id"?: string,"competencia"?: string,"convenio_id"?: string,"created_at"?: string,"criado_por"?: string | null,"enviado_em"?: string | null,"id"?: string,"numero_lote"?: string,"observacoes"?: string | null,"protocolo_operadora"?: string | null,"quantidade_guias"?: number,"retorno_em"?: string | null,"status"?: string,"updated_at"?: string,"valor_apresentado"?: number,"valor_conciliado_financeiro"?: number,"valor_pago"?: number,"versao_tiss"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lotes_tiss_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lotes_tiss_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"medico_disponibilidade": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"dia_semana": number,"duracao_consulta": number,"hora_fim": string,"hora_inicio": string,"id": string,"intervalo_consultas": number,"medico_id": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"dia_semana": number,"duracao_consulta"?: number,"hora_fim": string,"hora_inicio": string,"id"?: string,"intervalo_consultas"?: number,"medico_id": string,"updated_at"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"dia_semana"?: number,"duracao_consulta"?: number,"hora_fim"?: string,"hora_inicio"?: string,"id"?: string,"intervalo_consultas"?: number,"medico_id"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "medico_disponibilidade_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    }
                  ]
                },"medicos": {
                  Row: {
                    "ativo": boolean | null,"carimbo_url": string | null,"clinica_id": string | null,"cns": string | null,"cpf": string | null,"created_at": string | null,"crm": string,"crm_uf": string | null,"data_nascimento": string | null,"email": string | null,"especialidade": string | null,"foto_url": string | null,"id": string,"intervalo_consulta": number | null,"nome": string | null,"percentual_repasse": number,"rqe": string | null,"telefone": string | null,"tipo_registro": string | null,"tipo_repasse": string,"updated_at": string | null,"user_id": string | null,"valor_repasse_fixo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"carimbo_url"?: string | null,"clinica_id"?: string | null,"cns"?: string | null,"cpf"?: string | null,"created_at"?: string | null,"crm": string,"crm_uf"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"especialidade"?: string | null,"foto_url"?: string | null,"id"?: string,"intervalo_consulta"?: number | null,"nome"?: string | null,"percentual_repasse"?: number,"rqe"?: string | null,"telefone"?: string | null,"tipo_registro"?: string | null,"tipo_repasse"?: string,"updated_at"?: string | null,"user_id"?: string | null,"valor_repasse_fixo"?: number
                  }
                  Update: {
                    "ativo"?: boolean | null,"carimbo_url"?: string | null,"clinica_id"?: string | null,"cns"?: string | null,"cpf"?: string | null,"created_at"?: string | null,"crm"?: string,"crm_uf"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"especialidade"?: string | null,"foto_url"?: string | null,"id"?: string,"intervalo_consulta"?: number | null,"nome"?: string | null,"percentual_repasse"?: number,"rqe"?: string | null,"telefone"?: string | null,"tipo_registro"?: string | null,"tipo_repasse"?: string,"updated_at"?: string | null,"user_id"?: string | null,"valor_repasse_fixo"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "medicos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"memed_prescricoes": {
                  Row: {
                    "clinica_id": string,"created_at": string,"data_prescricao": string | null,"excluida_em": string | null,"id": string,"medico_id": string,"memed_prescription_id": string | null,"memed_prescription_uuid": string,"paciente_id": string,"payload": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"data_prescricao"?: string | null,"excluida_em"?: string | null,"id"?: string,"medico_id": string,"memed_prescription_id"?: string | null,"memed_prescription_uuid": string,"paciente_id": string,"payload"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"data_prescricao"?: string | null,"excluida_em"?: string | null,"id"?: string,"medico_id"?: string,"memed_prescription_id"?: string | null,"memed_prescription_uuid"?: string,"paciente_id"?: string,"payload"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memed_prescricoes_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memed_prescricoes_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memed_prescricoes_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"mercadopago_oauth_refresh_locks": {
                  Row: {
                    "clinica_id": string,"lock_id": string,"lock_until": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"lock_id": string,"lock_until": string
                  }
                  Update: {
                    "clinica_id"?: string,"lock_id"?: string,"lock_until"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mercadopago_oauth_refresh_locks_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: true
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"mercadopago_oauth_states": {
                  Row: {
                    "clinica_id": string,"code_verifier_cifrado": string,"created_at": string,"expires_at": string,"state_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"code_verifier_cifrado": string,"created_at"?: string,"expires_at": string,"state_hash": string,"user_id": string
                  }
                  Update: {
                    "clinica_id"?: string,"code_verifier_cifrado"?: string,"created_at"?: string,"expires_at"?: string,"state_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mercadopago_oauth_states_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"mercadopago_point_orders": {
                  Row: {
                    "clinica_id": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"external_reference": string,"id": string,"idempotency_key": string,"lancamento_id": string,"mp_order_id": string | null,"mp_payment_id": string | null,"paid_at": string | null,"payment_method": string | null,"payment_sync_error": string | null,"payment_sync_status": string,"request_id": string,"status": string,"status_detail": string | null,"terminal_id": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"external_reference": string,"id"?: string,"idempotency_key": string,"lancamento_id": string,"mp_order_id"?: string | null,"mp_payment_id"?: string | null,"paid_at"?: string | null,"payment_method"?: string | null,"payment_sync_error"?: string | null,"payment_sync_status"?: string,"request_id": string,"status"?: string,"status_detail"?: string | null,"terminal_id": string,"updated_at"?: string,"valor": number
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"external_reference"?: string,"id"?: string,"idempotency_key"?: string,"lancamento_id"?: string,"mp_order_id"?: string | null,"mp_payment_id"?: string | null,"paid_at"?: string | null,"payment_method"?: string | null,"payment_sync_error"?: string | null,"payment_sync_status"?: string,"request_id"?: string,"status"?: string,"status_detail"?: string | null,"terminal_id"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "mercadopago_point_orders_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mercadopago_point_orders_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    }
                  ]
                },"mercadopago_webhook_logs": {
                  Row: {
                    "claim_token": string | null,"created_at": string | null,"data_id": string | null,"erro_mensagem": string | null,"event_id": string | null,"event_type": string,"id": string,"lease_until": string | null,"payload": NonNullable<Json>,"processado": boolean | null,"repeticoes": number,"sinal_ordem": string | null,"tentativas": number,"ultima_repeticao_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_token"?: string | null,"created_at"?: string | null,"data_id"?: string | null,"erro_mensagem"?: string | null,"event_id"?: string | null,"event_type": string,"id"?: string,"lease_until"?: string | null,"payload"?: NonNullable<Json>,"processado"?: boolean | null,"tentativas"?: number
                  }
                  Update: {
                    "claim_token"?: string | null,"created_at"?: string | null,"data_id"?: string | null,"erro_mensagem"?: string | null,"event_id"?: string | null,"event_type"?: string,"id"?: string,"lease_until"?: string | null,"payload"?: NonNullable<Json>,"processado"?: boolean | null,"repeticoes"?: number,"sinal_ordem"?: string | null,"tentativas"?: number,"ultima_repeticao_em"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"monitor_saude": {
                  Row: {
                    "alvo": string,"erro": string | null,"id": string,"ms": number | null,"ok": boolean,"status_code": number | null,"verificado_em": string,"virada": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "alvo": string,"erro"?: string | null,"id"?: string,"ms"?: number | null,"ok": boolean,"status_code"?: number | null,"verificado_em"?: string,"virada"?: boolean
                  }
                  Update: {
                    "alvo"?: string,"erro"?: string | null,"id"?: string,"ms"?: number | null,"ok"?: boolean,"status_code"?: number | null,"verificado_em"?: string,"virada"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"movimentacoes_estoque": {
                  Row: {
                    "chave_idempotencia": string | null,"clinica_id": string | null,"created_at": string | null,"data": string | null,"id": string,"item_id": string,"motivo": string | null,"prontuario_id": string | null,"quantidade": number,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_idempotencia"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data"?: string | null,"id"?: string,"item_id": string,"motivo"?: string | null,"prontuario_id"?: string | null,"quantidade": number,"tipo": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "chave_idempotencia"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data"?: string | null,"id"?: string,"item_id"?: string,"motivo"?: string | null,"prontuario_id"?: string | null,"quantidade"?: number,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimentacoes_estoque_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacoes_estoque_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "estoque"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacoes_estoque_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_queue": {
                  Row: {
                    "agendado_para": string | null,"assunto": string | null,"clinica_id": string | null,"conteudo": string,"created_at": string | null,"dados_extras": Json | null,"dedupe_key": string | null,"destinatario_email": string | null,"destinatario_id": string | null,"destinatario_nome": string | null,"destinatario_telefone": string | null,"enviado_em": string | null,"erro_mensagem": string | null,"id": string,"iniciado_em": string | null,"max_tentativas": number | null,"status": string,"template_id": string | null,"tentativas": number | null,"tipo": string,"ultimo_erro_em": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendado_para"?: string | null,"assunto"?: string | null,"clinica_id"?: string | null,"conteudo": string,"created_at"?: string | null,"dados_extras"?: Json | null,"dedupe_key"?: string | null,"destinatario_email"?: string | null,"destinatario_id"?: string | null,"destinatario_nome"?: string | null,"destinatario_telefone"?: string | null,"enviado_em"?: string | null,"erro_mensagem"?: string | null,"id"?: string,"iniciado_em"?: string | null,"max_tentativas"?: number | null,"status"?: string,"template_id"?: string | null,"tentativas"?: number | null,"tipo": string,"ultimo_erro_em"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "agendado_para"?: string | null,"assunto"?: string | null,"clinica_id"?: string | null,"conteudo"?: string,"created_at"?: string | null,"dados_extras"?: Json | null,"dedupe_key"?: string | null,"destinatario_email"?: string | null,"destinatario_id"?: string | null,"destinatario_nome"?: string | null,"destinatario_telefone"?: string | null,"enviado_em"?: string | null,"erro_mensagem"?: string | null,"id"?: string,"iniciado_em"?: string | null,"max_tentativas"?: number | null,"status"?: string,"template_id"?: string | null,"tentativas"?: number | null,"tipo"?: string,"ultimo_erro_em"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_queue_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_queue_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "notification_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_template_versions": {
                  Row: {
                    "action": string,"actor_type": string,"author_id": string | null,"author_name": string | null,"clinica_id": string | null,"created_at": string,"id": string,"revision": number,"snapshot": NonNullable<Json>,"template_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_type": string,"author_id"?: string | null,"author_name"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"id"?: string,"revision": number,"snapshot": NonNullable<Json>,"template_id": string
                  }
                  Update: {
                    "action"?: string,"actor_type"?: string,"author_id"?: string | null,"author_name"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"id"?: string,"revision"?: number,"snapshot"?: NonNullable<Json>,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_template_versions_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_templates": {
                  Row: {
                    "assunto": string | null,"ativo": boolean | null,"categoria": string,"clinica_id": string | null,"conteudo": string,"created_at": string | null,"id": string,"nome": string,"tipo": string,"updated_at": string | null,"variaveis": (string)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assunto"?: string | null,"ativo"?: boolean | null,"categoria": string,"clinica_id"?: string | null,"conteudo": string,"created_at"?: string | null,"id"?: string,"nome": string,"tipo": string,"updated_at"?: string | null,"variaveis"?: (string)[] | null
                  }
                  Update: {
                    "assunto"?: string | null,"ativo"?: boolean | null,"categoria"?: string,"clinica_id"?: string | null,"conteudo"?: string,"created_at"?: string | null,"id"?: string,"nome"?: string,"tipo"?: string,"updated_at"?: string | null,"variaveis"?: (string)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_templates_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"operational_events": {
                  Row: {
                    "actor_id": string | null,"aggregate_id": string,"aggregate_type": string,"clinica_id": string,"correlation_id": string,"created_at": string,"event_type": string,"id": number,"metadata": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"aggregate_id": string,"aggregate_type": string,"clinica_id": string,"correlation_id"?: string,"created_at"?: string,"event_type": string,"id"?: never,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "actor_id"?: string | null,"aggregate_id"?: string,"aggregate_type"?: string,"clinica_id"?: string,"correlation_id"?: string,"created_at"?: string,"event_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "operational_events_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"paciente_comorbidades": {
                  Row: {
                    "ativo": boolean,"cid10_id": string | null,"clinica_id": string | null,"codigo_cid": string | null,"created_at": string,"data_diagnostico": string | null,"descricao": string,"id": string,"observacoes": string | null,"paciente_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"cid10_id"?: string | null,"clinica_id"?: string | null,"codigo_cid"?: string | null,"created_at"?: string,"data_diagnostico"?: string | null,"descricao": string,"id"?: string,"observacoes"?: string | null,"paciente_id": string,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"cid10_id"?: string | null,"clinica_id"?: string | null,"codigo_cid"?: string | null,"created_at"?: string,"data_diagnostico"?: string | null,"descricao"?: string,"id"?: string,"observacoes"?: string | null,"paciente_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "paciente_comorbidades_cid10_id_fkey"
      columns: ["cid10_id"]
isOneToOne: false
      referencedRelation: "cid10_codigos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paciente_comorbidades_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paciente_comorbidades_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"paciente_portal_tokens": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string | null,"created_at": string | null,"expires_at": string | null,"id": string,"paciente_id": string,"token": string,"ultimo_acesso": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"created_at"?: string | null,"expires_at"?: string | null,"id"?: string,"paciente_id": string,"token"?: string,"ultimo_acesso"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"created_at"?: string | null,"expires_at"?: string | null,"id"?: string,"paciente_id"?: string,"token"?: string,"ultimo_acesso"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "paciente_portal_tokens_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paciente_portal_tokens_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"paciente_status_eventos": {
                  Row: {
                    "alterado_por": string,"ativo": boolean,"clinica_id": string,"id": string,"motivo": string,"ocorreu_em": string,"paciente_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alterado_por": string,"ativo": boolean,"clinica_id": string,"id"?: string,"motivo": string,"ocorreu_em"?: string,"paciente_id": string
                  }
                  Update: {
                    "alterado_por"?: string,"ativo"?: boolean,"clinica_id"?: string,"id"?: string,"motivo"?: string,"ocorreu_em"?: string,"paciente_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "paciente_status_eventos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paciente_status_eventos_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"pacientes": {
                  Row: {
                    "alergias": (string)[] | null,"amamentando": boolean,"ativo": boolean,"bairro": string | null,"cep": string | null,"cidade": string | null,"clinica_id": string | null,"complemento": string | null,"convenio_id": string | null,"cpf": string | null,"cpf_digitos": string | null,"cpf_responsavel": string | null,"created_at": string | null,"data_nascimento": string | null,"email": string | null,"email_confirmacao_origem": string | null,"email_confirmado_em": string | null,"email_confirmado_por": string | null,"estado": string | null,"estado_civil": string | null,"foto_url": string | null,"fuso_horario_contato": string,"gestante": boolean,"horario_contato_fim": string,"horario_contato_inicio": string,"id": string,"logradouro": string | null,"mesclado_em_paciente_id": string | null,"nome": string,"nome_responsavel": string | null,"nome_social": string | null,"numero": string | null,"numero_carteira": string | null,"observacoes": string | null,"parentesco_responsavel": string | null,"preferencia_canal_lembrete": string,"profissao": string | null,"sexo": string | null,"telefone": string | null,"telefone_confirmacao_origem": string | null,"telefone_confirmado_em": string | null,"telefone_confirmado_por": string | null,"telefone_digitos": string | null,"tipo_sanguineo": string | null,"updated_at": string | null,"validade_carteira": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alergias"?: (string)[] | null,"amamentando"?: boolean,"ativo"?: boolean,"bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"clinica_id"?: string | null,"complemento"?: string | null,"convenio_id"?: string | null,"cpf"?: string | null,"cpf_digitos"?: string | null,"cpf_responsavel"?: string | null,"created_at"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"email_confirmacao_origem"?: string | null,"email_confirmado_em"?: string | null,"email_confirmado_por"?: string | null,"estado"?: string | null,"estado_civil"?: string | null,"foto_url"?: string | null,"fuso_horario_contato"?: string,"gestante"?: boolean,"horario_contato_fim"?: string,"horario_contato_inicio"?: string,"id"?: string,"logradouro"?: string | null,"mesclado_em_paciente_id"?: string | null,"nome": string,"nome_responsavel"?: string | null,"nome_social"?: string | null,"numero"?: string | null,"numero_carteira"?: string | null,"observacoes"?: string | null,"parentesco_responsavel"?: string | null,"preferencia_canal_lembrete"?: string,"profissao"?: string | null,"sexo"?: string | null,"telefone"?: string | null,"telefone_confirmacao_origem"?: string | null,"telefone_confirmado_em"?: string | null,"telefone_confirmado_por"?: string | null,"telefone_digitos"?: string | null,"tipo_sanguineo"?: string | null,"updated_at"?: string | null,"validade_carteira"?: string | null
                  }
                  Update: {
                    "alergias"?: (string)[] | null,"amamentando"?: boolean,"ativo"?: boolean,"bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"clinica_id"?: string | null,"complemento"?: string | null,"convenio_id"?: string | null,"cpf"?: string | null,"cpf_digitos"?: string | null,"cpf_responsavel"?: string | null,"created_at"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"email_confirmacao_origem"?: string | null,"email_confirmado_em"?: string | null,"email_confirmado_por"?: string | null,"estado"?: string | null,"estado_civil"?: string | null,"foto_url"?: string | null,"fuso_horario_contato"?: string,"gestante"?: boolean,"horario_contato_fim"?: string,"horario_contato_inicio"?: string,"id"?: string,"logradouro"?: string | null,"mesclado_em_paciente_id"?: string | null,"nome"?: string,"nome_responsavel"?: string | null,"nome_social"?: string | null,"numero"?: string | null,"numero_carteira"?: string | null,"observacoes"?: string | null,"parentesco_responsavel"?: string | null,"preferencia_canal_lembrete"?: string,"profissao"?: string | null,"sexo"?: string | null,"telefone"?: string | null,"telefone_confirmacao_origem"?: string | null,"telefone_confirmado_em"?: string | null,"telefone_confirmado_por"?: string | null,"telefone_digitos"?: string | null,"tipo_sanguineo"?: string | null,"updated_at"?: string | null,"validade_carteira"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pacientes_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pacientes_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"pagamentos": {
                  Row: {
                    "chave_idempotencia": string | null,"clinica_id": string | null,"created_at": string,"data_pagamento": string,"estornado_em": string | null,"estornado_por": string | null,"forma_pagamento": string,"id": string,"lancamento_id": string,"lote_pagamento_id": number | null,"motivo_estorno": string | null,"observacoes": string | null,"parcelas": number,"recebido_por": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_idempotencia"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"data_pagamento"?: string,"estornado_em"?: string | null,"estornado_por"?: string | null,"forma_pagamento": string,"id"?: string,"lancamento_id": string,"lote_pagamento_id"?: number | null,"motivo_estorno"?: string | null,"observacoes"?: string | null,"parcelas"?: number,"recebido_por"?: string | null,"valor": number
                  }
                  Update: {
                    "chave_idempotencia"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"data_pagamento"?: string,"estornado_em"?: string | null,"estornado_por"?: string | null,"forma_pagamento"?: string,"id"?: string,"lancamento_id"?: string,"lote_pagamento_id"?: number | null,"motivo_estorno"?: string | null,"observacoes"?: string | null,"parcelas"?: number,"recebido_por"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagamentos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_estornado_por_fkey"
      columns: ["estornado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_recebido_por_fkey"
      columns: ["recebido_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pagamentos_mercadopago": {
                  Row: {
                    "acrescimo": number | null,"agendamento_id": string | null,"boleto_url": string | null,"checkout_url": string | null,"clinica_id": string | null,"cobranca_direta": boolean | null,"conta_destino": string | null,"contrato_url": string | null,"created_at": string | null,"data_aprovacao": string | null,"data_criacao": string | null,"data_expiracao": string | null,"data_recebimento": string | null,"data_vencimento": string | null,"desconto": number | null,"descricao": string | null,"detalhes_pagamento": Json | null,"id": string,"intervalo_parcelas": number | null,"lancamento_id": string | null,"metodo_pagamento": string | null,"moeda": string | null,"mp_external_reference": string | null,"mp_payment_id": string | null,"mp_preference_id": string | null,"notificacao_webhook": Json | null,"numero_parcelas": number | null,"observacoes_caixa": string | null,"paciente_id": string | null,"parcela_atual": number | null,"parcelas": number | null,"qr_code_base64": string | null,"qr_code_pix": string | null,"status": string,"tipo": string,"updated_at": string | null,"valor": number,"valor_pago": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acrescimo"?: number | null,"agendamento_id"?: string | null,"boleto_url"?: string | null,"checkout_url"?: string | null,"clinica_id"?: string | null,"cobranca_direta"?: boolean | null,"conta_destino"?: string | null,"contrato_url"?: string | null,"created_at"?: string | null,"data_aprovacao"?: string | null,"data_criacao"?: string | null,"data_expiracao"?: string | null,"data_recebimento"?: string | null,"data_vencimento"?: string | null,"desconto"?: number | null,"descricao"?: string | null,"detalhes_pagamento"?: Json | null,"id"?: string,"intervalo_parcelas"?: number | null,"lancamento_id"?: string | null,"metodo_pagamento"?: string | null,"moeda"?: string | null,"mp_external_reference"?: string | null,"mp_payment_id"?: string | null,"mp_preference_id"?: string | null,"notificacao_webhook"?: Json | null,"numero_parcelas"?: number | null,"observacoes_caixa"?: string | null,"paciente_id"?: string | null,"parcela_atual"?: number | null,"parcelas"?: number | null,"qr_code_base64"?: string | null,"qr_code_pix"?: string | null,"status"?: string,"tipo"?: string,"updated_at"?: string | null,"valor": number,"valor_pago"?: number | null
                  }
                  Update: {
                    "acrescimo"?: number | null,"agendamento_id"?: string | null,"boleto_url"?: string | null,"checkout_url"?: string | null,"clinica_id"?: string | null,"cobranca_direta"?: boolean | null,"conta_destino"?: string | null,"contrato_url"?: string | null,"created_at"?: string | null,"data_aprovacao"?: string | null,"data_criacao"?: string | null,"data_expiracao"?: string | null,"data_recebimento"?: string | null,"data_vencimento"?: string | null,"desconto"?: number | null,"descricao"?: string | null,"detalhes_pagamento"?: Json | null,"id"?: string,"intervalo_parcelas"?: number | null,"lancamento_id"?: string | null,"metodo_pagamento"?: string | null,"moeda"?: string | null,"mp_external_reference"?: string | null,"mp_payment_id"?: string | null,"mp_preference_id"?: string | null,"notificacao_webhook"?: Json | null,"numero_parcelas"?: number | null,"observacoes_caixa"?: string | null,"paciente_id"?: string | null,"parcela_atual"?: number | null,"parcelas"?: number | null,"qr_code_base64"?: string | null,"qr_code_pix"?: string | null,"status"?: string,"tipo"?: string,"updated_at"?: string | null,"valor"?: number,"valor_pago"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagamentos_mercadopago_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_mercadopago_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_mercadopago_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_mercadopago_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"pedido_laboratorio_eventos": {
                  Row: {
                    "ator_id": string | null,"clinica_id": string,"created_at": string,"detalhes": NonNullable<Json>,"id": string,"pedido_id": string,"status_anterior": string | null,"status_novo": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ator_id"?: string | null,"clinica_id": string,"created_at"?: string,"detalhes"?: NonNullable<Json>,"id"?: string,"pedido_id": string,"status_anterior"?: string | null,"status_novo"?: string | null,"tipo": string
                  }
                  Update: {
                    "ator_id"?: string | null,"clinica_id"?: string,"created_at"?: string,"detalhes"?: NonNullable<Json>,"id"?: string,"pedido_id"?: string,"status_anterior"?: string | null,"status_novo"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedido_laboratorio_eventos_ator_id_fkey"
      columns: ["ator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedido_laboratorio_eventos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedido_laboratorio_eventos_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos_laboratorio"
      referencedColumns: ["id"]
    }
                  ]
                },"pedidos_laboratorio": {
                  Row: {
                    "clinica_id": string,"codigo": string,"convenio_id": string | null,"created_at": string,"id": string,"indicacao_clinica": string | null,"medico_solicitante_id": string | null,"numero_autorizacao": string | null,"origem": string,"paciente_id": string,"prazo_previsto": string | null,"prioridade": string,"solicitado_em": string,"solicitado_por": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"codigo"?: string,"convenio_id"?: string | null,"created_at"?: string,"id"?: string,"indicacao_clinica"?: string | null,"medico_solicitante_id"?: string | null,"numero_autorizacao"?: string | null,"origem"?: string,"paciente_id": string,"prazo_previsto"?: string | null,"prioridade"?: string,"solicitado_em"?: string,"solicitado_por"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "clinica_id"?: string,"codigo"?: string,"convenio_id"?: string | null,"created_at"?: string,"id"?: string,"indicacao_clinica"?: string | null,"medico_solicitante_id"?: string | null,"numero_autorizacao"?: string | null,"origem"?: string,"paciente_id"?: string,"prazo_previsto"?: string | null,"prioridade"?: string,"solicitado_em"?: string,"solicitado_por"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedidos_laboratorio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_laboratorio_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_laboratorio_medico_solicitante_id_fkey"
      columns: ["medico_solicitante_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_laboratorio_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_laboratorio_solicitado_por_fkey"
      columns: ["solicitado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planos": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"descricao": string | null,"destaque": boolean | null,"features": NonNullable<Json>,"frequencia": string,"id": string,"max_funcionarios_total": number,"max_medicos": number,"max_recepcao": number,"max_storage_mb": number,"nome": string,"ordem": number | null,"slug": string,"trial_dias": number | null,"updated_at": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"descricao"?: string | null,"destaque"?: boolean | null,"features"?: NonNullable<Json>,"frequencia"?: string,"id"?: string,"max_funcionarios_total"?: number,"max_medicos"?: number,"max_recepcao"?: number,"max_storage_mb"?: number,"nome": string,"ordem"?: number | null,"slug": string,"trial_dias"?: number | null,"updated_at"?: string | null,"valor": number
                  }
                  Update: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"descricao"?: string | null,"destaque"?: boolean | null,"features"?: NonNullable<Json>,"frequencia"?: string,"id"?: string,"max_funcionarios_total"?: number,"max_medicos"?: number,"max_recepcao"?: number,"max_storage_mb"?: number,"nome"?: string,"ordem"?: number | null,"slug"?: string,"trial_dias"?: number | null,"updated_at"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    
                  ]
                },"plataforma_estado": {
                  Row: {
                    "atualizado_em": string,"atualizado_por": string | null,"id": boolean,"manutencao": boolean,"mensagem": string,"previsao_retorno": string | null,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"atualizado_por"?: string | null,"id"?: boolean,"manutencao"?: boolean,"mensagem"?: string,"previsao_retorno"?: string | null,"titulo"?: string
                  }
                  Update: {
                    "atualizado_em"?: string,"atualizado_por"?: string | null,"id"?: boolean,"manutencao"?: boolean,"mensagem"?: string,"previsao_retorno"?: string | null,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "ativo": boolean,"created_at": string,"created_by": string | null,"id": string,"impersonating_clinica_id": string | null,"nivel": string,"notes": string | null,"original_clinica_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"impersonating_clinica_id"?: string | null,"nivel": string,"notes"?: string | null,"original_clinica_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "ativo"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"impersonating_clinica_id"?: string | null,"nivel"?: string,"notes"?: string | null,"original_clinica_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_admins_impersonating_clinica_id_fkey"
      columns: ["impersonating_clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_ai_config": {
                  Row: {
                    "ativo": boolean,"id": boolean,"limite_mensal_clinica": number,"max_tokens": number,"modelo_fallback": string | null,"modelo_principal": string,"prompt_base": string,"temperatura": number,"updated_at": string,"updated_by": string | null,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"id"?: boolean,"limite_mensal_clinica"?: number,"max_tokens"?: number,"modelo_fallback"?: string | null,"modelo_principal"?: string,"prompt_base"?: string,"temperatura"?: number,"updated_at"?: string,"updated_by"?: string | null,"versao"?: number
                  }
                  Update: {
                    "ativo"?: boolean,"id"?: boolean,"limite_mensal_clinica"?: number,"max_tokens"?: number,"modelo_fallback"?: string | null,"modelo_principal"?: string,"prompt_base"?: string,"temperatura"?: number,"updated_at"?: string,"updated_by"?: string | null,"versao"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_ai_prompt_versions": {
                  Row: {
                    "created_at": string,"criado_por": string | null,"id": string,"modelo": string,"prompt": string,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"criado_por"?: string | null,"id"?: string,"modelo": string,"prompt": string,"versao": number
                  }
                  Update: {
                    "created_at"?: string,"criado_por"?: string | null,"id"?: string,"modelo"?: string,"prompt"?: string,"versao"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_ai_token_reservations": {
                  Row: {
                    "clinica_id": string,"created_at": string,"expires_at": string,"id": string,"reserved_tokens": number,"settled_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"expires_at"?: string,"id"?: string,"reserved_tokens": number,"settled_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"reserved_tokens"?: number,"settled_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_ai_token_reservations_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_ai_usage": {
                  Row: {
                    "clinica_id": string | null,"created_at": string,"custo_estimado": number,"duracao_ms": number | null,"erro": string | null,"id": number,"input_tokens": number,"modelo": string,"operacao": string,"output_tokens": number,"sucesso": boolean,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string,"custo_estimado"?: number,"duracao_ms"?: number | null,"erro"?: string | null,"id"?: never,"input_tokens"?: number,"modelo": string,"operacao": string,"output_tokens"?: number,"sucesso": boolean,"user_id"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string,"custo_estimado"?: number,"duracao_ms"?: number | null,"erro"?: string | null,"id"?: never,"input_tokens"?: number,"modelo"?: string,"operacao"?: string,"output_tokens"?: number,"sucesso"?: boolean,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_ai_usage_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_announcement_reads": {
                  Row: {
                    "announcement_id": string,"lido_em": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "announcement_id": string,"lido_em"?: string,"user_id": string
                  }
                  Update: {
                    "announcement_id"?: string,"lido_em"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_announcement_reads_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "platform_announcements"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_announcements": {
                  Row: {
                    "created_at": string,"criado_por": string,"destino": string,"destino_id": string | null,"id": string,"inicia_em": string,"mensagem": string,"publicado": boolean,"termina_em": string | null,"tipo": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"criado_por": string,"destino"?: string,"destino_id"?: string | null,"id"?: string,"inicia_em"?: string,"mensagem": string,"publicado"?: boolean,"termina_em"?: string | null,"tipo"?: string,"titulo": string
                  }
                  Update: {
                    "created_at"?: string,"criado_por"?: string,"destino"?: string,"destino_id"?: string | null,"id"?: string,"inicia_em"?: string,"mensagem"?: string,"publicado"?: boolean,"termina_em"?: string | null,"tipo"?: string,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_domains": {
                  Row: {
                    "checked_at": string | null,"clinica_id": string | null,"created_at": string,"created_by": string,"dns_result": Json | null,"domain": string,"id": string,"purpose": string,"status": string,"verification_token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"created_by"?: string,"dns_result"?: Json | null,"domain": string,"id"?: string,"purpose"?: string,"status"?: string,"verification_token"?: string
                  }
                  Update: {
                    "checked_at"?: string | null,"clinica_id"?: string | null,"created_at"?: string,"created_by"?: string,"dns_result"?: Json | null,"domain"?: string,"id"?: string,"purpose"?: string,"status"?: string,"verification_token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_domains_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_feature_flags": {
                  Row: {
                    "ativo": boolean,"chave": string,"descricao": string | null,"destino": string,"destino_id": string | null,"id": string,"nome": string,"percentual": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"chave": string,"descricao"?: string | null,"destino"?: string,"destino_id"?: string | null,"id"?: string,"nome": string,"percentual"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"chave"?: string,"descricao"?: string | null,"destino"?: string,"destino_id"?: string | null,"id"?: string,"nome"?: string,"percentual"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_impersonation_log": {
                  Row: {
                    "acoes": NonNullable<Json>,"clinica_id": string,"encerrado_em": string | null,"id": string,"iniciado_em": string,"motivo": string,"platform_admin_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acoes"?: NonNullable<Json>,"clinica_id": string,"encerrado_em"?: string | null,"id"?: string,"iniciado_em"?: string,"motivo": string,"platform_admin_id": string
                  }
                  Update: {
                    "acoes"?: NonNullable<Json>,"clinica_id"?: string,"encerrado_em"?: string | null,"id"?: string,"iniciado_em"?: string,"motivo"?: string,"platform_admin_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_impersonation_log_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_incident_updates": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"incident_id": string,"message": string,"status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"incident_id": string,"message": string,"status"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"incident_id"?: string,"message"?: string,"status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_incident_updates_incident_id_fkey"
      columns: ["incident_id"]
isOneToOne: false
      referencedRelation: "platform_incidents"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_incidents": {
                  Row: {
                    "affected_services": (string)[],"created_at": string,"created_by": string,"id": string,"owner_id": string | null,"resolved_at": string | null,"severity": string,"started_at": string,"status": string,"summary": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_services"?: (string)[],"created_at"?: string,"created_by"?: string,"id"?: string,"owner_id"?: string | null,"resolved_at"?: string | null,"severity": string,"started_at"?: string,"status"?: string,"summary": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "affected_services"?: (string)[],"created_at"?: string,"created_by"?: string,"id"?: string,"owner_id"?: string | null,"resolved_at"?: string | null,"severity"?: string,"started_at"?: string,"status"?: string,"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_migration_runs": {
                  Row: {
                    "atualizada_em": string,"atualizada_por": string | null,"concluida_em": string | null,"etapa_atual": string | null,"etapas_concluidas": number,"id": string,"iniciada_em": string | null,"mensagem": string | null,"nome": string,"progresso": number,"status": string,"total_etapas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"atualizada_por"?: string | null,"concluida_em"?: string | null,"etapa_atual"?: string | null,"etapas_concluidas"?: number,"id"?: string,"iniciada_em"?: string | null,"mensagem"?: string | null,"nome": string,"progresso"?: number,"status"?: string,"total_etapas"?: number
                  }
                  Update: {
                    "atualizada_em"?: string,"atualizada_por"?: string | null,"concluida_em"?: string | null,"etapa_atual"?: string | null,"etapas_concluidas"?: number,"id"?: string,"iniciada_em"?: string | null,"mensagem"?: string | null,"nome"?: string,"progresso"?: number,"status"?: string,"total_etapas"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_onboarding": {
                  Row: {
                    "clinica_id": string,"due_at": string | null,"next_action": string | null,"owner_id": string | null,"stage": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"due_at"?: string | null,"next_action"?: string | null,"owner_id"?: string | null,"stage"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string,"due_at"?: string | null,"next_action"?: string | null,"owner_id"?: string | null,"stage"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_onboarding_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: true
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_operational_state": {
                  Row: {
                    "bloqueio_emergencial": boolean,"id": boolean,"mensagem": string | null,"somente_leitura": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bloqueio_emergencial"?: boolean,"id"?: boolean,"mensagem"?: string | null,"somente_leitura"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "bloqueio_emergencial"?: boolean,"id"?: boolean,"mensagem"?: string | null,"somente_leitura"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_plan_orders": {
                  Row: {
                    "barcode_content": string | null,"created_at": string,"digitable_line": string | null,"erro_mensagem": string | null,"expira_em": string | null,"gateway_snapshot": NonNullable<Json>,"id": string,"idempotency_key": string,"metodo": string,"mp_order_id": string | null,"mp_payment_id": string | null,"pago_em": string | null,"periodo_fim": string | null,"periodo_inicio": string | null,"periodo_meses": number,"plano_id": string,"plano_slug": string,"qr_code": string | null,"qr_code_base64": string | null,"status": string,"status_detail": string | null,"ticket_url": string | null,"updated_at": string,"user_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode_content"?: string | null,"created_at"?: string,"digitable_line"?: string | null,"erro_mensagem"?: string | null,"expira_em"?: string | null,"gateway_snapshot"?: NonNullable<Json>,"id"?: string,"idempotency_key"?: string,"metodo": string,"mp_order_id"?: string | null,"mp_payment_id"?: string | null,"pago_em"?: string | null,"periodo_fim"?: string | null,"periodo_inicio"?: string | null,"periodo_meses": number,"plano_id": string,"plano_slug": string,"qr_code"?: string | null,"qr_code_base64"?: string | null,"status"?: string,"status_detail"?: string | null,"ticket_url"?: string | null,"updated_at"?: string,"user_id": string,"valor": number
                  }
                  Update: {
                    "barcode_content"?: string | null,"created_at"?: string,"digitable_line"?: string | null,"erro_mensagem"?: string | null,"expira_em"?: string | null,"gateway_snapshot"?: NonNullable<Json>,"id"?: string,"idempotency_key"?: string,"metodo"?: string,"mp_order_id"?: string | null,"mp_payment_id"?: string | null,"pago_em"?: string | null,"periodo_fim"?: string | null,"periodo_inicio"?: string | null,"periodo_meses"?: number,"plano_id"?: string,"plano_slug"?: string,"qr_code"?: string | null,"qr_code_base64"?: string | null,"status"?: string,"status_detail"?: string | null,"ticket_url"?: string | null,"updated_at"?: string,"user_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_plan_orders_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "planos"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_plan_trial_claims": {
                  Row: {
                    "checkout_reference": string,"created_at": string,"gateway_subscription_id": string | null,"plano_slug": string,"status": string,"trial_days": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checkout_reference": string,"created_at"?: string,"gateway_subscription_id"?: string | null,"plano_slug": string,"status"?: string,"trial_days": number,"user_id": string
                  }
                  Update: {
                    "checkout_reference"?: string,"created_at"?: string,"gateway_subscription_id"?: string | null,"plano_slug"?: string,"status"?: string,"trial_days"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_report_runs": {
                  Row: {
                    "created_at": string,"error": string | null,"id": string,"recipients_count": number,"schedule_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"recipients_count"?: number,"schedule_id": string,"status": string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"recipients_count"?: number,"schedule_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_report_runs_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "platform_report_schedules"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_report_schedules": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string,"frequency": string,"id": string,"last_run_at": string | null,"monthly_day_of_month": number,"name": string,"next_run_at": string,"recipients": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"frequency": string,"id"?: string,"last_run_at"?: string | null,"monthly_day_of_month"?: number,"name": string,"next_run_at"?: string,"recipients": (string)[]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"frequency"?: string,"id"?: string,"last_run_at"?: string | null,"monthly_day_of_month"?: number,"name"?: string,"next_run_at"?: string,"recipients"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"platform_restore_requests": {
                  Row: {
                    "approved_by": string | null,"backup_name": string,"decided_at": string | null,"executed_at": string | null,"id": string,"reason": string,"requested_at": string,"requested_by": string,"result": Json | null,"scope": string,"scope_ref": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_by"?: string | null,"backup_name": string,"decided_at"?: string | null,"executed_at"?: string | null,"id"?: string,"reason": string,"requested_at"?: string,"requested_by": string,"result"?: Json | null,"scope"?: string,"scope_ref"?: string | null,"status"?: string
                  }
                  Update: {
                    "approved_by"?: string | null,"backup_name"?: string,"decided_at"?: string | null,"executed_at"?: string | null,"id"?: string,"reason"?: string,"requested_at"?: string,"requested_by"?: string,"result"?: Json | null,"scope"?: string,"scope_ref"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_retention_policies": {
                  Row: {
                    "ativo": boolean,"base_legal": string,"categoria": string,"id": string,"retencao_meses": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"base_legal": string,"categoria": string,"id"?: string,"retencao_meses": number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"base_legal"?: string,"categoria"?: string,"id"?: string,"retencao_meses"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_subscription_events": {
                  Row: {
                    "assinatura_id": string,"clinica_id": string | null,"event_type": string,"id": number,"mrr_delta": number,"new_plan_slug": string | null,"new_status": string | null,"new_value": number | null,"occurred_at": string,"old_plan_slug": string | null,"old_status": string | null,"old_value": number | null,"source": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assinatura_id": string,"clinica_id"?: string | null,"event_type": string,"id"?: never,"mrr_delta"?: number,"new_plan_slug"?: string | null,"new_status"?: string | null,"new_value"?: number | null,"occurred_at"?: string,"old_plan_slug"?: string | null,"old_status"?: string | null,"old_value"?: number | null,"source"?: string,"user_id": string
                  }
                  Update: {
                    "assinatura_id"?: string,"clinica_id"?: string | null,"event_type"?: string,"id"?: never,"mrr_delta"?: number,"new_plan_slug"?: string | null,"new_status"?: string | null,"new_value"?: number | null,"occurred_at"?: string,"old_plan_slug"?: string | null,"old_status"?: string | null,"old_value"?: number | null,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_subscription_events_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_subscription_invoices": {
                  Row: {
                    "amount": number | null,"assinatura_mp_id": string | null,"created_at": string,"currency_id": string | null,"date_created": string | null,"debit_date": string | null,"id": string,"invoice_status": string,"invoice_type": string | null,"last_modified": string | null,"mp_authorized_payment_id": string,"mp_payment_id": string | null,"mp_preapproval_id": string,"payment_status": string | null,"payment_status_detail": string | null,"retry_attempt": number | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"assinatura_mp_id"?: string | null,"created_at"?: string,"currency_id"?: string | null,"date_created"?: string | null,"debit_date"?: string | null,"id"?: string,"invoice_status": string,"invoice_type"?: string | null,"last_modified"?: string | null,"mp_authorized_payment_id": string,"mp_payment_id"?: string | null,"mp_preapproval_id": string,"payment_status"?: string | null,"payment_status_detail"?: string | null,"retry_attempt"?: number | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"assinatura_mp_id"?: string | null,"created_at"?: string,"currency_id"?: string | null,"date_created"?: string | null,"debit_date"?: string | null,"id"?: string,"invoice_status"?: string,"invoice_type"?: string | null,"last_modified"?: string | null,"mp_authorized_payment_id"?: string,"mp_payment_id"?: string | null,"mp_preapproval_id"?: string,"payment_status"?: string | null,"payment_status_detail"?: string | null,"retry_attempt"?: number | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_subscription_invoices_assinatura_mp_id_fkey"
      columns: ["assinatura_mp_id"]
isOneToOne: false
      referencedRelation: "assinaturas_mercadopago"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_tenant_limits": {
                  Row: {
                    "clinica_id": string,"max_ai_tokens": number,"max_notifications": number,"max_users": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"max_ai_tokens"?: number,"max_notifications"?: number,"max_users"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string,"max_ai_tokens"?: number,"max_notifications"?: number,"max_users"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_tenant_limits_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: true
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_guias_tokens": {
                  Row: {
                    "ativo": boolean,"clinica_id": string,"created_at": string,"criado_por": string | null,"descricao": string | null,"expires_at": string,"id": string,"token": string,"ultimo_uso": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"clinica_id": string,"created_at"?: string,"criado_por"?: string | null,"descricao"?: string | null,"expires_at"?: string,"id"?: string,"token"?: string,"ultimo_uso"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"clinica_id"?: string,"created_at"?: string,"criado_por"?: string | null,"descricao"?: string | null,"expires_at"?: string,"id"?: string,"token"?: string,"ultimo_uso"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "portal_guias_tokens_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"precos_consulta_convenio": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string | null,"convenio_id": string,"created_at": string | null,"id": string,"tipo_consulta_id": string,"updated_at": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"convenio_id": string,"created_at"?: string | null,"id"?: string,"tipo_consulta_id": string,"updated_at"?: string | null,"valor"?: number
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"convenio_id"?: string,"created_at"?: string | null,"id"?: string,"tipo_consulta_id"?: string,"updated_at"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "precos_consulta_convenio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "precos_consulta_convenio_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "precos_consulta_convenio_tipo_consulta_id_fkey"
      columns: ["tipo_consulta_id"]
isOneToOne: false
      referencedRelation: "tipos_consulta"
      referencedColumns: ["id"]
    }
                  ]
                },"precos_exames_convenio": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string | null,"codigo_tuss": string | null,"convenio_id": string,"created_at": string | null,"descricao": string | null,"id": string,"tipo_exame": string,"updated_at": string | null,"valor_custo": number | null,"valor_filme": number | null,"valor_repasse": number | null,"valor_tabela": number,"valor_total": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"codigo_tuss"?: string | null,"convenio_id": string,"created_at"?: string | null,"descricao"?: string | null,"id"?: string,"tipo_exame": string,"updated_at"?: string | null,"valor_custo"?: number | null,"valor_filme"?: number | null,"valor_repasse"?: number | null,"valor_tabela"?: number,"valor_total"?: never
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"codigo_tuss"?: string | null,"convenio_id"?: string,"created_at"?: string | null,"descricao"?: string | null,"id"?: string,"tipo_exame"?: string,"updated_at"?: string | null,"valor_custo"?: number | null,"valor_filme"?: number | null,"valor_repasse"?: number | null,"valor_tabela"?: number,"valor_total"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "precos_exames_convenio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "precos_exames_convenio_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"predicoes_no_show": {
                  Row: {
                    "agendamento_id": string | null,"clinica_id": string,"created_at": string,"id": string,"motivos_risco": (string)[],"paciente_id": string,"probabilidade_no_show": number,"recomendacoes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"clinica_id": string,"created_at"?: string,"id"?: string,"motivos_risco"?: (string)[],"paciente_id": string,"probabilidade_no_show": number,"recomendacoes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "agendamento_id"?: string | null,"clinica_id"?: string,"created_at"?: string,"id"?: string,"motivos_risco"?: (string)[],"paciente_id"?: string,"probabilidade_no_show"?: number,"recomendacoes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "predicoes_no_show_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "predicoes_no_show_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "predicoes_no_show_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"prescricoes": {
                  Row: {
                    "alerta_confirmado_em": string | null,"alerta_confirmado_por": string | null,"alertas_seguranca": NonNullable<Json>,"arquivo_pdf": string | null,"clinica_id": string,"created_at": string | null,"data_emissao": string | null,"dosagem": string | null,"duracao": string | null,"id": string,"justificativa_alerta": string | null,"medicamento": string,"medico_id": string | null,"observacoes": string | null,"paciente_id": string | null,"posologia": string | null,"prontuario_id": string | null,"quantidade": string | null,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alerta_confirmado_em"?: string | null,"alerta_confirmado_por"?: string | null,"alertas_seguranca"?: NonNullable<Json>,"arquivo_pdf"?: string | null,"clinica_id": string,"created_at"?: string | null,"data_emissao"?: string | null,"dosagem"?: string | null,"duracao"?: string | null,"id"?: string,"justificativa_alerta"?: string | null,"medicamento": string,"medico_id"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"posologia"?: string | null,"prontuario_id"?: string | null,"quantidade"?: string | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "alerta_confirmado_em"?: string | null,"alerta_confirmado_por"?: string | null,"alertas_seguranca"?: NonNullable<Json>,"arquivo_pdf"?: string | null,"clinica_id"?: string,"created_at"?: string | null,"data_emissao"?: string | null,"dosagem"?: string | null,"duracao"?: string | null,"id"?: string,"justificativa_alerta"?: string | null,"medicamento"?: string,"medico_id"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"posologia"?: string | null,"prontuario_id"?: string | null,"quantidade"?: string | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prescricoes_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prescricoes_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prescricoes_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prescricoes_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"product_feedback": {
                  Row: {
                    "categoria": string,"clinica_id": string,"contexto": NonNullable<Json>,"created_at": string,"id": string,"mensagem": string,"protocolo": string,"responded_at": string | null,"responded_by": string | null,"resposta_publica": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria": string,"clinica_id": string,"contexto"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"mensagem": string,"protocolo": string,"responded_at"?: string | null,"responded_by"?: string | null,"resposta_publica"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "categoria"?: string,"clinica_id"?: string,"contexto"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"mensagem"?: string,"protocolo"?: string,"responded_at"?: string | null,"responded_by"?: string | null,"resposta_publica"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_feedback_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "ativo": boolean | null,"avatar": string | null,"clinica_id": string | null,"cpf_cnpj": string | null,"created_at": string | null,"email": string,"id": string,"mfa_enabled": boolean,"nome": string,"telefone": string | null,"ultimo_acesso": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"avatar"?: string | null,"clinica_id"?: string | null,"cpf_cnpj"?: string | null,"created_at"?: string | null,"email": string,"id": string,"mfa_enabled"?: boolean,"nome": string,"telefone"?: string | null,"ultimo_acesso"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"avatar"?: string | null,"clinica_id"?: string | null,"cpf_cnpj"?: string | null,"created_at"?: string | null,"email"?: string,"id"?: string,"mfa_enabled"?: boolean,"nome"?: string,"telefone"?: string | null,"ultimo_acesso"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"prontuario_acessos": {
                  Row: {
                    "acao": string,"clinica_id": string | null,"created_at": string,"id": string,"ip_address": string | null,"justificativa": string | null,"paciente_id": string | null,"prontuario_id": string | null,"user_agent": string | null,"user_crm": string | null,"user_id": string | null,"user_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"clinica_id"?: string | null,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"justificativa"?: string | null,"paciente_id"?: string | null,"prontuario_id"?: string | null,"user_agent"?: string | null,"user_crm"?: string | null,"user_id"?: string | null,"user_nome"?: string | null
                  }
                  Update: {
                    "acao"?: string,"clinica_id"?: string | null,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"justificativa"?: string | null,"paciente_id"?: string | null,"prontuario_id"?: string | null,"user_agent"?: string | null,"user_crm"?: string | null,"user_id"?: string | null,"user_nome"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prontuario_acessos_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"prontuario_adendos": {
                  Row: {
                    "clinica_id": string | null,"created_at": string,"crm": string,"hash": string | null,"id": string,"medico_id": string | null,"medico_nome": string,"motivo": string,"prontuario_id": string,"texto": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string,"crm": string,"hash"?: string | null,"id"?: string,"medico_id"?: string | null,"medico_nome": string,"motivo": string,"prontuario_id": string,"texto": string,"tipo": string
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string,"crm"?: string,"hash"?: string | null,"id"?: string,"medico_id"?: string | null,"medico_nome"?: string,"motivo"?: string,"prontuario_id"?: string,"texto"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prontuario_adendos_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"prontuario_assinaturas": {
                  Row: {
                    "assinado_em": string,"assinado_por_user_id": string,"assinante_crm": string,"assinante_nome": string,"clinica_id": string,"codigo_verificacao": string,"conteudo_hash": string,"created_at": string,"id": string,"medico_id": string,"metodo": string,"prontuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assinado_em"?: string,"assinado_por_user_id": string,"assinante_crm": string,"assinante_nome": string,"clinica_id": string,"codigo_verificacao"?: string,"conteudo_hash": string,"created_at"?: string,"id"?: string,"medico_id": string,"metodo"?: string,"prontuario_id": string
                  }
                  Update: {
                    "assinado_em"?: string,"assinado_por_user_id"?: string,"assinante_crm"?: string,"assinante_nome"?: string,"clinica_id"?: string,"codigo_verificacao"?: string,"conteudo_hash"?: string,"created_at"?: string,"id"?: string,"medico_id"?: string,"metodo"?: string,"prontuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prontuario_assinaturas_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prontuario_assinaturas_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prontuario_assinaturas_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: true
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"prontuario_diagnosticos": {
                  Row: {
                    "cid10_id": string | null,"codigo_cid": string,"confirmado": boolean | null,"created_at": string,"data_confirmacao": string | null,"descricao": string,"id": string,"observacoes": string | null,"prontuario_id": string,"tipo": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cid10_id"?: string | null,"codigo_cid": string,"confirmado"?: boolean | null,"created_at"?: string,"data_confirmacao"?: string | null,"descricao": string,"id"?: string,"observacoes"?: string | null,"prontuario_id": string,"tipo"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cid10_id"?: string | null,"codigo_cid"?: string,"confirmado"?: boolean | null,"created_at"?: string,"data_confirmacao"?: string | null,"descricao"?: string,"id"?: string,"observacoes"?: string | null,"prontuario_id"?: string,"tipo"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prontuario_diagnosticos_cid10_id_fkey"
      columns: ["cid10_id"]
isOneToOne: false
      referencedRelation: "cid10_codigos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prontuario_diagnosticos_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"prontuarios": {
                  Row: {
                    "agendamento_id": string | null,"alergias_relatadas": string | null,"assinado": boolean,"assinado_em": string | null,"assinado_por": string | null,"clinica_id": string | null,"conduta": string | null,"created_at": string | null,"crm_assinante": string | null,"data": string,"diagnostico_principal": string | null,"diagnostico_principal_cid": string | null,"diagnosticos_count": number | null,"diagnosticos_secundarios": (string)[] | null,"exame_abdomen": string | null,"exame_cabeca_pescoco": string | null,"exame_membros": string | null,"exame_neurologico": string | null,"exame_pele": string | null,"exame_torax": string | null,"exames_fisicos": string | null,"hash_conteudo": string | null,"hipotese_diagnostica": string | null,"historia_doenca_atual": string | null,"historia_familiar": string | null,"historia_patologica_pregressa": string | null,"historia_social": string | null,"id": string,"medicamentos_em_uso": string | null,"medico_id": string | null,"observacoes_internas": string | null,"orientacoes_paciente": string | null,"paciente_id": string,"plano_terapeutico": string | null,"queixa_principal": string | null,"revisao_sistemas": string | null,"sinais_vitais": Json | null,"tipo_assinatura": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"alergias_relatadas"?: string | null,"assinado"?: boolean,"assinado_em"?: string | null,"assinado_por"?: string | null,"clinica_id"?: string | null,"conduta"?: string | null,"created_at"?: string | null,"crm_assinante"?: string | null,"data"?: string,"diagnostico_principal"?: string | null,"diagnostico_principal_cid"?: string | null,"diagnosticos_count"?: number | null,"diagnosticos_secundarios"?: (string)[] | null,"exame_abdomen"?: string | null,"exame_cabeca_pescoco"?: string | null,"exame_membros"?: string | null,"exame_neurologico"?: string | null,"exame_pele"?: string | null,"exame_torax"?: string | null,"exames_fisicos"?: string | null,"hash_conteudo"?: string | null,"hipotese_diagnostica"?: string | null,"historia_doenca_atual"?: string | null,"historia_familiar"?: string | null,"historia_patologica_pregressa"?: string | null,"historia_social"?: string | null,"id"?: string,"medicamentos_em_uso"?: string | null,"medico_id"?: string | null,"observacoes_internas"?: string | null,"orientacoes_paciente"?: string | null,"paciente_id": string,"plano_terapeutico"?: string | null,"queixa_principal"?: string | null,"revisao_sistemas"?: string | null,"sinais_vitais"?: Json | null,"tipo_assinatura"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"alergias_relatadas"?: string | null,"assinado"?: boolean,"assinado_em"?: string | null,"assinado_por"?: string | null,"clinica_id"?: string | null,"conduta"?: string | null,"created_at"?: string | null,"crm_assinante"?: string | null,"data"?: string,"diagnostico_principal"?: string | null,"diagnostico_principal_cid"?: string | null,"diagnosticos_count"?: number | null,"diagnosticos_secundarios"?: (string)[] | null,"exame_abdomen"?: string | null,"exame_cabeca_pescoco"?: string | null,"exame_membros"?: string | null,"exame_neurologico"?: string | null,"exame_pele"?: string | null,"exame_torax"?: string | null,"exames_fisicos"?: string | null,"hash_conteudo"?: string | null,"hipotese_diagnostica"?: string | null,"historia_doenca_atual"?: string | null,"historia_familiar"?: string | null,"historia_patologica_pregressa"?: string | null,"historia_social"?: string | null,"id"?: string,"medicamentos_em_uso"?: string | null,"medico_id"?: string | null,"observacoes_internas"?: string | null,"orientacoes_paciente"?: string | null,"paciente_id"?: string,"plano_terapeutico"?: string | null,"queixa_principal"?: string | null,"revisao_sistemas"?: string | null,"sinais_vitais"?: Json | null,"tipo_assinatura"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prontuarios_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prontuarios_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prontuarios_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prontuarios_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"protocolos_clinicos": {
                  Row: {
                    "ativo": boolean | null,"cid_relacionados": (string)[] | null,"clinica_id": string | null,"condicao": string,"created_at": string | null,"criado_por": string | null,"descricao": string | null,"especialidade": string | null,"exames_sugeridos": (string)[] | null,"id": string,"medicamentos_sugeridos": Json | null,"nome": string,"orientacoes": string | null,"passos": NonNullable<Json>,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"cid_relacionados"?: (string)[] | null,"clinica_id"?: string | null,"condicao": string,"created_at"?: string | null,"criado_por"?: string | null,"descricao"?: string | null,"especialidade"?: string | null,"exames_sugeridos"?: (string)[] | null,"id"?: string,"medicamentos_sugeridos"?: Json | null,"nome": string,"orientacoes"?: string | null,"passos"?: NonNullable<Json>,"updated_at"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"cid_relacionados"?: (string)[] | null,"clinica_id"?: string | null,"condicao"?: string,"created_at"?: string | null,"criado_por"?: string | null,"descricao"?: string | null,"especialidade"?: string | null,"exames_sugeridos"?: (string)[] | null,"id"?: string,"medicamentos_sugeridos"?: Json | null,"nome"?: string,"orientacoes"?: string | null,"passos"?: NonNullable<Json>,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "protocolos_clinicos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"public_booking_holds": {
                  Row: {
                    "clinica_id": string,"created_at": string,"data": string,"expires_at": string,"hora_fim": string,"hora_inicio": string,"id": string,"medico_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"data": string,"expires_at": string,"hora_fim": string,"hora_inicio": string,"id"?: string,"medico_id": string,"token_hash": string
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"data"?: string,"expires_at"?: string,"hora_fim"?: string,"hora_inicio"?: string,"id"?: string,"medico_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "public_booking_holds_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "public_booking_holds_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "chave": string,"contagem": number,"janela": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"contagem"?: number,"janela": string
                  }
                  Update: {
                    "chave"?: string,"contagem"?: number,"janela"?: string
                  }
                  Relationships: [
                    
                  ]
                },"registros_pendentes": {
                  Row: {
                    "activated_at": string | null,"clinica": string | null,"codigo_convite": string,"created_at": string | null,"email": string,"expires_at": string,"id": string,"mp_payment_id": string | null,"nome": string,"plano_id": string | null,"plano_slug": string,"reminder_count": number,"status": string,"telefone": string | null,"updated_at": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_at"?: string | null,"clinica"?: string | null,"codigo_convite": string,"created_at"?: string | null,"email": string,"expires_at": string,"id"?: string,"mp_payment_id"?: string | null,"nome": string,"plano_id"?: string | null,"plano_slug": string,"reminder_count"?: number,"status"?: string,"telefone"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "activated_at"?: string | null,"clinica"?: string | null,"codigo_convite"?: string,"created_at"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"mp_payment_id"?: string | null,"nome"?: string,"plano_id"?: string | null,"plano_slug"?: string,"reminder_count"?: number,"status"?: string,"telefone"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "registros_pendentes_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "planos"
      referencedColumns: ["id"]
    }
                  ]
                },"relatorios_salvos": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string,"config": NonNullable<Json>,"created_at": string,"dataset": string,"descricao": string | null,"destinatarios": (string)[] | null,"dia_mes": number | null,"dia_semana": number | null,"formato": string | null,"frequencia": string | null,"hora": string | null,"id": string,"nome": string,"proxima_execucao": string | null,"ultima_execucao": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id": string,"config"?: NonNullable<Json>,"created_at"?: string,"dataset": string,"descricao"?: string | null,"destinatarios"?: (string)[] | null,"dia_mes"?: number | null,"dia_semana"?: number | null,"formato"?: string | null,"frequencia"?: string | null,"hora"?: string | null,"id"?: string,"nome": string,"proxima_execucao"?: string | null,"ultima_execucao"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string,"config"?: NonNullable<Json>,"created_at"?: string,"dataset"?: string,"descricao"?: string | null,"destinatarios"?: (string)[] | null,"dia_mes"?: number | null,"dia_semana"?: number | null,"formato"?: string | null,"frequencia"?: string | null,"hora"?: string | null,"id"?: string,"nome"?: string,"proxima_execucao"?: string | null,"ultima_execucao"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"repasse_regra_alteracoes": {
                  Row: {
                    "alterado_em": string,"alterado_por": string,"clinica_id": string,"id": string,"medico_id": string,"tipo_anterior": string,"tipo_novo": string,"valor_anterior": number,"valor_novo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alterado_em"?: string,"alterado_por": string,"clinica_id": string,"id"?: string,"medico_id": string,"tipo_anterior": string,"tipo_novo": string,"valor_anterior": number,"valor_novo": number
                  }
                  Update: {
                    "alterado_em"?: string,"alterado_por"?: string,"clinica_id"?: string,"id"?: string,"medico_id"?: string,"tipo_anterior"?: string,"tipo_novo"?: string,"valor_anterior"?: number,"valor_novo"?: number
                  }
                  Relationships: [
                    
                  ]
                },"repasses_medicos": {
                  Row: {
                    "aprovado_em": string | null,"clinica_id": string,"competencia": string,"created_at": string,"criado_por": string | null,"id": string,"lancamento_id": string,"lancamento_pagamento_id": string | null,"medico_id": string,"observacoes": string | null,"pago_em": string | null,"percentual": number,"status": string,"tipo_calculo": string,"updated_at": string,"valor_base": number,"valor_configurado": number | null,"valor_repasse": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aprovado_em"?: string | null,"clinica_id": string,"competencia": string,"created_at"?: string,"criado_por"?: string | null,"id"?: string,"lancamento_id": string,"lancamento_pagamento_id"?: string | null,"medico_id": string,"observacoes"?: string | null,"pago_em"?: string | null,"percentual": number,"status"?: string,"tipo_calculo"?: string,"updated_at"?: string,"valor_base": number,"valor_configurado"?: number | null,"valor_repasse": number
                  }
                  Update: {
                    "aprovado_em"?: string | null,"clinica_id"?: string,"competencia"?: string,"created_at"?: string,"criado_por"?: string | null,"id"?: string,"lancamento_id"?: string,"lancamento_pagamento_id"?: string | null,"medico_id"?: string,"observacoes"?: string | null,"pago_em"?: string | null,"percentual"?: number,"status"?: string,"tipo_calculo"?: string,"updated_at"?: string,"valor_base"?: number,"valor_configurado"?: number | null,"valor_repasse"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "repasses_medicos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repasses_medicos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: true
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repasses_medicos_lancamento_pagamento_id_fkey"
      columns: ["lancamento_pagamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "repasses_medicos_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    }
                  ]
                },"resultado_critico_confirmacoes": {
                  Row: {
                    "clinica_id": string,"conduta": string,"confirmado_em": string,"confirmado_por": string | null,"id": string,"numero_versao": number,"resultado_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"conduta": string,"confirmado_em"?: string,"confirmado_por"?: string | null,"id"?: string,"numero_versao": number,"resultado_id": string
                  }
                  Update: {
                    "clinica_id"?: string,"conduta"?: string,"confirmado_em"?: string,"confirmado_por"?: string | null,"id"?: string,"numero_versao"?: number,"resultado_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resultado_critico_confirmacoes_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultado_critico_confirmacoes_confirmado_por_fkey"
      columns: ["confirmado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultado_critico_confirmacoes_resultado_id_fkey"
      columns: ["resultado_id"]
isOneToOne: false
      referencedRelation: "resultados_laboratorio"
      referencedColumns: ["id"]
    }
                  ]
                },"resultados_laboratorio": {
                  Row: {
                    "clinica_id": string | null,"coleta_id": string,"created_at": string | null,"critico": boolean,"data_liberacao": string | null,"data_validacao": string | null,"equipamento": string | null,"exame_id": string | null,"id": string,"liberado": boolean | null,"liberado_por": string | null,"metodo": string | null,"numero_versao": number,"observacao_revisao": string | null,"observacoes": string | null,"paciente_id": string,"parametro": string,"resultado": string,"revisado_em": string | null,"revisado_por": string | null,"status_resultado": string | null,"unidade": string | null,"updated_at": string | null,"validado_por": string | null,"valor_referencia_max": number | null,"valor_referencia_min": number | null,"valor_referencia_texto": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"coleta_id": string,"created_at"?: string | null,"critico"?: boolean,"data_liberacao"?: string | null,"data_validacao"?: string | null,"equipamento"?: string | null,"exame_id"?: string | null,"id"?: string,"liberado"?: boolean | null,"liberado_por"?: string | null,"metodo"?: string | null,"numero_versao"?: number,"observacao_revisao"?: string | null,"observacoes"?: string | null,"paciente_id": string,"parametro": string,"resultado": string,"revisado_em"?: string | null,"revisado_por"?: string | null,"status_resultado"?: string | null,"unidade"?: string | null,"updated_at"?: string | null,"validado_por"?: string | null,"valor_referencia_max"?: number | null,"valor_referencia_min"?: number | null,"valor_referencia_texto"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"coleta_id"?: string,"created_at"?: string | null,"critico"?: boolean,"data_liberacao"?: string | null,"data_validacao"?: string | null,"equipamento"?: string | null,"exame_id"?: string | null,"id"?: string,"liberado"?: boolean | null,"liberado_por"?: string | null,"metodo"?: string | null,"numero_versao"?: number,"observacao_revisao"?: string | null,"observacoes"?: string | null,"paciente_id"?: string,"parametro"?: string,"resultado"?: string,"revisado_em"?: string | null,"revisado_por"?: string | null,"status_resultado"?: string | null,"unidade"?: string | null,"updated_at"?: string | null,"validado_por"?: string | null,"valor_referencia_max"?: number | null,"valor_referencia_min"?: number | null,"valor_referencia_texto"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "resultados_laboratorio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_coleta_id_fkey"
      columns: ["coleta_id"]
isOneToOne: false
      referencedRelation: "coletas_laboratorio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_coleta_id_fkey"
      columns: ["coleta_id"]
isOneToOne: false
      referencedRelation: "fila_alertas_lab_esquecido"
      referencedColumns: ["coleta_id"]
    },{
      foreignKeyName: "resultados_laboratorio_exame_id_fkey"
      columns: ["exame_id"]
isOneToOne: false
      referencedRelation: "exames"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_liberado_por_fkey"
      columns: ["liberado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_revisado_por_fkey"
      columns: ["revisado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_validado_por_fkey"
      columns: ["validado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"resultados_laboratorio_versoes": {
                  Row: {
                    "alterado_em": string,"alterado_por": string | null,"clinica_id": string,"id": string,"motivo": string | null,"numero_versao": number,"registro_anterior": NonNullable<Json>,"resultado_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alterado_em"?: string,"alterado_por"?: string | null,"clinica_id": string,"id"?: string,"motivo"?: string | null,"numero_versao": number,"registro_anterior": NonNullable<Json>,"resultado_id": string
                  }
                  Update: {
                    "alterado_em"?: string,"alterado_por"?: string | null,"clinica_id"?: string,"id"?: string,"motivo"?: string | null,"numero_versao"?: number,"registro_anterior"?: NonNullable<Json>,"resultado_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resultados_laboratorio_versoes_alterado_por_fkey"
      columns: ["alterado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_versoes_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultados_laboratorio_versoes_resultado_id_fkey"
      columns: ["resultado_id"]
isOneToOne: false
      referencedRelation: "resultados_laboratorio"
      referencedColumns: ["id"]
    }
                  ]
                },"retornos": {
                  Row: {
                    "agendamento_id": string | null,"agendamento_retorno_id": string | null,"clinica_id": string | null,"confirmado_em": string | null,"created_at": string | null,"data_consulta_origem": string,"data_retorno_prevista": string,"historico": NonNullable<Json>,"id": string,"lembrete_enviado": boolean | null,"lembretes_enviados": number,"medico_id": string | null,"motivo": string | null,"observacoes": string | null,"paciente_id": string | null,"prontuario_id": string | null,"status": string | null,"tipo_retorno": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"agendamento_retorno_id"?: string | null,"clinica_id"?: string | null,"confirmado_em"?: string | null,"created_at"?: string | null,"data_consulta_origem"?: string,"data_retorno_prevista": string,"historico"?: NonNullable<Json>,"id"?: string,"lembrete_enviado"?: boolean | null,"lembretes_enviados"?: number,"medico_id"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"prontuario_id"?: string | null,"status"?: string | null,"tipo_retorno"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"agendamento_retorno_id"?: string | null,"clinica_id"?: string | null,"confirmado_em"?: string | null,"created_at"?: string | null,"data_consulta_origem"?: string,"data_retorno_prevista"?: string,"historico"?: NonNullable<Json>,"id"?: string,"lembrete_enviado"?: boolean | null,"lembretes_enviados"?: number,"medico_id"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"paciente_id"?: string | null,"prontuario_id"?: string | null,"status"?: string | null,"tipo_retorno"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "retornos_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retornos_agendamento_retorno_id_fkey"
      columns: ["agendamento_retorno_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retornos_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retornos_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retornos_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retornos_prontuario_id_fkey"
      columns: ["prontuario_id"]
isOneToOne: false
      referencedRelation: "prontuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"room_hygiene_active_checklists": {
                  Row: {
                    "checklist_version_id": string,"clinic_id": string,"updated_at": string,"updated_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checklist_version_id": string,"clinic_id": string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "checklist_version_id"?: string,"clinic_id"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_hygiene_active_checklists_checklist_version_id_fkey"
      columns: ["checklist_version_id"]
isOneToOne: true
      referencedRelation: "room_hygiene_checklist_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_hygiene_active_checklists_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: true
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"room_hygiene_audit": {
                  Row: {
                    "action": string,"actor_id": string | null,"clinic_id": string,"created_at": string,"execution_id": string | null,"id": number,"room_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"clinic_id": string,"created_at"?: string,"execution_id"?: string | null,"id"?: never,"room_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"clinic_id"?: string,"created_at"?: string,"execution_id"?: string | null,"id"?: never,"room_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_hygiene_audit_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_hygiene_audit_execution_id_fkey"
      columns: ["execution_id"]
isOneToOne: false
      referencedRelation: "room_hygiene_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_hygiene_audit_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "salas"
      referencedColumns: ["id"]
    }
                  ]
                },"room_hygiene_checklist_versions": {
                  Row: {
                    "clinic_id": string,"created_at": string,"created_by": string,"id": string,"items": NonNullable<Json>,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic_id": string,"created_at"?: string,"created_by": string,"id"?: string,"items": NonNullable<Json>,"title": string,"version": number
                  }
                  Update: {
                    "clinic_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"items"?: NonNullable<Json>,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_hygiene_checklist_versions_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"room_hygiene_executions": {
                  Row: {
                    "checklist_version_id": string,"clinic_id": string,"completed_items": Json | null,"id": string,"notes": string | null,"room_id": string,"started_at": string,"started_by": string,"submitted_at": string | null,"submitted_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "checklist_version_id": string,"clinic_id": string,"completed_items"?: Json | null,"id"?: string,"notes"?: string | null,"room_id": string,"started_at"?: string,"started_by": string,"submitted_at"?: string | null,"submitted_by"?: string | null
                  }
                  Update: {
                    "checklist_version_id"?: string,"clinic_id"?: string,"completed_items"?: Json | null,"id"?: string,"notes"?: string | null,"room_id"?: string,"started_at"?: string,"started_by"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_hygiene_executions_checklist_version_id_fkey"
      columns: ["checklist_version_id"]
isOneToOne: false
      referencedRelation: "room_hygiene_checklist_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_hygiene_executions_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_hygiene_executions_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "salas"
      referencedColumns: ["id"]
    }
                  ]
                },"room_hygiene_reviews": {
                  Row: {
                    "clinic_id": string,"created_at": string,"decision": string,"execution_id": string,"id": string,"note": string,"reviewer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic_id": string,"created_at"?: string,"decision": string,"execution_id": string,"id"?: string,"note": string,"reviewer_id": string
                  }
                  Update: {
                    "clinic_id"?: string,"created_at"?: string,"decision"?: string,"execution_id"?: string,"id"?: string,"note"?: string,"reviewer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_hygiene_reviews_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_hygiene_reviews_execution_id_fkey"
      columns: ["execution_id"]
isOneToOne: false
      referencedRelation: "room_hygiene_executions"
      referencedColumns: ["id"]
    }
                  ]
                },"salas": {
                  Row: {
                    "andar": string | null,"capacidade": number | null,"clinica_id": string | null,"cor": string | null,"created_at": string | null,"equipamentos": (string)[] | null,"genero": string | null,"horario_fim": string | null,"horario_inicio": string | null,"id": string,"medico_responsavel": string | null,"nome": string,"numero_cama": string | null,"observacoes": string | null,"setor": string | null,"status": Database["public"]['Enums']["status_sala"] | null,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "andar"?: string | null,"capacidade"?: number | null,"clinica_id"?: string | null,"cor"?: string | null,"created_at"?: string | null,"equipamentos"?: (string)[] | null,"genero"?: string | null,"horario_fim"?: string | null,"horario_inicio"?: string | null,"id"?: string,"medico_responsavel"?: string | null,"nome": string,"numero_cama"?: string | null,"observacoes"?: string | null,"setor"?: string | null,"status"?: Database["public"]['Enums']["status_sala"] | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "andar"?: string | null,"capacidade"?: number | null,"clinica_id"?: string | null,"cor"?: string | null,"created_at"?: string | null,"equipamentos"?: (string)[] | null,"genero"?: string | null,"horario_fim"?: string | null,"horario_inicio"?: string | null,"id"?: string,"medico_responsavel"?: string | null,"nome"?: string,"numero_cama"?: string | null,"observacoes"?: string | null,"setor"?: string | null,"status"?: Database["public"]['Enums']["status_sala"] | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "salas_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "salas_medico_responsavel_fkey"
      columns: ["medico_responsavel"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    }
                  ]
                },"support_access_requests": {
                  Row: {
                    "approved_by": string | null,"clinica_id": string,"created_at": string,"decided_at": string | null,"expires_at": string | null,"id": string,"reason": string,"requested_by": string,"revoked_at": string | null,"scopes": (string)[],"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_by"?: string | null,"clinica_id": string,"created_at"?: string,"decided_at"?: string | null,"expires_at"?: string | null,"id"?: string,"reason": string,"requested_by": string,"revoked_at"?: string | null,"scopes"?: (string)[],"status"?: string
                  }
                  Update: {
                    "approved_by"?: string | null,"clinica_id"?: string,"created_at"?: string,"decided_at"?: string | null,"expires_at"?: string | null,"id"?: string,"reason"?: string,"requested_by"?: string,"revoked_at"?: string | null,"scopes"?: (string)[],"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_access_requests_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"support_ticket_messages": {
                  Row: {
                    "autor_id": string,"created_at": string,"id": string,"interno": boolean,"mensagem": string,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autor_id": string,"created_at"?: string,"id"?: string,"interno"?: boolean,"mensagem": string,"ticket_id": string
                  }
                  Update: {
                    "autor_id"?: string,"created_at"?: string,"id"?: string,"interno"?: boolean,"mensagem"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_ticket_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "categoria": string,"clinica_id": string,"created_at": string,"descricao": string,"id": string,"primeira_resposta_em": string | null,"prioridade": string,"resolvido_em": string | null,"responsavel_id": string | null,"sla_limite": string,"solicitante_id": string,"status": string,"titulo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string,"clinica_id": string,"created_at"?: string,"descricao": string,"id"?: string,"primeira_resposta_em"?: string | null,"prioridade"?: string,"resolvido_em"?: string | null,"responsavel_id"?: string | null,"sla_limite": string,"solicitante_id": string,"status"?: string,"titulo": string,"updated_at"?: string
                  }
                  Update: {
                    "categoria"?: string,"clinica_id"?: string,"created_at"?: string,"descricao"?: string,"id"?: string,"primeira_resposta_em"?: string | null,"prioridade"?: string,"resolvido_em"?: string | null,"responsavel_id"?: string | null,"sla_limite"?: string,"solicitante_id"?: string,"status"?: string,"titulo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"tarefas": {
                  Row: {
                    "categoria": string | null,"clinica_id": string | null,"created_at": string | null,"criado_por": string | null,"data_conclusao": string | null,"data_vencimento": string | null,"descricao": string | null,"id": string,"paciente_id": string | null,"prioridade": string,"responsavel_id": string | null,"status": string,"titulo": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_conclusao"?: string | null,"data_vencimento"?: string | null,"descricao"?: string | null,"id"?: string,"paciente_id"?: string | null,"prioridade"?: string,"responsavel_id"?: string | null,"status"?: string,"titulo": string,"updated_at"?: string | null
                  }
                  Update: {
                    "categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_conclusao"?: string | null,"data_vencimento"?: string | null,"descricao"?: string | null,"id"?: string,"paciente_id"?: string | null,"prioridade"?: string,"responsavel_id"?: string | null,"status"?: string,"titulo"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarefas_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"teleconsulta_sessions": {
                  Row: {
                    "agendamento_id": string,"clinica_id": string,"closed_at": string | null,"created_at": string,"expires_at": string,"guest_consented_at": string | null,"guest_last_seen_at": string | null,"guest_token_hash": string,"id": string,"medico_id": string,"provider_consented_at": string | null,"provider_last_seen_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id": string,"clinica_id": string,"closed_at"?: string | null,"created_at"?: string,"expires_at": string,"guest_consented_at"?: string | null,"guest_last_seen_at"?: string | null,"guest_token_hash": string,"id"?: string,"medico_id": string,"provider_consented_at"?: string | null,"provider_last_seen_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "agendamento_id"?: string,"clinica_id"?: string,"closed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"guest_consented_at"?: string | null,"guest_last_seen_at"?: string | null,"guest_token_hash"?: string,"id"?: string,"medico_id"?: string,"provider_consented_at"?: string | null,"provider_last_seen_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teleconsulta_sessions_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: true
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teleconsulta_sessions_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teleconsulta_sessions_medico_id_fkey"
      columns: ["medico_id"]
isOneToOne: false
      referencedRelation: "medicos"
      referencedColumns: ["id"]
    }
                  ]
                },"teleconsulta_signals": {
                  Row: {
                    "created_at": string,"id": number,"payload": NonNullable<Json>,"sender": string,"session_id": string,"signal_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"payload": NonNullable<Json>,"sender": string,"session_id": string,"signal_type": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"payload"?: NonNullable<Json>,"sender"?: string,"session_id"?: string,"signal_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teleconsulta_signals_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "teleconsulta_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"templates_atestado": {
                  Row: {
                    "cid": string | null,"clinica_id": string | null,"conteudo": string | null,"created_at": string | null,"criado_por": string | null,"dias_afastamento": number | null,"id": string,"nome": string,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cid"?: string | null,"clinica_id"?: string | null,"conteudo"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"dias_afastamento"?: number | null,"id"?: string,"nome": string,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "cid"?: string | null,"clinica_id"?: string | null,"conteudo"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"dias_afastamento"?: number | null,"id"?: string,"nome"?: string,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_atestado_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"templates_prescricao": {
                  Row: {
                    "clinica_id": string | null,"created_at": string | null,"criado_por": string | null,"id": string,"medicamentos": Json | null,"nome": string,"observacoes_gerais": string | null,"tipo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"id"?: string,"medicamentos"?: Json | null,"nome": string,"observacoes_gerais"?: string | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"id"?: string,"medicamentos"?: Json | null,"nome"?: string,"observacoes_gerais"?: string | null,"tipo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_prescricao_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"tipo_exames_catalog": {
                  Row: {
                    "ativo": boolean | null,"categoria": string,"clinica_id": string,"codigo_tuss": string | null,"created_at": string | null,"descricao": string | null,"id": string,"laboratorio_id": string | null,"metodo_padrao": string | null,"nome": string,"preco_custo": number | null,"preco_venda": number | null,"preparo": string | null,"referencia_max": number | null,"referencia_min": number | null,"referencia_texto": string | null,"setor_id": string | null,"tempo_estimado_horas": number | null,"tubo_padrao": string | null,"unidade_padrao": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"categoria": string,"clinica_id": string,"codigo_tuss"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"id"?: string,"laboratorio_id"?: string | null,"metodo_padrao"?: string | null,"nome": string,"preco_custo"?: number | null,"preco_venda"?: number | null,"preparo"?: string | null,"referencia_max"?: number | null,"referencia_min"?: number | null,"referencia_texto"?: string | null,"setor_id"?: string | null,"tempo_estimado_horas"?: number | null,"tubo_padrao"?: string | null,"unidade_padrao"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"categoria"?: string,"clinica_id"?: string,"codigo_tuss"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"id"?: string,"laboratorio_id"?: string | null,"metodo_padrao"?: string | null,"nome"?: string,"preco_custo"?: number | null,"preco_venda"?: number | null,"preparo"?: string | null,"referencia_max"?: number | null,"referencia_min"?: number | null,"referencia_texto"?: string | null,"setor_id"?: string | null,"tempo_estimado_horas"?: number | null,"tubo_padrao"?: string | null,"unidade_padrao"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tipo_exames_catalog_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tipo_exames_catalog_laboratorio_id_fkey"
      columns: ["laboratorio_id"]
isOneToOne: false
      referencedRelation: "laboratorios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tipo_exames_catalog_setor_id_fkey"
      columns: ["setor_id"]
isOneToOne: false
      referencedRelation: "laboratorio_setores"
      referencedColumns: ["id"]
    }
                  ]
                },"tipos_consulta": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string | null,"cor": string | null,"created_at": string | null,"descricao": string | null,"duracao_minutos": number | null,"id": string,"instrucoes_preparo": string | null,"nome": string,"updated_at": string | null,"valor_particular": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"cor"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"duracao_minutos"?: number | null,"id"?: string,"instrucoes_preparo"?: string | null,"nome": string,"updated_at"?: string | null,"valor_particular"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"cor"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"duracao_minutos"?: number | null,"id"?: string,"instrucoes_preparo"?: string | null,"nome"?: string,"updated_at"?: string | null,"valor_particular"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tipos_consulta_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"tipos_exame_custom": {
                  Row: {
                    "categoria": string | null,"clinica_id": string | null,"created_at": string | null,"id": string,"nome": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"nome": string,"user_id": string
                  }
                  Update: {
                    "categoria"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"nome"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tipos_exame_custom_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"triagens": {
                  Row: {
                    "agendamento_id": string | null,"altura": number | null,"classificacao_risco": Database["public"]['Enums']["classificacao_risco"] | null,"clinica_id": string | null,"created_at": string | null,"data_hora": string | null,"dor_escala": number | null,"enfermeiro_id": string,"frequencia_cardiaca": number | null,"frequencia_respiratoria": number | null,"glicemia": number | null,"id": string,"imc": number | null,"observacoes": string | null,"paciente_id": string,"peso": number | null,"pressao_arterial": string | null,"queixa_principal": string | null,"saturacao": number | null,"temperatura": number | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"altura"?: number | null,"classificacao_risco"?: Database["public"]['Enums']["classificacao_risco"] | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_hora"?: string | null,"dor_escala"?: number | null,"enfermeiro_id": string,"frequencia_cardiaca"?: number | null,"frequencia_respiratoria"?: number | null,"glicemia"?: number | null,"id"?: string,"imc"?: number | null,"observacoes"?: string | null,"paciente_id": string,"peso"?: number | null,"pressao_arterial"?: string | null,"queixa_principal"?: string | null,"saturacao"?: number | null,"temperatura"?: number | null,"updated_at"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"altura"?: number | null,"classificacao_risco"?: Database["public"]['Enums']["classificacao_risco"] | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_hora"?: string | null,"dor_escala"?: number | null,"enfermeiro_id"?: string,"frequencia_cardiaca"?: number | null,"frequencia_respiratoria"?: number | null,"glicemia"?: number | null,"id"?: string,"imc"?: number | null,"observacoes"?: string | null,"paciente_id"?: string,"peso"?: number | null,"pressao_arterial"?: string | null,"queixa_principal"?: string | null,"saturacao"?: number | null,"temperatura"?: number | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "triagens_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "triagens_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "triagens_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"tv_panel_media": {
                  Row: {
                    "ativo": boolean | null,"clinica_id": string | null,"created_at": string | null,"duracao_exibicao": number | null,"id": string,"nome": string,"ordem": number | null,"tipo": string,"updated_at": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"created_at"?: string | null,"duracao_exibicao"?: number | null,"id"?: string,"nome": string,"ordem"?: number | null,"tipo": string,"updated_at"?: string | null,"url": string
                  }
                  Update: {
                    "ativo"?: boolean | null,"clinica_id"?: string | null,"created_at"?: string | null,"duracao_exibicao"?: number | null,"id"?: string,"nome"?: string,"ordem"?: number | null,"tipo"?: string,"updated_at"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tv_panel_media_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"user_notification_state": {
                  Row: {
                    "clinica_id": string,"created_at": string,"read_at": string,"source_id": string,"source_type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"created_at"?: string,"read_at"?: string,"source_id": string,"source_type": string,"user_id": string
                  }
                  Update: {
                    "clinica_id"?: string,"created_at"?: string,"read_at"?: string,"source_id"?: string,"source_type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_notification_state_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "browser_notifications": boolean,"clinica_id": string,"date_format": string,"density": string,"email_daily_summary": boolean,"high_contrast": boolean,"start_page": string,"text_size": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "browser_notifications"?: boolean,"clinica_id": string,"date_format"?: string,"density"?: string,"email_daily_summary"?: boolean,"high_contrast"?: boolean,"start_page"?: string,"text_size"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "browser_notifications"?: boolean,"clinica_id"?: string,"date_format"?: string,"density"?: string,"email_daily_summary"?: boolean,"high_contrast"?: boolean,"start_page"?: string,"text_size"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_preferences_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "assigned_at": string | null,"assigned_by": string | null,"id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string | null,"assigned_by"?: string | null,"id"?: string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string | null,"assigned_by"?: string | null,"id"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_training_progress": {
                  Row: {
                    "clinica_id": string,"completed_at": string,"tutorial_key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id": string,"completed_at"?: string,"tutorial_key": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "clinica_id"?: string,"completed_at"?: string,"tutorial_key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_training_progress_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_agent_actions": {
                  Row: {
                    "clinica_id": string | null,"conversation_id": string | null,"created_at": string | null,"dados_entrada": Json | null,"dados_saida": Json | null,"duracao_ms": number | null,"erro_mensagem": string | null,"id": string,"sucesso": boolean | null,"tipo_acao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string | null,"dados_entrada"?: Json | null,"dados_saida"?: Json | null,"duracao_ms"?: number | null,"erro_mensagem"?: string | null,"id"?: string,"sucesso"?: boolean | null,"tipo_acao": string
                  }
                  Update: {
                    "clinica_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string | null,"dados_entrada"?: Json | null,"dados_saida"?: Json | null,"duracao_ms"?: number | null,"erro_mensagem"?: string | null,"id"?: string,"sucesso"?: boolean | null,"tipo_acao"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_agent_actions_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_agent_actions_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "whatsapp_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_agent_knowledge": {
                  Row: {
                    "agent_id": string,"clinica_id": string,"conteudo": string,"created_at": string,"embedding": string,"id": string,"search_vector": unknown,"titulo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id": string,"clinica_id": string,"conteudo": string,"created_at"?: string,"embedding": string,"id"?: string,"search_vector"?: never,"titulo": string,"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string,"clinica_id"?: string,"conteudo"?: string,"created_at"?: string,"embedding"?: string,"id"?: string,"search_vector"?: never,"titulo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_agent_knowledge_agent_clinic_fk"
      columns: ["agent_id","clinica_id"]
isOneToOne: false
      referencedRelation: "whatsapp_agents"
      referencedColumns: ["id","clinica_id"]
    },{
      foreignKeyName: "whatsapp_agent_knowledge_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_agents": {
                  Row: {
                    "atende_fora_horario": boolean | null,"ativo": boolean | null,"clinica_id": string | null,"created_at": string | null,"habilidades": (string)[],"horario_atendimento_fim": string | null,"horario_atendimento_inicio": string | null,"humor": string,"id": string,"instrucoes_personalizadas": string | null,"max_tokens": number | null,"mensagem_boas_vindas": string | null,"mensagem_encerramento": string | null,"mensagem_fora_horario": string | null,"nome": string,"temperatura": number | null,"tipo": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atende_fora_horario"?: boolean | null,"ativo"?: boolean | null,"clinica_id"?: string | null,"created_at"?: string | null,"habilidades"?: (string)[],"horario_atendimento_fim"?: string | null,"horario_atendimento_inicio"?: string | null,"humor"?: string,"id"?: string,"instrucoes_personalizadas"?: string | null,"max_tokens"?: number | null,"mensagem_boas_vindas"?: string | null,"mensagem_encerramento"?: string | null,"mensagem_fora_horario"?: string | null,"nome": string,"temperatura"?: number | null,"tipo"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "atende_fora_horario"?: boolean | null,"ativo"?: boolean | null,"clinica_id"?: string | null,"created_at"?: string | null,"habilidades"?: (string)[],"horario_atendimento_fim"?: string | null,"horario_atendimento_inicio"?: string | null,"humor"?: string,"id"?: string,"instrucoes_personalizadas"?: string | null,"max_tokens"?: number | null,"mensagem_boas_vindas"?: string | null,"mensagem_encerramento"?: string | null,"mensagem_fora_horario"?: string | null,"nome"?: string,"temperatura"?: number | null,"tipo"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_agents_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_conversations": {
                  Row: {
                    "acao_pendente": Json | null,"atendimento_humano_em": string | null,"clinica_id": string | null,"contexto": Json | null,"created_at": string | null,"encerrada_em": string | null,"id": string,"nao_lidas": number,"paciente_id": string | null,"primeira_resposta_em": string | null,"prioridade": string,"remote_jid": string,"responsavel_id": string | null,"resumo_ia": string | null,"satisfacao_comentario": string | null,"satisfacao_nota": number | null,"session_id": string | null,"sla_limite_em": string | null,"status": string | null,"ultima_mensagem_at": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao_pendente"?: Json | null,"atendimento_humano_em"?: string | null,"clinica_id"?: string | null,"contexto"?: Json | null,"created_at"?: string | null,"encerrada_em"?: string | null,"id"?: string,"nao_lidas"?: number,"paciente_id"?: string | null,"primeira_resposta_em"?: string | null,"prioridade"?: string,"remote_jid": string,"responsavel_id"?: string | null,"resumo_ia"?: string | null,"satisfacao_comentario"?: string | null,"satisfacao_nota"?: number | null,"session_id"?: string | null,"sla_limite_em"?: string | null,"status"?: string | null,"ultima_mensagem_at"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "acao_pendente"?: Json | null,"atendimento_humano_em"?: string | null,"clinica_id"?: string | null,"contexto"?: Json | null,"created_at"?: string | null,"encerrada_em"?: string | null,"id"?: string,"nao_lidas"?: number,"paciente_id"?: string | null,"primeira_resposta_em"?: string | null,"prioridade"?: string,"remote_jid"?: string,"responsavel_id"?: string | null,"resumo_ia"?: string | null,"satisfacao_comentario"?: string | null,"satisfacao_nota"?: number | null,"session_id"?: string | null,"sla_limite_em"?: string | null,"status"?: string | null,"ultima_mensagem_at"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_conversations_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_conversations_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_conversations_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_conversations_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "whatsapp_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_messages": {
                  Row: {
                    "clinica_id": string | null,"conteudo": string | null,"conversation_id": string | null,"created_at": string | null,"direcao": string,"id": string,"message_id": string | null,"metadata": Json | null,"status": string | null,"tipo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clinica_id"?: string | null,"conteudo"?: string | null,"conversation_id"?: string | null,"created_at"?: string | null,"direcao": string,"id"?: string,"message_id"?: string | null,"metadata"?: Json | null,"status"?: string | null,"tipo"?: string | null
                  }
                  Update: {
                    "clinica_id"?: string | null,"conteudo"?: string | null,"conversation_id"?: string | null,"created_at"?: string | null,"direcao"?: string,"id"?: string,"message_id"?: string | null,"metadata"?: Json | null,"status"?: string | null,"tipo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_messages_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "whatsapp_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_notas_internas": {
                  Row: {
                    "autor_id": string,"clinica_id": string,"conteudo": string,"conversation_id": string,"created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autor_id": string,"clinica_id": string,"conteudo": string,"conversation_id": string,"created_at"?: string,"id"?: string
                  }
                  Update: {
                    "autor_id"?: string,"clinica_id"?: string,"conteudo"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_notas_internas_autor_id_fkey"
      columns: ["autor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_notas_internas_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_notas_internas_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "whatsapp_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_sessions": {
                  Row: {
                    "agent_id": string | null,"clinica_id": string | null,"created_at": string | null,"id": string,"instance_id": string | null,"instance_name": string,"phone_number": string | null,"qr_code": string | null,"qr_code_expires_at": string | null,"status": string | null,"updated_at": string | null,"webhook_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"instance_id"?: string | null,"instance_name": string,"phone_number"?: string | null,"qr_code"?: string | null,"qr_code_expires_at"?: string | null,"status"?: string | null,"updated_at"?: string | null,"webhook_url"?: string | null
                  }
                  Update: {
                    "agent_id"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"id"?: string,"instance_id"?: string | null,"instance_name"?: string,"phone_number"?: string | null,"qr_code"?: string | null,"qr_code_expires_at"?: string | null,"status"?: string | null,"updated_at"?: string | null,"webhook_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_sessions_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "whatsapp_agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_sessions_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "fila_alertas_lab_esquecido": {
                  Row: {
                    "clinica_id": string | null,"coleta_id": string | null,"created_at": string | null,"exame_id": string | null,"paciente_id": string | null,"paciente_nome": string | null,"parado_ha": string | null,"status": string | null,"tipo_exame": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "coletas_laboratorio_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_exame_id_fkey"
      columns: ["exame_id"]
isOneToOne: false
      referencedRelation: "exames"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coletas_laboratorio_paciente_id_fkey"
      columns: ["paciente_id"]
isOneToOne: false
      referencedRelation: "pacientes"
      referencedColumns: ["id"]
    }
                  ]
                },"funcionarios_safe": {
                  Row: {
                    "ativo": boolean | null,"cargo": string | null,"clinica_id": string | null,"created_at": string | null,"data_admissao": string | null,"departamento": string | null,"email": string | null,"id": string | null,"nome": string | null,"telefone": string | null,"tipo_funcionario": string | null,"updated_at": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"cargo"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_admissao"?: string | null,"departamento"?: string | null,"email"?: string | null,"id"?: string | null,"nome"?: string | null,"telefone"?: string | null,"tipo_funcionario"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"cargo"?: string | null,"clinica_id"?: string | null,"created_at"?: string | null,"data_admissao"?: string | null,"departamento"?: string | null,"email"?: string | null,"id"?: string | null,"nome"?: string | null,"telefone"?: string | null,"tipo_funcionario"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "funcionarios_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"nps_resumo_mensal": {
                  Row: {
                    "clinica_id": string | null,"detratores": number | null,"media": number | null,"mes": string | null,"neutros": number | null,"nps_score": number | null,"promotores": number | null,"total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "feedbacks_nps_clinica_id_fkey"
      columns: ["clinica_id"]
isOneToOne: false
      referencedRelation: "clinicas"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_saude_agregada": {
                  Row: {
                    "agendamentos_no_mes": number | null,"audits_ultimos_7d": number | null,"clinicas_arquivadas": number | null,"clinicas_ativas": number | null,"clinicas_em_trial": number | null,"total_clinicas": number | null,"total_pacientes": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "abrir_caixa_diario":
{ Args: { "p_valor_abertura": number }; Returns: Json
                           },
"accept_employee_invitation":
{ Args: { "_token": string,"_user_id": string }; Returns: Json
                           },
"aceitar_oferta_lista_espera":
{ Args: { "p_lista_espera_id": string,"p_paciente_id": string }; Returns: string
                           },
"auditoria_acessos_intervalo":
{ Args: { "p_fim": string,"p_inicio": string }; Returns: {
              "acao": string,"evento_id": string,"ocorrido_em": string,"origem": string,"recurso": string,"registro_id": string | null,"usuario_id": string | null,"usuario_nome": string | null
            }[]
                           },
"activate_public_registration":
{ Args: { "_codigo_convite": string,"_user_id": string }; Returns: Json
                           },
"admin_encerrar_sessoes":
{ Args: { "p_user_id": string }; Returns: number
                           },
"admin_situacao_contas":
{ Args: Record<PropertyKey, never>; Returns: {
              "bloqueado": boolean,"bloqueado_ate": string,"email_confirmado": boolean,"sessoes_abertas": number,"ultimo_login": string,"user_id": string
            }[]
                           },
"agendamento_tem_cobranca_ativa":
{ Args: { "p_agendamento_id": string }; Returns: boolean
                           },
"agendar_consulta_online_atomico":
{ Args: { "p_clinica_id": string,"p_data": string,"p_duracao_minutos": number,"p_hora_inicio": string,"p_medico_id": string,"p_observacoes": string,"p_paciente_id": string }; Returns: Json
                           } |
{ Args: { "p_clinica_id": string,"p_data": string,"p_duracao_minutos": number,"p_hold_token_hash": string,"p_hora_inicio": string,"p_medico_id": string,"p_observacoes": string,"p_paciente_id": string }; Returns: Json
                           },
"agendar_guia_externa":
{ Args: { "p_clinica_id": string,"p_data": string,"p_guia_id": string,"p_hora": string,"p_paciente_id": string }; Returns: string
                           },
"agendar_retorno_atomico":
{ Args: { "p_confirmou_fora_expediente"?: boolean,"p_data": string,"p_hora": string,"p_retorno_id": string }; Returns: string
                           },
"alterar_status_agendamento_com_fila":
{ Args: { "p_agendamento_id": string,"p_clinica_id": string,"p_status": string,"p_updated_at": string }; Returns: Json
                           },
"alterar_status_conversa_whatsapp":
{ Args: { "_conversation_id": string,"_status": string }; Returns: undefined
                           },
"alterar_status_paciente":
{ Args: { "p_ativo": boolean,"p_motivo": string,"p_paciente_id": string }; Returns: Json
                           },
"aplicar_status_pedido_plano":
{ Args: { "p_mp_payment_id": string,"p_pedido_id": string,"p_snapshot": Json,"p_status": string,"p_status_detail": string }; Returns: Json
                           },
"apply_clinical_safety_review":
{ Args: { "p_actor_user_id": string,"p_assigned_to": string,"p_clinic_id": string,"p_corrective_action": string,"p_due_at": string,"p_expected_updated_at": string,"p_report_id": string,"p_review_note": string,"p_status": string }; Returns: {
              "report_id": string,"report_status": string,"report_updated_at": string
            }[]
                           },
"aprovar_repasse_medico":
{ Args: { "p_repasse_id": string }; Returns: Json
                           },
"assinar_prontuario_verificavel":
{ Args: { "p_prontuario_id": string }; Returns: Json
                           },
"assumir_conversa_whatsapp":
{ Args: { "_conversation_id": string }; Returns: undefined
                           },
"atualizar_glosa_convenio":
{ Args: { "p_glosa_id": string,"p_recurso_justificativa"?: string,"p_status": string,"p_valor_recuperado"?: number }; Returns: Json
                           },
"atualizar_predicoes_no_show":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"automacoes_padrao":
{ Args: Record<PropertyKey, never>; Returns: {
              "chave": string,"descricao": string
            }[]
                           },
"busca_global":
{ Args: { "p_limite"?: number,"p_termo": string }; Returns: {
              "data_referencia": string,"href": string,"id": string,"subtitulo": string,"tipo": string,"titulo": string
            }[]
                           },
"buscar_contato_medico_notificacao":
{ Args: { "p_medico_id": string }; Returns: {
              "email": string,"id": string,"nome": string,"user_id": string
            }[]
                           },
"buscar_medico_atual":
{ Args: Record<PropertyKey, never>; Returns: {
              "ativo": boolean,"crm": string,"crm_uf": string,"especialidade": string,"foto_url": string,"id": string,"intervalo_consulta": number,"nome": string,"rqe": string
            }[]
                           },
"buscar_pacientes_resumo_financeiro":
{ Args: { "p_convenio_id"?: string,"p_ids"?: (string)[],"p_limite"?: number,"p_nascimento_apos"?: string,"p_nascimento_ate"?: string,"p_sexo"?: string,"p_somente_particular"?: boolean,"p_termo"?: string }; Returns: {
              "convenio_id": string,"cpf": string,"created_at": string,"data_nascimento": string,"email": string,"id": string,"nome": string,"nome_social": string,"telefone": string
            }[]
                           },
"buscar_possiveis_duplicidades_paciente":
{ Args: { "p_data_nascimento": string,"p_excluir"?: string,"p_nome": string,"p_telefone": string }; Returns: {
              "data_nascimento": string,"id": string,"motivos": (string)[],"nome": string,"nome_social": string,"telefone_final": string
            }[]
                           },
"concluir_exportacao_lgpd_paciente":
{ Args: { "p_evidencia": string,"p_id": string }; Returns: Json
                           },
"descartar_duplicidade_pacientes":
{ Args: { "p_paciente_a": string,"p_paciente_b": string }; Returns: undefined
                           },
"listar_duplicidades_pacientes":
{ Args: { "p_limiar"?: number,"p_limite"?: number }; Returns: {
              "motivos": (string)[],"nascimento_a": string,"nascimento_b": string,"nome_a": string,"nome_b": string,"paciente_a": string,"paciente_b": string,"pontuacao": number,"telefone_final_a": string,"telefone_final_b": string
            }[]
                           },
"mesclar_pacientes":
{ Args: { "p_campos": (string)[],"p_destino": string,"p_motivo": string,"p_origem": string }; Returns: Json
                           },
"cadastrar_item_estoque":
{ Args: { "p_categoria": string,"p_chave_cadastro"?: string,"p_clinica_id": string,"p_codigo_ean": string,"p_descricao": string,"p_dosagem": string,"p_fabricante": string,"p_fornecedor": string,"p_localizacao": string,"p_lote": string,"p_nome": string,"p_ponto_pedido": number,"p_principio_ativo": string,"p_quantidade": number,"p_quantidade_maxima": number,"p_quantidade_minima": number,"p_unidade": string,"p_validade": string,"p_valor_unitario": number,"p_valor_venda": number }; Returns: string
                           },
"cadastrar_item_estoque_impl":
{ Args: { "p_categoria": string,"p_chave_cadastro"?: string,"p_clinica_id": string,"p_codigo_ean": string,"p_descricao": string,"p_dosagem": string,"p_fabricante": string,"p_fornecedor": string,"p_localizacao": string,"p_lote": string,"p_nome": string,"p_ponto_pedido": number,"p_principio_ativo": string,"p_quantidade": number,"p_quantidade_maxima": number,"p_quantidade_minima": number,"p_unidade": string,"p_validade": string,"p_valor_unitario": number,"p_valor_venda": number }; Returns: string
                           },
"can_access_clinical":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"can_access_financial":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"can_manage_data":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"cancelar_agendamento_com_motivo":
{ Args: { "p_agendamento_id": string,"p_clinica_id": string,"p_motivo_cancelamento": string,"p_updated_at": string }; Returns: Json
                           },
"cancelar_coletas_pendentes_antigas":
{ Args: { "p_dias": number,"p_motivo": string }; Returns: number
                           },
"cancelar_lancamento_pendente":
{ Args: { "p_lancamento_id": string }; Returns: boolean
                           },
"cancelar_retorno_atomico":
{ Args: { "p_retorno_id": string }; Returns: boolean
                           },
"central_notificacoes_usuario":
{ Args: { "p_limit"?: number }; Returns: {
              "category": string,"href": string,"is_read": boolean,"message": string,"occurred_at": string,"severity": string,"source_id": string,"source_type": string,"title": string
            }[]
                           },
"chave_config_da_clinica":
{ Args: { "p_chave": string }; Returns: boolean
                           },
"checar_rate_limit":
{ Args: { "p_chave": string,"p_janela_segundos"?: number,"p_limite": number }; Returns: boolean
                           },
"claim_automation_delivery":
{ Args: { "p_chave": string,"p_clinica_id": string }; Returns: boolean
                           },
"claim_cobranca_inadimplente":
{ Args: { "p_clinica_id": string,"p_dias_atraso": number,"p_lancamento_id": string }; Returns: boolean
                           },
"claim_mercadopago_oauth_refresh_lock":
{ Args: { "p_clinica_id": string,"p_lock_id": string,"p_lock_until": string }; Returns: boolean
                           },
"claim_mercadopago_webhook":
{ Args: { "p_data_id": string,"p_event_id": string,"p_event_type": string,"p_lease_seconds"?: number,"p_payload": Json }; Returns: {
              "claim_status": string,"claim_token": string,"log_id": string
            }[]
                           },
"clinic_onboarding_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"clinica_acesso_bloqueado":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"clinica_recurso_plano_liberado":
{ Args: { "p_clinica_id": string,"p_recurso": string }; Returns: boolean
                           },
"uso_plano_clinica":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"historico_cobranca_assinatura":
{ Args: { "p_limit"?: number }; Returns: {
              "atualizado_em": string | null,"criado_em": string | null,"detalhe": string | null,"id": string,"metodo": string | null,"origem": string,"referencia": string | null,"status": string,"valor": number | null
            }[]
                           },
"avisos_alteracao_plano":
{ Args: Record<PropertyKey, never>; Returns: {
              "alterado_em": string,"campos": Json,"efeito_preco": string | null,"id": string,"plano_nome": string,"vigencia_preco": string | null
            }[]
                           },
"platform_reconciliar_cobranca":
{ Args: { "p_id": string,"p_justificativa": string,"p_origem": string,"p_resolucao": string }; Returns: Json
                           },
"platform_reconciliacoes_cobranca":
{ Args: { "p_limit"?: number }; Returns: {
              "autor_email": string | null,"criado_em": string | null,"id": string,"justificativa": string | null,"origem": string | null,"record_id": string,"resolucao": string | null,"status_anterior": string | null,"status_novo": string | null
            }[]
                           },
"platform_checkout_attempts":
{ Args: { "p_limit"?: number }; Returns: {
              "atualizado_em": string | null,"clinica_nome": string | null,"criado_em": string | null,"detalhe": string | null,"divergente": boolean,"dono_email": string | null,"id": string,"metodo": string | null,"origem": string,"referencia": string | null,"status": string,"valor": number | null
            }[]
                           },
"concluir_cobranca_inadimplente":
{ Args: { "p_clinica_id": string,"p_dias_atraso": number,"p_lancamento_id": string }; Returns: undefined
                           },
"concluir_fila_atomico":
{ Args: { "p_agendamento_id": string,"p_fila_id": string }; Returns: boolean
                           },
"configurar_percentual_repasse":
{ Args: { "p_medico_id": string,"p_percentual": number }; Returns: undefined
                           },
"configurar_repasse_medico":
{ Args: { "p_medico_id": string,"p_tipo": string,"p_valor": number }; Returns: undefined
                           },
"confirmar_acao_agenda_whatsapp":
{ Args: { "p_clinica_id": string,"p_conversation_id": string }; Returns: Json
                           },
"confirmar_ciencia_resultado_critico":
{ Args: { "p_conduta": string,"p_resultado_id": string }; Returns: {
              "conduta": string,"confirmado_em": string,"confirmado_por": string,"numero_versao": number,"resultado_id": string
            }[]
                           },
"confirmar_estado_cobranca_checkin":
{ Args: { "p_agendamento_id": string,"p_clinica_id": string,"p_gratuito": boolean }; Returns: boolean
                           },
"contar_equipe_ativa":
{ Args: Record<PropertyKey, never>; Returns: {
              "funcionarios": number,"medicos": number
            }[]
                           },
"contar_pacientes_cadastrados":
{ Args: { "p_fim": string,"p_inicio": string }; Returns: number
                           },
"create_clinical_safety_correction_request":
{ Args: { "p_actor_user_id": string,"p_clinic_id": string,"p_proposed_immediate_action": string,"p_proposed_summary": string,"p_reason": string,"p_report_id": string }; Returns: {
              "request_created_at": string,"request_id": string,"request_status": string
            }[]
                           },
"create_clinical_safety_report":
{ Args: { "p_actor_user_id": string,"p_category": string,"p_clinic_id": string,"p_immediate_action": string,"p_location_label": string,"p_occurred_at": string,"p_reporter_confidential": boolean,"p_severity": string,"p_summary": string }; Returns: {
              "report_created_at": string,"report_id": string,"report_status": string
            }[]
                           },
"create_employee_invitation":
{ Args: { "_clinica_id": string,"_email": string,"_invited_by": string,"_nome": string,"_roles": (string)[],"_token": string }; Returns: string
                           },
"create_room_hygiene_checklist":
{ Args: { "p_actor_id": string,"p_clinic_id": string,"p_items": Json,"p_title": string }; Returns: string
                           },
"criar_cobranca_checkin_atomica":
{ Args: { "p_agendamento_id": string,"p_categoria": string,"p_clinica_id": string,"p_data": string,"p_descricao": string,"p_paciente_id": string,"p_valor": number }; Returns: string
                           },
"criar_lote_tiss":
{ Args: { "p_competencia": string,"p_convenio_id": string,"p_numero_lote": string,"p_quantidade_guias": number,"p_valor_apresentado": number }; Returns: Json
                           },
"criar_pedido_laboratorio":
{ Args: { "p_convenio_id": string,"p_exames": Json,"p_indicacao_clinica": string,"p_medico_solicitante_id": string,"p_paciente_id": string,"p_prioridade": string }; Returns: string
                           },
"current_clinica_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"decide_support_access":
{ Args: { "p_decision": string,"p_hours"?: number,"p_request_id": string }; Returns: undefined
                           },
"desfazer_checkin_sem_cobranca":
{ Args: { "p_agendamento_id": string,"p_clinica_id": string,"p_fila_id": string,"p_status_anterior": string }; Returns: Json
                           },
"encaminhar_guia_externa_para_fila":
{ Args: { "p_clinica_id": string,"p_guia_id": string,"p_paciente_id": string }; Returns: number
                           },
"enfileirar_jornada_paciente":
{ Args: { "p_agendamento_id"?: string,"p_automation_key"?: string,"p_clinica_id"?: string,"p_resultado_id"?: string }; Returns: Json
                           },
"enfileirar_lembrete_risco":
{ Args: { "p_agendamento_id": string }; Returns: boolean
                           },
"enfileirar_lembretes_retorno":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"enfileirar_mensagem_jornada":
{ Args: { "p_agendado_para": string,"p_chave": string,"p_clinica_id": string,"p_conteudo": string,"p_evento": string,"p_extras": Json,"p_legacy_key"?: string,"p_paciente_id": string }; Returns: number
                           },
"estado_operacional":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"estornar_pagamento":
{ Args: { "p_motivo": string,"p_pagamento_id": string }; Returns: Json
                           },
"estornar_pagamento_mercadopago_point":
{ Args: { "p_point_order_id": string }; Returns: Json
                           },
"exame_e_de_laboratorio":
{ Args: { "p_tipo": string }; Returns: boolean
                           },
"excluir_funcionario_revogando_acesso":
{ Args: { "p_funcionario_id": string }; Returns: undefined
                           },
"expirar_ofertas_lista_espera":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"expirar_planos_pre_pagos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"expire_trials":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"fechar_caixa_diario":
{ Args: { "p_caixa_id": string,"p_observacoes"?: string,"p_valor_contado": number }; Returns: Json
                           },
"finalizar_atendimento_atomico":
{ Args: { "p_agendamento_id": string,"p_agendar_retorno"?: boolean,"p_dias_retorno"?: number,"p_fila_id"?: string,"p_tipo_exame"?: string }; Returns: {
              "cobranca_criada": boolean,"repetido": boolean,"retorno_id": string,"status_agendamento": string
            }[]
                           },
"find_patient_id_by_normalized_cpf":
{ Args: { "p_clinica_id": string,"p_cpf": string }; Returns: string
                           },
"finish_automation_delivery":
{ Args: { "p_chave": string,"p_clinica_id": string,"p_estado"?: string }; Returns: undefined
                           },
"gerar_repasses_medicos":
{ Args: { "p_competencia": string }; Returns: number
                           },
"gerenciar_documento_portal_paciente":
{ Args: { "p_anexo_id": string,"p_origem": string,"p_publicado": boolean,"p_validade_ate": string }; Returns: Json
                           },
"get_my_clinica_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_user_plan":
{ Args: { "_user_id": string }; Returns: {
              "em_trial": boolean,"plano_nome": string,"plano_slug": string,"status": string,"trial_fim": string
            }[]
                           },
"has_any_role":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"has_role":
{ Args: { "_role": Database["public"]['Enums']["app_role"],"_user_id": string }; Returns: boolean
                           },
"incrementar_whatsapp_nao_lidas":
{ Args: { "_conversation_id": string }; Returns: undefined
                           },
"indicadores_produtividade":
{ Args: { "p_days"?: number }; Returns: {
              "current_value": number,"label": string,"metric_key": string,"previous_value": number,"scope": string,"unit": string
            }[]
                           },
"iniciar_atendimento_atomico":
{ Args: { "p_agendamento_id": string,"p_fila_id": string }; Returns: Json
                           },
"integracoes_da_clinica":
{ Args: Record<PropertyKey, never>; Returns: {
              "conectado_em": string,"config": Json,"provedor": string,"referencia_id": string,"segredo_dica": string,"status": string,"ultimo_erro": string,"ultimo_teste_em": string,"updated_at": string
            }[]
                           },
"is_admin":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"is_clinica_owner":
{ Args: { "p_clinica_id": string }; Returns: boolean
                           },
"is_enfermagem":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"is_financeiro":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"is_medico":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"is_medico_da_agenda":
{ Args: { "p_medico_id": string }; Returns: boolean
                           },
"is_medico_responsavel_do_prontuario":
{ Args: { "p_medico_id": string }; Returns: boolean
                           },
"is_paciente_da_clinica":
{ Args: { "p_clinica_id": string,"p_paciente_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_recepcao":
{ Args: { "_user_id": string }; Returns: boolean
                           },
"is_same_clinica":
{ Args: { "record_clinica_id": string }; Returns: boolean
                           },
"laboratorio_registrar_evento_amostra":
{ Args: { "p_coleta_id": string,"p_detalhes"?: Json,"p_local"?: string,"p_tipo": string }; Returns: string
                           },
"laboratorio_sla_etapas":
{ Args: { "p_inicio": string }; Returns: {
              "amostras": number,"coleta_recebimento_h": number | null,"em_atraso": number,"espera_coleta_h": number | null,"processamento_liberacao_h": number | null,"recebimento_processamento_h": number | null,"setor_id": string | null,"setor_nome": string,"sla_horas": number,"total_h": number | null
            }[]
                           },
"lancar_item_no_atendimento":
{ Args: { "p_agendamento_id": string,"p_categoria"?: string,"p_descricao": string,"p_prontuario_id"?: string,"p_quantidade"?: number,"p_valor_unitario": number }; Returns: Json
                           },
"liberar_resultados_laboratorio":
{ Args: { "p_coleta_id": string,"p_resultado_ids": (string)[] }; Returns: {
              "id": string
            }[]
                           },
"limpar_logs_antigos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"limpar_rate_limit_antigos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"link_portal_paciente":
{ Args: { "p_paciente_id": string }; Returns: string
                           },
"list_my_account_sessions":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"is_current": boolean,"last_activity_at": string,"session_id": string,"user_agent": string
            }[]
                           },
"listar_agendamentos_com_triagem":
{ Args: { "p_agendamento_ids": (string)[] }; Returns: {
              "agendamento_id": string
            }[]
                           },
"listar_funcionarios_chat_equipe":
{ Args: Record<PropertyKey, never>; Returns: {
              "cargo": string,"tipo_funcionario": string,"user_id": string
            }[]
                           },
"listar_funcionarios_equipe_admin":
{ Args: Record<PropertyKey, never>; Returns: {
              "ativo": boolean | null,
"carga_horaria": number | null,
"cargo": string | null,
"clinica_id": string | null,
"cpf": string | null,
"created_at": string | null,
"data_admissao": string | null,
"data_nascimento": string | null,
"departamento": string | null,
"edit_version": number,
"email": string | null,
"especialidade": string | null,
"id": string,
"nome": string,
"pending_roles": (Database["public"]['Enums']["app_role"])[],
"registro_profissional": string | null,
"salario": number | null,
"telefone": string | null,
"tipo_funcionario": string | null,
"tipo_registro": string | null,
"turno": string | null,
"uf_registro": string | null,
"updated_at": string | null,
"user_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "funcionarios"
        isOneToOne: false
        isSetofReturn: true
      } },
"listar_medicos_equipe_admin":
{ Args: Record<PropertyKey, never>; Returns: {
              "ativo": boolean | null,
"carimbo_url": string | null,
"clinica_id": string | null,
"cns": string | null,
"cpf": string | null,
"created_at": string | null,
"crm": string,
"crm_uf": string | null,
"data_nascimento": string | null,
"email": string | null,
"especialidade": string | null,
"foto_url": string | null,
"id": string,
"intervalo_consulta": number | null,
"nome": string | null,
"percentual_repasse": number,
"rqe": string | null,
"telefone": string | null,
"tipo_registro": string | null,
"tipo_repasse": string,
"updated_at": string | null,
"user_id": string | null,
"valor_repasse_fixo": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "medicos"
        isOneToOne: false
        isSetofReturn: true
      } },
"listar_medicos_repasse_equipe":
{ Args: Record<PropertyKey, never>; Returns: {
              "crm": string,"id": string,"nome": string,"percentual_repasse": number,"tipo_repasse": string,"valor_repasse_fixo": number
            }[]
                           },
"manage_product_feedback":
{ Args: { "p_id": string,"p_resposta"?: string,"p_status": string }; Returns: undefined
                           },
"marcar_atendimento_nao_realizado":
{ Args: { "p_agendamento_id": string,"p_clinica_id": string }; Returns: Json
                           },
"marcar_comunicado_lido":
{ Args: { "p_announcement_id": string }; Returns: undefined
                           },
"marcar_retorno_realizado_atomico":
{ Args: { "p_retorno_id": string }; Returns: boolean
                           },
"marcar_whatsapp_como_lida":
{ Args: { "_conversation_id": string }; Returns: undefined
                           },
"mask_cpf":
{ Args: { "cpf_value": string }; Returns: string
                           },
"meu_historico_acoes":
{ Args: { "p_action"?: string,"p_collection"?: string,"p_from"?: string,"p_page"?: number,"p_page_size"?: number,"p_to"?: string }; Returns: {
              "action": string,"event_id": string,"occurred_at": string,"resource": string,"total_count": number
            }[]
                           },
"meus_comunicados":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"inicia_em": string,"lido": boolean,"mensagem": string,"termina_em": string,"tipo": string,"titulo": string
            }[]
                           },
"movimentos_caixa_diario":
{ Args: { "p_data": string }; Returns: {
              "categoria": string,"created_at": string,"data": string,"descricao": string,"forma_pagamento": string,"id": string,"origem_pagamento": boolean,"paciente_id": string,"paciente_nome": string,"tipo": string,"valor": number
            }[]
                           },
"nome_catalogo_tipo_consulta":
{ Args: { "p_tipo": string }; Returns: string
                           },
"normalizar_nome_exame":
{ Args: { "p_nome": string }; Returns: string
                           },
"normalizar_telefone_jornada":
{ Args: { "p_telefone": string }; Returns: string
                           },
"normalizar_telefone_revisao":
{ Args: { "p_telefone": string }; Returns: string
                           },
"normalize_cpf":
{ Args: { "cpf_value": string }; Returns: string
                           },
"ordem_de_restauracao":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"platform_ai_release_tokens":
{ Args: { "p_clinica_id": string,"p_reservation_id": string }; Returns: undefined
                           },
"platform_ai_reserve_tokens":
{ Args: { "p_clinica_id": string,"p_limite_padrao": number,"p_tokens_reservados": number }; Returns: Json
                           },
"platform_ai_settle_tokens":
{ Args: { "p_clinica_id": string,"p_duracao_ms": number,"p_input_tokens": number,"p_modelo": string,"p_operacao": string,"p_output_tokens": number,"p_reservation_id": string,"p_user_id": string }; Returns: undefined
                           },
"platform_ai_usage_summary":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_arquivar_clinica":
{ Args: { "_clinica_id": string,"_motivo"?: string }; Returns: Json
                           },
"platform_billing_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_clinic_integration_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_conteudo_da_clinica":
{ Args: { "_clinica_id": string }; Returns: Json
                           },
"platform_crm_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "assinatura_status": string,"cliente_desde": string,"clinica_id": string,"clinica_nome": string,"cnpj": string,"dias_para_vencer": number,"dias_sem_uso": number,"dono_email": string,"dono_nome": string,"dono_telefone": string,"em_trial": boolean,"plano_nome": string,"plano_valor": number,"suspensa": boolean,"total_agendamentos": number,"total_funcionarios": number,"total_medicos": number,"total_pacientes": number,"ultima_atividade": string,"vence_em": string
            }[]
                           },
"platform_decide_restore":
{ Args: { "p_approve": boolean,"p_id": string }; Returns: undefined
                           },
"platform_desarquivar_clinica":
{ Args: { "_clinica_id": string }; Returns: Json
                           },
"platform_excluir_clinica_vazia":
{ Args: { "_clinica_id": string,"_confirmacao": string }; Returns: Json
                           },
"platform_executive_report":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"platform_financial_history":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"platform_get_backup_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_get_clinicas_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "arquivada": boolean,"arquivada_em": string,"arquivada_motivo": string,"assinatura_status": string,"clinica_id": string,"clinica_nome": string,"created_at": string,"data_fim": string,"em_trial": boolean,"owner_email": string,"owner_id": string,"owner_nome": string,"plano_nome": string,"plano_slug": string,"suspensa": boolean,"total_agendamentos": number,"total_funcionarios": number,"total_medicos": number,"total_pacientes": number,"trial_fim": string
            }[]
                           },
"platform_get_clinicas_saude":
{ Args: Record<PropertyKey, never>; Returns: {
              "agendamentos_em_atendimento": number,"arquivada": boolean,"assinatura_status": string,"audits_no_mes": number,"clinica_id": string,"clinica_nome": string,"coletas_esquecidas": number,"contas_a_receber_valor": number,"contas_a_receber_vencidas": number,"criada_em": string,"em_trial": boolean,"exames_solicitados_ha_7d": number,"plano_nome": string,"suspensa": boolean,"total_agendamentos_no_mes": number,"total_pacientes": number,"ultima_atividade": string,"ultima_atividade_ha_dias": number
            }[]
                           },
"platform_onboarding_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_open_incident":
{ Args: { "p_severity": string,"p_summary": string,"p_title": string }; Returns: string
                           },
"platform_plan_recurring_payment_overdue":
{ Args: { "p_owner_user_id": string }; Returns: boolean
                           },
"platform_publish_ai_config":
{ Args: { "p_ativo": boolean,"p_expected_version": number,"p_limite_mensal_clinica": number,"p_max_tokens": number,"p_modelo_fallback": string,"p_modelo_principal": string,"p_prompt_base": string,"p_temperatura": number }; Returns: Json
                           },
"platform_queue_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_request_restore":
{ Args: { "p_backup_name": string,"p_reason": string,"p_scope"?: string,"p_scope_ref"?: string }; Returns: string
                           },
"platform_retry_notification":
{ Args: { "p_id": string }; Returns: boolean
                           },
"platform_security_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_set_tenant_limits":
{ Args: { "p_clinica_id": string,"p_max_ai_tokens": number,"p_max_notifications": number,"p_max_users": number }; Returns: undefined
                           },
"platform_start_impersonation":
{ Args: { "_motivo"?: string,"_target_clinica_id": string }; Returns: Json
                           },
"platform_stop_impersonation":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_subscription_invoice_history":
{ Args: { "p_limit"?: number }; Returns: {
              "amount": number,"clinic_name": string,"currency_id": string,"date_created": string,"debit_date": string,"id": string,"invoice_status": string,"invoice_type": string,"mp_authorized_payment_id": string,"mp_payment_id": string,"mp_preapproval_id": string,"owner_email": string,"payment_status": string,"payment_status_detail": string,"retry_attempt": number
            }[]
                           },
"platform_support_context":
{ Args: { "p_request_id": string }; Returns: Json
                           },
"platform_update_clinic_user":
{ Args: { "p_nome": string,"p_roles": (string)[],"p_telefone": string,"p_user_id": string }; Returns: undefined
                           },
"platform_update_incident":
{ Args: { "p_id": string,"p_message": string,"p_status": string }; Returns: undefined
                           },
"platform_update_lgpd_request":
{ Args: { "p_evidence": string,"p_id": string,"p_status": string }; Returns: undefined
                           },
"platform_update_onboarding":
{ Args: { "p_clinica_id": string,"p_due_at"?: string,"p_next_action": string,"p_owner_id"?: string,"p_stage": string }; Returns: undefined
                           },
"platform_usage_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"prontuario_conteudo_hash":
{ Args: { "p_prontuario_id": string }; Returns: string
                           },
"prontuario_leitura_auditada":
{ Args: { "p_prontuario_id": string }; Returns: boolean
                           },
"provision_clinic_after_subscription":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"public_availability_check":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reabrir_caixa_diario":
{ Args: { "p_motivo": string }; Returns: Json
                           },
"realizar_checkin":
{ Args: { "p_agendamento_id": string,"p_prioridade"?: string }; Returns: Json
                           },
"recalcular_conta":
{ Args: { "p_lancamento_id": string }; Returns: undefined
                           },
"registrar_acesso_documento_clinico":
{ Args: { "p_acao": string,"p_documento_id": string,"p_tipo": string }; Returns: string
                           },
"registrar_alerta_webhook_comunicacao":
{ Args: { "p_clinica_id": string,"p_codigo": string }; Returns: string
                           },
"registrar_baixa_estoque":
{ Args: { "p_item_id": string,"p_motivo"?: string,"p_prontuario_id"?: string,"p_quantidade": number,"p_usuario_id"?: string }; Returns: {
              "item_id": string,"ja_baixado": boolean,"quantidade_anterior": number,"quantidade_nova": number
            }[]
                           },
"registrar_confirmacao_contato_paciente":
{ Args: { "p_canal": string,"p_origem": string,"p_paciente_id": string }; Returns: Json
                           },
"registrar_envio_lote_tiss":
{ Args: { "p_lote_id": string }; Returns: Json
                           },
"adicionar_guia_lote_tiss":
{ Args: { "p_autorizacao_id": string | null,"p_codigo_procedimento": string,"p_data_atendimento": string,"p_lote_id": string,"p_numero_carteira": string | null,"p_numero_guia": string,"p_paciente_id": string | null,"p_quantidade": number,"p_tipo_servico": string,"p_valor_total": number }; Returns: Json
                           },
"remover_guia_lote_tiss":
{ Args: { "p_guia_id": string }; Returns: Json
                           },
"definir_recurso_glosa":
{ Args: { "p_glosa_id": string,"p_prazo": string,"p_responsavel_id": string }; Returns: Json
                           },
"registrar_documento_recurso_glosa":
{ Args: { "p_byte_size": number,"p_content_type": string,"p_file_name": string,"p_glosa_id": string,"p_storage_path": string }; Returns: Json
                           },
"importar_extrato_bancario":
{ Args: { "p_conta": string,"p_transacoes": Json }; Returns: Json
                           },
"historico_alteracoes_lancamento":{ Args: { "p_lancamento_id": string }; Returns: {
              "alterado_em": string,"alterado_por_nome": string | null,"campo": string,"valor_anterior": string | null,"valor_novo": string | null
            }[]
                           },
"historico_regras_repasse":
{ Args: { "p_limite"?: number }; Returns: {
              "alterado_em": string,"alterado_por_nome": string | null,"id": string,"medico_id": string,"tipo_anterior": string,"tipo_novo": string,"valor_anterior": number,"valor_novo": number
            }[]
                           },
"listar_responsaveis_financeiro":{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"nome": string | null
            }[]
                           },"pendencias_lote_tiss":
{ Args: { "p_lote_id": string }; Returns: {
              "campo": string,"gravidade": string,"guia_id": string | null,"mensagem": string,"numero_guia": string | null,"tipo": string
            }[]
                           },
"registrar_exportacao_lgpd_paciente":
{ Args: { "p_paciente_id": string }; Returns: number
                           },
"registrar_glosa_convenio":
{ Args: { "p_chave_idempotencia": string,"p_codigo_glosa": string,"p_guia_referencia": string,"p_lote_id": string,"p_motivo": string,"p_valor_glosado": number }; Returns: Json
                           },
"registrar_movimentacao_estoque":
{ Args: { "p_chave_idempotencia"?: string,"p_item_id": string,"p_motivo"?: string,"p_quantidade": number,"p_tipo": string }; Returns: number
                           },
"registrar_movimentacao_estoque_impl":
{ Args: { "p_chave_idempotencia"?: string,"p_item_id": string,"p_motivo"?: string,"p_quantidade": number,"p_tipo": string }; Returns: number
                           },
"registrar_pagamento":
{ Args: { "p_acrescimo"?: number,"p_chave_idempotencia"?: string,"p_desconto"?: number,"p_lancamento_id": string,"p_observacoes"?: string,"p_pagamentos": Json }; Returns: Json
                           },
"registrar_pagamento_mercadopago_point":
{ Args: { "p_point_order_id": string }; Returns: Json
                           },
"registrar_pagamento_repasse_medico":
{ Args: { "p_data_pagamento": string,"p_forma_pagamento": string,"p_observacoes"?: string,"p_repasse_id": string }; Returns: Json
                           },
"registrar_prescricao_memed_local":
{ Args: { "p_clinica_id": string,"p_data_emissao": string,"p_medicamento": string,"p_medico_id": string,"p_paciente_id": string,"p_prescription_uuid": string }; Returns: string
                           },
"registrar_prontuario_acesso":
{ Args: { "p_acao": string,"p_justificativa"?: string,"p_prontuario_id": string }; Returns: string
                           },
"registrar_prontuario_adendo":
{ Args: { "p_motivo": string,"p_prontuario_id": string,"p_texto": string,"p_tipo": string }; Returns: Json
                           },
"registrar_retorno_lote_tiss":
{ Args: { "p_lote_id": string,"p_motivo_ajuste"?: string,"p_valor_pago": number }; Returns: Json
                           } |
{ Args: { "p_data_pagamento": string,"p_lote_id": string,"p_motivo_ajuste": string,"p_valor_pago": number }; Returns: Json
                           } |
{ Args: { "p_data_pagamento": string,"p_lote_id": string,"p_motivo_ajuste": string,"p_registrar_financeiro": boolean,"p_valor_pago": number }; Returns: Json
                           },
"registrar_satisfacao_whatsapp":
{ Args: { "p_clinica_id": string,"p_comentario"?: string,"p_nota": number,"p_telefone": string }; Returns: boolean
                           },
"registrar_venda_pdv":
{ Args: { "p_chave": string,"p_clinica_id": string,"p_data": string,"p_descricao": string,"p_exames"?: Json,"p_forma_pagamento": string,"p_paciente_id": string,"p_produtos"?: Json,"p_valor_cobrado": number,"p_valor_pago": number }; Returns: {
              "ja_registrada": boolean,"lancamento_id": string
            }[]
                           },
"registrar_visualizacao_historico_clinica":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"registrar_visualizacao_historico_medico":
{ Args: { "p_medico_id": string }; Returns: number
                           },
"registrar_visualizacao_historico_paciente":
{ Args: { "p_paciente_id": string }; Returns: number
                           },
"registrar_visualizacao_historico_prontuarios":
{ Args: { "p_prontuario_ids": (string)[] }; Returns: number
                           },
"reivindicar_notificacoes":
{ Args: { "p_clinica_id"?: string,"p_limite"?: number }; Returns: {
              "agendado_para": string | null,
"assunto": string | null,
"clinica_id": string | null,
"conteudo": string,
"created_at": string | null,
"dados_extras": Json | null,
"dedupe_key": string | null,
"destinatario_email": string | null,
"destinatario_id": string | null,
"destinatario_nome": string | null,
"destinatario_telefone": string | null,
"enviado_em": string | null,
"erro_mensagem": string | null,
"id": string,
"iniciado_em": string | null,
"max_tentativas": number | null,
"status": string,
"template_id": string | null,
"tentativas": number | null,
"tipo": string,
"ultimo_erro_em": string | null,
"updated_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "notification_queue"
        isOneToOne: false
        isSetofReturn: true
      } },
"release_automation_delivery":
{ Args: { "p_chave": string,"p_clinica_id": string }; Returns: undefined
                           },
"release_mercadopago_oauth_refresh_lock":
{ Args: { "p_clinica_id": string,"p_lock_id": string }; Returns: undefined
                           },
"remover_item_fila_atomico":
{ Args: { "p_fila_id": string,"p_status_esperado": string }; Returns: Json
                           },
"remover_item_fila_com_motivo":
{ Args: { "p_fila_id": string,"p_motivo": string,"p_status_esperado": string }; Returns: Json
                           },
"reparar_cobranca_exame_atomica":
{ Args: { "p_clinica_id": string,"p_descricao": string,"p_lancamento_id": string,"p_valor": number }; Returns: boolean
                           },
"request_support_access":
{ Args: { "p_clinica_id": string,"p_reason": string,"p_scopes"?: (string)[] }; Returns: string
                           },
"resend_activation_manual":
{ Args: { "_registro_id": string }; Returns: Json
                           },
"reservar_horario_publico_atomico":
{ Args: { "p_clinica_id": string,"p_data": string,"p_duracao_minutos": number,"p_hora_inicio": string,"p_medico_id": string,"p_token_hash": string }; Returns: Json
                           },
"resolve_clinical_safety_correction":
{ Args: { "p_actor_user_id": string,"p_clinic_id": string,"p_expected_report_updated_at": string,"p_request_id": string,"p_review_note": string,"p_status": string }; Returns: {
              "report_updated_at": string,"request_id": string,"request_status": string
            }[]
                           },
"resolver_preco_exame":
{ Args: { "p_clinica_id": string,"p_convenio_id": string,"p_tipo_exame": string }; Returns: number
                           },
"restaurar_configuracao_clinica_versao":
{ Args: { "p_versao_esperada": string,"p_versao_id": string }; Returns: string
                           },
"resumo_pacientes_clinica":
{ Args: { "p_hoje": string }; Returns: {
              "com_alergias": number,"com_convenio": number,"menores": number,"total": number
            }[]
                           },
"retificar_resultado_laboratorio":
{ Args: { "p_critico": boolean,"p_metodo": string,"p_motivo": string,"p_referencia_max": number,"p_referencia_min": number,"p_referencia_texto": string,"p_resultado": string,"p_resultado_id": string,"p_unidade": string }; Returns: number
                           },
"review_room_hygiene_execution":
{ Args: { "p_actor_id": string,"p_clinic_id": string,"p_decision": string,"p_execution_id": string,"p_note": string }; Returns: undefined
                           },
"revogar_links_portal_paciente":
{ Args: { "p_paciente_id": string }; Returns: number
                           },
"revoke_support_access":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"saldo_devedor_do_agendamento":
{ Args: { "p_agendamento_id": string }; Returns: number
                           },
"salvar_configuracao_clinica_segura":
{ Args: { "p_chave": string,"p_valor": Json,"p_versao_esperada": string }; Returns: string
                           },
"search_whatsapp_agent_knowledge":
{ Args: { "_agent_id": string,"_clinica_id": string,"_match_count"?: number,"_query_embedding": string,"_query_text": string }; Returns: {
              "conteudo": string,"id": string,"rank_score": number,"similaridade": number,"titulo": string
            }[]
                           },
"sincronizar_comorbidades_paciente":
{ Args: { "p_descricoes": (string)[],"p_paciente_id": string }; Returns: undefined
                           },
"solicitar_autorizacao_convenio":
{ Args: { "p_convenio_id": string,"p_descricao": string,"p_observacoes"?: string,"p_paciente_id": string,"p_tipo_servico": string }; Returns: Json
                           },
"start_free_trial":
{ Args: { "_plano_slug": string,"_user_id": string }; Returns: Json
                           },
"start_room_hygiene_execution":
{ Args: { "p_actor_id": string,"p_clinic_id": string,"p_room_id": string }; Returns: string
                           },
"storage_med_attach_allowed":
{ Args: { "_name": string }; Returns: boolean
                           },
"storage_med_attach_delete_allowed":
{ Args: { "_name": string }; Returns: boolean
                           },
"storage_med_attach_read_allowed":
{ Args: { "_name": string }; Returns: boolean
                           },
"storage_patient_photo_allowed":
{ Args: { "_name": string }; Returns: boolean
                           },
"submit_product_feedback":
{ Args: { "p_categoria": string,"p_contexto"?: Json,"p_mensagem": string }; Returns: {
              "created_at": string,"id": string,"protocolo": string,"status": string
            }[]
                           },
"submit_room_hygiene_execution":
{ Args: { "p_actor_id": string,"p_clinic_id": string,"p_completed_items": Json,"p_execution_id": string,"p_notes"?: string }; Returns: undefined
                           },
"substituir_prescricoes_do_prontuario":
{ Args: { "p_prescricoes"?: Json,"p_prontuario_id": string }; Returns: number
                           },
"support_sla":
{ Args: { "p": string }; Returns: string
                           },
"sync_employee_roles":
{ Args: { "_funcionario_id": string,"_roles": (Database["public"]['Enums']["app_role"])[],"_user_id": string }; Returns: undefined
                           } |
{ Args: { "_ativo": boolean,"_funcionario_id": string,"_roles": (Database["public"]['Enums']["app_role"])[],"_user_id": string }; Returns: undefined
                           },
"sync_employee_roles_if_unchanged":
{ Args: { "_ativo": boolean,"_expected_version": number,"_funcionario_id": string,"_roles": (Database["public"]['Enums']["app_role"])[],"_user_id": string }; Returns: undefined
                           },
"tabelas_para_backup":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"tem_cobranca_ativa_do_agendamento":
{ Args: { "p_agendamento_id": string,"p_clinica_id": string }; Returns: boolean
                           },
"tem_triagem":
{ Args: { "p_agendamento_id": string }; Returns: boolean
                           },
"touch_my_account_session":
{ Args: { "p_user_agent": string }; Returns: undefined
                           },
"user_has_feature":
{ Args: { "_feature": string,"_user_id": string }; Returns: boolean
                           },
"user_in_same_clinica":
{ Args: { "_target_user_id": string }; Returns: boolean
                           },
"validar_coleta_laboratorio":
{ Args: { "p_coleta_id": string }; Returns: number
                           },
"validar_notificacao_jornada":
{ Args: { "p_id": string }; Returns: boolean
                           },
"validate_invitation_token":
{ Args: { "_token": string }; Returns: Json
                           },
"validate_invite_code":
{ Args: { "_codigo": string }; Returns: Json
                           },
"verificar_assinatura_prontuario":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"verificar_pagamento_fila":
{ Args: { "p_agendamento_ids": (string)[] }; Returns: {
              "agendamento_id": string,"pode_atender": boolean
            }[]
                           },
"verificar_saude_clinicas_e_alertar":
{ Args: Record<PropertyKey, never>; Returns: {
              "clinica_id": string,"enfileirada": boolean,"motivo": string
            }[]
                           },
"watchdog_atendimento_travado":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"whatsapp_dashboard_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           }
          }
          Enums: {
            "app_role": "admin"|"medico"|"recepcao"|"enfermagem"|"financeiro","classificacao_risco": "verde"|"amarelo"|"laranja"|"vermelho"|"azul","status_agendamento": "agendado"|"confirmado"|"aguardando"|"em_atendimento"|"finalizado"|"cancelado"|"faltou"|"aguardando_pagamento"|"pago"|"aguardando_triagem"|"em_triagem"|"atendimento_finalizado"|"aguardando_pagamento_adicional","status_exame": "solicitado"|"agendado"|"realizado"|"laudo_disponivel"|"cancelado","status_pagamento": "pendente"|"pago"|"cancelado"|"estornado"|"atrasado"|"parcial","status_sala": "disponivel"|"ocupado"|"manutencao"|"limpeza"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["admin", "medico", "recepcao", "enfermagem", "financeiro"],"classificacao_risco": ["verde", "amarelo", "laranja", "vermelho", "azul"],"status_agendamento": ["agendado", "confirmado", "aguardando", "em_atendimento", "finalizado", "cancelado", "faltou", "aguardando_pagamento", "pago", "aguardando_triagem", "em_triagem", "atendimento_finalizado", "aguardando_pagamento_adicional"],"status_exame": ["solicitado", "agendado", "realizado", "laudo_disponivel", "cancelado"],"status_pagamento": ["pendente", "pago", "cancelado", "estornado", "atrasado", "parcial"],"status_sala": ["disponivel", "ocupado", "manutencao", "limpeza"]
          }
        }
} as const
