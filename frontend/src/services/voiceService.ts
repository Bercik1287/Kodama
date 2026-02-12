// ──────────────────────────────────────────────
// WebRTC Voice Service
// Zarządza połączeniami peer-to-peer i strumieniami audio
// ──────────────────────────────────────────────

export interface VoicePeer {
  userId: number;
  username: string;
  muted: boolean;
  connection?: RTCPeerConnection;
  stream?: MediaStream;
}

type VoiceEventType =
  | 'peers-updated'
  | 'connected'
  | 'disconnected'
  | 'error';

type VoiceEventCallback = (data?: unknown) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class VoiceService {
  private ws: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private peers: Map<number, VoicePeer> = new Map();
  private channelId: number | null = null;
  private myUserId: number = 0;
  private myUsername: string = '';
  private isMuted: boolean = false;
  private listeners: Map<VoiceEventType, Set<VoiceEventCallback>> = new Map();
  private audioElements: Map<number, HTMLAudioElement> = new Map();

  // ── Event system ──

  on(event: VoiceEventType, callback: VoiceEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: VoiceEventType, callback: VoiceEventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: VoiceEventType, data?: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  // ── Public API ──

  async join(channelId: number, userId: number, username: string): Promise<void> {
    // Jeśli już połączony — rozłącz
    if (this.ws) {
      await this.leave();
    }

    this.channelId = channelId;
    this.myUserId = userId;
    this.myUsername = username;
    this.isMuted = false;

    // 1. Pobierz mikrofon
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (err) {
      this.emit('error', 'Nie udało się uzyskać dostępu do mikrofonu');
      throw err;
    }

    // 2. Połącz WebSocket
    const token = localStorage.getItem('kodama-token');
    if (!token) {
      this.cleanup();
      throw new Error('Brak tokenu autoryzacji');
    }

    const apiBase = import.meta.env.VITE_API_URL || '';
    let wsUrl: string;

    if (apiBase.startsWith('http')) {
      // Produkcja: https://backend.render.com/api -> wss://backend.render.com/api/ws/voice/...
      wsUrl = apiBase.replace(/^http/, 'ws') + `/ws/voice/${channelId}?token=${token}`;
    } else {
      // Dev: proxy przez Vite
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/api/ws/voice/${channelId}?token=${token}`;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Voice] WebSocket connected');
        this.emit('connected');
        resolve();
      };

      this.ws.onerror = (e) => {
        console.error('[Voice] WebSocket error:', e);
        this.emit('error', 'Błąd połączenia WebSocket');
        reject(e);
      };

      this.ws.onclose = () => {
        console.log('[Voice] WebSocket closed');
        this.cleanup();
        this.emit('disconnected');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleSignalingMessage(msg);
        } catch (err) {
          console.error('[Voice] Failed to parse message:', err);
        }
      };
    });
  }

  async leave(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.cleanup();
    this.emit('disconnected');
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;

    // Wycisz/odcisz lokalny stream
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    // Powiadom pozostałych przez WebSocket
    this.sendSignal({
      type: 'mute-state',
      from: this.myUserId,
      from_name: this.myUsername,
      to: 0,
      muted: muted,
      channel_id: this.channelId || 0,
      payload: null,
    });

    this.emit('peers-updated');
  }

  getPeers(): VoicePeer[] {
    return Array.from(this.peers.values());
  }

  getMyMuteState(): boolean {
    return this.isMuted;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Signaling ──

  private async handleSignalingMessage(msg: {
    type: string;
    from: number;
    from_name: string;
    to: number;
    payload: unknown;
    channel_id: number;
    muted: boolean;
  }) {
    switch (msg.type) {
      case 'room-peers': {
        // Lista istniejących peerów — tworzymy offer do każdego
        const peers = msg.payload as Array<{
          user_id: number;
          username: string;
          muted: boolean;
        }>;
        console.log(`[Voice] Room has ${peers.length} existing peers`);
        for (const peer of peers) {
          await this.createPeerConnection(peer.user_id, peer.username, peer.muted, true);
        }
        break;
      }

      case 'peer-joined': {
        // Nowy peer — czekamy na jego offer
        console.log(`[Voice] Peer joined: ${msg.from_name} (${msg.from})`);
        // Peer joined, ale to ON wyśle nam offer (bo dostał room-peers)
        break;
      }

      case 'peer-left': {
        console.log(`[Voice] Peer left: ${msg.from_name} (${msg.from})`);
        this.removePeer(msg.from);
        this.emit('peers-updated');
        break;
      }

      case 'offer': {
        console.log(`[Voice] Received offer from ${msg.from}`);
        await this.handleOffer(msg.from, msg.from_name, msg.payload as RTCSessionDescriptionInit);
        break;
      }

      case 'answer': {
        console.log(`[Voice] Received answer from ${msg.from}`);
        await this.handleAnswer(msg.from, msg.payload as RTCSessionDescriptionInit);
        break;
      }

      case 'ice-candidate': {
        await this.handleIceCandidate(msg.from, msg.payload as RTCIceCandidateInit);
        break;
      }

      case 'mute-state': {
        const peer = this.peers.get(msg.from);
        if (peer) {
          peer.muted = msg.muted;
          this.emit('peers-updated');
        }
        break;
      }
    }
  }

  private async createPeerConnection(
    remoteUserId: number,
    remoteUsername: string,
    remoteMuted: boolean,
    createOffer: boolean
  ): Promise<RTCPeerConnection> {
    // Zamknij istniejące połączenie jeśli jest
    this.removePeer(remoteUserId);

    const pc = new RTCPeerConnection(ICE_SERVERS);

    const peer: VoicePeer = {
      userId: remoteUserId,
      username: remoteUsername,
      muted: remoteMuted,
      connection: pc,
    };
    this.peers.set(remoteUserId, peer);

    // Dodaj lokalny stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Obsłuż remote stream
    pc.ontrack = (event) => {
      console.log(`[Voice] Got remote track from ${remoteUsername}`);
      const remoteStream = event.streams[0];
      peer.stream = remoteStream;

      // Odtwarzaj audio
      this.playRemoteAudio(remoteUserId, remoteStream);
      this.emit('peers-updated');
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          from: this.myUserId,
          from_name: this.myUsername,
          to: remoteUserId,
          payload: event.candidate.toJSON(),
          channel_id: this.channelId || 0,
          muted: this.isMuted,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Voice] Connection state with ${remoteUsername}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Będzie obsłużone przez peer-left z WebSocket
      }
    };

    // Tworzymy offer jeśli to my inicjujemy (jesteśmy nowym peerem)
    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal({
        type: 'offer',
        from: this.myUserId,
        from_name: this.myUsername,
        to: remoteUserId,
        payload: pc.localDescription!.toJSON(),
        channel_id: this.channelId || 0,
        muted: this.isMuted,
      });
    }

    this.emit('peers-updated');
    return pc;
  }

  private async handleOffer(
    fromUserId: number,
    fromUsername: string,
    offer: RTCSessionDescriptionInit
  ) {
    const pc = await this.createPeerConnection(fromUserId, fromUsername, false, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignal({
      type: 'answer',
      from: this.myUserId,
      from_name: this.myUsername,
      to: fromUserId,
      payload: pc.localDescription!.toJSON(),
      channel_id: this.channelId || 0,
      muted: this.isMuted,
    });
  }

  private async handleAnswer(fromUserId: number, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(fromUserId);
    if (peer?.connection) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleIceCandidate(fromUserId: number, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(fromUserId);
    if (peer?.connection) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[Voice] Failed to add ICE candidate:', err);
      }
    }
  }

  // ── Audio playback ──

  private playRemoteAudio(userId: number, stream: MediaStream) {
    // Usuń stary element audio
    const existing = this.audioElements.get(userId);
    if (existing) {
      existing.srcObject = null;
      existing.remove();
    }

    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
    // Nie dodajemy do DOM — Audio() działa bez tego
    audio.play().catch((err) => {
      console.warn('[Voice] Autoplay blocked:', err);
    });

    this.audioElements.set(userId, audio);
  }

  // ── Helpers ──

  private sendSignal(msg: {
    type: string;
    from: number;
    from_name: string;
    to: number;
    payload: unknown;
    channel_id: number;
    muted: boolean;
  }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private removePeer(userId: number) {
    const peer = this.peers.get(userId);
    if (peer) {
      peer.connection?.close();
      const audio = this.audioElements.get(userId);
      if (audio) {
        audio.srcObject = null;
        audio.remove();
        this.audioElements.delete(userId);
      }
      this.peers.delete(userId);
    }
  }

  private cleanup() {
    // Zamknij wszystkie połączenia peer
    this.peers.forEach((_, userId) => this.removePeer(userId));
    this.peers.clear();

    // Zatrzymaj lokalny stream (mikrofon)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Zamknij WebSocket
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.channelId = null;
    this.isMuted = false;

    // Wyczyść elementy audio
    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();
  }
}

// Singleton — jedna instancja na całą aplikację
export const voiceService = new VoiceService();
