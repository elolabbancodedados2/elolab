import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { ptBR } from 'date-fns/locale';
import { FileText, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import jsPDF from 'jspdf';
import { parseDateOnly } from '@/lib/dateOnly';

interface DischargeReportProps {
  isOpen: boolean;
  onClose: () => void;
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
  isOpen, 
  onClose, 
  data,
  clinicaNome = 'EloLab Clínica',
  clinicaEndereco = '',
  clinicaTelefone = '',
  clinicaCNPJ = '',
}: DischargeReportProps) {
  const calcularIdade = (dataNascimento?: string) => {
    if (!dataNascimento) return null;
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return idade;
  };

  const drawHeader = (doc: jsPDF, pageWidth: number): number => {
    let y = 15;

    // Top colored bar
    doc.setFillColor(0, 120, 200);
    doc.rect(0, 0, pageWidth, 4, 'F');

    // Clinic name
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 90, 160);
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
    doc.setDrawColor(0, 120, 200);
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
    doc.setTextColor(0, 90, 160);
    doc.text(title, 20, y);
    y += 1;
    doc.setDrawColor(0, 120, 200);
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
      doc.setFillColor(0, 120, 200);
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
        doc.text(`Dr(a). ${data.medico.nome}`, pageWidth / 2, sigY + 5, { align: 'center' });
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

  const generatePDF = () => {
    const doc = new jsPDF();
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
    doc.text(`Data: ${format(parseDateOnly(data.consulta.data)!, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`, 22, y);
    y += 5;
    doc.text(`Médico: Dr(a). ${data.medico.nome}${data.medico.crm ? ` - CRM ${data.medico.crm}` : ''}`, 22, y);
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

      doc.setFillColor(240, 248, 255);
      doc.roundedRect(20, y - 3, pageWidth - 40, 14, 2, 2, 'F');
      doc.text(`Data prevista: ${format(parseDateOnly(data.retorno.data)!, "dd/MM/yyyy", { locale: ptBR })}`, 24, y + 3);
      if (data.retorno.motivo) {
        doc.text(`Motivo: ${data.retorno.motivo}`, 24, y + 8);
      }
      y += 18;
    }

    // Footer with signature and page numbers
    drawFooter(doc, pageWidth);

    return doc;
  };

  const handlePrint = () => {
    const doc = generatePDF();
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const handleDownload = () => {
    const doc = generatePDF();
    doc.save(`relatorio-alta-${data.paciente.nome.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const idade = calcularIdade(data.paciente.dataNascimento);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Relatório de Alta
          </DialogTitle>
          <DialogDescription>
            Resumo do atendimento para o paciente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Patient Info */}
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">DADOS DO PACIENTE</h3>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="font-medium text-lg">{data.paciente.nome}</p>
              <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                {data.paciente.cpf && <span>CPF: {data.paciente.cpf}</span>}
                {idade && <span>{idade} anos</span>}
              </div>
            </div>
          </div>

          {/* Consultation Info */}
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">ATENDIMENTO</h3>
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Data:</span>
                <span className="font-medium">
                  {format(parseDateOnly(data.consulta.data)!, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Médico:</span>
                <span className="font-medium">
                  Dr(a). {data.medico.nome}
                  {data.medico.crm && <span className="text-muted-foreground ml-1">(CRM {data.medico.crm})</span>}
                </span>
              </div>
              {data.medico.especialidade && (
                <div className="flex justify-between">
                  <span className="text-sm">Especialidade:</span>
                  <Badge variant="secondary">{data.medico.especialidade}</Badge>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Clinical Details */}
          {data.consulta.queixaPrincipal && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">QUEIXA PRINCIPAL</h3>
              <p className="text-sm">{data.consulta.queixaPrincipal}</p>
            </div>
          )}

          {data.consulta.hipoteseDiagnostica && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">HIPÓTESE DIAGNÓSTICA</h3>
              <p className="text-sm">{data.consulta.hipoteseDiagnostica}</p>
            </div>
          )}

          {data.consulta.conduta && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">CONDUTA</h3>
              <p className="text-sm">{data.consulta.conduta}</p>
            </div>
          )}

          {/* Prescriptions */}
          {data.prescricoes && data.prescricoes.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">PRESCRIÇÕES</h3>
              <div className="space-y-2">
                {data.prescricoes.map((p, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <p className="font-medium">
                      {index + 1}. {p.medicamento}
                      {p.dosagem && <span className="text-muted-foreground"> - {p.dosagem}</span>}
                    </p>
                    <div className="text-sm text-muted-foreground mt-1">
                      {p.posologia && <span>Posologia: {p.posologia}</span>}
                      {p.duracao && <span className="ml-4">Duração: {p.duracao}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orientations */}
          {data.orientacoes && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">ORIENTAÇÕES</h3>
              <p className="text-sm whitespace-pre-wrap">{data.orientacoes}</p>
            </div>
          )}

          {/* Return */}
          {data.retorno?.data && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">RETORNO</h3>
              <div className="p-3 border rounded-lg bg-primary/5">
                <p className="font-medium">
                  {format(parseDateOnly(data.retorno.data)!, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                {data.retorno.motivo && (
                  <p className="text-sm text-muted-foreground">{data.retorno.motivo}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Baixar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
