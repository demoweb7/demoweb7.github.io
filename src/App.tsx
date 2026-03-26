import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Trash2, 
  RotateCcw, 
  Clock, 
  ShieldCheck, 
  UserPlus, 
  Users,
  AlertCircle,
  CheckCircle2,
  X,
  Activity,
  LogOut
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Analyst, ActiveBreak, ADMIN_PASSWORD } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [analysts, setAnalysts] = useState<Analyst[]>(() => {
    const saved = localStorage.getItem("analysts");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeBreaks, setActiveBreaks] = useState<ActiveBreak[]>(() => {
    const saved = localStorage.getItem("activeBreaks");
    return saved ? JSON.parse(saved) : [];
  });

  const [newAnalystName, setNewAnalystName] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState<{
    type: "add" | "remove" | "reset" | "resetAll";
    id?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every 10 seconds for monitor
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem("analysts", JSON.stringify(analysts));
  }, [analysts]);

  useEffect(() => {
    localStorage.setItem("activeBreaks", JSON.stringify(activeBreaks));
  }, [activeBreaks]);

  // Automatic Daily Reset at 00:00
  const checkDailyReset = useCallback(() => {
    const lastReset = localStorage.getItem("lastResetDate");
    const today = new Date().toDateString();

    if (lastReset !== today) {
      setAnalysts(prev => prev.map(a => ({
        ...a,
        break1: { checked: false, startTime: undefined, endTime: undefined },
        break2: { checked: false, startTime: undefined, endTime: undefined }
      })));
      setActiveBreaks([]); // Clear monitor on daily reset
      localStorage.setItem("lastResetDate", today);
      console.log("Daily reset performed at:", new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    checkDailyReset();
    const interval = setInterval(checkDailyReset, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkDailyReset]);

  const handleAction = () => {
    if (password !== ADMIN_PASSWORD) {
      setError("Clave incorrecta");
      return;
    }

    if (showPasswordModal?.type === "add") {
      if (!newAnalystName.trim()) return;
      const newAnalyst: Analyst = {
        id: crypto.randomUUID(),
        name: newAnalystName,
        break1: { checked: false },
        break2: { checked: false }
      };
      setAnalysts(prev => [...prev, newAnalyst]);
      setNewAnalystName("");
    } else if (showPasswordModal?.type === "remove" && showPasswordModal.id) {
      setAnalysts(prev => prev.filter(a => a.id !== showPasswordModal.id));
      setActiveBreaks(prev => prev.filter(ab => ab.analystId !== showPasswordModal.id));
    } else if (showPasswordModal?.type === "reset" && showPasswordModal.id) {
      setAnalysts(prev => prev.map(a => 
        a.id === showPasswordModal.id 
          ? { ...a, break1: { checked: false, startTime: undefined, endTime: undefined }, break2: { checked: false, startTime: undefined, endTime: undefined } } 
          : a
      ));
      setActiveBreaks(prev => prev.filter(ab => ab.analystId !== showPasswordModal.id));
    } else if (showPasswordModal?.type === "resetAll") {
      setAnalysts(prev => prev.map(a => ({
        ...a,
        break1: { checked: false, startTime: undefined, endTime: undefined },
        break2: { checked: false, startTime: undefined, endTime: undefined }
      })));
      setActiveBreaks([]);
    }

    closeModal();
  };

  const closeModal = () => {
    setShowPasswordModal(null);
    setPassword("");
    setError(null);
  };

  const toggleBreak = (id: string, breakNum: 1 | 2) => {
    const analyst = analysts.find(a => a.id === id);
    if (!analyst) return;

    const breakKey = breakNum === 1 ? "break1" : "break2";
    if (analyst[breakKey].checked) return;

    const now = new Date();
    const startTime = Date.now();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setAnalysts(prev => prev.map(a => {
      if (a.id === id) {
        return {
          ...a,
          [breakKey]: {
            checked: true,
            time: timeStr,
            startTime: startTime
          }
        };
      }
      return a;
    }));

    // Add to monitor
    const newActiveBreak: ActiveBreak = {
      id: crypto.randomUUID(),
      analystId: id,
      analystName: analyst.name,
      breakName: `Break ${breakNum}`,
      startTime: startTime
    };
    setActiveBreaks(prev => [...prev, newActiveBreak]);
  };

  const finishBreak = (activeBreakId: string) => {
    const ab = activeBreaks.find(b => b.id === activeBreakId);
    if (ab) {
      const now = Date.now();
      setAnalysts(prev => prev.map(a => {
        if (a.id === ab.analystId) {
          if (ab.breakName === "Break 1") {
            return { ...a, break1: { ...a.break1, endTime: now } };
          } else if (ab.breakName === "Break 2") {
            return { ...a, break2: { ...a.break2, endTime: now } };
          }
        }
        return a;
      }));
    }
    setActiveBreaks(prev => prev.filter(ab => ab.id !== activeBreakId));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Users className="text-blue-600" size={32} />
              Control de Analistas
            </h1>
            <p className="text-slate-500 mt-1">Gestión de descansos y turnos diarios</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowPasswordModal({ type: "resetAll" })}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium shadow-sm"
            >
              <RotateCcw size={16} className="text-slate-500" />
              Resetear Todo
            </button>
            <button
              onClick={() => setShowPasswordModal({ type: "add" })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
            >
              <UserPlus size={16} />
              Agregar Analista
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Analysts List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={20} className="text-slate-400" />
              <h2 className="font-semibold text-slate-700">Lista de Analistas</h2>
            </div>
            
            <AnimatePresence mode="popLayout">
              {analysts.map((analyst) => (
                <motion.div
                  key={analyst.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-4 min-w-[180px]">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                      {analyst.name.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="font-semibold text-lg">{analyst.name}</h3>
                  </div>

                  <div className="flex flex-1 flex-wrap gap-8 items-center justify-center md:justify-start">
                    {/* Break 1 */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-500">Break 1</span>
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const isLimitReached = activeBreaks.length >= 2;
                            const isBreak1Disabled = analyst.break1.checked || isLimitReached;

                            return (
                              <>
                                <button
                                  onClick={() => toggleBreak(analyst.id, 1)}
                                  disabled={isBreak1Disabled}
                                  className={cn(
                                    "w-6 h-6 rounded border-2 transition-all flex items-center justify-center",
                                    analyst.break1.checked 
                                      ? "bg-green-500 border-green-500 text-white" 
                                      : isBreak1Disabled
                                        ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed"
                                        : "border-slate-300 hover:border-blue-500"
                                  )}
                                >
                                  {analyst.break1.checked && <CheckCircle2 size={16} />}
                                </button>
                                {analyst.break1.checked && (
                                  <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 flex items-center gap-1">
                                    <Clock size={12} />
                                    {analyst.break1.time}
                                  </span>
                                )}
                                {isLimitReached && !analyst.break1.checked && (
                                  <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">
                                    Límite 2
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Break 2 */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-500">Break 2</span>
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const cooldownMs = 59 * 60 * 1000; // 59 minutes
                            const break1EndTime = analyst.break1.endTime || 0;
                            const isBreak1Checked = analyst.break1.checked;
                            const isBreak1Active = isBreak1Checked && !analyst.break1.endTime;
                            const timePassedSinceEnd = currentTime - break1EndTime;
                            const isCooldownActive = isBreak1Checked && (isBreak1Active || timePassedSinceEnd < cooldownMs);
                            const isLimitReached = activeBreaks.length >= 2;
                            const isBreak2Disabled = analyst.break2.checked || !isBreak1Checked || isCooldownActive || isLimitReached;

                            const remainingMins = Math.ceil((cooldownMs - timePassedSinceEnd) / 60000);

                            return (
                              <>
                                <button
                                  onClick={() => toggleBreak(analyst.id, 2)}
                                  disabled={isBreak2Disabled}
                                  className={cn(
                                    "w-6 h-6 rounded border-2 transition-all flex items-center justify-center",
                                    analyst.break2.checked 
                                      ? "bg-green-500 border-green-500 text-white" 
                                      : isBreak2Disabled
                                        ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed"
                                        : "border-slate-300 hover:border-blue-500"
                                  )}
                                >
                                  {analyst.break2.checked && <CheckCircle2 size={16} />}
                                </button>
                                {analyst.break2.checked && (
                                  <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 flex items-center gap-1">
                                    <Clock size={12} />
                                    {analyst.break2.time}
                                  </span>
                                )}
                                {isCooldownActive && !analyst.break2.checked && !isLimitReached && (
                                  <span className="text-[10px] text-orange-500 font-medium whitespace-nowrap">
                                    {isBreak1Active ? "Break 1 activo" : `Espera ${remainingMins}m`}
                                  </span>
                                )}
                                {isLimitReached && !analyst.break2.checked && (
                                  <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">
                                    Límite 2
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPasswordModal({ type: "reset", id: analyst.id })}
                      title="Resetear analista"
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <RotateCcw size={18} />
                    </button>
                    <button
                      onClick={() => setShowPasswordModal({ type: "remove", id: analyst.id })}
                      title="Eliminar analista"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {analysts.length === 0 && (
              <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl">
                <Users className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-500">No hay analistas registrados</p>
                <button
                  onClick={() => setShowPasswordModal({ type: "add" })}
                  className="mt-4 text-blue-600 font-medium hover:underline"
                >
                  Agregar el primero
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Status Monitor */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={20} className="text-slate-400" />
              <h2 className="font-semibold text-slate-700">Monitor de Estado</h2>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-[400px]">
              <div className="bg-slate-50 border-bottom border-slate-200 p-3 text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                <span>Analista / Break</span>
                <span>Estado</span>
              </div>
              
              <div className="p-2 space-y-2">
                <AnimatePresence mode="popLayout">
                  {activeBreaks.map((ab) => {
                    const elapsedMs = currentTime - ab.startTime;
                    const elapsedMins = Math.floor(elapsedMs / 60000);
                    const isOverLimit = elapsedMins >= 15;

                    return (
                      <motion.div
                        key={ab.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className={cn(
                          "p-3 rounded-lg border flex items-center justify-between transition-colors",
                          isOverLimit 
                            ? "bg-red-50 border-red-200 text-red-700" 
                            : "bg-green-50 border-green-200 text-green-700"
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{ab.analystName}</span>
                          <span className="text-xs opacity-80">{ab.breakName} • {elapsedMins}m</span>
                        </div>
                        
                        <button
                          onClick={() => finishBreak(ab.id)}
                          className={cn(
                            "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all",
                            isOverLimit
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "bg-green-600 text-white hover:bg-green-700"
                          )}
                        >
                          <LogOut size={12} />
                          Fin Break
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {activeBreaks.length === 0 && (
                  <div className="text-center py-12 text-slate-300">
                    <Activity size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No hay breaks activos</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                      <ShieldCheck size={24} />
                    </div>
                    <h2 className="text-xl font-bold">Autenticación Requerida</h2>
                  </div>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {showPasswordModal.type === "add" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Nombre del Analista</label>
                      <input
                        autoFocus
                        type="text"
                        value={newAnalystName}
                        onChange={(e) => setNewAnalystName(e.target.value)}
                        placeholder="Ej: David Muñoz"
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Clave de Administrador</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAction()}
                      placeholder="Ingrese Clave Admin"
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none",
                        error ? "border-red-500" : "border-slate-200"
                      )}
                    />
                    {error && (
                      <p className="text-red-500 text-xs flex items-center gap-1">
                        <AlertCircle size={12} />
                        {error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAction}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto mt-12 pt-8 border-t border-slate-200 text-center text-slate-400 text-sm">
        <p>© 2026 Sistema de Control de Analistas. Las casillas se reinician automáticamente a las 00:00.</p>
      </footer>
    </div>
  );
}
