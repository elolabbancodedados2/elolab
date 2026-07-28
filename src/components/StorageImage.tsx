import { useEffect, useState } from 'react';
import { AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

/**
 * Exibe imagem guardada em bucket privado do Supabase.
 *
 * POR QUE ISTO EXISTE
 * O bucket `patient-photos` era público: qualquer pessoa com a URL via a foto
 * do paciente, sem login. As URLs eram geradas por getPublicUrl() e gravadas em
 * `pacientes.foto_url` / `medicos.foto_url`.
 *
 * Com o bucket privado, o acesso passa a exigir link assinado — que expira e
 * por isso NÃO pode ser guardado no banco. O banco guarda o caminho do arquivo
 * e o link é gerado na hora de exibir.
 *
 * Compatível com o que já está gravado: valores antigos são URLs completas e
 * seguem sendo usados como estão (deixarão de funcionar quando o bucket for
 * fechado, e a foto pode ser reenviada pela tela).
 */
export function useStorageUrl(bucket: string, value?: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let ativo = true;

    if (!value) {
      setUrl(undefined);
      return;
    }

    // Registro antigo: já é uma URL completa
    if (value.startsWith('http')) {
      setUrl(value);
      return;
    }

    supabase.storage
      .from(bucket)
      .createSignedUrl(value, 3600)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          console.error(`Erro ao gerar link de ${bucket}:`, error);
          setUrl(undefined);
          return;
        }
        setUrl(data?.signedUrl);
      });

    return () => { ativo = false; };
  }, [bucket, value]);

  return url;
}

/** AvatarImage que resolve o caminho do storage antes de exibir. */
export function StorageAvatarImage({
  bucket,
  path,
  alt,
}: {
  bucket: string;
  path?: string | null;
  alt?: string;
}) {
  const url = useStorageUrl(bucket, path);
  if (!url) return null;
  return <AvatarImage src={url} alt={alt} />;
}

/** <img> comum que resolve o caminho do storage antes de exibir. */
export function StorageImg({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: string;
  path?: string | null;
  alt?: string;
  className?: string;
}) {
  const url = useStorageUrl(bucket, path);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
