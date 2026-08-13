import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, RefreshCw, Trash2, QrCode, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { WhatsAppSession, WhatsAppAgent } from './types';

interface SessionsTabProps {
  sessions: WhatsAppSession[];
  agents: WhatsAppAgent[];
  isLoading: boolean;
  onCreateSession: (instanceName: string) => void;
  onRefreshQR: (sessionId: string, instanceName: string) => void;
  onCheckStatus: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onLinkAgent: (sessionId: string, agentId: string | null) => void;
  isCreating: boolean;
  isRefreshing: boolean;
  isChecking: boolean;
}

export function SessionsTab({
  sessions,
  agents,
  isLoading,
  onCreateSession,
  onRefreshQR,
  onCheckStatus,
  onDeleteSession,
  onLinkAgent,
  isCreating,
  isRefreshing,
  isChecking,
}: SessionsTabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [qrImages, setQrImages] = useState<Record<string, string>>({});

  // A Evolution API can return either an image/base64 or the raw QR payload
  // (`code`). Generate the image in the browser for the latter so the user
  // always gets something scannable instead of a broken <img>.
  useEffect(() => {
    let active = true;

    const generateImages = async () => {
      const entries = await Promise.all(
        sessions
          .filter((session) => session.status !== 'connected' && session.qr_code)
          .map(async (session) => {
            const value = session.qr_code!.trim();
            if (value.startsWith('data:image/')) return [session.id, value] as const;

            // Raw base64 image data is common in Evolution API responses.
            if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
              return [session.id, `data:image/png;base64,${value}`] as const;
            }

            try {
              return [session.id, await QRCode.toDataURL(value, { width: 384, margin: 2 })] as const;
            } catch {
              return null;
            }
          }),
      );

      if (active) setQrImages(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
    };

    void generateImages();
    return () => { active = false; };
  }, [sessions]);

  const handleCreate = () => {
    onCreateSession(newInstanceName);
    setNewInstanceName('');
    setIsOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500"><Wifi className="w-3 h-3 mr-1" /> Conectado</Badge>;
      case 'qr_code':
        return <Badge variant="secondary"><QrCode className="w-3 h-3 mr-1" /> Aguardando QR</Badge>;
      case 'connecting':
        return <Badge variant="outline"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Conectando</Badge>;
      default:
        return <Badge variant="destructive"><WifiOff className="w-3 h-3 mr-1" /> Desconectado</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Sessões de WhatsApp</h2>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Sessão
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Sessão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Nome da Instância</Label>
                <Input
                  placeholder="Ex: clinica-principal"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use apenas letras, números e hífens
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={!newInstanceName || isCreating}
              >
                {isCreating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4 mr-2" />
                )}
                Gerar QR Code
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Carregando sessões...</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma sessão configurada</h3>
            <p className="text-muted-foreground mb-4">
              Crie uma sessão para conectar o WhatsApp
            </p>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Sessão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{session.instance_name}</CardTitle>
                  {getStatusBadge(session.status)}
                </div>
                {session.phone_number && (
                  <CardDescription>{session.phone_number}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {session.status !== 'connected' && (
                  <div className="flex flex-col items-center gap-2">
                    {qrImages[session.id] && (
                      <img
                        src={qrImages[session.id]}
                        alt="QR Code para conectar o WhatsApp"
                        className="w-48 h-48 border rounded"
                      />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRefreshQR(session.id, session.instance_name)}
                      disabled={isRefreshing}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {session.qr_code ? 'Atualizar QR' : 'Gerar QR Code'}
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Agente Vinculado</Label>
                  <Select
                    value={session.agent_id || 'none'}
                    onValueChange={(value) => 
                      onLinkAgent(session.id, value === 'none' ? null : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um agente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum agente</SelectItem>
                      {agents.filter(a => a.ativo).map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.nome} ({agent.tipo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onCheckStatus(session.id)}
                    disabled={isChecking}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                    Verificar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm('Deseja realmente remover esta sessão?')) {
                        onDeleteSession(session.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
