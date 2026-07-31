import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, X, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { StorageAvatarImage } from '@/components/StorageImage';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

interface PatientPhotoProps {
  pacienteId: string;
  pacienteNome: string;
  currentPhotoUrl?: string | null;
  onPhotoChange?: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  editable?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-32 w-32',
};

const iconSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
  xl: 'h-14 w-14',
};

export function PatientPhoto({
  pacienteId,
  pacienteNome,
  currentPhotoUrl,
  onPhotoChange,
  size = 'md',
  editable = true,
  className,
}: PatientPhotoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(currentPhotoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    setUploading(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${pacienteId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('patient-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Guardamos o CAMINHO, não uma URL. O bucket é privado e o link assinado
      // expira — guardá-lo no banco resultaria em foto quebrada depois de 1h.
      const { error: updateError } = await supabase
        .from('pacientes')
        .update({ foto_url: fileName })
        .eq('id', pacienteId);

      if (updateError) throw updateError;

      setPhotoUrl(fileName);
      onPhotoChange?.(fileName);
      toast.success('Foto atualizada com sucesso!');
      setIsOpen(false);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro ao fazer upload da foto', { description: mensagemDeErro(error) });
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);

    try {
      // Update patient record to remove photo
      const { error } = await supabase
        .from('pacientes')
        .update({ foto_url: null })
        .eq('id', pacienteId);

      if (error) throw error;

      setPhotoUrl(null);
      onPhotoChange?.(null);
      toast.success('Foto removida com sucesso!');
      setIsOpen(false);
    } catch (error) {
      console.error('Erro ao remover foto:', error);
      toast.error('Erro ao remover foto', { description: mensagemDeErro(error) });
    } finally {
      setUploading(false);
    }
  };

  const avatarContent = (
    <Avatar className={cn(sizeClasses[size], className)}>
      <StorageAvatarImage bucket="patient-photos" path={photoUrl} alt={pacienteNome} />
      <AvatarFallback className="bg-primary/10 text-primary">
        {pacienteNome ? getInitials(pacienteNome) : <User className={iconSizes[size]} />}
      </AvatarFallback>
    </Avatar>
  );

  if (!editable) {
    return avatarContent;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
        >
          {avatarContent}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Foto do Paciente</DialogTitle>
          <DialogDescription>
            Adicione ou atualize a foto do paciente para facilitar a identificação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          <Avatar className="h-32 w-32">
            <StorageAvatarImage bucket="patient-photos" path={photoUrl} alt={pacienteNome} />
            <AvatarFallback className="bg-primary/10 text-primary text-4xl">
              {pacienteNome ? getInitials(pacienteNome) : <User className="h-16 w-16" />}
            </AvatarFallback>
          </Avatar>

          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {photoUrl ? 'Alterar Foto' : 'Enviar Foto'}
            </Button>

            {photoUrl && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleRemovePhoto}
                disabled={uploading}
              >
                <X className="h-4 w-4 mr-2" />
                Remover
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Formatos aceitos: JPG, PNG, GIF. Tamanho máximo: 5MB
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
