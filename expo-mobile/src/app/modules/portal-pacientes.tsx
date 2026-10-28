import { useEffect, useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Button, Card, Feedback, Field, ListRow, Section, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must } from '../../lib/useLoad';
import { WEB_BASE_URL } from '../../navigation/catalog';
import { colors } from '../../theme/tokens';

type Patient = { id: string; nome: string; nome_social: string | null; telefone: string | null };

// Same rule as src/lib/whatsapp.ts on the web.
function whatsappLink(phone: string | null, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}?text=${encodeURIComponent(text)}`;
}

const steps = [['Selecione o paciente', 'Busque por nome, CPF ou telefone.'], ['Gere o link individual', 'Vale por até um ano e substitui o anterior.'], ['Compartilhe com segurança', 'Copie o link ou envie pelo WhatsApp.']];

export default function PortalPacientesScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    const term = search.trim();
    if (!clinicId || term.length < 2 || patient) { setResults([]); setSearchError(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const rows = must(await db.rpc('buscar_pacientes_paginado', { p_termo: term, p_limite: 20, p_offset: 0, p_status: 'ativos', p_sexo: null, p_convenio_id: null, p_somente_particular: false, p_nascimento_apos: null, p_nascimento_ate: null }).select('id,nome,nome_social,telefone'));
          if (active) { setResults((rows ?? []) as Patient[]); setSearchError(null); }
        } catch (err) { if (active) setSearchError(friendlyError(err)); } finally { if (active) setSearching(false); }
      })();
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [clinicId, search, patient]);

  async function generate() {
    if (!patient) return;
    setBusy(true); setLink(''); setFeedback(null);
    try {
      const url = must<unknown>(await db.rpc('link_portal_paciente', { p_paciente_id: patient.id }));
      if (typeof url !== 'string') throw new Error('O link do portal não foi retornado.');
      const parsed = new URL(url);
      const token = parsed.searchParams.get('token');
      if (parsed.pathname !== '/portal-paciente' || !token) throw new Error('O link retornado está incompleto.');
      // The web rebuilds the link on its own origin; the app uses the public web address.
      setLink(`${WEB_BASE_URL}/portal-paciente?token=${encodeURIComponent(token)}`);
      setFeedback({ message: 'Link de acesso gerado para este paciente.' });
    } catch (err) { setFeedback({ message: `Não foi possível gerar o link do portal. ${friendlyError(err, 'Tente novamente.')}`, error: true }); } finally { setBusy(false); }
  }

  const name = patient ? patient.nome_social || patient.nome : '';
  const whatsapp = link && patient ? whatsappLink(patient.telefone, `Olá, ${name}! A clínica está compartilhando seu link de acesso ao Portal do Paciente: ${link}`) : null;

  return <ModuleScreen moduleKey="portal-pacientes" subtitle="Gere um link individual e privado para cada paciente consultar as informações liberadas pela clínica.">
    <Card>
      <Text style={styles.title}>Enviar acesso</Text>
      <Text style={styles.text}>O link é individual e permite consultar somente as informações disponíveis para aquele paciente.</Text>
      {patient ? <View style={styles.selected}>
        <ListRow title={name} subtitle={patient.telefone || 'Sem telefone cadastrado'} icon="person-outline" />
        <View style={styles.actions}><Button variant="ghost" label="Trocar paciente" disabled={busy} onPress={() => { setPatient(null); setLink(''); setFeedback(null); }} /><Button label={busy ? 'Gerando link…' : 'Gerar link de acesso'} icon="link-outline" loading={busy} onPress={() => void generate()} /></View>
      </View> : <>
        <Field label="Paciente" value={search} onChangeText={setSearch} placeholder="Busque por nome, CPF ou telefone..." autoCorrect={false} hint="Digite ao menos 2 caracteres" />
        {searching ? <StateView loading title="Buscando pacientes…" /> : searchError ? <StateView icon="alert-circle-outline" title="Não foi possível concluir a busca" message={searchError} /> : search.trim().length >= 2 && !results.length ? <StateView icon="search-outline" title="Nenhum paciente encontrado" message="Tente outro nome ou confira a grafia da busca." /> :
          results.map(p => <ListRow key={p.id} title={p.nome_social || p.nome} subtitle={p.telefone || 'Sem telefone cadastrado'} icon="person-outline" onPress={() => { setPatient(p); setLink(''); setFeedback(null); }} />)}
      </>}
      {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
      {link ? <View style={styles.linkBox}>
        <Text style={styles.label}>Link individual do portal</Text>
        <Text selectable style={styles.link}>{link}</Text>
        <View style={styles.actions}>
          <Button variant="secondary" icon="share-outline" label="Compartilhar" onPress={() => void Share.share({ message: link })} />
          {whatsapp ? <Button icon="logo-whatsapp" label="Enviar por WhatsApp" onPress={() => void Linking.openURL(whatsapp)} /> : null}
        </View>
        {!whatsapp ? <Text style={styles.text}>Cadastre um telefone válido para enviar pelo WhatsApp; por enquanto, compartilhe o link.</Text> : null}
        <Text style={styles.text}>Por segurança, este link substitui os anteriores e vale por até um ano.</Text>
      </View> : null}
      <Text style={styles.warning}>Compartilhe este link somente com o paciente ou responsável autorizado. O endereço contém uma credencial individual de acesso.</Text>
    </Card>
    <Section title="Como funciona">{steps.map(([title, text], i) => <ListRow key={title} title={`${i + 1}. ${title}`} subtitle={text} />)}</Section>
    <Text style={styles.text}>O link novo desativa o anterior.</Text>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' }, text: { color: colors.muted, fontSize: 12, lineHeight: 18, marginVertical: 6 },
  selected: { marginTop: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginVertical: 8 },
  linkBox: { padding: 12, borderRadius: 13, backgroundColor: colors.primarySoft, marginTop: 8 }, label: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, link: { color: colors.ink, fontSize: 11, marginTop: 6 },
  warning: { color: colors.ink, fontSize: 11, lineHeight: 16, padding: 10, borderRadius: 11, backgroundColor: colors.surfaceMuted, marginTop: 12 },
});
