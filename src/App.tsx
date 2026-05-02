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
  peer: Peer.Instance;
  stream: MediaStream | null;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [roomId, setRoomId] = useState('lobby');
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
      
      // Initial mute state
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
      newSocket.emit('join-room', roomId);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      // Cleanup peers on disconnect
      peersRef.current.forEach(p => p.peer.destroy());
      peersRef.current = [];
      setPeers([]);
    });

    newSocket.on('all-users', (users: string[]) => {
      const newPeers: PeerConnection[] = [];
      users.forEach(userID => {
        const peer = createPeer(userID, newSocket.id!, streamRef.current!);
        newPeers.push({
          peerID: userID,
          peer,
          stream: null
        });
      });
      peersRef.current = newPeers;
      setPeers(newPeers);
    });

    newSocket.on('user-joined', (payload: { signal: Peer.SignalData, callerId: string }) => {
      const peer = addPeer(payload.signal, payload.callerId, streamRef.current!);
      const peerObj = {
        peerID: payload.callerId,
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

  }, [serverUrl, roomId]);

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
    <div className="min-h-screen bg-[#0a0a0b] text-white font-sans selection:bg-orange-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden h-screen">
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-orange-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-lg mx-auto px-6 py-12 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              DROIDVOICE
            </h1>
            <p className="text-xs text-gray-400 font-mono mt-1 tracking-widest uppercase">
              Secure Voice Channel
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/10"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        {/* Status Card */}
        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-medium text-gray-400 uppercase tracking-widest">Status</span>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all",
              isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            )}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? "CONNECTED" : "DISCONNECTED"}
            </div>
          </div>
          
          <div className="flex flex-col items-center py-4">
            <h2 className="text-xl font-medium mb-1">{roomId}</h2>
            <p className="text-xs text-gray-500 font-mono">{serverUrl}</p>
          </div>

          <div className="mt-8 flex gap-4">
            {!isConnected ? (
              <button 
                onClick={connectToServer}
                className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-orange-900/20"
              >
                <Phone className="w-5 h-5" /> JOIN CHANNEL
              </button>
            ) : (
              <button 
                onClick={() => socket?.disconnect()}
                className="w-full py-4 bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-500/30 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <PhoneOff className="w-5 h-5" /> LEAVE
              </button>
            )}
          </div>
        </section>

        {/* Controls */}
        <section className="grid grid-cols-2 gap-4 mb-8">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            disabled={isPTT}
            className={cn(
              "p-6 rounded-3xl flex flex-col items-center gap-3 transition-all border",
              isMuted ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-white/5 border-white/10 text-white",
              isPTT && "opacity-30 cursor-not-allowed"
            )}
          >
            {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            <span className="text-xs font-bold uppercase tracking-widest">{isMuted ? "Muted" : "Live"}</span>
          </button>

          <button 
            onClick={() => setIsPTT(!isPTT)}
            className={cn(
              "p-6 rounded-3xl flex flex-col items-center gap-3 transition-all border",
              isPTT ? "bg-orange-500/10 border-orange-500/20 text-orange-500" : "bg-white/5 border-white/10 text-white"
            )}
          >
            <Radio className="w-8 h-8" />
            <span className="text-xs font-bold uppercase tracking-widest">{isPTT ? "PTT ON" : "PTT OFF"}</span>
          </button>
        </section>

        {/* PTT Large Button */}
        <AnimatePresence>
          {isPTT && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="mb-8"
            >
              <button 
                onMouseDown={handlePTTDown}
                onMouseUp={handlePTTUp}
                onTouchStart={handlePTTDown}
                onTouchEnd={handlePTTUp}
                className={cn(
                  "w-full h-48 rounded-[3rem] border-2 flex flex-col items-center justify-center gap-4 transition-all active:scale-[0.98]",
                  isPTTActive 
                    ? "bg-orange-500 border-orange-400 shadow-[0_0_50px_rgba(249,115,22,0.4)]" 
                    : "bg-white/5 border-white/10 grayscale opacity-50"
                )}
              >
                <div className={cn(
                  "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all",
                  isPTTActive ? "bg-white border-white/20 scale-110" : "border-white/10"
                )}>
                  <Mic className={cn("w-10 h-10 transition-colors", isPTTActive ? "text-orange-600" : "text-white/20")} />
                </div>
                <span className={cn("text-sm font-bold uppercase tracking-[0.2em]", isPTTActive ? "text-white" : "text-white/20")}>
                  {isPTTActive ? "Transmitting..." : "Push to Talk"}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Volume */}
        <section className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Volume Control</span>
            </div>
            <span className="text-xs font-mono">{Math.round(volume * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full accent-orange-600 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
          />
        </section>

        {/* Peer List */}
        <section className="flex-1">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Active Peers ({peers.length + (isConnected ? 1 : 0)})</span>
          </div>
          
          <div className="space-y-3">
            {isConnected && (
              <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-600/20 rounded-xl flex items-center justify-center">
                    <span className="text-orange-500 font-bold">ME</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Local User</p>
                    <p className="text-[10px] text-gray-500 font-mono tracking-tighter opacity-50 uppercase">Broadcast: {isMuted ? 'Muted' : (isPTT && !isPTTActive) ? 'Idle' : 'Active'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {(!isMuted && (!isPTT || isPTTActive)) && (
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }} 
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-2 h-2 bg-emerald-500 rounded-full" 
                    />
                  )}
                </div>
              </div>
            )}

            {peers.map((peer) => (
              <PeerAudio 
                key={peer.peerID} 
                peer={peer} 
                volume={volume} 
              />
            ))}

            {peers.length === 0 && !isConnected && (
              <div className="py-12 flex flex-col items-center opacity-30">
                <Users className="w-12 h-12 mb-4" />
                <p className="text-sm font-medium">No one in channel</p>
              </div>
            )}
          </div>
        </section>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            >
              <div className="w-full max-w-sm bg-[#151518] border border-white/10 rounded-[2rem] p-8">
                <h3 className="text-xl font-bold mb-6">Channel Settings</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Server Address</label>
                    <input 
                      type="text" 
                      value={serverUrl} 
                      onChange={(e) => setServerUrl(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="http://192.168.1.1:3000"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Room Name</label>
                    <input 
                      type="text" 
                      value={roomId} 
                      onChange={(e) => setRoomId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="e.g. general"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full mt-8 py-4 bg-white text-black rounded-2xl font-bold transition-all active:scale-95"
                >
                  SAVE & CLOSE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
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
      "p-4 bg-white/5 border rounded-2xl flex items-center justify-between transition-all duration-300",
      isSpeaking ? "border-orange-500/50 bg-orange-500/5 shadow-[0_0_20px_rgba(249,115,22,0.1)]" : "border-white/5"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
          isSpeaking ? "bg-orange-600 shadow-lg shadow-orange-900/40" : "bg-white/10"
        )}>
          <span className={cn("font-bold text-xs uppercase", isSpeaking ? "text-white" : "text-gray-400")}>
            {peer.peerID.slice(0, 2)}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium">User_{peer.peerID.slice(0, 4)}</p>
          <p className="text-[10px] text-gray-500 font-mono uppercase">
            {isSpeaking ? "• Speaking..." : "Status: Connected"}
          </p>
        </div>
      </div>
      <audio ref={audioRef} autoPlay />
      <div className="flex gap-1 h-4 items-center">
        {[0, 1, 2, 3, 4].map(i => (
          <motion.div 
            key={i}
            animate={{ 
              height: isSpeaking ? [4, 12, 6, 16, 4][i % 5] : 4,
              opacity: isSpeaking ? 1 : 0.3
            }}
            transition={{ 
              repeat: Infinity, 
              duration: 0.4,
              delay: i * 0.05
            }}
            className="w-1 bg-orange-500 rounded-full"
          />
        ))}
      </div>
    </div>
  );
}
