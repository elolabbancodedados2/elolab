import { formatDate } from '@/lib/formatters';
import { Link } from 'react-router-dom';
import { NavegacaoLegal } from '@/components/NavegacaoLegal';
import { ArrowLeft, Cookie } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/landing-v2/Logo';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { COOKIE_CATALOG } from '@/lib/cookies';
import { revokeCookieConsent } from '@/lib/cookies';
import { toast } from 'sonner';

export default function PoliticaCookies() {
  const handleRevokeConsent = () => {
    revokeCookieConsent();
    toast.success('Consentimento revogado. O banner de cookies aparecerá novamente na próxima visita.');
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F8FC] to-white">
      <div className="container mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" aria-label="EloLab, página inicial" className="inline-flex min-h-10 items-center">
            <Logo />
          </Link>
          <Button asChild variant="outline" size="sm" className="h-10 gap-2 rounded-full">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </Button>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
            <Cookie className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Política de Cookies</h1>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 rounded-2xl border border-[#DCE6F2] bg-card p-5 text-muted-foreground shadow-[0_8px_24px_rgba(16,128,202,0.06)] sm:p-8 prose-a:text-primary">
          <p className="text-xs">Última atualização: {formatDate(new Date(), 'short')}</p>

          <section>
            <h2 className="text-lg font-semibold text-foreground">1. O que são Cookies?</h2>
            <p>Cookies são pequenos arquivos de texto armazenados no seu navegador quando você acessa nosso sistema. Eles permitem que o sistema funcione corretamente, lembre suas preferências e melhore sua experiência.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Base Legal</h2>
            <p>O uso de cookies está em conformidade com a <strong>LGPD (Lei nº 13.709/2018)</strong> e o <strong>Marco Civil da Internet (Lei nº 12.965/2014)</strong>. Cookies essenciais são utilizados com base no legítimo interesse; os demais requerem seu consentimento prévio.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Cookies Utilizados</h2>
            
            {COOKIE_CATALOG.map((category) => (
              <div key={category.category} className="mb-6">
                <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                  {category.name}
                  {category.required && <Badge variant="outline" className="rounded-full border-border text-[10px] text-primary">Obrigatório</Badge>}
                </h3>
                <p className="text-sm mb-2">{category.description}</p>
                
                <div className="not-prose overflow-x-auto rounded-xl border border-border/60">
                <Table className="min-w-[520px]">
                  <TableHeader className="bg-[#F3F8FC]">
                    <TableRow>
                      <TableHead className="text-xs">Cookie</TableHead>
                      <TableHead className="text-xs">Finalidade</TableHead>
                      <TableHead className="text-xs">Duração</TableHead>
                      <TableHead className="text-xs">Provedor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.cookies.map((cookie) => (
                      <TableRow key={cookie.name}>
                        <TableCell className="text-xs font-mono">{cookie.name}</TableCell>
                        <TableCell className="text-xs">{cookie.purpose}</TableCell>
                        <TableCell className="text-xs">{cookie.duration}</TableCell>
                        <TableCell className="text-xs">{cookie.provider}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Como Gerenciar Cookies</h2>
            <ul>
              <li><strong>No sistema:</strong> Ao acessar pela primeira vez, um banner permite aceitar, rejeitar ou personalizar cookies.</li>
              <li><strong>No navegador:</strong> Você pode bloquear ou excluir cookies nas configurações do seu navegador.</li>
              <li><strong>Revogar consentimento:</strong> Clique no botão abaixo para revogar seu consentimento a qualquer momento.</li>
            </ul>
            <Button variant="outline" size="sm" onClick={handleRevokeConsent} className="mt-2 h-10 rounded-full">
              Revogar Consentimento de Cookies
            </Button>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Impacto da Desativação</h2>
            <p>A desativação de cookies essenciais pode impedir o funcionamento correto do sistema (login, sessão). Cookies opcionais podem ser desativados sem afetar funcionalidades críticas.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Contato</h2>
            <p>Dúvidas sobre cookies: <strong>privacidade@elolab.com.br</strong></p>
            <p>Consulte também nossa <Link to="/politica-privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.</p>
          </section>
          <NavegacaoLegal atual="/politica-cookies" />
        </div>
      </div>
    </div>
  );
}
