import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Video, VideoOff, Mic, MicOff, PhoneOff, ShieldCheck, Loader2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

type Signal = { id: number; sender: 'provider' | 'guest'; signal_type: 'offer' | 'answer' | 'ice-candidate'; payload: RTCSessionDescriptionInit | RTCIceCandidateInit };
type SessionInfo = { status: string; expires_at: string; provider_present: boolean; guest_present: boolean };

export default function Teleconsulta() {
  const { sessionId = '' } = useParams();
  const { user } = useSupabaseAuth();
  const [guestToken, setGuestToken] = useState('');
  const isProvider = !guestToken;
  const [consentChecked, setConsentChecked] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const seenSignals = useRef(new Set<number>());
  const connecting = useRef(false);

  useEffect(() => {
    const previousTitle = document.title;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = robots?.content;
    const noIndex = robots ?? document.createElement('meta');
    noIndex.name = 'robots';
    noIndex.content = 'noindex, nofollow, noarchive';
    if (!robots) document.head.appendChild(noIndex);
    document.title = 'Teleconsulta · EloLab';
    return () => {
      document.title = previousTitle;
      if (previousRobots !== undefined) noIndex.content = previousRobots;
      else noIndex.remove();
    };
  }, []);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke('teleconsulta', {
      body: { action, session_id: sessionId, ...(guestToken ? { guest_token: guestToken } : {}), ...extra },
    });
    if (invokeError) throw new Error('Não foi possível conectar à sala. Atualize e tente novamente.');
    if (data?.error) throw new Error(data.error);
    return data;
  }, [guestToken, sessionId]);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (token) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      setGuestToken(token);
    }
  }, []);

  useEffect(() => {
    if (!sessionId || (!user && !guestToken)) return;
    let alive = true;
    call('state').then((state: SessionInfo) => { if (alive) setSession(state); })
      .catch((cause: Error) => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [call, guestToken, sessionId, user]);

  const send = useCallback(async (signalType: string, payload: unknown) => {
    await call('signal', { signal_type: signalType, payload });
  }, [call]);

  const startConnection = useCallback(async (forceRestart = false) => {
    if (connecting.current || (peer.current && !forceRestart)) return;
    connecting.current = true;
    try {
      if (forceRestart) {
        peer.current?.close();
        peer.current = null;
        localStream.current?.getTracks().forEach((track) => track.stop());
        localStream.current = null;
        setConnected(false);
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peer.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      connection.ontrack = (event) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
        setConnected(true);
      };
      connection.onicecandidate = (event) => {
        if (event.candidate) void send('ice-candidate', event.candidate.toJSON()).catch(() => undefined);
      };
      connection.onconnectionstatechange = () => {
        setConnected(connection.connectionState === 'connected');
        if (connection.connectionState === 'failed') setError('Não foi possível estabelecer a chamada nesta rede. Verifique sua conexão e tente novamente.');
      };
      if (isProvider) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await send('offer', { type: offer.type, sdp: offer.sdp });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Libere o acesso ao microfone e à câmera para continuar.');
      if (peer.current) peer.current.close();
      peer.current = null;
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    } finally { connecting.current = false; }
  }, [isProvider, send]);

  useEffect(() => {
    if (!accepted || !session) return;
    let alive = true;
    const handleSignal = async (signal: Signal) => {
      if (seenSignals.current.has(signal.id)) return;
      seenSignals.current.add(signal.id);
      if (signal.signal_type === 'offer' && !isProvider && peer.current?.connectionState === 'connected') await startConnection(true);
      if (signal.signal_type === 'offer' && !peer.current) await startConnection();
      const connection = peer.current;
      if (!connection) return;
      if (signal.signal_type === 'offer' && !isProvider) {
        await connection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await send('answer', { type: answer.type, sdp: answer.sdp });
      } else if (signal.signal_type === 'answer' && isProvider) {
        await connection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      } else if (signal.signal_type === 'ice-candidate') {
        await connection.addIceCandidate(signal.payload as RTCIceCandidateInit).catch(() => undefined);
      }
    };
    const timer = window.setInterval(async () => {
      try {
        const state = await call('state');
        if (!alive || state.status === 'closed' || state.status === 'expired') throw new Error('Esta sala foi encerrada.');
        setSession(state);
        if (state.provider_present && state.guest_present && !peer.current) await startConnection();
        const result = await call('poll');
        for (const signal of result.signals as Signal[]) await handleSignal(signal);
      } catch (cause) {
        if (alive && cause instanceof Error && cause.message.includes('encerrada')) setError(cause.message);
      }
    }, 1500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [accepted, call, isProvider, send, session, startConnection]);

  useEffect(() => () => {
    peer.current?.close();
    localStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const acceptConsent = async () => {
    setError('');
    try {
      await call('consent');
      setAccepted(true);
      setSession((current) => current ? { ...current, status: isProvider ? 'active' : current.status } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível aceitar o consentimento.'); }
  };

  const closeRoom = async () => {
    try { await call(isProvider ? 'close' : 'leave'); } catch { /* fecha a interface mesmo se a rede cair */ }
    peer.current?.close();
    localStream.current?.getTracks().forEach((track) => track.stop());
    setConnected(false);
    setAccepted(false);
    setError('Atendimento encerrado.');
  };

  const reconnect = async () => {
    setError('');
    try {
      await call('reconnect');
      await startConnection(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reconectar.');
    }
  };

  if (!user && !guestToken) return <main className="min-h-screen grid place-items-center bg-muted/30 p-4"><Card className="max-w-md"><CardHeader><CardTitle>Entre para abrir a sala</CardTitle><CardDescription>A equipe da clínica precisa estar autenticada. Se você recebeu o convite, abra o link completo enviado pela clínica.</CardDescription></CardHeader><CardContent><Button asChild><Link to="/auth">Entrar na conta</Link></Button></CardContent></Card></main>;
  if (error && !session && !accepted) return <main className="min-h-screen grid place-items-center bg-muted/30 p-4"><Card className="max-w-md"><CardHeader><CardTitle>Sala indisponível</CardTitle><CardDescription>{error}</CardDescription></CardHeader></Card></main>;
  return <main className="min-h-screen bg-muted/30 p-4 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Video className="h-6 w-6" /></div><div><h1 className="text-2xl font-semibold">Teleconsulta</h1><p className="text-sm text-muted-foreground">Sala privada · sem gravação</p></div></header>
      {!accepted ? <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>{isProvider ? 'Preparar sala de atendimento' : 'Entrar na sala de espera'}</CardTitle><CardDescription>Confirme o consentimento antes de ativar câmera e microfone.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm">O áudio e o vídeo são transmitidos diretamente entre os dispositivos. Esta aplicação não grava a chamada. Sua conexão e o endereço de rede podem ser usados para estabelecer o canal de vídeo.</p></div>
        <div className="flex items-start gap-3"><Checkbox id="teleconsulta-consent" checked={consentChecked} onCheckedChange={(checked) => setConsentChecked(checked === true)} /><Label htmlFor="teleconsulta-consent" className="leading-5">Entendi como funciona a chamada e concordo em participar desta teleconsulta.</Label></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={!consentChecked || !session} onClick={acceptConsent}>{!session ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando sala</> : 'Aceitar e entrar'}</Button>
      </CardContent></Card> : <>
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent className="p-2"><video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full rounded-lg bg-black" aria-label="Vídeo da outra pessoa" /><p className="px-2 py-1 text-sm text-muted-foreground">{connected ? 'Chamada conectada' : 'Aguardando a outra pessoa entrar'}</p></CardContent></Card>
          <Card><CardContent className="p-2"><video ref={localVideo} autoPlay playsInline muted className="aspect-video w-full rounded-lg bg-black" aria-label="Prévia do seu vídeo" /><p className="px-2 py-1 text-sm text-muted-foreground">Sua câmera</p></CardContent></Card>
        </div>
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={reconnect}><Wifi className="mr-2 h-4 w-4" />Reconectar</Button>
          <Button variant="outline" size="icon" aria-label={muted ? 'Ativar microfone' : 'Silenciar microfone'} onClick={() => { const next = !muted; localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); }}>{muted ? <MicOff /> : <Mic />}</Button>
          <Button variant="outline" size="icon" aria-label={cameraOff ? 'Ativar câmera' : 'Desligar câmera'} onClick={() => { const next = !cameraOff; localStream.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); }}>{cameraOff ? <VideoOff /> : <Video />}</Button>
          <Button variant="destructive" onClick={closeRoom}><PhoneOff className="mr-2 h-4 w-4" />{isProvider ? 'Encerrar chamada' : 'Sair da sala'}</Button>
        </div>
      </>}
      <p className="text-center text-xs text-muted-foreground">Se não conseguir conectar, confirme as permissões da câmera e do microfone e tente novamente.</p>
    </div>
  </main>;
}
