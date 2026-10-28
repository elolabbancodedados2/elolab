import { describe, expect, it } from 'vitest';
import {
  findUniquePatientIdByPhone,
  isWhatsAppToolAllowed,
  normalizeBrazilianPhone,
  parseExplicitConfirmation,
  normalizeMedicalSpecialty,
} from '../../../supabase/functions/_shared/whatsappAgentPolicy';

describe('whatsapp agent policy', () => {
  it('matches general practitioners regardless of accents and wording', () => {
    expect(normalizeMedicalSpecialty('Clínico geral')).toBe('clinica geral');
    expect(normalizeMedicalSpecialty('clinica geral')).toBe('clinica geral');
    expect(normalizeMedicalSpecialty('Clínico')).toBe('clinica geral');
    expect(normalizeMedicalSpecialty('Clínica')).toBe('clinica geral');
    expect(normalizeMedicalSpecialty(' GINECOLOGISTA ')).toBe('ginecologia');
    expect(normalizeMedicalSpecialty('ginecologo')).toBe('ginecologia');
  });
  it('exposes tools only when the clinic enabled the matching capability', () => {
    expect(isWhatsAppToolAllowed('criar_agendamento', ['consultar_disponibilidade'])).toBe(false);
    expect(isWhatsAppToolAllowed('consultar_disponibilidade', ['consultar_disponibilidade'])).toBe(true);
    expect(isWhatsAppToolAllowed('transferir_humano', [])).toBe(true);
    expect(isWhatsAppToolAllowed('delete_clinic', ['informacoes_clinica'])).toBe(false);
  });
  it('offers patient identification only with a capability that acts on the patient record', () => {
    expect(isWhatsAppToolAllowed('identificar_paciente', ['consultar_agendamentos_paciente'])).toBe(true);
    expect(isWhatsAppToolAllowed('identificar_paciente', ['cancelar_agendamento'])).toBe(true);
    expect(isWhatsAppToolAllowed('identificar_paciente', ['informacoes_clinica', 'consultar_disponibilidade'])).toBe(false);
    expect(isWhatsAppToolAllowed('identificar_paciente', [])).toBe(false);
    expect(isWhatsAppToolAllowed('identificar_paciente', 'criar_agendamento')).toBe(false);
  });

  it('normalizes a Brazilian mobile number with or without country prefix', () => {
    expect(normalizeBrazilianPhone('+55 (11) 99999-1234')).toBe('11999991234');
    expect(normalizeBrazilianPhone('11999991234')).toBe('11999991234');
  });

  it('links a patient only when there is exactly one normalized phone match', () => {
    expect(findUniquePatientIdByPhone('5511999991234@s.whatsapp.net', [
      { id: 'patient-1', telefone: '+55 11 99999-1234' },
    ])).toBe('patient-1');
    expect(findUniquePatientIdByPhone('5511999991234@s.whatsapp.net', [
      { id: 'patient-1', telefone: '11 99999-1234' },
      { id: 'patient-2', telefone: '+55 11 99999-1234' },
    ])).toBeNull();
  });

  it('accepts only an unambiguous yes or no for appointment confirmation', () => {
    expect(parseExplicitConfirmation('SIM')).toBe('yes');
    expect(parseExplicitConfirmation('não')).toBe('no');
    expect(parseExplicitConfirmation('Sim, mas depois')).toBe('unclear');
  });
});
