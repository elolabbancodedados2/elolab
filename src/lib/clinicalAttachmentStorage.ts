import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'medical-attachments';

/** `url_arquivo` is a private bucket path; older records may store its URL. */
export function clinicalAttachmentStoragePath(stored: string): string {
  if (!stored.startsWith('http')) return stored;
  const afterBucket = stored.split(`/${BUCKET}/`)[1];
  if (afterBucket) return decodeURIComponent(afterBucket.split('?')[0]);
  return stored.split('/').slice(-2).join('/');
}

/** Creates a one hour signed URL for an attachment in the private bucket. */
export async function createClinicalAttachmentSignedUrl(stored: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(clinicalAttachmentStoragePath(stored), 3600);
    if (error) {
      console.error('Erro ao gerar link do anexo clínico:', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error('Erro ao gerar link do anexo clínico:', error);
    return null;
  }
}
