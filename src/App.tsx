import { useState, useEffect, useCallback, useMemo, FormEvent } from "react";
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
  LogOut,
  LogIn
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Analyst, ActiveBreak, ADMIN_PASSWORD } from "./types";
import { 
  db, 
  auth, 
  login, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  getDoc,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<ActiveBreak[]>([]);
  const [lastResetDate, setLastResetDate] = useState<string>("");
  const [loggedInUser, setLoggedInUser] = useState<Analyst | null>(() => {
    const saved = localStorage.getItem("loggedInUser");
    return saved ? JSON.parse(saved) : null;
  });

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingAnalysts, setLoadingAnalysts] = useState(true);

  const [newAnalystName, setNewAnalystName] = useState("");
  const [newAnalystUsername, setNewAnalystUsername] = useState("");
  const [newAnalystPassword, setNewAnalystPassword] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState<{
    type: "add" | "remove" | "reset" | "resetAll";
    id?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Firestore Listeners
  useEffect(() => {
    const unsubAnalysts = onSnapshot(collection(db, "analysts"), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as Analyst);
      setAnalysts(data);
      setLoadingAnalysts(false);

      // Seed initial admin if no admin exists
      const hasAdmin = data.some(a => a.role === "admin");
      if (!hasAdmin) {
        const adminId = crypto.randomUUID();
        const initialAdmin: Analyst = {
          id: adminId,
          name: "Administrador",
          username: "admin",
          password: "password123",
          role: "admin",
          break1: { checked: false },
          break2: { checked: false }
        };
        setDoc(doc(db, "analysts", adminId), initialAdmin)
          .catch(err => handleFirestoreError(err, OperationType.WRITE, "analysts/seed"));
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, "analysts"));

    const unsubActiveBreaks = onSnapshot(collection(db, "activeBreaks"), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as ActiveBreak);
      setActiveBreaks(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "activeBreaks"));

    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (snapshot) => {
      if (snapshot.exists()) {
        setLastResetDate(snapshot.data().lastResetDate);
      } else {
        // Seed initial reset date
        const today = new Date().toDateString();
        setDoc(doc(db, "settings", "global"), { lastResetDate: today })
          .catch(err => handleFirestoreError(err, OperationType.WRITE, "settings/global-seed"));
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, "settings/global"));

    return () => {
      unsubAnalysts();
      unsubActiveBreaks();
      unsubSettings();
    };
  }, []);

  // Update current time every 10 seconds for monitor
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Automatic Daily Reset at 00:00
  const checkDailyReset = useCallback(async () => {
    if (!lastResetDate) return;
    
    const today = new Date().toDateString();

    if (lastResetDate !== today) {
      try {
        const batch = writeBatch(db);
        
        // Reset analysts
        analysts.forEach(a => {
          const ref = doc(db, "analysts", a.id);
          batch.update(ref, {
            break1: { checked: false, startTime: null, endTime: null },
            break2: { checked: false, startTime: null, endTime: null }
          });
        });

        // Clear active breaks
        activeBreaks.forEach(ab => {
          const ref = doc(db, "activeBreaks", ab.id);
          batch.delete(ref);
        });

        // Update reset date
        const settingsRef = doc(db, "settings", "global");
        batch.set(settingsRef, { lastResetDate: today });

        await batch.commit();
        console.log("Daily reset performed at:", new Date().toLocaleTimeString());
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "daily-reset");
      }
    }
  }, [lastResetDate, analysts, activeBreaks]);

  useEffect(() => {
    if (lastResetDate) {
      checkDailyReset();
    }
  }, [lastResetDate, checkDailyReset]);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    const user = analysts.find(a => a.username === loginUsername && a.password === loginPassword);
    if (user) {
      setLoggedInUser(user);
      localStorage.setItem("loggedInUser", JSON.stringify(user));
      setLoginError(null);
    } else {
      setLoginError("Usuario o contraseña incorrectos");
    }
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    localStorage.removeItem("loggedInUser");
  };

  // Sync loggedInUser with latest data from analysts
  useEffect(() => {
    if (loggedInUser) {
      const updatedUser = analysts.find(a => a.id === loggedInUser.id);
      if (updatedUser) {
        if (JSON.stringify(updatedUser) !== JSON.stringify(loggedInUser)) {
          setLoggedInUser(updatedUser);
          localStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
        }
      } else {
        // User was deleted
        handleLogout();
      }
    }
  }, [analysts, loggedInUser]);

  const handleAction = async () => {
    if (password !== ADMIN_PASSWORD) {
      setError("Clave incorrecta");
      return;
    }

    try {
      if (showPasswordModal?.type === "add") {
        if (!newAnalystName.trim() || !newAnalystUsername.trim() || !newAnalystPassword.trim()) return;
        const id = crypto.randomUUID();
        const newAnalyst: Analyst = {
          id,
          name: newAnalystName,
          username: newAnalystUsername,
          password: newAnalystPassword,
          role: "analyst",
          break1: { checked: false },
          break2: { checked: false }
        };
        await setDoc(doc(db, "analysts", id), newAnalyst);
        setNewAnalystName("");
        setNewAnalystUsername("");
        setNewAnalystPassword("");
      } else if (showPasswordModal?.type === "remove" && showPasswordModal.id) {
        await deleteDoc(doc(db, "analysts", showPasswordModal.id));
        // Also remove from active breaks
        const absToRemove = activeBreaks.filter(ab => ab.analystId === showPasswordModal.id);
        for (const ab of absToRemove) {
          await deleteDoc(doc(db, "activeBreaks", ab.id));
        }
      } else if (showPasswordModal?.type === "reset" && showPasswordModal.id) {
        await updateDoc(doc(db, "analysts", showPasswordModal.id), {
          break1: { checked: false, startTime: null, endTime: null },
          break2: { checked: false, startTime: null, endTime: null }
        });
        const absToRemove = activeBreaks.filter(ab => ab.analystId === showPasswordModal.id);
        for (const ab of absToRemove) {
          await deleteDoc(doc(db, "activeBreaks", ab.id));
        }
      } else if (showPasswordModal?.type === "resetAll") {
        const batch = writeBatch(db);
        analysts.forEach(a => {
          batch.update(doc(db, "analysts", a.id), {
            break1: { checked: false, startTime: null, endTime: null },
            break2: { checked: false, startTime: null, endTime: null }
          });
        });
        activeBreaks.forEach(ab => {
          batch.delete(doc(db, "activeBreaks", ab.id));
        });
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "admin-action");
    }

    closeModal();
  };

  const closeModal = () => {
    setShowPasswordModal(null);
    setPassword("");
    setError(null);
  };

  const toggleBreak = async (id: string, breakNum: 1 | 2) => {
    const analyst = analysts.find(a => a.id === id);
    if (!analyst) return;

    const breakKey = breakNum === 1 ? "break1" : "break2";
    if (analyst[breakKey].checked) return;

    const now = new Date();
    const startTime = Date.now();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      await updateDoc(doc(db, "analysts", id), {
        [breakKey]: {
          checked: true,
          time: timeStr,
          startTime: startTime
        }
      });

      const abId = crypto.randomUUID();
      const newActiveBreak: ActiveBreak = {
        id: abId,
        analystId: id,
        analystName: analyst.name,
        breakName: `Break ${breakNum}`,
        startTime: startTime
      };
      await setDoc(doc(db, "activeBreaks", abId), newActiveBreak);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "toggle-break");
    }
  };

  const finishBreak = async (activeBreakId: string) => {
    const ab = activeBreaks.find(b => b.id === activeBreakId);
    if (ab) {
      const now = Date.now();
      try {
        const breakKey = ab.breakName === "Break 1" ? "break1" : "break2";
        const analyst = analysts.find(a => a.id === ab.analystId);
        if (analyst) {
          await updateDoc(doc(db, "analysts", ab.analystId), {
            [`${breakKey}.endTime`]: now
          });
        }
        await deleteDoc(doc(db, "activeBreaks", activeBreakId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "finish-break");
      }
    }
  };

  const filteredAnalysts = useMemo(() => {
    if (!loggedInUser) return [];
    if (loggedInUser.role === "admin") return analysts;
    return analysts.filter(a => a.id === loggedInUser.id);
  }, [analysts, loggedInUser]);

  if (!lastResetDate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!loggedInUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Acceso al Sistema</h1>
            <p className="text-slate-500 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Usuario</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Nombre de usuario"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Contraseña</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-xs flex items-center gap-1">
                <AlertCircle size={12} />
                {loginError}
              </p>
            )}
            <button
              type="submit"
              disabled={loadingAnalysts}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAnalysts ? "Cargando..." : "Ingresar"}
            </button>
          </form>
          {analysts.length > 0 && !analysts.some(a => a.role === 'admin') && (
            <p className="text-[10px] text-center text-slate-400">
              Sincronizando base de datos... por favor espera.
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <Users className="text-blue-600" size={32} />
                Control de Analistas
              </h1>
              <p className="text-slate-500 mt-1">Gestión de descansos y turnos diarios</p>
            </div>
            <button 
              onClick={handleLogout}
              className="md:hidden p-2 text-slate-400 hover:text-red-600 transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-700">{loggedInUser.name}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{loggedInUser.role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all text-sm font-medium"
            >
              <LogOut size={18} />
              Salir
            </button>
            {loggedInUser.role === "admin" && (
              <>
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
              </>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Analysts List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={20} className="text-slate-400" />
              <h2 className="font-semibold text-slate-700">
                {loggedInUser.role === "admin" ? "Lista de Analistas" : "Mi Cuenta"}
              </h2>
            </div>
            
            <AnimatePresence mode="popLayout">
              {filteredAnalysts.map((analyst) => (
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
                    {loggedInUser.role === "admin" && (
                      <>
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
                      </>
                    )}
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
                        
                        {(loggedInUser.role === "admin" || loggedInUser.id === ab.analystId) && (
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
                        )}
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
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Nombre Completo</label>
                        <input
                          autoFocus
                          type="text"
                          value={newAnalystName}
                          onChange={(e) => setNewAnalystName(e.target.value)}
                          placeholder="Ej: David Muñoz"
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Usuario de Acceso</label>
                        <input
                          type="text"
                          value={newAnalystUsername}
                          onChange={(e) => setNewAnalystUsername(e.target.value)}
                          placeholder="Ej: dmunoz"
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Contraseña</label>
                        <input
                          type="password"
                          value={newAnalystPassword}
                          onChange={(e) => setNewAnalystPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </>
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
        <p>for DEMO</p>
      </footer>
    </div>
  );
}
