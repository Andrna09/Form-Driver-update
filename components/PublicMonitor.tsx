import React, { useEffect, useState, useRef } from 'react';
import { getDrivers } from '../services/dataService';
import { DriverData, QueueStatus } from '../types';
import { 
  ArrowLeft, Clock, Truck, Volume2, PlayCircle, 
  AlertCircle, Megaphone, Activity 
} from 'lucide-react';

interface Props {
    onBack?: () => void;
}

const PublicMonitor: React.FC<Props> = ({ onBack }) => {
  // --- STATE DATA ---
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [time, setTime] = useState(new Date());
   
  // --- AUDIO STATE ---
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showActivationPrompt, setShowActivationPrompt] = useState(true);
  const [currentlySpeaking, setCurrentlySpeaking] = useState<string | null>(null);
  
  // Refs
  const lastAnnouncedIds = useRef<Set<string>>(new Set());
  const speechQueue = useRef<DriverData[]>([]);
  const isProcessingQueue = useRef(false);
  const chimeAudio = useRef<HTMLAudioElement | null>(null);

  // 1. INIT AUDIO
  useEffect(() => {
      chimeAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      chimeAudio.current.preload = 'auto';
  }, []);

  // 2. UNLOCK AUDIO
  const unlockAudio = async () => {
    try {
      if (chimeAudio.current) {
        chimeAudio.current.volume = 1.0; 
        await chimeAudio.current.play();
      }
      if ('speechSynthesis' in window) {
        const test = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(test);
      }
      setAudioUnlocked(true);
      setShowActivationPrompt(false);
    } catch (error) {
      console.error('Audio unlock failed:', error);
    }
  };

  // 3. TTS LOGIC
  const spellPlateNumber = (text: string) => {
      return text.toUpperCase().split('').map(char => {
          if (/[0-9]/.test(char)) return `${char} `; 
          if (char === ' ') return '... '; 
          return `${char} `; 
      }).join('');
  };

  const processQueue = async () => {
      if (isProcessingQueue.current || speechQueue.current.length === 0 || !audioUnlocked) return;

      isProcessingQueue.current = true;
      const driver = speechQueue.current.shift();

      if (driver) {
          try {
              setCurrentlySpeaking(`Memanggil ${driver.licensePlate}...`);
              
              if (chimeAudio.current) {
                  chimeAudio.current.currentTime = 0; 
                  await chimeAudio.current.play();
                  await new Promise(r => setTimeout(r, 1500)); 
              }

              const spelledPlate = spellPlateNumber(driver.licensePlate);
              const gateName = driver.gate.replace('GATE_', '').replace(/_/g, ' ');
              const text = `Panggilan untuk kendaraan... ${spelledPlate}... Harap segera merapat ke... ${gateName}`;

              const utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = 'id-ID'; 
              utterance.rate = 0.9;
              utterance.pitch = 1.1;
              
              utterance.onend = () => {
                  setCurrentlySpeaking(null);
                  isProcessingQueue.current = false;
                  setTimeout(processQueue, 1000); 
              };
              
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);

          } catch (e) {
              isProcessingQueue.current = false;
              processQueue();
          }
      } else {
          isProcessingQueue.current = false;
      }
  };

  // 4. DATA REFRESH
  const refresh = async () => {
      try {
        const data = await getDrivers();
        setDrivers(data);
        setTime(new Date());

        const calledDrivers = data.filter(d => d.status === QueueStatus.CALLED);
        calledDrivers.forEach(d => {
             if (!lastAnnouncedIds.current.has(d.id)) {
                 speechQueue.current.push(d);
                 lastAnnouncedIds.current.add(d.id);
             }
        });
        
        if (audioUnlocked) processQueue();

      } catch (err) {
        console.error('Error fetching data', err);
      }
  };

  useEffect(() => {
      refresh();
      const interval = setInterval(refresh, 5000); 
      return () => clearInterval(interval);
  }, [audioUnlocked]);

  // --- FILTERS ---
  const waitingList = drivers
    .filter(d => d.status === QueueStatus.VERIFIED)
    .sort((a,b) => (a.verifiedTime || 0) - (b.verifiedTime || 0));

  const calledList = drivers
    .filter(d => d.status === QueueStatus.CALLED); 

  const loadingList = drivers
    .filter(d => d.status === QueueStatus.LOADING);


  return (
    // UBAH 1: Gunakan h-screen hanya di desktop (lg). Di HP gunakan min-h-screen agar bisa scroll ke bawah.
    <div className="min-h-screen lg:h-screen bg-slate-950 text-white font-sans relative overflow-x-hidden flex flex-col">
        
        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 -z-10 fixed"></div>

        {/* ACTIVATION MODAL (Responsive Padding) */}
        {showActivationPrompt && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="text-center space-y-4 md:space-y-6 animate-in fade-in zoom-in duration-300 max-w-sm md:max-w-lg w-full bg-slate-900/50 p-6 md:p-8 rounded-3xl border border-white/10">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(37,99,235,0.5)]">
                    <Volume2 className="w-8 h-8 md:w-10 md:h-10 text-white" />
                </div>
                <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">AKTIFKAN MONITOR</h1>
                <p className="text-sm md:text-base text-slate-400">Klik tombol di bawah untuk mengizinkan notifikasi suara.</p>
                <button onClick={unlockAudio} className="w-full bg-white text-blue-900 py-3 md:py-4 rounded-xl font-bold text-lg hover:scale-105 transition-transform flex items-center justify-center gap-2">
                    <PlayCircle className="w-5 h-5 md:w-6 md:h-6" /> MULAI SISTEM
                </button>
            </div>
          </div>
        )}

        {/* HEADER (Responsive Layout) */}
        <header className="bg-slate-900/80 border-b border-white/10 flex flex-col md:flex-row items-center justify-between p-4 md:px-6 backdrop-blur-sm shrink-0 gap-4 md:gap-0 sticky top-0 z-50 lg:relative">
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-lg md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                            <Truck className="w-6 h-6 md:w-8 md:h-8 text-blue-500" />
                            LOGISTICS
                        </h1>
                        <div className="hidden md:flex items-center gap-2 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            ONLINE • {audioUnlocked ? 'AUDIO ON' : 'MUTED'}
                        </div>
                    </div>
                </div>
                
                {/* Jam Mobile (Muncul di kanan atas pada HP) */}
                <div className="md:hidden text-right">
                    <div className="text-2xl font-black font-mono text-white leading-none">
                        {time.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}
                    </div>
                </div>
            </div>

            {/* Jam Desktop */}
            <div className="hidden md:block text-right">
                <div className="text-4xl font-black font-mono text-white leading-none">
                    {time.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}
                </div>
                <div className="text-sm font-bold text-slate-400 uppercase">
                    {time.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long'})}
                </div>
            </div>
        </header>

        {/* MAIN CONTENT (Grid Desktop, Flex Mobile) */}
        <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-visible lg:overflow-hidden">
            
            {/* === ZONA 2: PANGGILAN (DI HP JADI URUTAN PERTAMA) === */}
            {/* UBAH 2: Tambahkan 'order-first lg:order-none' agar di HP dia naik ke atas */}
            <section className="order-first lg:order-none lg:col-span-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-1">
                    <Megaphone className="w-5 h-5 md:w-6 md:h-6 text-amber-500 animate-pulse" />
                    <h2 className="text-lg md:text-xl font-black text-white tracking-wide">PANGGILAN</h2>
                </div>

                <div className="flex-1 lg:overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                    {calledList.length === 0 ? (
                        <div className="h-40 lg:h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-slate-600 p-4 text-center bg-slate-900/30">
                            <Megaphone className="w-8 h-8 md:w-10 md:h-10 opacity-20 mb-2" />
                            <h3 className="text-lg md:text-2xl font-bold text-slate-500">Standby...</h3>
                        </div>
                    ) : calledList.map(d => (
                        <div key={d.id} className="relative overflow-hidden rounded-[1.5rem] md:rounded-[2rem] bg-gradient-to-br from-amber-500 to-orange-600 p-1 shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse">
                            <div className="bg-slate-900 h-full rounded-[1.3rem] md:rounded-[1.8rem] p-5 md:p-6 relative overflow-hidden">
                                {/* Watermark (Hidden on mobile to save space) */}
                                <div className="hidden md:block absolute -right-4 -bottom-4 text-[8rem] font-black text-white/5 select-none pointer-events-none">GO</div>

                                <div className="relative z-10 text-center">
                                    <div className="inline-block bg-amber-500/20 text-amber-400 text-[10px] md:text-sm font-black tracking-widest uppercase px-3 py-1 rounded-full mb-3 md:mb-4 animate-bounce border border-amber-500/30">
                                        MENUJU KE
                                    </div>
                                    
                                    {/* UBAH 3: Font Size Responsive (text-5xl di HP, text-7xl di Desktop) */}
                                    <div className="text-5xl md:text-7xl font-black text-white font-mono tracking-tighter mb-2 drop-shadow-2xl">
                                        {d.gate.replace('GATE_', '')}
                                    </div>
                                    
                                    <div className="text-[10px] md:text-sm text-slate-400 font-bold uppercase tracking-widest mb-4 md:mb-6">
                                        LOADING DOCK
                                    </div>

                                    <div className="bg-white text-slate-900 rounded-xl py-2 md:py-3 px-4 shadow-xl">
                                        <div className="text-3xl md:text-5xl font-black font-mono tracking-tight text-slate-900 truncate">
                                            {d.licensePlate}
                                        </div>
                                    </div>
                                    
                                    <div className="mt-3 md:mt-4 flex justify-center gap-2 md:gap-4 text-slate-400 text-xs md:text-sm font-bold truncate">
                                        <span>{d.company}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            
            {/* === ZONA 1: ANTRIAN (WAITING) === */}
            {/* Di HP urutan kedua */}
            <section className="lg:col-span-3 bg-slate-900/50 rounded-3xl border border-white/5 flex flex-col overflow-hidden max-h-[400px] lg:max-h-none">
                <div className="p-3 md:p-4 bg-slate-800/30 border-b border-white/5 flex justify-between items-center">
                    <h2 className="font-bold text-slate-300 flex items-center gap-2 text-sm md:text-base">
                        <Clock className="w-4 h-4 md:w-5 md:h-5 text-slate-400" /> ANTRIAN
                    </h2>
                    <span className="bg-slate-700 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-full">{waitingList.length}</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2 md:space-y-3 custom-scrollbar">
                    {waitingList.length === 0 ? (
                        <div className="h-32 lg:h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                            <p className="text-xs font-bold">Tidak ada antrian</p>
                        </div>
                    ) : waitingList.map((d, i) => (
                        <div key={d.id} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-amber-400 font-mono font-black text-lg md:text-xl">#{d.queueNumber}</span>
                                    <span className="text-white font-bold text-sm md:text-lg">{d.licensePlate}</span>
                                </div>
                                <div className="text-[10px] md:text-xs text-slate-400 truncate w-32 md:w-auto">{d.company}</div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-white/10 whitespace-nowrap">
                                {d.verifiedTime ? Math.floor((Date.now() - d.verifiedTime) / 60000) : 0} min
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* === ZONA 3: PROSES BONGKAR === */}
            <section className="lg:col-span-4 bg-slate-900/50 rounded-3xl border border-white/5 flex flex-col overflow-hidden max-h-[400px] lg:max-h-none">
                <div className="p-3 md:p-4 bg-blue-900/10 border-b border-blue-500/20 flex justify-between items-center">
                    <h2 className="font-bold text-blue-200 flex items-center gap-2 text-sm md:text-base">
                        <Activity className="w-4 h-4 md:w-5 md:h-5 text-blue-400" /> PROSES BONGKAR
                    </h2>
                    <span className="bg-blue-900/50 text-blue-200 text-[10px] md:text-xs font-bold px-2 py-1 rounded-full border border-blue-500/30">{loadingList.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4 custom-scrollbar">
                    {loadingList.length === 0 ? (
                        <div className="h-32 lg:h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                            <p className="text-xs font-bold">Dock Kosong</p>
                        </div>
                    ) : loadingList.map(d => (
                        <div key={d.id} className="bg-blue-950/20 border border-blue-500/20 p-4 rounded-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                            <div className="flex justify-between items-start mb-1">
                                <div className="text-blue-400 font-bold text-xs md:text-sm tracking-wide">
                                    {d.gate.replace('GATE_', 'DOCK ')}
                                </div>
                                <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded text-[10px] font-bold text-blue-300 border border-blue-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                    LOADING
                                </div>
                            </div>
                            <div className="text-xl md:text-3xl font-mono font-bold text-white mb-1">{d.licensePlate}</div>
                            <div className="text-xs md:text-sm text-slate-400 truncate">{d.company}</div>
                        </div>
                    ))}
                </div>
            </section>

        </main>

        {/* FOOTER (Running Text) */}
        <footer className="h-10 md:h-12 bg-slate-900 border-t border-white/10 shrink-0 relative overflow-hidden flex items-center mt-auto">
            <div className="absolute left-0 z-20 h-full bg-slate-900 px-3 md:px-4 flex items-center border-r border-white/10 shadow-xl">
                <span className="text-red-500 font-black tracking-widest text-[10px] md:text-xs flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 md:w-4 md:h-4" /> INFO
                </span>
            </div>
            
            <div className="whitespace-nowrap animate-[marquee_20s_linear_infinite] md:animate-[marquee_30s_linear_infinite] pl-[100vw]">
                <span className="text-slate-300 font-mono text-sm md:text-lg font-bold mx-4">
                    +++ DRIVER WAJIB MENGGUNAKAN SEPATU SAFETY +++ DILARANG MEROKOK +++ HARAP MENYIAPKAN SURAT JALAN +++
                </span>
            </div>
        </footer>

        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            
            @keyframes marquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-100%); }
            }
        `}</style>
    </div>
  );
};

export default PublicMonitor;
