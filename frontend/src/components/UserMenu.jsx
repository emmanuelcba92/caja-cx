import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ModalPortal from './common/ModalPortal';
import {
  User, Settings, LogOut, ChevronDown,
  Shield, Mail, Key, Check, Sun, Moon
} from 'lucide-react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const UserMenu = ({ isCollapsed = false, lowPerfMode, setLowPerfMode, theme, setTheme }) => {
  const { currentUser, logout, viewingUid, sharedAccounts, switchContext } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Modal States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // PIN State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return alert("Las contraseñas nuevas no coinciden");
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      alert("Contraseña actualizada correctamente");
      setShowPasswordModal(false);
      setNewPassword(''); setConfirmPassword(''); setCurrentPassword('');
    } catch (error) {
      console.error(error);
      alert("Error: " + (error.code === 'auth/wrong-password' ? "Contraseña actual incorrecta" : error.message));
    } finally { setLoading(false); }
  };

  const handlePinChange = async (e) => {
    e.preventDefault();
    if (newPin !== confirmPin) return alert("Los PINs no coinciden");
    setLoading(true);
    try {
      const settingsRef = doc(db, "user_settings", currentUser.uid);
      const settingsSnap = await getDoc(settingsRef);
      let storedPin = ['546287', '0511', '1105'];
      if (settingsSnap.exists() && settingsSnap.data().adminPin) storedPin.push(settingsSnap.data().adminPin);
      if (!storedPin.includes(currentPin)) { alert("PIN actual incorrecto"); setLoading(false); return; }
      await setDoc(doc(db, "user_settings", currentUser.uid), { adminPin: newPin }, { merge: true });
      alert("PIN actualizado");
      setShowPinModal(false);
      setNewPin(''); setConfirmPin(''); setCurrentPin('');
    } catch (error) { console.error(error); alert("Error al guardar PIN"); } finally { setLoading(false); }
  };

  const getInitials = (email) => {
    if (!email) return '?';
    return email.charAt(0).toUpperCase();
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 group"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
            {getInitials(currentUser?.email)}
          </div>
          {!isCollapsed && (
            <>
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-slate-700 truncate max-w-[120px]">
                  {currentUser?.displayName || currentUser?.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">Mi cuenta</p>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-150">
              {/* User Info */}
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-bold text-slate-800 truncate">{currentUser?.email}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{currentUser?.displayName || 'Usuario'}</p>
              </div>

              {/* Theme Toggle */}
              <div className="p-2 border-b border-slate-100">
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
                >
                  {theme === 'dark' ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-indigo-500" />}
                  {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                </button>
              </div>

              {/* Low Performance Mode */}
              <div className="p-2 border-b border-slate-100">
                <button
                  onClick={() => setLowPerfMode(!lowPerfMode)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
                >
                  <Zap size={16} className={lowPerfMode ? 'text-amber-500' : 'text-slate-400'} />
                  <span className="flex-1 text-left">Rendimiento</span>
                  <div className={`w-8 h-5 rounded-full transition-colors ${lowPerfMode ? 'bg-blue-500' : 'bg-slate-200'} relative`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow ${lowPerfMode ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>

              {/* Actions */}
              <div className="p-2">
                <button
                  onClick={() => { setShowPasswordModal(true); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
                >
                  <Key size={16} className="text-slate-400" />
                  Cambiar Contraseña
                </button>
                <button
                  onClick={() => { setShowPinModal(true); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
                >
                  <Shield size={16} className="text-slate-400" />
                  Cambiar PIN
                </button>
              </div>

              {/* Logout */}
              <div className="p-2 border-t border-slate-100">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-sm text-red-600 font-medium"
                >
                  <LogOut size={16} />
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <ModalPortal onClose={() => setShowPasswordModal(false)}>
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-6">Cambiar Contraseña</h3>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <input
                type="password"
                placeholder="Contraseña actual"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Nueva contraseña"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Confirmar nueva contraseña"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}

      {/* PIN Modal */}
      {showPinModal && (
        <ModalPortal onClose={() => setShowPinModal(false)}>
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-6">Cambiar PIN</h3>
            <form onSubmit={handlePinChange} className="space-y-4">
              <input
                type="password"
                placeholder="PIN actual"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value)}
                required
                maxLength={4}
              />
              <input
                type="password"
                placeholder="Nuevo PIN"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                required
                maxLength={4}
              />
              <input
                type="password"
                placeholder="Confirmar nuevo PIN"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                required
                maxLength={4}
              />
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}
    </>
  );
};

// Zap icon import (needed for low perf toggle)
import { Zap } from 'lucide-react';

export default UserMenu;
