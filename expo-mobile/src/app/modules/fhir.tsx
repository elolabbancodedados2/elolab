import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Card, ListRow, Section } from '../../components/ui';
import { colors } from '../../theme/tokens';

// src/pages/Interoperabilidade.tsx only exports an encrypted FHIR R4 Bundle file (fhir-export) and opens
// protected .elolab files. Both produce/read files on the device, so the phone hands off to the web.
const resources = [
  ['Patient / AllergyIntolerance', 'Identificação, contatos e alergias'],
  ['Encounter / Composition', 'Atendimentos e evoluções clínicas'],
  ['ServiceRequest / DiagnosticReport', 'Solicitações de exames e laudos liberados'],
  ['Observation / Condition / MedicationRequest', 'Sinais vitais, diagnósticos e prescrições'],
];

export default function FhirScreen() {
  return <ModuleScreen moduleKey="fhir" subtitle="Exportação segura e auditada no padrão HL7 FHIR R4.">
    <Card style={styles.card}>
      <Text style={styles.title}>Bundle clínico FHIR R4</Text>
      <Text style={styles.text}>A exportação gera um arquivo protegido por senha e a abertura de arquivos .elolab salva o conteúdo no dispositivo. Por isso, as duas ações ficam na versão web, em um computador autorizado. Não há envio direto para sistemas externos.</Text>
      <OpenOnWeb path="/interoperabilidade" label="Exportar no navegador" />
    </Card>
    <Section title="Conteúdo do Bundle">{resources.map(([title, text]) => <ListRow key={title} icon="document-text-outline" title={title} subtitle={text} />)}</Section>
    <View accessibilityRole="alert" style={styles.warn}><Text style={styles.warnText}>O arquivo inclui dados pessoais (contato e endereço) e conteúdo clínico. Guarde e compartilhe somente em ambiente autorizado. Laudos anexados são incluídos por links privados temporários, válidos por 1 hora. O CPF é omitido; a auditoria registra apenas metadados da exportação.</Text></View>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ card: { gap: 10, marginTop: 8 }, title: { color: colors.ink, fontSize: 14, fontWeight: '700' }, text: { color: colors.muted, fontSize: 12, lineHeight: 18 }, warn: { backgroundColor: colors.warningSoft, borderRadius: 13, padding: 12, marginTop: 18 }, warnText: { color: colors.warning, fontSize: 11, lineHeight: 16 } });
