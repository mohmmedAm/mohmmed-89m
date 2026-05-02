/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, FC } from 'react';
import { io, Socket } from 'socket.io-client';
import Peer from 'simple-peer';
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Wifi, 
  WifiOff, 
  Settings, 
  Users, 
  Volume2, 
  Radio 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Global polyfill for Buffer
import { Buffer } from 'buffer';
window.Buffer = Buffer;

interface PeerConnection {
  peerID: string;
  username: string;
  peer: Peer.Instance;
  stream: MediaStream | null;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [roomId, setRoomId] = useState('World_1');
  const [username, setUsername] = useState('Steve_' + Math.floor(Math.random() * 1000));
  const [serverUrl, setServerUrl] = useState(window.location.origin);
  const [isMuted, setIsMuted] = useState(false);
  const [isPTT, setIsPTT] = useState(false);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<PeerConnection[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Media Stream
  const initMedia = useCallback(async () => {
    try {
      const userStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setStream(userStream);
      streamRef.current = userStream;
      
      userStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted && (!isPTT || isPTTActive);
      });
    } catch (err) {
      console.error('Failed to get media stream:', err);
    }
  }, [isMuted, isPTT, isPTTActive]);

  const connectToServer = useCallback(() => {
    if (socketRef.current) socketRef.current.disconnect();

    const newSocket = io(serverUrl);
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setIsConnected(true);
      newSocket.emit('join-room', { roomId, username });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      peersRef.current.forEach(p => p.peer.destroy());
      peersRef.current = [];
      setPeers([]);
    });

    newSocket.on('all-users', (users: { id: string, name: string }[]) => {
      const newPeers: PeerConnection[] = [];
      users.forEach(({ id, name }) => {
        const peer = createPeer(id, newSocket.id!, streamRef.current!);
        newPeers.push({
          peerID: id,
          username: name,
          peer,
          stream: null
        });
      });
      peersRef.current = newPeers;
      setPeers(newPeers);
    });

    newSocket.on('user-joined', (payload: { signal: Peer.SignalData, callerId: string, username: string }) => {
      const peer = addPeer(payload.signal, payload.callerId, streamRef.current!);
      const peerObj = {
        peerID: payload.callerId,
        username: payload.username,
        peer,
        stream: null
      };
      
      peersRef.current.push(peerObj);
      setPeers(prev => [...prev, peerObj]);
    });

    newSocket.on('receiving-returned-signal', (payload: { signal: Peer.SignalData, id: string }) => {
      const item = peersRef.current.find(p => p.peerID === payload.id);
      if (item) {
        item.peer.signal(payload.signal);
      }
    });

    newSocket.on('user-left', (id: string) => {
      const item = peersRef.current.find(p => p.peerID === id);
      if (item) {
        item.peer.destroy();
      }
      const updatedPeers = peersRef.current.filter(p => p.peerID !== id);
      peersRef.current = updatedPeers;
      setPeers(updatedPeers);
    });

  }, [serverUrl, roomId, username]);

  function createPeer(userToSignal: string, callerId: string, stream: MediaStream) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on('signal', signal => {
      socketRef.current?.emit('sending-signal', { userToSignal, callerId, signal });
    });

    peer.on('stream', userStream => {
      setPeers(prev => prev.map(p => p.peerID === userToSignal ? { ...p, stream: userStream } : p));
    });

    return peer;
  }

  function addPeer(incomingSignal: Peer.SignalData, callerId: string, stream: MediaStream) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', signal => {
      socketRef.current?.emit('returning-signal', { signal, callerId });
    });

    peer.on('stream', userStream => {
      setPeers(prev => prev.map(p => p.peerID === callerId ? { ...p, stream: userStream } : p));
    });

    peer.signal(incomingSignal);

    return peer;
  }

  // Handle Mute/PTT Logic
  useEffect(() => {
    if (streamRef.current) {
      const isActuallyEnabled = !isMuted && (!isPTT || isPTTActive);
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isActuallyEnabled;
      });
    }
  }, [isMuted, isPTT, isPTTActive]);

  useEffect(() => {
    initMedia();
    const timer = setTimeout(() => {
      connectToServer();
    }, 1000);
    return () => {
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [initMedia, connectToServer]);

  // Handle PTT Keyboard/Touch Events
  const handlePTTDown = () => isPTT && setIsPTTActive(true);
  const handlePTTUp = () => isPTT && setIsPTTActive(false);

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#e1e1e1] font-sans selection:bg-[#3c8527]/30">
      {/* Minecraft-style Overlay */}
      <div className="fixed inset-0 pointer-events-none border-[12px] border-[#313131] z-50 mix-blend-overlay opacity-20" />

      <main className="relative z-10 max-w-lg mx-auto px-6 py-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#e1e1e1] flex items-center gap-3">
              <div className="w-10 h-10 bg-[#3c8527] border-b-4 border-[#245218] rounded flex items-center justify-center p-1 shadow-inner">
                <img src="https://api.iconify.design/mdi:minecraft.svg" className="w-8 h-8 invert opacity-80" alt="MC" />
              </div>
              <span>DROIDVOICE <span className="text-[#3c8527] ml-1">BE</span></span>
            </h1>
            <p className="text-[10px] text-[#8b8b8b] font-mono mt-1 uppercase tracking-widest leading-none">
              In-Game Link: {isConnected ? "CONNECTED" : "OFFLINE"}
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 bg-[#313131] border-2 border-[#4a4a4a] hover:bg-[#3a3a3a] rounded transition-transform active:scale-95"
          >
            <Settings className="w-5 h-5 text-[#8b8b8b]" />
          </button>
        </header>

        {/* Global Connection Info */}
        <div className="bg-[#313131] border-2 border-[#414141] p-1 mb-6 shadow-2xl">
          <div className="flex items-center justify-between bg-[#252525] px-4 py-2 border-2 border-t-[#151515] border-l-[#151515] border-r-[#4a4a4a] border-b-[#4a4a4a]">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-sm shadow-sm",
                isConnected ? "bg-[#3c8527] animate-pulse" : "bg-[#bf2e2e]"
              )} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[#8b8b8b] uppercase tracking-tighter">Current World</span>
                <span className="text-xs font-medium text-[#e1e1e1] leading-none">{roomId}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-[#8b8b8b] uppercase tracking-tighter">Player</span>
              <span className="block text-xs font-medium text-[#d4af37] leading-none">{username}</span>
            </div>
          </div>
        </div>

        {/* Main Action Area */}
        <section className="space-y-6 mb-8">
          {!isConnected ? (
            <button 
              onClick={connectToServer}
              className="w-full py-4 bg-[#3c8527] hover:bg-[#4ea632] text-white border-b-4 border-[#245218] active:border-b-2 active:translate-y-0.5 rounded font-bold flex items-center justify-center gap-3 transition-colors shadow-lg"
            >
              <Phone className="w-5 h-5" /> START VOICE LINK
            </button>
          ) : (
            <button 
              onClick={() => socket?.disconnect()}
              className="w-full py-4 bg-[#bf2e2e] hover:bg-[#df3e3e] text-white border-b-4 border-[#7a1e1e] active:border-b-2 active:translate-y-0.5 rounded font-bold flex items-center justify-center gap-3 transition-colors"
            >
              <PhoneOff className="w-5 h-5" /> TERMINATE LINK
            </button>
          )}

          {/* Controls Grid */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              disabled={isPTT}
              className={cn(
                "py-6 bg-[#313131] border-2 rounded flex flex-col items-center gap-2 transition-all active:translate-y-0.5",
                isMuted ? "border-[#bf2e2e] text-[#bf2e2e]" : "border-[#4a4a4a] text-[#e1e1e1]",
                isPTT && "opacity-30 cursor-not-allowed border-transparent"
              )}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              <span className="text-[10px] font-bold uppercase tracking-widest">{isMuted ? "Muted" : "Active"}</span>
            </button>

            <button 
              onClick={() => setIsPTT(!isPTT)}
              className={cn(
                "py-6 bg-[#313131] border-2 rounded flex flex-col items-center gap-2 transition-all active:translate-y-0.5",
                isPTT ? "border-[#d4af37] text-[#d4af37]" : "border-[#4a4a4a] text-[#e1e1e1]"
              )}
            >
              <Radio className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-widest">PTT MODE</span>
            </button>
          </div>
        </section>

        {/* PTT Trigger */}
        <AnimatePresence>
          {isPTT && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="mb-8"
            >
              <button 
                onMouseDown={handlePTTDown}
                onMouseUp={handlePTTUp}
                onTouchStart={handlePTTDown}
                onTouchEnd={handlePTTUp}
                className={cn(
                  "w-full h-40 bg-[#313131] border-4 flex flex-col items-center justify-center gap-4 transition-all rounded-xl active:scale-[0.99]",
                  isPTTActive 
                    ? "bg-[#3c8527] border-[#fff]/20 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]" 
                    : "border-[#4a4a4a] opacity-60 grayscale-[0.5]"
                )}
              >
                <div className={cn(
                  "w-16 h-16 bg-[#252525] border-2 rounded-full flex items-center justify-center transition-all",
                  isPTTActive ? "border-white/40 scale-110" : "border-[#4a4a4a]"
                )}>
                  <Mic className={cn("w-8 h-8 transition-colors", isPTTActive ? "text-white" : "text-[#4a4a4a]")} />
                </div>
                <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", isPTTActive ? "text-white animate-pulse" : "text-[#8b8b8b]")}>
                  {isPTTActive ? "TRANSMITTING..." : "HOLD TO TALK"}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Volume & Audio Players */}
        <section className="bg-[#313131] border-2 border-[#4a4a4a] rounded shadow-inner p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#8b8b8b]" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#8b8b8b]">Master Output</span>
            </div>
            <span className="text-xs font-mono text-[#d4af37]">{Math.round(volume * 100)}%</span>
          </div>
          <input 
            type="range" min="0" max="1" step="0.01" 
            value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full accent-[#3c8527] h-2 bg-[#1e1e1e] rounded appearance-none cursor-pointer border border-[#4a4a4a]"
          />
        </section>

        {/* Player List */}
        <section className="flex-1">
          <div className="flex items-center justify-between mb-4 border-b border-[#313131] pb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#8b8b8b]" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#8b8b8b]">Players Nearby</span>
            </div>
            <span className="text-[10px] font-mono text-[#8b8b8b] bg-[#313131] px-2 py-0.5 rounded">Count: {peers.length + (isConnected ? 1 : 0)}</span>
          </div>
          
          <div className="space-y-2">
            {isConnected && (
              <div className="group bg-[#252525] border-2 border-[#313131] p-3 rounded flex items-center justify-between hover:border-[#3c8527]/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img 
                      src={`https://api.mineatar.io/face/${username}?scale=8`} 
                      className="w-10 h-10 pixelated bg-[#3c8527] p-0.5 rounded-sm"
                      onError={(e) => { e.currentTarget.src = "https://api.mineatar.io/face/Steve?scale=8" }}
                      alt="Skin"
                    />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#3c8527] border-2 border-[#252525] rounded-full" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#e1e1e1]">{username}</p>
                    <p className="text-[9px] text-[#8b8b8b] uppercase tracking-tighter">(LOCAL USER)</p>
                  </div>
                </div>
                <div className="flex gap-1 h-4 items-end">
                  {(!isMuted && (!isPTT || isPTTActive)) && (
                    <motion.div animate={{ height: [4, 12, 6, 14, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1 bg-[#3c8527]" />
                  )}
                </div>
              </div>
            )}

            {peers.map((peer) => (
              <PeerAudio key={peer.peerID} peer={peer} volume={volume} />
            ))}

            {peers.length === 0 && !isConnected && (
              <div className="py-12 text-center opacity-20">
                <img src="https://api.iconify.design/mdi:account-off.svg" className="w-12 h-12 mx-auto mb-2 invert" alt="" />
                <p className="text-xs uppercase font-bold tracking-[0.2em]">Disconnected from World</p>
              </div>
            )}
          </div>
        </section>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
            >
              <div className="w-full max-w-sm bg-[#313131] border-2 border-[#4a4a4a] p-1 shadow-2xl">
                <div className="bg-[#252525] p-6 border-2 border-t-[#151515] border-l-[#151515] border-r-[#4a4a4a] border-b-[#4a4a4a]">
                  <h3 className="text-xl font-bold mb-6 text-[#e1e1e1] uppercase tracking-wider">World Settings</h3>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-[#8b8b8b] uppercase tracking-[0.2em] mb-2">Minecraft IGN</label>
                      <input 
                        type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-[#1e1e1e] border-2 border-[#4a4a4a] px-4 py-3 text-sm focus:outline-none focus:border-[#d4af37]"
                        placeholder="Steve"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#8b8b8b] uppercase tracking-[0.2em] mb-2">Voice Server Link</label>
                      <input 
                        type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
                        className="w-full bg-[#1e1e1e] border-2 border-[#4a4a4a] px-4 py-3 text-sm focus:outline-none focus:border-[#d4af37]"
                        placeholder="http://192.168.1.1:3000"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#8b8b8b] uppercase tracking-[0.2em] mb-2">Room ID</label>
                      <input 
                        type="text" value={roomId} onChange={(e) => setRoomId(e.target.value)}
                        className="w-full bg-[#1e1e1e] border-2 border-[#4a4a4a] px-4 py-3 text-sm focus:outline-none focus:border-[#d4af37]"
                        placeholder="Default_World"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => { setShowSettings(false); socket?.disconnect(); }}
                    className="w-full mt-8 py-4 bg-[#3c8527] text-white border-b-4 border-[#245218] active:border-b-2 active:translate-y-0.5 rounded font-bold uppercase tracking-widest"
                  >
                    SAVE & RECONNECT
                  </button>
                  
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full mt-2 py-2 text-[#8b8b8b] text-[10px] font-bold uppercase tracking-widest hover:text-[#e1e1e1]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        .pixelated {
          image-rendering: pixelated;
        }
      `}</style>
    </div>
  );
}

const PeerAudio: FC<{ peer: PeerConnection; volume: number }> = ({ peer, volume }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (audioRef.current && peer.stream) {
      audioRef.current.srcObject = peer.stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(peer.stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setIsSpeaking(average > 10);
        animationRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();

      return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        audioContext.close();
      };
    }
  }, [peer.stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  return (
    <div className={cn(
      "bg-[#252525] border-2 p-3 rounded flex items-center justify-between transition-all duration-300",
      isSpeaking ? "border-[#3c8527] bg-[#253022]" : "border-[#313131]"
    )}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <img 
            src={`https://api.mineatar.io/face/${peer.username}?scale=8`} 
            className={cn(
              "w-10 h-10 pixelated p-0.5 rounded-sm transition-all",
              isSpeaking ? "bg-[#3c8527] shadow-[0_0_10px_rgba(60,133,39,0.5)]" : "bg-[#313131]"
            )}
            onError={(e) => { e.currentTarget.src = "https://api.mineatar.io/face/Steve?scale=8" }}
            alt="NPC"
          />
          {isSpeaking && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#3c8527] border-2 border-[#222] rounded-full animate-pulse" />}
        </div>
        <div>
          <p className="text-sm font-bold text-[#e1e1e1]">{peer.username}</p>
          <p className={cn("text-[9px] uppercase font-bold tracking-tighter", isSpeaking ? "text-[#3c8527]" : "text-[#8b8b8b]")}>
            {isSpeaking ? "• Speaking" : "Idle"}
          </p>
        </div>
      </div>
      <audio ref={audioRef} autoPlay />
      <div className="flex gap-1 h-4 items-center">
        {[0, 1, 2, 3, 4].map(i => (
          <motion.div 
            key={i}
            animate={{ 
              height: isSpeaking ? [4, 14, 8, 18, 4][i % 5] : 4,
              opacity: isSpeaking ? 1 : 0.2
            }}
            transition={{ repeat: Infinity, duration: 0.4, delay: i * 0.05 }}
            className="w-1 bg-[#3c8527] rounded-sm"
          />
        ))}
      </div>
    </div>
  );
}
