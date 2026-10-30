import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';

import { ptBR } from 'date-fns/locale';
import { ArrowLeft, FileText, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/PageHeader';
import type jsPDF from 'jspdf';
import { ageFromDateOnly, parseDateOnly } from '@/lib/dateOnly';

interface DischargeReportProps {
  onClose: () => void;
  hasUnsavedChanges?: boolean;
  data: {
    paciente: {
      nome: string;
      dataNascimento?: string;
      cpf?: string;
    };
    medico: {
      nome: string;
      crm?: string;
      especialidade?: string;
    };
    consulta: {
      data: string;
      queixaPrincipal?: string;
      hipoteseDiagnostica?: string;
      conduta?: string;
    };
    prescricoes?: {
      medicamento: string;
      dosagem?: string;
      posologia?: string;
      duracao?: string;
    }[];
    orientacoes?: string;
    retorno?: {
      data?: string;
      motivo?: string;
    };
  };
  clinicaNome?: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;
  clinicaCNPJ?: string;
}

export function DischargeReport({
  onClose, 
  hasUnsavedChanges = false,
  data,
  clinicaNome = 'EloLab Clínica',
  clinicaEndereco = '',
  clinicaTelefone = '',
  clinicaCNPJ = '',
}: DischargeReportProps) {
  const calcularIdade = (dataNascimento?: string) => {
    if (!dataNascimento) return null;
    return ageFromDateOnly(dataNascimento);
  };

  const drawHeader = (doc: jsPDF, pageWidth: number): number => {
    let y = 15;

    // Top colored bar
    doc.setFillColor(20, 86, 192);
    doc.rect(0, 0, pageWidth, 4, 'F');

    // Clinic name
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 35, 70);
    doc.text(clinicaNome, pageWidth / 2, y, { align: 'center' });
    y += 6;

    // Clinic details
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    const details = [clinicaEndereco, clinicaTelefone, clinicaCNPJ].filter(Boolean);
    if (details.length > 0) {
      doc.text(details.join(' | '), pageWidth / 2, y, { align: 'center' });
      y += 5;
    }

    // Divider line
    doc.setDrawColor(20, 86, 192);
    doc.setLineWidth(0.5);
    doc.line(20, y, pageWidth - 20, y);
    y += 8;

    // Document title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('RELATÓRIO DE ALTA / RESUMO DE ATENDIMENTO', pageWidth / 2, y, { align: 'center' });
    y += 12;

    return y;
  };

  const drawSection = (doc: jsPDF, title: string, y: number, pageWidth: number): number => {
    // Check for page break
    if (y > 255) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 35, 70);
    doc.text(title, 20, y);
    y += 1;
    doc.setDrawColor(20, 86, 192);
    doc.setLineWidth(0.3);
    doc.line(20, y, 80, y);
    y += 5;
    doc.setTextColor(40, 40, 40);
    return y;
  };

  const drawFooter = (doc: jsPDF, pageWidth: number) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Bottom colored bar
      doc.setFillColor(20, 86, 192);
      doc.rect(0, pageHeight - 4, pageWidth, 4, 'F');

      // Signature area (last page only)
      if (i === totalPages) {
        const sigY = pageHeight - 45;
        
        // Doctor signature line
        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.3);
        doc.line(pageWidth / 2 - 40, sigY, pageWidth / 2 + 40, sigY);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(`${nomeMedico(data.medico.nome)}`, pageWidth / 2, sigY + 5, { align: 'center' });
        if (data.medico.crm) {
          doc.text(`CRM ${data.medico.crm}`, pageWidth / 2, sigY + 9, { align: 'center' });
        }
        if (data.medico.especialidade) {
          doc.text(data.medico.especialidade, pageWidth / 2, sigY + 13, { align: 'center' });
        }
      }

      // Page info
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} | ${clinicaNome} | Página ${i}/${totalPages}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    }
  };

  const generatePDF = async () => {
    // jsPDF sob demanda: o relatório de alta é gerado por clique.
    const { default: JsPDF } = await import('jspdf');
    const doc = new JsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    let y = drawHeader(doc, pageWidth);

    // Patient info box
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(18, y - 3, pageWidth - 36, 22, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(`Paciente: ${data.paciente.nome}`, 22, y + 4);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const infoItems: string[] = [];
    if (data.paciente.cpf) infoItems.push(`CPF: ${data.paciente.cpf}`);
    const idade = calcularIdade(data.paciente.dataNascimento);
    if (idade) infoItems.push(`Idade: ${idade} anos`);
    if (infoItems.length > 0) {
      doc.text(infoItems.join('   |   '), 22, y + 11);
    }
    y += 25;

    // Consultation info
    y = drawSection(doc, 'DADOS DO ATENDIMENTO', y, pageWidth);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const dataAtendimento = parseDateOnly(data.consulta.data);
    doc.text(`Data: ${dataAtendimento ? format(dataAtendimento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : data.consulta.data || 'Não informada'}`, 22, y);
    y += 5;
    doc.text(`Médico: ${nomeMedico(data.medico.nome)}${data.medico.crm ? ` - CRM ${data.medico.crm}` : ''}`, 22, y);
    y += 5;
    if (data.medico.especialidade) {
      doc.text(`Especialidade: ${data.medico.especialidade}`, 22, y);
      y += 5;
    }
    y += 5;

    // Clinical sections
    const clinicalSections = [
      { title: 'QUEIXA PRINCIPAL', content: data.consulta.queixaPrincipal },
      { title: 'HIPÓTESE DIAGNÓSTICA', content: data.consulta.hipoteseDiagnostica },
      { title: 'CONDUTA', content: data.consulta.conduta },
    ];

    clinicalSections.forEach(({ title, content }) => {
      if (!content) return;
      y = drawSection(doc, title, y, pageWidth);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(content, pageWidth - 44);
      doc.text(lines, 22, y);
      y += lines.length * 4.5 + 6;
    });

    // Prescriptions
    if (data.prescricoes && data.prescricoes.length > 0) {
      y = drawSection(doc, 'PRESCRIÇÕES', y, pageWidth);
      doc.setFontSize(9);

      data.prescricoes.forEach((p, index) => {
        if (y > 255) { doc.addPage(); y = 20; }
        
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${p.medicamento}${p.dosagem ? ` - ${p.dosagem}` : ''}`, 25, y);
        y += 4.5;
        doc.setFont('helvetica', 'normal');
        if (p.posologia) { doc.text(`Posologia: ${p.posologia}`, 30, y); y += 4; }
        if (p.duracao) { doc.text(`Duração: ${p.duracao}`, 30, y); y += 4; }
        y += 2;
      });
      y += 3;
    }

    // Orientations
    if (data.orientacoes) {
      y = drawSection(doc, 'ORIENTAÇÕES', y, pageWidth);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(data.orientacoes, pageWidth - 44);
      doc.text(lines, 22, y);
      y += lines.length * 4.5 + 6;
    }

    // Return
    if (data.retorno?.data) {
      y = drawSection(doc, 'RETORNO', y, pageWidth);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      doc.setFillColor(245, 248, 252);
      doc.roundedRect(20, y - 3, pageWidth - 40, 14, 2, 2, 'F');
      const dataRetorno = parseDateOnly(data.retorno.data);
      doc.text(`Data prevista: ${dataRetorno ? format(dataRetorno, "dd/MM/yyyy", { locale: ptBR }) : data.retorno.data}`, 24, y + 3);
      if (data.retorno.motivo) {
        doc.text(`Motivo: ${data.retorno.motivo}`, 24, y + 8);
      }
      y += 18;
    }

    // Footer with signature and page numbers
    drawFooter(doc, pageWidth);

    return doc;
  };

  const handlePrint = async () => {
    const doc = await generatePDF();
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const handleDownload = async () => {
    const doc = await generatePDF();
    doc.save(`relatorio-alta-${data.paciente.nome.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const idade = calcularIdade(data.paciente.dataNascimento);
  const dataAtendimento = parseDateOnly(data.consulta.data);
  const dataRetorno = data.retorno?.data ? parseDateOnly(data.retorno.data) : null;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6" data-testid="clinical-discharge-report">
      <PageHeader
        title="Relatório de alta"
        description="Prévia do resumo clínico para imprimir ou baixar. Esta tela não altera o prontuário."
        icon={<FileText />}
        actions={(
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" onClick={onClose} className="min-h-10 flex-1 sm:flex-none">
              <ArrowLeft className="mr-2 h-4 w-4" />Voltar à evolução
            </Button>
            <Button variant="outline" onClick={handlePrint} className="min-h-10 flex-1 sm:flex-none">
              <Printer className="mr-2 h-4 w-4" />Imprimir
            </Button>
            <Button onClick={handleDownload} className="min-h-10 flex-1 sm:flex-none">
              <Download className="mr-2 h-4 w-4" />Baixar PDF
            </Button>
          </div>
        )}
      />

      {hasUnsavedChanges && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Esta prévia inclui alterações ainda não salvas na evolução. Volte ao atendimento para salvá-las.
        </p>
      )}

      <article className="space-y-7 rounded-xl border border-border bg-card p-4 sm:p-6 lg:p-8">
        <section aria-labelledby="discharge-patient-heading">
          <h2 id="discharge-patient-heading" className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">DADOS DO PACIENTE</h2>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-5">
            <p className="text-lg font-semibold text-foreground">{data.paciente.nome || 'Paciente não identificado'}</p>
            {data.paciente.cpf && <span className="text-sm text-muted-foreground">CPF: {data.paciente.cpf}</span>}
            {idade && <span className="text-sm text-muted-foreground">{idade} anos</span>}
          </div>
        </section>

        <section aria-labelledby="discharge-appointment-heading">
          <h2 id="discharge-appointment-heading" className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground">ATENDIMENTO</h2>
          <dl className="grid gap-x-6 gap-y-4 border-b border-border pb-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Data</dt>
              <dd className="mt-1 font-medium">{dataAtendimento ? format(dataAtendimento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : data.consulta.data || 'Não informada'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Médico</dt>
              <dd className="mt-1 font-medium">{nomeMedico(data.medico.nome)}{data.medico.crm && <span className="ml-1 text-muted-foreground">(CRM {data.medico.crm})</span>}</dd>
            </div>
            {data.medico.especialidade && (
              <div>
                <dt className="text-xs text-muted-foreground">Especialidade</dt>
                <dd className="mt-1"><Badge variant="secondary">{data.medico.especialidade}</Badge></dd>
              </div>
            )}
          </dl>
        </section>

        <Separator />
        {data.consulta.queixaPrincipal && <section><h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">QUEIXA PRINCIPAL</h2><p className="whitespace-pre-wrap text-sm leading-6">{data.consulta.queixaPrincipal}</p></section>}
        {data.consulta.hipoteseDiagnostica && <section><h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">HIPÓTESE DIAGNÓSTICA</h2><p className="whitespace-pre-wrap text-sm leading-6">{data.consulta.hipoteseDiagnostica}</p></section>}
        {data.consulta.conduta && <section><h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">CONDUTA</h2><p className="whitespace-pre-wrap text-sm leading-6">{data.consulta.conduta}</p></section>}

        {data.prescricoes && data.prescricoes.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">PRESCRIÇÕES</h2>
            <ol className="divide-y divide-border border-y border-border">
              {data.prescricoes.map((p, index) => (
                <li key={`${p.medicamento}-${index}`} className="py-3">
                  <p className="font-medium text-foreground">{index + 1}. {p.medicamento}{p.dosagem && <span className="text-muted-foreground"> - {p.dosagem}</span>}</p>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {p.posologia && <span>Posologia: {p.posologia}</span>}
                    {p.duracao && <span className="ml-4">Duração: {p.duracao}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {data.orientacoes && <section><h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">ORIENTAÇÕES</h2><p className="whitespace-pre-wrap text-sm leading-6">{data.orientacoes}</p></section>}
        {data.retorno?.data && (
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">RETORNO</h2>
            <div className="border-l-2 border-primary pl-3">
              <p className="font-medium">{dataRetorno ? format(dataRetorno, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : data.retorno.data}</p>
              {data.retorno.motivo && <p className="text-sm text-muted-foreground">{data.retorno.motivo}</p>}
            </div>
          </section>
        )}
      </article>
    </section>
  );
}
