export function receptionTicketCode(queueId: string): string {
  const compactId = queueId.replace(/-/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(compactId)) return 'EL-0000000000';
  return `EL-${compactId.slice(-10)}`;
}

export async function printReceptionTicket(queueId: string, arrivalTime: string): Promise<boolean> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: [80, 66] });
  const code = receptionTicketCode(queueId);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('EloLab · Senha de atendimento', 40, 12, { align: 'center' });
  doc.setFontSize(24);
  doc.text(code, 40, 31, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Chegada: ${arrivalTime}`, 40, 41, { align: 'center' });
  doc.setFontSize(8);
  doc.text('Aguarde sua senha ser chamada no painel.', 40, 50, { align: 'center' });
  doc.text('Este comprovante não contém dados pessoais.', 40, 56, { align: 'center' });

  const url = URL.createObjectURL(doc.output('blob'));
  const printWindow = window.open(url, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
