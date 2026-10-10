import { useEffect, useState } from 'react';
import logoHorizontal from '@/assets/elolab-logo-identidade.png';

interface BrandLoadingScreenProps {
  message?: string;
  detail?: string;
  timeoutMs?: number;
}

export function BrandLoadingScreen({
  message = 'Preparando seu espaço de cuidado',
  detail = 'Agenda, prontuários e equipe estarão prontos em instantes.',
  timeoutMs = 12000,
}: BrandLoadingScreenProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  return (
    <main className="brand-loader" role={slow ? 'alert' : 'status'} aria-live="polite">
      <div className="brand-loader__content">
        <div className="brand-loader__identity">
          <img className="brand-loader__mark" src={logoHorizontal} alt="EloLab" />
        </div>
        <div className="brand-loader__progress" aria-hidden="true">
          <span />
        </div>
        <p className="brand-loader__message">{slow ? 'O carregamento está demorando' : message}</p>
        <p className="brand-loader__detail">
          {slow ? 'Confira sua conexão e tente abrir o app novamente.' : detail}
        </p>
        {slow && (
          <a className="brand-loader__retry" href="">
            Tentar novamente
          </a>
        )}
      </div>
    </main>
  );
}
