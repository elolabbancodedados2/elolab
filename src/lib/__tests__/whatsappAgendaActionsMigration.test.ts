import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014230000_whatsapp_agenda_actions.sql';
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('confirmação atômica de agenda pelo WhatsApp', () => {
  it('restringe a execução ao serviço e trava a conversa antes de consumir a confirmação', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('TO service_role');
    expect(sql).toMatch(/FROM public\.whatsapp_conversations[\s\S]*?FOR UPDATE/);
    expect(sql.indexOf('FOR UPDATE')).toBeLessThan(sql.indexOf('SET acao_pendente = NULL'));
    expect(sql).toContain("v_pending->>'expires_at'");
    expect(sql).toContain('v_conversation.acao_pendente IS NULL');
  });

  it('revalida clínica, vínculo telefônico e capacidade do agente da sessão', () => {
    expect(sql).toContain('v_conversation.clinica_id IS DISTINCT FROM p_clinica_id');
    expect(sql).toContain("v_conversation.status IS DISTINCT FROM 'ativo'");
    expect(sql).toContain('a.id = s.agent_id');
    expect(sql).toContain('a.ativo IS TRUE');
    expect(sql).toContain('v_capability = ANY(v_habilidades)');
    expect(sql).toContain('v_phone_count <> 1');
    expect(sql).toContain('p.id = v_conversation.paciente_id');
  });

  it('limita alterações ao paciente e consulta futura e preserva o mesmo registro na remarcação', () => {
    expect(sql).toContain('a.paciente_id = v_conversation.paciente_id');
    expect(sql).toContain("v_appointment.status::text NOT IN ('agendado', 'confirmado')");
    expect(sql).toContain("AT TIME ZONE 'America/Sao_Paulo'");
    expect(sql).toContain("SET status = 'cancelado', motivo_cancelamento = v_reason");
    expect(sql).toContain("SET status = 'confirmado'");
    expect(sql).toMatch(/UPDATE public\.agendamentos\s+SET medico_id = v_doctor_id, data = v_date/);
    expect(sql).not.toMatch(/DELETE FROM public\.agendamentos/);
  });

  it('valida grade e bloqueios e registra sucesso apenas dentro da transação', () => {
    expect(sql).toContain('FROM public.medico_disponibilidade');
    expect(sql).toContain('intervalo_consultas');
    expect(sql).toContain('FROM public.bloqueios_agenda');
    expect(sql).toContain("WHEN exclusion_violation THEN");
    expect(sql).toContain('INSERT INTO public.whatsapp_agent_actions');
    expect(sql).toContain("'success', true, 'completed', true, 'agendamento_id', v_appointment_id");
    expect(sql.indexOf('INSERT INTO public.whatsapp_agent_actions')).toBeGreaterThan(sql.lastIndexOf('UPDATE public.agendamentos'));
  });
});
