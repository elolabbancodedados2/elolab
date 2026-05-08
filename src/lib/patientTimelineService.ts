/**
 * Patient Timeline Service
 * Busca e organiza dados clínicos para visualização em timeline
 */

import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent } from '@/components/PatientTimeline';

/**
 * Obter timeline completa do paciente
 */
export async function getPatientTimeline(pacienteId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  try {
    // 1. Buscar consultas/agendamentos
    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('id, data, hora_inicio, tipo, status, medicos(nome)')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false });

    if (agendamentos) {
      agendamentos.forEach(a => {
        if (a.data) {
          events.push({
            id: a.id,
            type: 'consulta',
            data: new Date(a.data + 'T' + (a.hora_inicio || '00:00')),
            titulo: `${a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1)}`,
            status: a.status === 'realizado' ? 'concluido' : a.status === 'cancelado' ? 'cancelado' : 'pendente',
            medico: (a.medicos as any)?.nome,
            expandavel: true,
            prioridade: 'media',
          });
        }
      });
    }

    // 2. Buscar diagnósticos
    const { data: diagnosticos } = await supabase
      .from('prontuario_diagnosticos')
      .select('id, prontuario_id, codigo_cid, descricao, tipo, confirmado, created_at, prontuarios(medicos(nome))')
      .eq('prontuarios.paciente_id', pacienteId)
      .order('created_at', { ascending: false });

    if (diagnosticos) {
      diagnosticos.forEach(d => {
        events.push({
          id: d.id,
          type: 'diagnostico',
          data: d.created_at,
          titulo: `${d.codigo_cid} - ${d.descricao}`,
          descricao: `Diagnóstico ${d.tipo}${d.confirmado ? ' (confirmado)' : ''}`,
          medico: (d.prontuarios as any)?.medicos?.[0]?.nome,
          tags: [d.codigo_cid, d.tipo],
          expandavel: true,
          prioridade: d.tipo === 'principal' ? 'alta' : 'media',
        });
      });
    }

    // 3. Buscar prescrições
    const { data: prescricoes } = await supabase
      .from('prescricoes')
      .select('id, medicamento, dosagem, posologia, data_emissao, medicos(nome)')
      .eq('paciente_id', pacienteId)
      .order('data_emissao', { ascending: false });

    if (prescricoes) {
      prescricoes.forEach(p => {
        events.push({
          id: p.id,
          type: 'prescricao',
          data: p.data_emissao,
          titulo: p.medicamento,
          descricao: `${p.dosagem} - ${p.posologia}`,
          medico: (p.medicos as any)?.nome,
          tags: ['medicamento', p.dosagem],
          expandavel: true,
          status: 'concluido',
        });
      });
    }

    // 4. Buscar exames
    const { data: exames } = await supabase
      .from('exames')
      .select('id, tipo_exame, status, data_solicitacao, data_realizacao, resultado, medicos(nome)')
      .eq('paciente_id', pacienteId)
      .order('data_solicitacao', { ascending: false });

    if (exames) {
      exames.forEach(e => {
        const statusMap: Record<string, TimelineEvent['status']> = {
          solicitado: 'pendente',
          agendado: 'em_progresso',
          realizado: 'concluido',
          cancelado: 'cancelado',
        };

        events.push({
          id: e.id,
          type: 'exame',
          data: e.data_realizacao || e.data_solicitacao,
          titulo: e.tipo_exame,
          descricao: e.resultado ? 'Resultado disponível' : 'Aguardando realização',
          detalhe: e.resultado,
          medico: (e.medicos as any)?.nome,
          status: statusMap[e.status] || 'pendente',
          expandavel: true,
          prioridade: e.status === 'solicitado' ? 'media' : 'baixa',
        });
      });
    }

    // 5. Buscar prontuários (para alertas/observações importantes)
    const { data: prontuarios } = await supabase
      .from('prontuarios')
      .select('id, data, queixa_principal, hipotese_diagnostica, conduta, medicos(nome)')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false })
      .limit(10);

    if (prontuarios) {
      prontuarios.forEach(p => {
        // Criar evento para prontuário com observações importantes
        if (p.conduta && p.conduta.toLowerCase().includes('urgente')) {
          events.push({
            id: `alerta-${p.id}`,
            type: 'alerta',
            data: p.data,
            titulo: 'Observação Urgente',
            descricao: p.conduta,
            medico: (p.medicos as any)?.nome,
            status: 'concluido',
            prioridade: 'critica',
            expandavel: false,
          });
        }
      });
    }

    // 6. Buscar comorbidades (para contexto)
    const { data: comorbidades } = await supabase
      .from('paciente_comorbidades')
      .select('id, codigo_cid, descricao, data_diagnostico')
      .eq('paciente_id', pacienteId)
      .eq('ativo', true)
      .limit(3);

    if (comorbidades && comorbidades.length > 0) {
      // Criar evento agregado para comorbidades
      events.push({
        id: 'comorbidades-summary',
        type: 'alerta',
        data: new Date(),
        titulo: 'Comorbidades Ativas',
        descricao: `${comorbidades.length} condição(ões) crônica(s) ativa(s)`,
        detalhe: comorbidades.map(c => `${c.codigo_cid}: ${c.descricao}`).join('\n'),
        tags: comorbidades.map(c => c.codigo_cid),
        expandavel: true,
        prioridade: 'alta',
        status: 'concluido',
      });
    }

    // 7. Buscar triagens recentes (vital signs)
    const { data: triagens } = await supabase
      .from('triagens')
      .select('id, data_hora, pressao_arterial, frequencia_cardiaca, temperatura, peso')
      .eq('paciente_id', pacienteId)
      .order('data_hora', { ascending: false })
      .limit(1);

    if (triagens && triagens.length > 0) {
      const t = triagens[0];
      const vitals = [
        t.pressao_arterial && `PA: ${t.pressao_arterial}`,
        t.frequencia_cardiaca && `FC: ${t.frequencia_cardiaca}`,
        t.temperatura && `Temp: ${t.temperatura}°C`,
        t.peso && `Peso: ${t.peso}kg`,
      ].filter(Boolean);

      events.push({
        id: t.id,
        type: 'consulta',
        data: t.data_hora,
        titulo: 'Triagem / Vitais',
        descricao: vitals.join(' • '),
        expandavel: false,
        status: 'concluido',
        prioridade: 'baixa',
      });
    }

    return events.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  } catch (error) {
    console.error('Error fetching patient timeline:', error);
    return [];
  }
}

/**
 * Obter eventos recentes (últimos 7 dias)
 */
export async function getRecentPatientEvents(pacienteId: string, dias: number = 7): Promise<TimelineEvent[]> {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - dias);

  const todosEventos = await getPatientTimeline(pacienteId);
  return todosEventos.filter(e => new Date(e.data) >= dataLimite);
}

/**
 * Obter eventos críticos (alertas, diagnósticos principais, etc)
 */
export async function getCriticalPatientEvents(pacienteId: string): Promise<TimelineEvent[]> {
  const todoSEventos = await getPatientTimeline(pacienteId);

  return todoSEventos.filter(e =>
    e.prioridade === 'critica' ||
    e.prioridade === 'alta' ||
    e.type === 'alerta' ||
    (e.type === 'diagnostico' && e.tags?.includes('principal')) ||
    e.status === 'cancelado'
  );
}

/**
 * Obter resumo estatístico da timeline
 */
export async function getTimelineSummary(pacienteId: string) {
  const eventos = await getPatientTimeline(pacienteId);

  const summary = {
    totalEventos: eventos.length,
    porTipo: {} as Record<string, number>,
    ultimoEvento: eventos[0],
    prioridades: {
      critica: 0,
      alta: 0,
      media: 0,
      baixa: 0,
    },
    statusDistribuicao: {
      pendente: 0,
      concluido: 0,
      em_progresso: 0,
      cancelado: 0,
    },
  };

  eventos.forEach(e => {
    // Por tipo
    summary.porTipo[e.type] = (summary.porTipo[e.type] || 0) + 1;

    // Por prioridade
    if (e.prioridade) {
      summary.prioridades[e.prioridade]++;
    }

    // Por status
    if (e.status) {
      summary.statusDistribuicao[e.status]++;
    }
  });

  return summary;
}
