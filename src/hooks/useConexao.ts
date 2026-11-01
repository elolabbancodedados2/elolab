import { useEffect, useState } from 'react';

/** Textos únicos de conexão, usados pela barra de status e pelo aviso flutuante. */
export const TEXTO_CONEXAO = {
  online: 'Conectado',
  offline: 'Sem conexão',
  offlineDetalhe: 'Você pode ver o que já está aberto, mas nada será salvo até a conexão voltar.',
  reconectado: 'Conexão restaurada',
} as const;

const DURACAO_AVISO_RECONEXAO_MS = 3000;

/**
 * Estado de conexão do navegador. `reconectado` fica verdadeiro por alguns
 * segundos depois que a conexão volta, para o aviso de restauração.
 */
export function useConexao() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [reconectado, setReconectado] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ligar = () => {
      setOnline(true);
      setReconectado(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReconectado(false), DURACAO_AVISO_RECONEXAO_MS);
    };
    const desligar = () => {
      setOnline(false);
      setReconectado(false);
      if (timer) clearTimeout(timer);
    };
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    return () => {
      window.removeEventListener('online', ligar);
      window.removeEventListener('offline', desligar);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { online, reconectado };
}
