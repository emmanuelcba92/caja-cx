import React, { useState, useEffect } from 'react';
import CajaForm from './components/CajaForm';
import LiquidacionView from './components/LiquidacionView';
import ProfesionalesView from './components/ProfesionalesView';
import HistorialCaja from './components/HistorialCaja';
import { LayoutDashboard, FileText, Users, History, Menu, Moon, Sun, ChevronLeft, ChevronRight } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('caja');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className={`min-h-screen font-sans text-slate-900 transition-colors duration-300 flex ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-[#f8fafc]'}`}>

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-sm transition-all duration-300 relative z-20`}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-8 bg-blue-600 text-white p-1 rounded-full shadow-md z-30 hover:bg-blue-700 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-8 overflow-hidden whitespace-nowrap">

            <div className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
              <h1 className="font-bold text-lg leading-tight uppercase tracking-tight dark:text-white">Caja de cirugía</h1>

            </div>
          </div>

          <nav className="space-y-1">
            {[
              { id: 'caja', icon: LayoutDashboard, label: 'Caja Diaria' },
              { id: 'historial', icon: History, label: 'Cajas' },
              { id: 'liquidaciones', icon: FileText, label: 'Liquidaciones' },
              { id: 'profesionales', icon: Users, label: 'Profesionales' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center px-4 py-3 rounded-xl transition-all font-medium whitespace-nowrap overflow-hidden ${activeTab === item.id
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
                  } ${!sidebarOpen ? 'justify-center px-2' : 'gap-3'}`}
                title={!sidebarOpen ? item.label : ''}
              >
                <item.icon size={sidebarOpen ? 20 : 28} className={`flex-shrink-0 transition-all ${!sidebarOpen && 'hover:scale-110'}`} />
                <span className={`transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>


      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-8 shadow-sm z-10 transition-colors duration-300">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 capitalize flex items-center gap-2">
            {!sidebarOpen && <Menu className="md:hidden" />}
            Principal / {activeTab}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} />}
            </button>
            <span className="text-sm font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-3 py-1 rounded-full uppercase tracking-wider hidden sm:block">Sistema Activo</span>

          </div>
        </header>

        <section className={`flex-1 overflow-y-auto p-8 ${darkMode ? 'bg-slate-900' : 'bg-[#f8fafc]/50'} transition-colors duration-300`}>
          <div className={`mx-auto space-y-6 transition-all duration-300 ${sidebarOpen ? 'max-w-7xl' : 'max-w-[1600px]'}`}>
            {activeTab === 'caja' && <CajaForm />}
            {activeTab === 'historial' && <HistorialCaja />}
            {activeTab === 'liquidaciones' && <LiquidacionView />}
            {activeTab === 'profesionales' && <ProfesionalesView />}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
