import React, { useState, useEffect } from 'react';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { AuthProvider, useAuth } from './context/AuthContext';

// Components
import LoginView from './components/LoginView';
import CajaForm from './components/CajaForm';
import LiquidacionView from './components/LiquidacionView';
import ProfesionalesView from './components/ProfesionalesView';
import AccessManager from './components/AccessManager';
import NotesView from './components/NotesView';
import OrdenesView from './components/OrdenesView';
import AdminView from './components/AdminView';
import AdminMigration from './components/AdminMigration';
import UserMenu from './components/UserMenu';

// Icons
import {
  Users, LayoutDashboard, FileText, History, Menu, ChevronLeft, ChevronRight,
  StickyNote, ClipboardList, Calendar, ShieldCheck, Archive, Coins,
  Settings, Stethoscope, X, ShieldAlert, LogOut, CheckCircle2
} from 'lucide-react';

const MainLayout = () => {
  const { currentUser, logout, permission, viewingUid } = useAuth();
  const [activeTab, setActiveTab] = useState('caja');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNextFeatures, setShowNextFeatures] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Sync Pending Reminders Count for Browser Tab
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "reminders"),
      where("userId", "==", viewingUid || currentUser.uid),
      where("completed", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.length;
      setPendingCount(count);
      document.title = count > 0 ? `(${count}) Caja de Cirugía` : `Caja de Cirugía`;
    });

    return () => {
      unsubscribe();
      document.title = `Caja de Cirugía`;
    };
  }, [currentUser, viewingUid]);

  const isAdmin = permission === 'admin';
  const isCaja = permission === 'caja' || isAdmin;
  const isAuditor = permission === 'auditor' || isAdmin;

  const menuItems = [
    { id: 'caja', label: 'Caja Diaria', icon: LayoutDashboard, visible: isCaja || permission === 'viewer' },
    { id: 'notas', label: 'Notas', icon: StickyNote, visible: true },
    { id: 'ordenes', label: 'Órdenes', icon: ClipboardList, visible: true },
    { id: 'pedidos', label: 'Pedidos (PM)', icon: Stethoscope, visible: true },
    { id: 'liquidaciones', label: 'Liquidaciones', icon: Coins, visible: isAdmin },
    { id: 'profesionales', label: 'Profesionales', icon: Users, visible: isAdmin },
    { id: 'cajas', label: 'Cajas', icon: Archive, visible: isAdmin },
    { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck, visible: isAuditor },
    { id: 'administracion', label: 'Administración', icon: Settings, visible: isAdmin },
  ].filter(item => item.visible);

  if (!permission && currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6 border border-slate-200">
          <div className="w-20 h-20 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Acceso Restringido</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              Tu cuenta (<span className="text-slate-900 font-bold">{currentUser.email}</span>) no está autorizada.
            </p>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg">
            <LogOut size={18} /> Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFB] text-slate-900 font-sans selection:bg-teal-100 selection:text-teal-900">

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} hidden md:flex flex-col bg-white border-r border-slate-100 transition-all duration-300 relative z-30`}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-8 bg-teal-600 text-white p-1 rounded-full shadow-md z-30 hover:bg-teal-700 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-teal-100">
            <span className="font-black text-xl">C</span>
          </div>
          {sidebarOpen && (
            <div className="animate-in fade-in duration-300">
              <h1 className="font-black text-slate-800 tracking-tighter leading-none text-lg">CAJA DE CIRUGÍA</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Centro COAT</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-bold whitespace-nowrap ${activeTab === item.id
                ? 'bg-teal-50 text-teal-600 shadow-sm'
                : 'text-slate-400 hover:bg-slate-50 hover:text-teal-600'
                } ${!sidebarOpen ? 'justify-center px-0' : 'gap-3'}`}
            >
              <item.icon size={20} />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-6">
          <div onClick={() => setShowNextFeatures(true)} className="text-[10px] text-slate-400 font-mono cursor-pointer hover:text-teal-500 transition-colors flex flex-col gap-0.5">
            <span>v1.3.1</span>
            {sidebarOpen && <span>Actualizado: 19/02/2026</span>}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-100 shrink-0 z-10 no-print">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <span>Principal</span>
            <ChevronRight size={12} className="opacity-50" />
            <span className="text-teal-600 font-black">{menuItems.find(i => i.id === activeTab)?.label}</span>
          </div>
          <UserMenu />
        </header>

        <section className="flex-1 overflow-y-auto p-8 relative scroll-smooth">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeTab === 'caja' && <CajaForm />}
            {activeTab === 'liquidaciones' && <LiquidacionView />}
            {activeTab === 'profesionales' && <ProfesionalesView />}
            {activeTab === 'ordenes' && <OrdenesView />}
            {activeTab === 'pedidos' && <OrdenesView initialTab="pedidos" />}
            {activeTab === 'notas' && <NotesView />}
            {activeTab === 'cajas' && <AdminMigration />}
            {activeTab === 'auditoria' && <AdminView />}
            {activeTab === 'administracion' && <AccessManager />}
          </div>
        </section>
      </main>

      {/* Version Modal */}
      {showNextFeatures && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-teal-500" />
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Actualizaciones</h3>
              <button onClick={() => setShowNextFeatures(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-4 text-sm text-slate-600">
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                <p><strong>Branding Teal & Orange:</strong> Interfaz unificada con la imagen institucional.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                <p><strong>Historial Dual:</strong> Seguimiento completo de ARS y USD por profesional.</p>
              </div>
            </div>
            <button onClick={() => setShowNextFeatures(false)} className="w-full mt-8 py-3 bg-teal-600 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-teal-700 shadow-lg shadow-teal-50">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

const AppContent = () => {
  const { currentUser, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    </div>
  );
  return currentUser ? <MainLayout /> : <LoginView />;
};

const App = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
