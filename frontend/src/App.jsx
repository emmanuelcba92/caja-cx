import React, { useState, useEffect } from 'react';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import CajaForm from './components/CajaForm';
import LiquidacionView from './components/LiquidacionView';
import ProfesionalesView from './components/ProfesionalesView';
import HistorialCaja from './components/HistorialCaja';
import AccessManager from './components/AccessManager';
import NotesView from './components/NotesView';
import OrdenesView from './components/OrdenesView';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginView from './components/LoginView';
import AdminView from './components/AdminView';
import { ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';

import UserMenu from './components/UserMenu';
import { Users, LayoutDashboard, FileText, History, Menu, ChevronLeft, ChevronRight, Share2, StickyNote, ClipboardList, FileHeart } from 'lucide-react';


function AuthenticatedApp() {
  const { currentUser, logout, viewingUid, sharedAccounts, switchContext, catalogOwnerUid } = useAuth();
  const { isAuthorized, isSuperAdmin, userRole, permissions } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  // Sync Pending Reminders Count for Browser Tab (PER USER)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "reminders"),
      where("userId", "==", currentUser.uid),
      where("completed", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.length;
      setPendingCount(count);
      if (count > 0) {
        document.title = `(${count}) Caja de Cirugía`;
      } else {
        document.title = `Caja de Cirugía`;
      }
    });

    return () => {
      unsubscribe();
      document.title = `Caja de Cirugía`;
    };
  }, [viewingUid, catalogOwnerUid]);

  // Tabs Definition
  const allTabs = [
    { id: 'caja', icon: LayoutDashboard, label: 'Caja Diaria' },
    { id: 'notas', icon: StickyNote, label: 'Notas' },
    { id: 'historial', icon: History, label: 'Cajas' },
    { id: 'liquidaciones', icon: FileText, label: 'Liquidaciones' },
    { id: 'profesionales', icon: Users, label: 'Profesionales' },
    { id: 'ordenes', icon: ClipboardList, label: 'Órdenes' },
    { id: 'pedidos', icon: FileHeart, label: 'Pedidos (PM)' },
    { id: 'compartir', icon: Share2, label: 'Compartir' },
    { id: 'admin', icon: ShieldAlert, label: 'Administración' }
  ];

  // Filter tabs logic
  const visibleTabs = allTabs.filter(tab => {
    // 1. Admin Tab Security
    if (tab.id === 'admin') {
      return isSuperAdmin;
    }

    // 1.5. Ordenes Tab - for Super Admin or users with ordenes permissions
    if (tab.id === 'ordenes' || tab.id === 'pedidos') {
      return isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes;
    }

    // 2. Shared Catalog Viewers (COAT behavior)
    // Users with 'can_view_shared_catalog' are restricted to essential tabs
    if (permissions?.can_view_shared_catalog) {
      return ['caja', 'liquidaciones', 'profesionales', 'historial', 'notas'].includes(tab.id);
    }

    return true;
  });

  const [activeTab, setActiveTab] = useState(userRole === 'coat' ? 'profesionales' : 'caja'); // Default tab logic
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [darkMode, setDarkMode] = useState(false);
  const [showNextFeatures, setShowNextFeatures] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  if (!currentUser) {
    return <LoginView />;
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6 border border-slate-200 animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
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
              <CheckCircle2 size={16} className="text-teal-500" />
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
    <div className={`min-h-screen font-sans text-slate-900 transition-colors duration-300 flex ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-[#f8fafc]'}`}>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0 md:translate-x-0 md:w-20'} fixed md:relative min-h-screen bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-xl md:shadow-none transition-all duration-300 z-30`}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute -right-3 top-8 bg-teal-600 text-white p-1 rounded-full shadow-md z-30 hover:bg-teal-700 transition-colors hidden md:flex`}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="p-4 md:p-6">
          <div className={`flex items-center gap-3 mb-8 overflow-hidden whitespace-nowrap ${!sidebarOpen && 'justify-center'}`}>
            <img src="/c_logo.svg" alt="Logo" className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
              <h1 className="font-bold text-lg leading-tight uppercase tracking-tight dark:text-white">Caja de cirugía</h1>
              <p className="text-[10px] text-slate-400 font-medium truncate">{currentUser?.email}</p>
            </div>
          </div>

          <nav className="space-y-1">
            {visibleTabs.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (window.innerWidth < 768) setSidebarOpen(false); // Close on mobile select
                }}
                className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-medium whitespace-nowrap overflow-hidden ${activeTab === item.id
                  ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400 font-bold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
                  } ${!sidebarOpen ? 'justify-center px-0' : 'gap-3'}`}
                title={!sidebarOpen ? item.label : ''}
              >
                <item.icon size={sidebarOpen ? 20 : 28} className={`flex-shrink-0 transition-all ${!sidebarOpen && 'hover:scale-110'}`} />
                <span className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>


        <div className={`mt-auto p-6 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
          <div
            onClick={() => setShowNextFeatures(true)}
            className="text-[10px] text-slate-400 font-mono cursor-pointer hover:text-teal-500 transition-colors flex flex-col gap-0.5"
          >
            <span>v1.3.0</span>
            <span>Actualizado: 26/01/2026 - 19:53</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-8 shadow-sm z-10 transition-colors duration-300">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 capitalize flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`md:hidden mr-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              <Menu size={24} className="text-slate-600 dark:text-slate-300" />
            </button>
            <span className="hidden sm:inline">Principal /</span> {activeTab}
          </div>
          <div className="flex items-center gap-4">
            <UserMenu darkMode={darkMode} setDarkMode={setDarkMode} />
          </div>
        </header>

        <section className={`flex-1 overflow-y-auto p-8 ${darkMode ? 'bg-slate-900' : 'bg-[#f8fafc]/50'} transition-colors duration-300`}>
          <div className={`mx-auto space-y-6 transition-all duration-300 ${sidebarOpen ? 'max-w-7xl' : 'max-w-[1600px]'}`}>
            {activeTab === 'caja' && <CajaForm />}
            {activeTab === 'notas' && <NotesView />}
            {activeTab === 'historial' && <HistorialCaja />}
            {activeTab === 'liquidaciones' && <LiquidacionView />}
            {activeTab === 'profesionales' && <ProfesionalesView />}
            {activeTab === 'compartir' && <AccessManager />}
            {activeTab === 'ordenes' && (isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes) && <OrdenesView initialTab="internacion" />}
            {activeTab === 'pedidos' && (isSuperAdmin || permissions?.can_view_ordenes || permissions?.can_share_ordenes) && <OrdenesView initialTab="pedidos" />}
            {activeTab === 'admin' && (isSuperAdmin || permissions?.can_view_admin) && <AdminView />}
          </div>
        </section>

        {/* HISTORIAL DE CAMBIOS MODAL */}
        {showNextFeatures && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-100 dark:border-slate-700 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Historial de Cambios 📓</h3>
                  <p className="text-xs text-slate-400 font-mono mt-1 italic">Registro de actualizaciones realizadas</p>
                </div>
                <button onClick={() => setShowNextFeatures(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                  <Menu size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-teal-500 uppercase tracking-widest border-l-2 border-teal-500 pl-3">19 de Enero, 2026</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>Compatibilidad W7:</strong>
                        <p className="text-xs opacity-70">Añadidos fallbacks de colores y estilos para soportar Chrome 109 y navegadores antiguos.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>Diseño Responsivo:</strong>
                        <p className="text-xs opacity-70">Menú de botones adaptativo en Liquidaciones y mejoras de visualización en móviles.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>URL Corta:</strong>
                        <p className="text-xs opacity-70">Migración al nuevo dominio corto: cajacx.web.app.</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-2 border-slate-300 pl-3">18 de Enero, 2026</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>Sistema de Fechas Seguro:</strong>
                        <p className="text-xs opacity-70">Implementación de escudos contra errores de renderizado por fechas inválidas.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>Deducciones Detalladas:</strong>
                        <p className="text-xs opacity-70">Añadida fecha individual a cada ítem de "Agregar Detalle".</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>Liquidación Multi-profesional:</strong>
                        <p className="text-xs opacity-70">Nueva funcionalidad para dividir honorarios manuales entre múltiples médicos.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <strong>Recibos Dinámicos:</strong>
                        <p className="text-xs opacity-70">La fecha del recibo ahora coincide con el periodo de liquidación seleccionado.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowNextFeatures(false)}
                className="w-full mt-8 py-3 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
              >
                Cerrar Registro
              </button>
            </div>
          </div>
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
