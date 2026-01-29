
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TimerStatus, TrainingSettings, Callout } from './types';
import { generateAndPlayCallout, getAudioContext, getAvailableVoices } from './services/audioService';
import { 
  Play, 
  Square, 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Activity, 
  Volume2,
  X,
  Download,
  RotateCcw,
  Pause
} from 'lucide-react';

const DEFAULT_CALLOUTS: Callout[] = [
  { id: '1', text: '1', active: true },
  { id: '2', text: '2', active: true },
  { id: '3', text: 'Left', active: true },
  { id: '4', text: 'Right', active: true },
  { id: '5', text: 'Pivot in', active: true },
  { id: '6', text: 'Pivot out', active: true },
  { id: '7', text: '12', active: true },
  { id: '8', text: '32', active: true },
];

const App: React.FC = () => {
  const [settings, setSettings] = useState<TrainingSettings>({
    roundCount: 3,
    roundDuration: 180,
    restDuration: 60,
    prepDuration: 10,
    calloutFrequency: 2,
    calloutFrequencyRandomness: 1.5,
    voiceName: undefined,
  });

  const [callouts, setCallouts] = useState<Callout[]>(DEFAULT_CALLOUTS);
  const [status, setStatus] = useState<TimerStatus>(TimerStatus.IDLE);
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(settings.prepDuration);
  const [newCalloutText, setNewCalloutText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextCalloutTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const prevStatusRef = useRef<TimerStatus>(TimerStatus.IDLE);

  // Screen Wake Lock API management
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Wake Lock active');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock was released');
        });
      } catch (err: any) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('Wake Lock released manually');
    }
  }, []);

  // Re-acquire wake lock if tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (status !== TimerStatus.IDLE && status !== TimerStatus.FINISHED && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status, requestWakeLock]);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const loadVoices = () => {
      const voices = getAvailableVoices();
      setAvailableVoices(voices);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const triggerCallout = useCallback((text: string) => {
    setIsCalling(true);
    generateAndPlayCallout(text, settings.voiceName);
    setTimeout(() => setIsCalling(false), 1000);
  }, [settings.voiceName]);

  const handleStart = () => {
    getAudioContext().resume();
    triggerCallout("Fight!");
    setStatus(TimerStatus.PREPARE);
    setTimeLeft(settings.prepDuration);
    setCurrentRound(1);
    requestWakeLock();
  };

  const handlePause = () => {
    prevStatusRef.current = status;
    setStatus(TimerStatus.PAUSED);
    window.speechSynthesis.cancel();
  };

  const handleResume = () => {
    // Return to whatever the status was before pausing
    setStatus(prevStatusRef.current !== TimerStatus.PAUSED ? prevStatusRef.current : TimerStatus.WORK);
  };

  const handleStop = () => {
    setStatus(TimerStatus.IDLE);
    window.speechSynthesis.cancel();
    releaseWakeLock();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleRestart = () => {
    handleStop();
    setTimeout(() => handleStart(), 100);
  };

  const addCallout = () => {
    if (!newCalloutText.trim()) return;
    setCallouts([...callouts, { id: Date.now().toString(), text: newCalloutText.trim(), active: true }]);
    setNewCalloutText('');
  };

  const getRandomCallout = useCallback(() => {
    const activeOnes = callouts.filter(c => c.active);
    if (activeOnes.length === 0) return null;
    return activeOnes[Math.floor(Math.random() * activeOnes.length)];
  }, [callouts]);

  useEffect(() => {
    if (status === TimerStatus.IDLE || status === TimerStatus.FINISHED || status === TimerStatus.PAUSED) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (status === TimerStatus.PREPARE) {
            setStatus(TimerStatus.WORK);
            nextCalloutTimeRef.current = settings.calloutFrequency;
            return settings.roundDuration;
          } else if (status === TimerStatus.WORK) {
            if (currentRound < settings.roundCount) {
              triggerCallout("Rest");
              setStatus(TimerStatus.REST);
              return settings.restDuration;
            } else {
              triggerCallout("Workout Complete");
              setStatus(TimerStatus.FINISHED);
              releaseWakeLock();
              return 0;
            }
          } else if (status === TimerStatus.REST) {
            setCurrentRound(r => r + 1);
            triggerCallout("Round " + (currentRound + 1));
            setStatus(TimerStatus.WORK);
            nextCalloutTimeRef.current = settings.calloutFrequency;
            return settings.roundDuration;
          }
        }

        if (status === TimerStatus.WORK) {
            const currentWorkTime = settings.roundDuration - (prev - 1);
            if (currentWorkTime >= nextCalloutTimeRef.current) {
                const callout = getRandomCallout();
                if (callout) {
                    triggerCallout(callout.text);
                }
                const jitter = (Math.random() - 0.5) * settings.calloutFrequencyRandomness;
                nextCalloutTimeRef.current = currentWorkTime + settings.calloutFrequency + jitter;
            }
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, currentRound, settings, getRandomCallout, triggerCallout, releaseWakeLock]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center p-4 md:p-8 overflow-x-hidden safe-area-inset-top">
      <header className="w-full max-w-5xl flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)]">
            <Activity className="text-white w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bebas tracking-wider text-white leading-none">
              MUAY THAI <span className="text-red-600">SHADOW BOX</span>
            </h1>
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
              {isStandalone ? 'Local Native Mode' : 'Web Preview Mode'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {deferredPrompt && !isStandalone && (
            <button 
              onClick={handleInstallClick}
              className="p-3 bg-red-600 rounded-xl hover:bg-red-700 transition-all border border-red-500 shadow-lg group flex items-center gap-2"
            >
              <Download className="w-5 h-5 text-white animate-bounce" />
              <span className="hidden sm:inline font-bebas text-white tracking-widest">Install</span>
            </button>
          )}
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-zinc-900/50 rounded-xl hover:bg-zinc-800 transition-all border border-zinc-800 group"
          >
            <SettingsIcon className="w-6 h-6 text-zinc-400 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className={`relative w-full aspect-square md:aspect-video bg-zinc-900/40 rounded-[2.5rem] border-2 transition-all duration-300 flex flex-col items-center justify-center overflow-hidden shadow-2xl ${isCalling ? 'border-red-600 scale-[1.01] shadow-[0_0_60px_rgba(220,38,38,0.15)]' : 'border-zinc-800'}`}>
            <div className="absolute top-10 left-10">
              <span className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest block mb-1">Current Round</span>
              <div className="text-5xl font-bebas text-white">
                {currentRound} <span className="text-zinc-700">/ {settings.roundCount}</span>
              </div>
            </div>

            <div className={`absolute top-10 right-10 font-bebas text-2xl uppercase tracking-[0.2em] px-4 py-1 rounded-full border ${status === TimerStatus.WORK ? 'text-red-600 border-red-600/30 bg-red-600/5' : status === TimerStatus.PAUSED ? 'text-amber-500 border-amber-500/30 bg-amber-500/5' : 'text-zinc-500 border-zinc-800'}`}>
              {status === TimerStatus.IDLE ? 'Standby' : status}
            </div>

            <div className={`text-[120px] md:text-[200px] font-bebas leading-none select-none transition-colors duration-500 ${status === TimerStatus.WORK ? 'text-white' : status === TimerStatus.PAUSED ? 'text-amber-500/80' : 'text-zinc-700'}`}>
              {formatTime(timeLeft)}
            </div>

            <div className="absolute bottom-12 flex flex-wrap justify-center gap-4 z-10 px-4">
              {status === TimerStatus.IDLE || status === TimerStatus.FINISHED ? (
                <button 
                  onClick={handleStart}
                  className="bg-red-600 hover:bg-red-700 text-white px-12 py-4 rounded-2xl transition-all hover:scale-105 shadow-[0_0_40px_rgba(220,38,38,0.4)] flex items-center gap-3 font-bebas text-2xl tracking-widest"
                >
                  <Play className="w-6 h-6 fill-current" />
                  Begin Training
                </button>
              ) : status === TimerStatus.PAUSED ? (
                <>
                  <button 
                    onClick={handleResume}
                    className="bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-2xl transition-all hover:scale-105 shadow-[0_0_40px_rgba(220,38,38,0.4)] flex items-center gap-3 font-bebas text-2xl tracking-widest"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Resume
                  </button>
                  <button 
                    onClick={handleRestart}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-10 py-4 rounded-2xl transition-all hover:scale-105 flex items-center gap-3 font-bebas text-2xl tracking-widest border border-zinc-700"
                  >
                    <RotateCcw className="w-6 h-6" />
                    Restart
                  </button>
                  <button 
                    onClick={handleStop}
                    className="bg-zinc-100 hover:bg-white text-zinc-900 px-10 py-4 rounded-2xl transition-all hover:scale-105 flex items-center gap-3 font-bebas text-2xl tracking-widest"
                  >
                    <Square className="w-6 h-6 fill-current" />
                    Stop
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={handlePause}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-12 py-4 rounded-2xl transition-all hover:scale-105 flex items-center gap-3 font-bebas text-2xl tracking-widest border border-zinc-700"
                  >
                    <Pause className="w-6 h-6 fill-current" />
                    Pause
                  </button>
                  <button 
                    onClick={handleStop}
                    className="bg-zinc-100 hover:bg-white text-zinc-900 px-12 py-4 rounded-2xl transition-all hover:scale-105 flex items-center gap-3 font-bebas text-2xl tracking-widest"
                  >
                    <Square className="w-6 h-6 fill-current" />
                    Stop
                  </button>
                </>
              )}
            </div>

            <div className={`absolute bottom-0 left-0 h-1.5 transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(220,38,38,0.8)] ${status === TimerStatus.PAUSED ? 'bg-amber-500' : 'bg-red-600'}`} 
                 style={{ width: `${(timeLeft / (status === TimerStatus.WORK ? settings.roundDuration : status === TimerStatus.REST ? settings.restDuration : settings.prepDuration)) * 100}%` }} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Frequency', value: `${settings.calloutFrequency}s` },
              { label: 'Randomness', value: `±${settings.calloutFrequencyRandomness}s` },
              { label: 'Active Moves', value: callouts.filter(c => c.active).length },
              { label: 'Total Duration', value: formatTime((settings.roundDuration + settings.restDuration) * settings.roundCount) }
            ].map((stat, i) => (
              <div key={i} className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/50 backdrop-blur-sm">
                <span className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest block mb-2">{stat.label}</span>
                <p className="text-3xl font-bebas text-white tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-zinc-900/30 rounded-[2rem] border border-zinc-800/50 flex flex-col h-[650px] overflow-hidden backdrop-blur-md shadow-xl">
            <div className="p-6 border-b border-zinc-800/50 flex justify-between items-center bg-zinc-900/50">
              <h3 className="font-bebas text-2xl text-white tracking-wider flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-red-600" />
                COMMAND SET
              </h3>
              <div className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 text-[9px] font-black uppercase tracking-tighter">Library</div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {callouts.map((c) => (
                <div 
                  key={c.id} 
                  className={`group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${c.active ? 'bg-zinc-800/40 border-zinc-700/50 text-white' : 'bg-transparent border-transparent opacity-30 grayscale'}`}
                >
                  <div 
                    onClick={() => setCallouts(callouts.map(item => item.id === c.id ? {...item, active: !item.active} : item))}
                    className="flex-1 cursor-pointer font-bold text-sm"
                  >
                    {c.text}
                  </div>
                  <button 
                    onClick={() => setCallouts(callouts.filter(item => item.id !== c.id))}
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-500 hover:text-red-500 transition-all transform hover:scale-110"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-zinc-800/50 bg-zinc-950/50">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newCalloutText}
                  onChange={(e) => setNewCalloutText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCallout()}
                  placeholder="Define new combo..."
                  className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/20 transition-all text-white"
                />
                <button 
                  onClick={addCallout}
                  className="p-3 bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-lg active:scale-95"
                >
                  <Plus className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="font-bebas text-3xl text-white tracking-widest flex items-center gap-3">
                <SettingsIcon className="w-6 h-6 text-red-600" />
                Workout Config
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Rounds</label>
                  <input type="number" value={settings.roundCount} onChange={e => setSettings({...settings, roundCount: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-red-600 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Round (sec)</label>
                  <input type="number" value={settings.roundDuration} onChange={e => setSettings({...settings, roundDuration: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-red-600 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Rest (sec)</label>
                  <input type="number" value={settings.restDuration} onChange={e => setSettings({...settings, restDuration: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-red-600 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Call Every (sec)</label>
                  <input type="number" value={settings.calloutFrequency} onChange={e => setSettings({...settings, calloutFrequency: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-red-600 transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Trainer Voice</label>
                <select 
                  value={settings.voiceName || ''} 
                  onChange={e => setSettings({...settings, voiceName: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-red-600 transition-colors text-sm"
                >
                  <option value="">System Default</option>
                  {availableVoices.map(v => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-8 bg-zinc-950/50 border-t border-zinc-800">
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bebas text-xl tracking-widest transition-all shadow-lg active:scale-95"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto py-10 text-zinc-700 text-[9px] uppercase font-black tracking-[0.4em] text-center border-t border-zinc-900/50 w-full max-w-5xl">
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #18181b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #27272a;
        }
      `}</style>
    </div>
  );
};

export default App;
