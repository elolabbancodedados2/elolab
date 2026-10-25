import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Mirrors src/pages/Templates.tsx (clinical tab of /todos-templates). E-mail templates are HTML with versioning: web only.
type Tab = 'prescriptions' | 'certificates' | 'email';
type Rx = { id: string; clinica_id: string | null; nome: string; tipo: string | null; medicamentos: unknown; observacoes_gerais: string | null };
type Cert = { id: string; clinica_id: string | null; nome: string; tipo: string | null; conteudo: string | null; cid: string | null; dias_afastamento: number | null };
type Form = { kind: 'prescription'; id?: string; nome: string; tipo: string; medicamentos: string; observacoes: string } | { kind: 'certificate'; id?: string; nome: string; tipo: string; conteudo: string; cid: string; dias: string };

const rxTypes = [{ value: 'simples', label: 'Receita Simples' }, { value: 'controle_especial', label: 'Controle Especial' }, { value: 'antimicrobiano', label: 'Antimicrobiano' }];
const certTypes = [{ value: 'comparecimento', label: 'Comparecimento' }, { value: 'afastamento', label: 'Afastamento' }, { value: 'aptidao', label: 'Aptidão' }, { value: 'acompanhante', label: 'Acompanhante' }];
const label = (list: { value: string; label: string }[], value: string | null, fallback: string) => list.find(t => t.value === (value || fallback))?.label ?? value ?? '—';

/** Same as medicamentosParaLinhas on the web: accepts text lines or legacy objects. */
function lines(medicamentos: unknown): string[] {
  if (!Array.isArray(medicamentos)) return [];
  return medicamentos.map(m => {
    if (typeof m === 'string') return m.trim();
    if (m && typeof m === 'object') {
      const o = m as Record<string, unknown>;
      const rest = [o.dosagem, o.posologia, o.duracao].filter(v => typeof v === 'string' && v.trim()).join(' — ');
      return [String(o.medicamento ?? o.nome ?? '').trim(), rest].filter(Boolean).join(' — ');
    }
    return '';
  }).filter(Boolean);
}

export default function TemplatesScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [tab, setTab] = useState<Tab>('prescriptions');
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    // Clinic templates plus shared defaults (clinica_id null), which stay read-only.
    const [rx, cert] = await Promise.all([
      client.from('templates_prescricao').select('id, clinica_id, nome, tipo, medicamentos, observacoes_gerais').or(`clinica_id.eq.${clinicId},clinica_id.is.null`).order('nome'),
      client.from('templates_atestado').select('id, clinica_id, nome, tipo, conteudo, cid, dias_afastamento').or(`clinica_id.eq.${clinicId},clinica_id.is.null`).order('nome'),
    ]);
    return { rx: (must(rx) ?? []) as Rx[], cert: (must(cert) ?? []) as Cert[] };
  }, [clinicId]);

  const table = (kind: Form['kind']) => kind === 'prescription' ? 'templates_prescricao' : 'templates_atestado';

  async function save() {
    if (!form || !clinicId || !session) return;
    let payload: Record<string, unknown>;
    if (form.kind === 'prescription') {
      const medicamentos = form.medicamentos.split('\n').map(l => l.trim()).filter(Boolean);
      if (!form.nome.trim()) return setFeedback({ message: 'Preencha os campos obrigatórios', error: true });
      if (!medicamentos.length) return setFeedback({ message: 'Informe ao menos um medicamento no modelo', error: true });
      payload = { nome: form.nome.trim(), tipo: form.tipo, observacoes_gerais: form.observacoes || null, medicamentos };
    } else {
      const dias = form.dias.trim() ? Number(form.dias) : null;
      if (!form.nome.trim() || !form.conteudo.trim()) return setFeedback({ message: 'Preencha os campos obrigatórios', error: true });
      if (form.tipo === 'afastamento' && dias !== null && (!Number.isInteger(dias) || dias < 1)) return setFeedback({ message: 'Os dias de afastamento devem ser um número inteiro maior que zero.', error: true });
      const afastamento = form.tipo === 'afastamento';
      payload = { nome: form.nome.trim(), tipo: form.tipo, conteudo: form.conteudo, cid: afastamento ? form.cid.trim() || null : null, dias_afastamento: afastamento ? dias : null };
    }
    setBusy('save');
    try {
      if (form.id) {
        const row = must(await db.from(table(form.kind)).update(payload).eq('id', form.id).eq('clinica_id', clinicId).select('id').maybeSingle());
        if (!row) throw new Error('Este modelo não pertence à clínica atual ou não está mais disponível.');
      } else must(await db.from(table(form.kind)).insert({ ...payload, clinica_id: clinicId, criado_por: session.user.id }));
      setFeedback({ message: form.id ? 'Template atualizado com sucesso' : 'Template criado com sucesso' });
      setForm(null);
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao salvar template'), error: true }); } finally { setBusy(null); }
  }

  async function duplicate(kind: Form['kind'], template: Rx | Cert) {
    if (!clinicId || !session) return;
    setBusy(template.id);
    try {
      const { id: _id, ...rest } = template;
      must(await db.from(table(kind)).insert({ ...rest, nome: `${template.nome} (cópia)`, clinica_id: clinicId, criado_por: session.user.id }));
      setFeedback({ message: 'Template duplicado' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao duplicar template'), error: true }); } finally { setBusy(null); }
  }

  function remove(kind: Form['kind'], template: Rx | Cert) {
    Alert.alert('Excluir modelo', `Excluir "${template.nome}"? Esta ação não pode ser desfeita.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void (async () => {
        setBusy(template.id);
        try {
          const row = must(await db.from(table(kind)).delete().eq('id', template.id).eq('clinica_id', clinicId).select('id').maybeSingle());
          if (!row) throw new Error('Este modelo não pertence à clínica atual ou já foi removido.');
          setFeedback({ message: 'Template excluído' });
          reload();
        } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao excluir template'), error: true }); } finally { setBusy(null); }
      })() },
    ]);
  }

  const open = (next: Form) => { setForm(next); setFeedback(null); };
  const rows: (Rx | Cert)[] = tab === 'prescriptions' ? data?.rx ?? [] : data?.cert ?? [];
  const kind: Form['kind'] = tab === 'prescriptions' ? 'prescription' : 'certificate';

  return <ModuleScreen moduleKey="modelos" subtitle="Modelos de prescrição e de atestado usados pela equipe." refreshing={refreshing} onRefresh={refresh}
    action={form || tab === 'email' ? null : <Button label="Novo" icon="add" onPress={() => open(tab === 'prescriptions' ? { kind: 'prescription', nome: '', tipo: 'simples', medicamentos: '', observacoes: '' } : { kind: 'certificate', nome: '', tipo: 'comparecimento', conteudo: '', cid: '', dias: '' })} />}>
    <Segmented options={[{ value: 'prescriptions', label: 'Prescrição' }, { value: 'certificates', label: 'Atestado' }, { value: 'email', label: 'E-mail' }]} value={tab} onChange={value => { setTab(value); setForm(null); }} />
    {form ? <Card style={styles.form}>
      <Field label="Nome do modelo *" value={form.nome} onChangeText={nome => setForm({ ...form, nome })} />
      {form.kind === 'prescription' ? <>
        <Chips label="Tipo *" options={rxTypes} value={form.tipo} onChange={tipo => setForm({ ...form, tipo })} />
        <Field label="Medicamentos *" value={form.medicamentos} onChangeText={medicamentos => setForm({ ...form, medicamentos })} multiline hint="Um medicamento por linha" />
        <Field label="Observações gerais" value={form.observacoes} onChangeText={observacoes => setForm({ ...form, observacoes })} multiline />
      </> : <>
        <Chips label="Tipo *" options={certTypes} value={form.tipo} onChange={tipo => setForm({ ...form, tipo })} />
        <Field label="Conteúdo *" value={form.conteudo} onChangeText={conteudo => setForm({ ...form, conteudo })} multiline hint="Variáveis: {{nome_paciente}}, {{cpf_paciente}}, {{data_emissao}}, {{data_atual}}, {{dias}}, {{data_inicio}}, {{data_fim}}, {{hora_inicio}}, {{hora_fim}}, {{medico_nome}}, {{medico_crm}}, {{cid}}" />
        {form.tipo === 'afastamento' ? <>
          <Field label="Dias de afastamento" value={form.dias} onChangeText={dias => setForm({ ...form, dias })} keyboardType="number-pad" hint="Opcional" />
          <Field label="CID" value={form.cid} onChangeText={cid => setForm({ ...form, cid })} autoCapitalize="characters" hint="Opcional. Só é impresso com autorização do paciente." />
        </> : null}
      </>}
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Salvar modelo" icon="checkmark" loading={busy === 'save'} onPress={() => void save()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {tab === 'email' ? <Card>
      <Text style={styles.copy}>Os modelos de e-mail usam editor HTML com pré-visualização e histórico de versões. Edite-os no navegador.</Text>
      <OpenOnWeb path="/todos-templates?tab=email" />
    </Card> : loading ? <StateView loading title="Carregando modelos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : !rows.length ? <StateView icon="document-outline" title="Nenhum modelo" message={tab === 'prescriptions' ? 'Crie um modelo de prescrição para agilizar as receitas.' : 'Crie um modelo de atestado para agilizar a emissão.'} /> :
      <Section title={`${rows.length} modelo(s)`}>{rows.map(template => {
        const own = template.clinica_id === clinicId;
        const rx = kind === 'prescription' ? template as Rx : null;
        const cert = kind === 'certificate' ? template as Cert : null;
        const subtitle = rx ? lines(rx.medicamentos).join(' · ') || 'Sem medicamentos' : cert?.conteudo;
        return <View key={template.id} style={styles.item}>
          <ListRow title={template.nome} subtitle={subtitle} meta={rx ? label(rxTypes, rx.tipo, 'simples') : [label(certTypes, cert?.tipo ?? null, 'comparecimento'), cert?.dias_afastamento ? `${cert.dias_afastamento} dia(s)` : null, cert?.cid ? `CID ${cert.cid}` : null].filter(Boolean).join(' · ')}
            right={own ? null : <Badge label="Padrão" tone="info" />} />
          <View style={styles.rowActions}>
            <Button variant="secondary" label="Duplicar" disabled={busy === template.id} onPress={() => void duplicate(kind, template)} />
            {own ? <Button variant="secondary" label="Editar" disabled={busy === template.id} onPress={() => open(rx ? { kind: 'prescription', id: rx.id, nome: rx.nome, tipo: rx.tipo || 'simples', medicamentos: lines(rx.medicamentos).join('\n'), observacoes: rx.observacoes_gerais ?? '' } : { kind: 'certificate', id: template.id, nome: template.nome, tipo: cert?.tipo || 'comparecimento', conteudo: cert?.conteudo ?? '', cid: cert?.cid ?? '', dias: cert?.dias_afastamento ? String(cert.dias_afastamento) : '' })} /> : null}
            {own ? <Button variant="danger" label="Excluir" disabled={busy === template.id} onPress={() => remove(kind, template)} /> : null}
          </View>
        </View>;
      })}</Section>}
    <Text style={styles.note}>Modelos padrão do sistema podem ser duplicados, mas não editados.</Text>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ form: { marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, item: { marginBottom: 6 }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, copy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 } });
