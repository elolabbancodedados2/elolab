import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkDrugInteractions,
  interactionsToAlerts,
  type DrugInteraction,
} from '@/lib/drugInteractionChecker';

describe('checkDrugInteractions', () => {
  // Mock fetch para garantir que OpenFDA não é chamada (testes offline)
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline test'));
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Nota: o DB local de interações usa nomes em inglês (warfarin, aspirin etc).
  // Medicamentos prescritos em português não disparam alerta — limitação conhecida.
  it('detecta interação warfarin + aspirin (major, sangramento)', async () => {
    const result = await checkDrugInteractions(['warfarin', 'aspirin']);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('major');
    expect(result[0].description).toMatch(/sangramento/i);
    expect(result[0].source).toBe('local');
  });

  it('detecta simvastatin + clarithromycin (risco miopatia)', async () => {
    const result = await checkDrugInteractions(['simvastatin', 'clarithromycin']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].severity).toBe('major');
  });

  it('NÃO detecta interação quando nomes estão em português (limitação conhecida)', async () => {
    // Documenta o bug: prescrição em português não bate com DB em inglês.
    // Quando o code switcher de medicamentos PT→EN for adicionado, este teste falha
    // e deve ser invertido.
    const result = await checkDrugInteractions(['Varfarina', 'Aspirina']);
    expect(result).toEqual([]);
  });

  it('retorna vazio para medicamentos sem interação conhecida', async () => {
    const result = await checkDrugInteractions(['paracetamol', 'vitamin-c']);
    expect(result).toEqual([]);
  });

  it('retorna vazio para um único medicamento', async () => {
    const result = await checkDrugInteractions(['Ibuprofeno']);
    expect(result).toEqual([]);
  });

  it('retorna vazio para lista vazia', async () => {
    const result = await checkDrugInteractions([]);
    expect(result).toEqual([]);
  });

  it('detecta interação independentemente da ordem dos medicamentos', async () => {
    const a = await checkDrugInteractions(['warfarin', 'aspirin']);
    const b = await checkDrugInteractions(['aspirin', 'warfarin']);
    expect(a.length).toBe(b.length);
    expect(a[0]?.severity).toBe(b[0]?.severity);
  });

  it('não duplica par detectado em ambas direções', async () => {
    // Lista com 3 medicamentos: warfarin, aspirin, acetaminophen (paracetamol)
    // warfarin+aspirin = major; acetaminophen+warfarin = moderate
    const result = await checkDrugInteractions(['warfarin', 'aspirin', 'acetaminophen']);
    const pairs = new Set(result.map(r => [r.drug1, r.drug2].sort().join('|')));
    expect(pairs.size).toBe(result.length);
  });
});

describe('interactionsToAlerts', () => {
  const baseInteraction: DrugInteraction = {
    drug1: 'Varfarina',
    drug2: 'Aspirina',
    severity: 'major',
    description: 'Risco de sangramento',
    source: 'local',
  };

  it('mapeia major → critical (não ignorável)', () => {
    const alerts = interactionsToAlerts([baseInteraction]);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].canIgnore).toBe(false);
  });

  it('mapeia moderate → warning (ignorável)', () => {
    const alerts = interactionsToAlerts([{ ...baseInteraction, severity: 'moderate' }]);
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].canIgnore).toBe(true);
  });

  it('mapeia minor → info (ignorável)', () => {
    const alerts = interactionsToAlerts([{ ...baseInteraction, severity: 'minor' }]);
    expect(alerts[0].severity).toBe('info');
    expect(alerts[0].canIgnore).toBe(true);
  });

  it('inclui nomes dos dois medicamentos no título', () => {
    const alerts = interactionsToAlerts([baseInteraction]);
    expect(alerts[0].title).toContain('Varfarina');
    expect(alerts[0].title).toContain('Aspirina');
  });

  it('cria ids únicos para cada interação', () => {
    const alerts = interactionsToAlerts([
      baseInteraction,
      { ...baseInteraction, drug2: 'Paracetamol', severity: 'moderate' },
    ]);
    const ids = alerts.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
