import React, { useState, useEffect, Suspense, lazy } from 'react';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';
import { Users, LayoutDashboard, FileText, History, Menu, ChevronLeft, ChevronRight, Share2, StickyNote, ClipboardList, Printer, Calendar as CalendarIcon, ShieldCheck, Sun, Moon } from 'lucide-react';

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
  const [lowPerfMode, setLowPerfMode] = useState(() => localStorage.getItem('low_perf_mode') === 'true');

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

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
        { id: 'caja', label: 'Caja', icon: LayoutDashboard },
        { id: 'historial', label: 'Historial', icon: History },
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
        { id: 'control', label: 'Control', icon: Printer }
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6 border border-slate-200 animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Acceso Restringido</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              Tu cuenta (<span className="text-slate-900 font-bold">{currentUser.email}</span>) no está autorizada para acceder a este sistema.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600 space-y-2">
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
    <div className="h-screen font-sans text-slate-900 flex bg-slate-50 transition-colors duration-300 overflow-hidden">

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Redesigned Sidebar (Fixed Width, Vertical Icons) */}
      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} fixed md:relative h-screen w-[85px] bg-white border-r border-slate-200 flex flex-col shadow-md md:shadow-none transition-all duration-300 z-30`}>
        
        {/* Sidebar Logo */}
        <div className="py-6 flex flex-col items-center flex-shrink-0">
          <div className="flex flex-col items-center gap-1">
            <img src="/c_logo.svg" alt="Logo" className="w-10 h-10 rounded-xl shadow-md shadow-blue-500/10" />
            <span className="text-[8px] font-black text-blue-600 uppercase tracking-tighter mt-1">CIRUGÍAS</span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          <nav className="flex flex-col items-center gap-4">
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
                className={`w-16 h-16 flex flex-col items-center justify-center rounded-2xl transition-all group relative ${activeModuleId === mod.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-400/20'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                title={mod.label}
              >
                <mod.icon size={22} className={`mb-1 transition-transform duration-300 ${activeModuleId === mod.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[9px] font-bold uppercase tracking-tighter text-center leading-none px-1">
                  {mod.label}
                </span>

                {/* Notifications Badges for specific modules */}
                {mod.id === 'notas' && notesCount > 0 && (
                  <span className="absolute top-2 right-2 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-[8px] font-black items-center justify-center shadow-sm">
                      {notesCount}
                    </span>
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer (Theme, User, Logout) */}
        <div className="p-3 border-t border-slate-100 flex flex-col items-center gap-4 py-6">

          {/* User Profile */}
          <div className="w-full flex justify-center">
            <UserMenu 
              isCollapsed={true} 
              lowPerfMode={lowPerfMode}
              setLowPerfMode={setLowPerfMode}
            />
          </div>

          {/* Logout Icon */}
          <button
            onClick={logout}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 transition-all"
            title="Cerrar Sesión"
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 transition-colors duration-300">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`md:hidden mr-2 p-2 rounded-lg hover:bg-slate-100 transition-colors ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              <Menu size={24} className="text-slate-600" />
            </button>
            
            <div className="flex items-baseline gap-2 shrink-0">
              <span className="text-sm md:text-xl font-black text-slate-900 uppercase tracking-tight">
                {filteredNav.find(m => m.id === activeModuleId)?.tabs.find(t => t.id === activeTab)?.label || activeTab}
              </span>
            </div>

            {/* Sub-navigation Tabs for grouped modules */}
            {filteredNav.find(m => m.id === activeModuleId)?.tabs.length > 1 && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl ml-2 md:ml-4 overflow-x-auto no-scrollbar max-w-[150px] sm:max-w-[300px] md:max-w-none">
                {filteredNav.find(m => m.id === activeModuleId).tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 md:px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-8 bg-slate-50 transition-colors duration-300">
          <div className={`mx-auto space-y-6 transition-all duration-300 ${sidebarOpen ? 'max-w-7xl' : 'max-w-[1600px]'}`}>
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-400">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="animate-pulse font-medium">Cargando módulo...</p>
              </div>
            }>
              {activeTab === 'caja' && <CajaForm />}
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
                />
              )}
              {activeTab === 'control' && (isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes) && (
                <OrdenesView
                  initialTab="control"
                  draftData={draftSurgery}
                  onDraftConsumed={() => setDraftSurgery(null)}
                />
              )}
              {activeTab === 'admin' && (isSuperAdmin || permissions?.can_view_admin) && <AdminView />}
            </Suspense>
          </div>
        </section>

        {/* HISTORIAL DE CAMBIOS MODAL */}
        {showNextFeatures && (
          <ModalPortal onClose={() => setShowNextFeatures(false)}>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl w-full max-w-lg border border-slate-100 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Historial de Cambios 📓</h3>
                  <p className="text-xs text-slate-400 font-mono mt-1 italic">Registro de actualizaciones realizadas</p>
                </div>
                <button onClick={() => setShowNextFeatures(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                  <Menu size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-blue-500 uppercase tracking-widest border-l-2 border-blue-500 pl-3">19 de Enero, 2026</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">Compatibilidad W7:</strong>
                        <p className="text-xs opacity-70">Añadidos fallbacks de colores y estilos para soportar Chrome 109 y navegadores antiguos.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">Diseño Responsivo:</strong>
                        <p className="text-xs opacity-70">Menú de botones adaptativo en Liquidaciones y mejoras de visualización en móviles.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">URL Corta:</strong>
                        <p className="text-xs opacity-70">Migración al nuevo dominio corto: cajacx.web.app.</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-2 border-slate-300 pl-3">18 de Enero, 2026</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">Sistema de Fechas Seguro:</strong>
                        <p className="text-xs opacity-70">Implementación de escudos contra errores de renderizado por fechas inválidas.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">Deducciones Detalladas:</strong>
                        <p className="text-xs opacity-70">Añadida fecha individual a cada ítem de "Agregar Detalle".</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">Liquidación Multi-profesional:</strong>
                        <p className="text-xs opacity-70">Nueva funcionalidad para dividir honorarios manuales entre múltiples médicos.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900">Recibos Dinámicos:</strong>
                        <p className="text-xs opacity-70">La fecha del recibo ahora coincide con el periodo de liquidación seleccionado.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowNextFeatures(false)}
                className="w-full mt-8 py-4 bg-slate-900 text-white font-black rounded-2xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest shadow-md shadow-slate-200"
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
