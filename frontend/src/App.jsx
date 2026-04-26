import React, { useState, useEffect, Suspense, lazy } from 'react';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { AuthProvider, useAuth } from './context/AuthContext';
import { supabase } from './supabase/config';
import { ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';
import { Users, LayoutDashboard, FileText, History as HistoryIcon, Menu, ChevronLeft, ChevronRight, Share2, StickyNote, ClipboardList, Printer, Calendar as CalendarIcon, ShieldCheck, Sun, Moon, FileBadge } from 'lucide-react';

// Static immediately-needed components
import NotificationBell from './components/NotificationBell';
import UserMenu from './components/UserMenu';
import LoginView from './components/LoginView';

// Lazy-loaded views
const CajaForm = lazy(() => import('./components/CajaForm'));
const LiquidacionView = lazy(() => import('./components/LiquidacionView'));
const ProfesionalesView = lazy(() => import('./components/ProfesionalesView'));
const HistorialCaja = lazy(() => import('./components/HistorialCaja'));
const AccessManager = lazy(() => import('./components/AccessManager'));
const NotesView = lazy(() => import('./components/NotesView'));
const OrdenesView = lazy(() => import('./components/OrdenesView'));
const AdminView = lazy(() => import('./components/AdminView'));
const ConsentimientosView = lazy(() => import('./components/ConsentimientosView'));
const PacientesView = lazy(() => import('./components/PacientesView'));
import { createPortal } from 'react-dom';

const ModalPortal = ({ children, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-300">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative pointer-events-auto">
        {children}
      </div>
    </div>,
    document.body
  );
};

function AuthenticatedApp() {
  const { currentUser, logout, viewingUid, sharedAccounts, switchContext, catalogOwnerUid } = useAuth();
  const { isAuthorized, isSuperAdmin, userRole, permissions } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [lowPerfMode, setLowPerfMode] = useState(() => {
    const saved = localStorage.getItem('low_perf_mode');
    if (saved !== null) return saved === 'true';
    // Auto-detect Chrome 109 or low-end environment
    const isLegacy = /Chrome\/109/.test(navigator.userAgent) || /Windows NT 6.1/.test(navigator.userAgent);
    return isLegacy;
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  // Supabase Heartbeat (Wake up server)
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        // Just a tiny list call to wake up the storage/api
        await supabase.storage.from('Cirugias').list('', { limit: 1 });
        console.log("Supabase heartbeat sent");
      } catch (e) {
        console.warn("Supabase heartbeat failed:", e.message);
      }
    };
    sendHeartbeat();
  }, []);

  // Theme & Performance Sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (lowPerfMode) {
      document.documentElement.classList.add('low-perf');
      localStorage.setItem('low_perf_mode', 'true');
    } else {
      document.documentElement.classList.remove('low-perf');
      localStorage.setItem('low_perf_mode', 'false');
    }
  }, [lowPerfMode]);

  // Sync Combined Counts for Browser Tab (Reminders + Notes)
  useEffect(() => {
    const totalCount = pendingCount + notesCount;
    if (totalCount > 0) {
      document.title = `(${totalCount}) Cirugías COAT`;
    } else {
      document.title = `Cirugías COAT`;
    }
  }, [pendingCount, notesCount]);

  // Sync Pending Reminders Count for Browser Tab (PER USER)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "reminders"),
      where("completed", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.docs.length);
    });

    return () => unsubscribe();
  }, []);

  // Sync Unread Notes Count
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "notes"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotesCount(snapshot.docs.filter(d => d.data().isRead !== true).length);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const navStructure = [
    {
      id: 'module_caja',
      label: 'Caja',
      icon: LayoutDashboard,
      defaultTab: 'caja',
      tabs: [
        { id: 'caja', label: 'Caja de Cirugía', icon: LayoutDashboard },
        { id: 'historial', label: 'Historial', icon: HistoryIcon },
        { id: 'liquidaciones', label: 'Liquidaciones', icon: FileText },
        { id: 'profesionales', label: 'Profesionales', icon: Users }
      ]
    },
    {
      id: 'module_cirugias',
      label: 'Cirugías',
      icon: ClipboardList,
      defaultTab: 'ordenes',
      tabs: [
        { id: 'ordenes', label: 'Órdenes', icon: ClipboardList },
        { id: 'pacientes', label: 'Pacientes', icon: Users },
        { id: 'control', label: 'Control', icon: Printer },
        { id: 'consentimientos', label: 'Consentimientos', icon: FileBadge }
      ]
    },
    {
      id: 'notas',
      label: 'Notas',
      icon: StickyNote,
      tabs: [{ id: 'notas', label: 'Notas', icon: StickyNote }]
    },
    {
      id: 'module_sistema',
      label: 'Sistema',
      icon: ShieldCheck,
      defaultTab: 'admin',
      tabs: [
        { id: 'admin', label: 'Admin', icon: ShieldAlert }
      ]
    }
  ];

  // Logic to filter visible modules and tabs based on permissions
  const filteredNav = navStructure.map(module => ({
    ...module,
    tabs: module.tabs.filter(tab => {
      if (tab.id === 'admin') return isSuperAdmin || permissions?.can_view_admin;
      if (userRole === 'medico') return ['notas', 'ordenes', 'control'].includes(tab.id);
      if (tab.id === 'ordenes' || tab.id === 'control') {
        return isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes;
      }
      if (permissions?.can_view_shared_catalog) {
        const allowed = ['caja', 'liquidaciones', 'profesionales', 'historial', 'notas'];
        if (permissions?.can_view_ordenes) allowed.push('ordenes', 'control');
        return allowed.includes(tab.id);
      }
      return true;
    })
  })).filter(mod => mod.tabs.length > 0);

  const [activeModuleId, setActiveModuleId] = useState(() => {
    if (userRole === 'coat') return 'module_caja';
    return 'module_caja';
  });
  
  const [activeTab, setActiveTab] = useState(() => {
    if (userRole === 'coat') return 'profesionales';
    return 'caja';
  });
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [showNextFeatures, setShowNextFeatures] = useState(false);
  const [draftSurgery, setDraftSurgery] = useState(null);

  const handleNavigate = (tab, payload = null) => {
    setActiveTab(tab);
    if (payload) {
      setDraftSurgery(payload);
    }
  };


  if (!currentUser) {
    return <LoginView />;
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Acceso Restringido</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              Tu cuenta (<span className="text-slate-900 dark:text-white font-bold">{currentUser.email}</span>) no está autorizada para acceder a este sistema.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 space-y-2">
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Solicita acceso al administrador</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg"
          >
            <LogOut size={18} /> Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen font-sans text-slate-900 dark:text-slate-100 flex bg-slate-50 dark:bg-slate-950 overflow-hidden ${lowPerfMode ? '' : 'transition-colors duration-300'}`}>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Redesigned Sidebar (Fixed Width, Vertical Icons) */}
      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} fixed md:relative h-screen w-[100px] bg-white dark:bg-slate-950/80 backdrop-blur-xl border-r border-slate-200 dark:border-white/5 flex flex-col shadow-2xl transition-all duration-500 z-30`}>
        
        {/* Sidebar Logo */}
        <div className="py-10 flex flex-col items-center flex-shrink-0">
          <div className="flex flex-col items-center gap-3 group cursor-pointer">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.3)] group-hover:scale-110 transition-all duration-500 transform -rotate-3 group-hover:rotate-0">
              <img src="/c_logo.svg" alt="Logo" className={`w-10 h-10 ${theme === 'dark' ? 'brightness-0 invert' : ''}`} />
            </div>
            <span className="text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.2em] mt-2 group-hover:text-blue-400 transition-colors text-center px-1">CIRUGÍAS</span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 custom-scrollbar">
          <nav className="flex flex-col items-center gap-5">
            {filteredNav.map((mod) => (
              <button
                key={mod.id}
                onClick={() => {
                  setActiveModuleId(mod.id);
                  if (mod.tabs.length > 0) {
                    // Switch to the first tab of the module if the current tab isn't in it
                    if (!mod.tabs.find(t => t.id === activeTab)) {
                      setActiveTab(mod.tabs[0].id);
                    }
                  }
                  if (window.innerWidth < 768 && mod.tabs.length === 1) setSidebarOpen(false);
                }}
                className={`w-16 h-16 flex flex-col items-center justify-center rounded-2xl transition-all duration-300 group relative ${activeModuleId === mod.id
                  ? 'bg-blue-600 text-white shadow-[0_0_25px_rgba(37,99,235,0.4)] scale-110'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-blue-600 dark:hover:text-slate-300'
                  }`}
                title={mod.label}
              >
                <div className={`transition-transform duration-500 ${activeModuleId === mod.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                  <mod.icon size={24} strokeWidth={activeModuleId === mod.id ? 2.5 : 2} />
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-center leading-none px-1 mt-1.5 opacity-80 group-hover:opacity-100">
                  {mod.label}
                </span>

                {/* Notifications Badges for specific modules */}
                {mod.id === 'notas' && notesCount > 0 && (
                  <span className="absolute top-2 right-2 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-[8px] font-black items-center justify-center shadow-lg">
                      {notesCount}
                    </span>
                  </span>
                )}
                
                {/* Active Indicator */}
                {activeModuleId === mod.id && (
                  <div className="absolute -left-3 w-1.5 h-8 bg-blue-500 dark:bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.8)]"></div>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer (Theme, User, Logout) */}
        <div className="p-4 border-t border-slate-100 dark:border-white/5 flex flex-col items-center gap-6 py-10 bg-slate-50/50 dark:bg-black/20">

          {/* User Profile */}
          <UserMenu 
            isCollapsed={true} 
            lowPerfMode={lowPerfMode}
            setLowPerfMode={setLowPerfMode}
            theme={theme}
            setTheme={setTheme}
          />

          {/* Logout Icon */}
          <button
            onClick={logout}
            className="w-12 h-12 flex items-center justify-center rounded-2xl text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-all duration-300"
            title="Cerrar Sesión"
          >
            <LogOut size={22} />
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className={`h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 z-10 ${lowPerfMode ? '' : 'transition-all duration-300'}`}>
          <div className="flex items-center gap-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`md:hidden p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:scale-105 active:scale-95 transition-all ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              <Menu size={24} />
            </button>
            
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.3em] mb-1">
                {filteredNav.find(m => m.id === activeModuleId)?.label || 'Módulo'}
              </span>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {filteredNav.find(m => m.id === activeModuleId)?.tabs.find(t => t.id === activeTab)?.label || activeTab}
              </h1>
            </div>

            {/* Premium Tab Selector */}
            {filteredNav.find(m => m.id === activeModuleId)?.tabs.length > 1 && (
              <div className="hidden md:flex items-center bg-slate-100/50 dark:bg-white/5 p-1.5 rounded-2xl ml-8 border border-slate-200/50 dark:border-white/5">
                {filteredNav.find(m => m.id === activeModuleId).tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all duration-300 uppercase tracking-widest ${
                      activeTab === tab.id
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xl shadow-blue-500/10 scale-105'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Sistema Operativo</span>
            </div>
            <NotificationBell />
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          <div className={`mx-auto space-y-6 ${lowPerfMode ? '' : 'transition-all duration-300'} ${activeTab === 'consentimientos' ? 'max-w-full px-4' : (sidebarOpen ? 'max-w-[1220px]' : 'max-w-[1280px]')}`}>
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-400 dark:text-slate-500">
                <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-900/30 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="animate-pulse font-medium">Cargando módulo...</p>
              </div>
            }>
              {activeTab === 'caja' && <CajaForm lowPerfMode={lowPerfMode} />}
              {activeTab === 'notas' && <NotesView />}
              {activeTab === 'historial' && <HistorialCaja />}
              {activeTab === 'liquidaciones' && <LiquidacionView />}
              {activeTab === 'profesionales' && <ProfesionalesView />}
              {activeTab === 'compartir' && <AccessManager />}
              {activeTab === 'ordenes' && (isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes) && (
                <OrdenesView
                  initialTab="internacion"
                  draftData={draftSurgery}
                  onDraftConsumed={() => setDraftSurgery(null)}
                  lowPerfMode={lowPerfMode}
                />
              )}
              {activeTab === 'control' && (isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes) && (
                <OrdenesView
                  initialTab="control"
                  draftData={draftSurgery}
                  onDraftConsumed={() => setDraftSurgery(null)}
                  lowPerfMode={lowPerfMode}
                />
              )}
              {activeTab === 'pacientes' && (isSuperAdmin || permissions?.can_view_ordenes) && <PacientesView lowPerfMode={lowPerfMode} />}
              {activeTab === 'consentimientos' && (isSuperAdmin || permissions?.can_view_ordenes) && <ConsentimientosView />}
              {activeTab === 'admin' && (isSuperAdmin || permissions?.can_view_admin) && <AdminView />}
            </Suspense>
          </div>
        </section>

        {/* HISTORIAL DE CAMBIOS MODAL */}
        {showNextFeatures && (
          <ModalPortal onClose={() => setShowNextFeatures(false)}>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-xl w-full max-w-lg border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Historial de Cambios 📓</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1 italic">Registro de actualizaciones realizadas</p>
                </div>
                <button onClick={() => setShowNextFeatures(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                  <Menu size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-blue-500 uppercase tracking-widest border-l-2 border-blue-500 pl-3">19 de Enero, 2026</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Compatibilidad W7:</strong>
                        <p className="text-xs opacity-70">Añadidos fallbacks de colores y estilos para soportar Chrome 109 y navegadores antiguos.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Diseño Responsivo:</strong>
                        <p className="text-xs opacity-70">Menú de botones adaptativo en Liquidaciones y mejoras de visualización en móviles.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">URL Corta:</strong>
                        <p className="text-xs opacity-70">Migración al nuevo dominio corto: cajacx.web.app.</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-2 border-slate-300 pl-3">18 de Enero, 2026</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Sistema de Fechas Seguro:</strong>
                        <p className="text-xs opacity-70">Implementación de escudos contra errores de renderizado por fechas inválidas.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Deducciones Detalladas:</strong>
                        <p className="text-xs opacity-70">Añadida fecha individual a cada ítem de "Agregar Detalle".</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Liquidación Multi-profesional:</strong>
                        <p className="text-xs opacity-70">Nueva funcionalidad para dividir honorarios manuales entre múltiples médicos.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Recibos Dinámicos:</strong>
                        <p className="text-xs opacity-70">La fecha del recibo ahora coincide con el periodo de liquidación seleccionado.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowNextFeatures(false)}
                className="w-full mt-8 py-4 bg-slate-900 dark:bg-blue-600 text-white font-black rounded-2xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest shadow-md shadow-slate-200 dark:shadow-none"
              >
                Cerrar Registro
              </button>
            </div>
          </ModalPortal>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}


export default App;
