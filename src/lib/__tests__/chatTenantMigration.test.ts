import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261010190000_isolar_chat_por_clinica.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const integrityMigrationPath = 'supabase/migrations/20261011210000_chat_integridade_conversas.sql';
const integrityMigration = existsSync(integrityMigrationPath) ? readFileSync(integrityMigrationPath, 'utf8') : '';

function policy(name: string) {
  return migration.match(new RegExp(`CREATE POLICY ${name}[\\s\\S]*?;`, 'i'))?.[0] ?? '';
}

describe('isolamento do chat interno', () => {
  it('limita leitura e abertura de conversa aos participantes ativos da mesma clínica', () => {
    const selectConversation = policy('chat_conv_select_clinic');
    const insertConversation = policy('chat_conv_insert_clinic');

    expect(selectConversation).toContain('clinica_id = public.get_my_clinica_id()');
    expect(selectConversation).toMatch(/participante_1_id = auth\.uid\(\) OR participante_2_id = auth\.uid\(\)/i);
    expect(insertConversation).toContain('participante_1_id = auth.uid()');
    expect(insertConversation).toContain('outro.clinica_id = public.get_my_clinica_id()');
    expect(insertConversation).toContain('outro.ativo IS TRUE');
  });

  it('restringe mensagens ao par correto e permite ao destinatário marcar como lida', () => {
    const selectMessage = policy('chat_msg_select_clinic');
    const insertMessage = policy('chat_msg_insert_clinic');
    const updateMessage = policy('chat_msg_update_clinic');

    expect(selectMessage).toContain('clinica_id = public.get_my_clinica_id()');
    expect(selectMessage).toContain('remetente_id = c.participante_1_id AND destinatario_id = c.participante_2_id');
    expect(insertMessage).toContain('remetente_id = auth.uid()');
    expect(insertMessage).toContain('c.participante_1_id = auth.uid() AND c.participante_2_id = destinatario_id');
    expect(insertMessage).toContain('c.participante_2_id = auth.uid() AND c.participante_1_id = destinatario_id');
    expect(updateMessage).toContain('destinatario_id = auth.uid()');
    expect(updateMessage).toContain('lida_em IS NULL');
    expect(updateMessage).toContain('lida_em IS NOT NULL');
  });

  it('protege conteúdo e identidade da conversa contra edição após envio', () => {
    expect(migration).toContain('CREATE TRIGGER trg_proteger_identidade_conversa_chat');
    expect(migration).toContain('CREATE TRIGGER trg_proteger_conteudo_mensagem_chat');
    expect(migration).toContain('NEW.texto IS DISTINCT FROM OLD.texto');
    expect(migration).toContain('NEW.participante_1_id IS DISTINCT FROM OLD.participante_1_id');
  });

  it('deduplica pares reversos e só permite criar conversas em ordem canônica', () => {
    expect(integrityMigration).toContain('chat_conversations_unique');
    expect(integrityMigration).toContain('idx_chat_conversations_participants_canonical');
    expect(integrityMigration).toContain('participante_1_id < participante_2_id');
    expect(integrityMigration).toContain('chat_conv_insert_clinic');
    expect(integrityMigration).toContain('auth.uid() IN (participante_1_id, participante_2_id)');
    expect(integrityMigration).toContain('UPDATE public.chat_messages');
    expect(integrityMigration).toContain('PARTITION BY clinica_id');
  });

  it('preserva histórico e atualiza prévia pelo banco, sem edição ou exclusão direta', () => {
    expect(integrityMigration).toContain('DROP POLICY IF EXISTS chat_conv_delete_clinic');
    expect(integrityMigration).toContain('DROP POLICY IF EXISTS chat_msg_delete_clinic');
    expect(integrityMigration).toContain('DROP POLICY IF EXISTS chat_conv_update_clinic');
    expect(integrityMigration).toContain('REVOKE UPDATE, DELETE ON public.chat_conversations');
    expect(integrityMigration).toContain('REVOKE DELETE ON public.chat_messages');
    expect(integrityMigration).toContain('SECURITY DEFINER');
    expect(integrityMigration).toContain('CREATE TRIGGER trg_atualizar_preview_chat');
    expect(integrityMigration).toContain('CREATE TRIGGER trg_timestamp_mensagem_chat');
    expect(integrityMigration).toContain('NEW.created_at := clock_timestamp()');
  });
});
