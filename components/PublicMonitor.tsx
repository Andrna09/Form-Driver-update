import React, { useEffect, useState, useRef } from 'react';
import { getDrivers } from '../services/dataService';
import { DriverData, QueueStatus } from '../types';
import { 
  ArrowLeft, Loader2, Clock, Truck, FileText, 
  Volume2, Mic, PlayCircle, CheckCircle2 
} from 'lucide-react';

interface Props {
    onBack?: () => void;
}

const PublicMonitor: React.FC<Props> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [time, setTime] = useState(new Date());
   
  // ===== AUDIO STATE =====
  // Default: Terkunci (False) & Tampilkan Popup (True)
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showActivationPrompt, setShowActivationPrompt] = useState(true);
   
  // Queue & Processing State
  const [currentlySpeaking, setCurrentlySpeaking] = useState<string | null>(null);
  const lastAnnouncedIds = useRef<Set<string>>(new Set());
  const speechQueue = useRef<DriverData[]>([]);
  const isProcessingQueue = useRef(false);
   
  // Audio Assets
  const chimeAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
      // 1. Preload Audio Asset saat pertama kali load
      chimeAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      chimeAudio.current.preload = 'auto';
  }, []);

  // ===== FUNGSI AKTIVASI (TRIGGER UTAMA) =====
  const unlockAudio = async () => {
    try {
      // 1. Pancing Browser dengan Play Audio
      if (chimeAudio.current) {
        // Set Volume 100% agar terdengar jelas di gudang
        chimeAudio.current.volume = 1.0; 
        
        // Play sebentar untuk buka "kunci" browser
        await chimeAudio.current.play();
        
        // Tunggu audio selesai (agar user mendengar konfirmasi)
        await new Promise<void>((resolve) => {
             chimeAudio.current!.onended = () => resolve();
             // Timeout 3 detik jaga-jaga jika audio error/lama
             setTimeout(() => resolve(), 3000); 
        });
      }
      
      // 2. Test TTS (Text-to-Speech) sekilas
      if ('speechSynthesis' in window) {
        const test = new SpeechSynthesisUtterance(''); // Suara kosong
        test.volume = 0.01;
        window.speechSynthesis.speak(test);
      }
      
      // 3. Update State: Audio Siap Digunakan
      setAudioUnlocked(true);
      setShowActivationPrompt(false);
      
      console.log('✅ Audio System Activated!');
    } catch (error) {
      console.error('Failed to unlock audio:', error);
      alert('Gagal mengaktifkan audio. Pastikan speaker terpasang dan volume nyala.');
    }
  };

  // --- LOGIC TTS (EJAAN PLAT NOMOR) ---
  const spellPlateNumber = (text: string) => {
      // B 1234 CDA -> "B... 1 2 3 4... C D A"
      return text.toUpperCase().split('').map(char => {
          if (/[0-9]/.test(char)) return `${char} `; 
          if (char === ' ') return '... '; 
          return `${char} `; 
      }).join('');
  };

  // --- ANTRIAN SUARA (QUEUE PROCESSOR) ---
  const processQueue = async () => {
      if (isProcessingQueue.current || speechQueue.current.length === 0) return;
      
      // STOP jika audio belum diaktifkan user
      if (!audioUnlocked) {
        isProcessingQueue.current = false;
        return;
      }

      isProcessingQueue.current = true;
      const driver = speechQueue.current.shift();

      if (driver) {
          try {
              // A. Visual Banner
              setCurrentlySpeaking(`Memanggil ${driver.licensePlate}...`);

              // B. Play Chime (Ting-Nong)
              if (chimeAudio.current) {
                  try {
                    chimeAudio.current.currentTime = 0; 
                    await chimeAudio.current.play();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  } catch (e) { console.error("Chime error:", e); }
              }

              // C. Suara Google (TTS)
              const spelledPlate = spellPlateNumber(driver.licensePlate);
              const gateName = driver.gate.replace('GATE_', '').replace(/_/g, ' ');
              const text = `Perhatian... Panggilan untuk kendaraan... ${spelledPlate}... Harap segera merapat ke... ${gateName}`;

              const utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = 'id-ID'; 
              utterance.rate = 0.85; // Agak lambat biar jelas
              utterance.pitch = 1;
              
              // Handler saat selesai bicara
              const onFinish = () => {
                  setCurrentlySpeaking(null);
                  isProcessingQueue.current = false;
                  setTimeout(processQueue, 1500); // Jeda antar panggilan
              };

              utterance.onend = onFinish;
              utterance.onerror = () => {
                  console.error("TTS Error");
                  onFinish();
              };

              // Clear antrian TTS browser biar tidak stuck
              window.speechSynthesis.cancel(); 
              window.speechSynthesis.speak(utterance);

          } catch (e) {
              console.error("Playback Error", e);
              setCurrentlySpeaking(null);
              isProcessingQueue.current = false;
              setTimeout(processQueue, 1500);
          }
      } else {
          isProcessingQueue.current = false;
      }
  };

  const queueAnnouncement = (d: DriverData) => {
      if (!speechQueue.current.some(q => q.id === d.id)) {
        speechQueue.current.push(d);
        // Coba proses antrian (hanya jalan jika audioUnlocked = true)
        processQueue();
      }
  };

  // --- DATA REFRESH ---
  const refresh = async () => {
      try {
        const data = await getDrivers();
        setDrivers(data);
        setTime(new Date());

        // Cek driver yang statusnya CALLED (Dipanggil)
        const calledDrivers = data.filter(d => d.status === QueueStatus.CALLED);
        calledDrivers.forEach(d => {
             // Jika ID ini belum pernah diumumkan
             if (!lastAnnouncedIds.current.has(d.id)) {
                 queueAnnouncement(d);
                 lastAnnouncedIds.current.add(d.id);
             }
        });
        
        // Pancing proses antrian barangkali ada sisa
        if (audioUnlocked) processQueue();

      } catch (err) {
        console.error('Refresh error:', err);
      }
  };

  useEffect(() => {
      refresh();
      // Refresh setiap 5 detik
      const interval = setInterval(refresh, 5000); 
      return () => clearInterval(interval);
  }, [audioUnlocked]); // Re-run effect saat audio aktif

  // --- RENDER HELPERS ---
  const loadingDrivers = drivers.filter(d => d.status === QueueStatus.LOADING || d.status === QueueStatus.CALLED);
  const waitingDrivers = drivers.filter(d => d.status === QueueStatus.VERIFIED).sort((a,b) => (a.verifiedTime || 0) - (b.verifiedTime || 0));

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 overflow-hidden font-sans relative selection:bg-blue-500 selection:text-white">
        
        {/* Background Mesh Effect */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 -z-10"></div>

        {/* ===== POPUP AKTIVASI (WAJIB MUNCUL DI AWAL) ===== */}
        {showActivationPrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border-2 border-blue-500/50 rounded-3xl p-8 md:p-12 max-w-lg mx-4 text-center shadow-[0_0_50px_rgba(59,130,246,0.5)]">
              <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce shadow-lg shadow-blue-500/50">
                <Volume2 className="w-12 h-12 text-white" />
              </div>
              
              <h2 className="text-3xl md:text-4xl font-black text-white mb-3 tracking-tight">SISTEM MONITORING</h2>
              <p className="text-slate-300 mb-8 text-lg leading-relaxed">
                Klik tombol di bawah untuk mengaktifkan<br/>
                <span className="text-blue-400 font-bold">Notifikasi Suara & Layar</span>
              </p>
              
              <button
                onClick={unlockAudio}
                className="w-full py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-xl rounded-2xl transition-all transform hover:scale-105 shadow-xl shadow-blue-900/50 flex items-center justify-center gap-3 group"
              >
                <PlayCircle className="w-8 h-8 group-hover:rotate-12 transition-transform" />
                AKTIFKAN SEKARANG
              </button>
              
              <p className="mt-6 text-slate-500 text-sm font-medium">
                *Wajib diklik setiap kali monitor dinyalakan
              </p>
            </div>
          </div>
        )}

        {/* CONTROLS POJOK KIRI ATAS */}
        <div className="absolute top-4 left-4 md:top-8 md:left-8 z-50 flex gap-4">
            {onBack && (
                <button onClick={onBack} className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm transition-all text-white flex items-center gap-2">
                    <ArrowLeft className="w-5 h-5"/> <span className="hidden md:inline text-xs font-bold">MENU UTAMA</span>
                </button>
            )}
            {/* Badge Status Audio */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md transition-all ${
              audioUnlocked 
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                : 'bg-red-500/10 border border-red-500/20 text-red-400 animate-pulse'
            }`}>
                {audioUnlocked ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">AUDIO AKTIF</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">AUDIO OFF</span>
                  </>
                )}
            </div>
        </div>

        {/* DYNAMIC ANNOUNCEMENT BANNER */}
        {currentlySpeaking && (
            <div className="absolute top-24 md:top-8 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-900 px-8 py-3 rounded-full shadow-2xl shadow-amber-500/50 flex items-center gap-3 animate-bounce">
                <Mic className="w-6 h-6 animate-pulse" />
                <span className="font-black uppercase tracking-widest text-sm">{currentlySpeaking}</span>
            </div>
        )}

        {/* HEADER JAM & TANGGAL */}
        <div className="flex flex-col md:flex-row justify-end md:justify-between items-end border-b border-white/10 pb-6 mb-8 pl-16 md:pl-0 mt-16 md:mt-0">
            <div className="hidden md:block">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">WAREHOUSE MONITOR</h1>
                <p className="text-xl md:text-2xl text-slate-400 font-bold mt-2 tracking-[0.2em]">LIVE QUEUE STATUS</p>
            </div>
            <div className="text-right">
                <div className="text-5xl md:text-8xl font-black font-mono tracking-tighter text-white drop-shadow-lg">
                    {time.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}
                </div>
                <div className="text-xl text-slate-400 font-bold uppercase tracking-wider">
                    {time.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long'})}
                </div>
            </div>
        </div>

        {/* GRID CONTENT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[65vh] md:h-[75vh]">
            
            {/* KIRI: STATUS BONGKAR MUAT (Besar) */}
            <div className="bg-slate-900/40 backdrop-blur-sm rounded-3xl border border-white/10 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-500"></div>
                
                <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-4">
                    <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
                    STATUS BONGKAR MUAT
                </h2>
                
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {loadingDrivers.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 italic">
                            <Truck className="w-16 h-16 mb-4 opacity-20" />
                            <div className="text-2xl font-bold opacity-50">Area Dock Kosong</div>
                        </div>
                    ) : loadingDrivers.map(d => {
                        const isCalled = d.status === QueueStatus.CALLED;
                        return (
                            <div key={d.id} className={`relative p-6 rounded-2xl border-l-8 shadow-2xl transition-all duration-500 overflow-hidden group
                                    ${isCalled 
                                        ? 'bg-gradient-to-r from-amber-900/40 to-slate-900 border-amber-500 shadow-amber-900/20 scale-[1.02] ring-2 ring-amber-500/50' 
                                        : 'bg-gradient-to-r from-emerald-900/30 to-slate-900 border-emerald-500 shadow-emerald-900/10'
                                    }`}>
                                {isCalled && (
                                    <div className="absolute inset-0 bg-amber-500/10 animate-pulse z-0 pointer-events-none"></div>
                                )}

                                <div className="relative z-10 flex justify-between items-center">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2
                                            ${isCalled ? 'bg-amber-500 text-slate-900 animate-pulse shadow-lg shadow-amber-500/50' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                            {isCalled ? "SILAKAN MERAPAT" : "SEDANG PROSES"}
                                        </div>

                                        <div className="text-5xl md:text-6xl font-black font-mono mb-1 tracking-tight text-white">
                                            {d.licensePlate}
                                        </div>
                                        
                                        <div className="flex items-center gap-3 mt-2 overflow-hidden">
                                            <span className="px-3 py-1 rounded-lg bg-white/10 text-sm font-bold text-slate-400 border border-white/5 whitespace-nowrap">{d.company}</span>
                                            <div className="flex items-center gap-2 text-lg md:text-xl text-slate-200 font-bold font-mono tracking-tight truncate">
                                                <FileText className="w-4 h-4 text-slate-500" />
                                                {d.doNumber}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">DOCK / GATE</div>
                                        <div className={`text-7xl font-black tracking-tighter drop-shadow-lg
                                            ${d.gate === 'GATE_2' ? 'text-blue-400' : d.gate === 'GATE_4' ? 'text-purple-400' : 'text-white'}`}>
                                            {d.gate.replace('GATE_', '')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* KANAN: ANTRIAN BERIKUTNYA (List Kecil) */}
            <div className="bg-slate-900/40 backdrop-blur-sm rounded-3xl border border-white/10 p-6 flex flex-col relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>

                 <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-4">
                    <Clock className="w-8 h-8 text-blue-400" />
                    ANTRIAN BERIKUTNYA
                </h2>

                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-slate-500 font-bold uppercase text-sm tracking-wider border-b border-white/10 mb-2">
                    <div className="col-span-3">No. Antrian</div>
                    <div className="col-span-6">Identitas & Dokumen</div>
                    <div className="col-span-3 text-right">Gate</div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                    {waitingDrivers.length === 0 ? (
                        <div className="mt-20 text-center text-slate-600 italic text-xl">Tidak ada antrian</div>
                    ) : waitingDrivers.map((d, i) => (
                        <div key={d.id} className="grid grid-cols-12 gap-4 items-center p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                            <div className="col-span-3">
                                <span className="text-3xl font-black font-mono text-yellow-400">{d.queueNumber || '-'}</span>
                            </div>
                            <div className="col-span-6 min-w-0">
                                <div className="text-2xl font-bold text-white mb-1">{d.licensePlate}</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-slate-400 border border-white/5 shrink-0">{d.company}</span>
                                    <span className="text-sm text-slate-300 font-mono font-medium truncate">{d.doNumber}</span>
                                </div>
                            </div>
                            <div className="col-span-3 text-right">
                                <span className={`text-2xl font-black font-mono ${d.gate === 'GATE_2' ? 'text-blue-400' : d.gate === 'GATE_4' ? 'text-purple-400' : 'text-slate-500'}`}>
                                    {d.gate !== 'NONE' ? d.gate.replace('GATE_', '') : '-'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* RUNNING TEXT BAWAH */}
        <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-white/10 text-white py-3 overflow-hidden whitespace-nowrap z-50">
            <div className="animate-[shimmer_20s_linear_infinite] inline-block font-mono font-bold text-lg text-blue-200">
                +++ HARAP MEMPERSIAPKAN DOKUMEN SEBELUM MENUJU GATE +++ DILARANG MEROKOK DI AREA BONGKAR MUAT +++ UTAMAKAN KESELAMATAN KERJA +++ 
                DRIVER DENGAN STATUS "DIPANGGIL" HARAP SEGERA MERAPAT KE DOCKING +++
            </div>
        </div>
        
        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        `}</style>
    </div>
  );
};

export default PublicMonitor;
