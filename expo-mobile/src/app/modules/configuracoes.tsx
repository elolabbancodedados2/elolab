import { useEffect, useState } from 'react';
import { StyleSheet, Text, type KeyboardTypeOptions } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Button, Card, Feedback, Field, Section, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// "Clínica" tab of src/pages/Configuracoes.tsx: key config_clinica in configuracoes_clinica,
// saved through salvar_configuracao_clinica_segura with the version read (updated_at).
type Config = Record<string, unknown> & { nomeClinica?: string; cnpj?: string };
const fields: { key: string; label: string; placeholder?: string; keyboard?: KeyboardTypeOptions; multiline?: boolean }[] = [
  { key: 'nomeClinica', label: 'Nome da Clínica *', placeholder: 'Nome da clínica' },
  { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00', keyboard: 'numbers-and-punctuation' },
  { key: 'cnes', label: 'CNES', placeholder: 'Código CNES', keyboard: 'number-pad' },
  { key: 'especialidadePrincipal', label: 'Especialidade Principal', placeholder: 'Ex: Clínica Geral' },
  { key: 'endereco', label: 'Endereço Completo', placeholder: 'Rua, número, bairro, cidade - UF, CEP', multiline: true },
  { key: 'telefone', label: 'Telefone Fixo', placeholder: '(00) 0000-0000', keyboard: 'phone-pad' },
  { key: 'celular', label: 'Celular / WhatsApp', placeholder: '(00) 00000-0000', keyboard: 'phone-pad' },
  { key: 'email', label: 'Email', placeholder: 'contato@clinica.com', keyboard: 'email-address' },
  { key: 'website', label: 'Website', placeholder: 'https://www.clinica.com.br', keyboard: 'url' },
  { key: 'responsavelTecnico', label: 'Nome do Responsável', placeholder: 'Dr(a). Nome Completo' },
  { key: 'crmResponsavel', label: 'CRM do Responsável', placeholder: 'CRM/UF 00000' },
];

export default function ClinicSettingsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [form, setForm] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean; reauth?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [config, clinic] = await Promise.all([
      client.from('configuracoes_clinica').select('valor, updated_at').eq('clinica_id', clinicId).eq('chave', 'config_clinica').order('updated_at', { ascending: false }).limit(1),
      client.from('clinicas').select('nome, cnpj').eq('id', clinicId).maybeSingle(),
    ]);
    const row = (must(config) ?? [])[0] as { valor: Config | null; updated_at: string | null } | undefined;
    const base = must<{ nome: string | null; cnpj: string | null } | null>(clinic);
    const valor = row?.valor ?? {};
    // Same fallback as the web: clinic name/CNPJ come from `clinicas` when the config is empty.
    return { config: { ...valor, nomeClinica: valor.nomeClinica || base?.nome || '', cnpj: valor.cnpj || base?.cnpj || '' } as Config, version: row?.updated_at ?? null };
  }, [clinicId]);

  useEffect(() => { if (data) setForm(data.config); }, [data]);

  async function save() {
    if (!form || !data) return;
    if (!String(form.nomeClinica ?? '').trim()) return setFeedback({ message: 'Informe o nome da clínica antes de salvar.', error: true });
    setSaving(true);
    setFeedback(null);
    try {
      const { data: version, error: rpcError } = await db.rpc('salvar_configuracao_clinica_segura', { p_chave: 'config_clinica', p_valor: form, p_versao_esperada: data.version });
      if (rpcError) {
        if (rpcError.hint === 'reautenticacao_necessaria') return setFeedback({ message: 'Por segurança, confirme sua identidade na versão web para salvar esta alteração.', error: true, reauth: true });
        throw new Error(rpcError.message);
      }
      if (typeof version !== 'string') throw new Error('A configuração foi salva, mas a versão não foi confirmada. Atualize os dados antes de salvar novamente.');
      setFeedback({ message: 'Dados da clínica salvos na nuvem!' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao salvar. Atualize os dados e tente novamente.'), error: true }); } finally { setSaving(false); }
  }

  return <ModuleScreen moduleKey="configuracoes" subtitle="Gerencie os dados e as preferências da sua clínica." refreshing={refreshing} onRefresh={refresh}>
    {loading ? <StateView loading title="Carregando as configurações…" /> : error || !form ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as configurações atuais" message={error ?? 'Os campos não serão apresentados com valores padrão para evitar sobrescrever configurações existentes.'} onAction={reload} /> :
      <Section title="Dados da clínica"><Card>
        {fields.map(f => <Field key={f.key} label={f.label} value={String(form[f.key] ?? '')} onChangeText={value => setForm({ ...form, [f.key]: value })} placeholder={f.placeholder} keyboardType={f.keyboard} multiline={f.multiline} autoCapitalize={f.keyboard === 'email-address' || f.keyboard === 'url' ? 'none' : 'sentences'} />)}
        {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
        {feedback?.reauth ? <OpenOnWeb path="/configuracoes" /> : null}
        <Button label={saving ? 'Salvando…' : 'Salvar na nuvem'} icon="cloud-upload-outline" loading={saving} onPress={() => void save()} />
      </Card></Section>}
    <Text style={styles.note}>Se outra pessoa salvar antes, o envio é recusado para não sobrescrever. Logo, salas, financeiro, impressão, segurança, backup e histórico de versões ficam na versão web.</Text>
    <OpenOnWeb path="/configuracoes" />
  </ModuleScreen>;
}

const styles = StyleSheet.create({ note: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginVertical: 14 } });
