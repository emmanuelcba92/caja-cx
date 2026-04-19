import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ModalPortal from './common/ModalPortal';
import {
    User, Settings, LogOut, Moon, Sun, ChevronDown,
    Shield, Mail, Key, Users, Check, Zap
} from 'lucide-react';
import { updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const UserMenu = ({ isCollapsed = false, lowPerfMode, setLowPerfMode }) => {
    const { currentUser, logout, viewingUid, sharedAccounts, switchContext, linkEmailPassword, hasPasswordProvider } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // Modal States
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showLinkPasswordModal, setShowLinkPasswordModal] = useState(false);

    // ... (rest of the state and handlers remain same)
    // I'll keep them for consistency in the replacement
    
    // Password State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Email State
    const [newEmail, setNewEmail] = useState('');

    // PIN State
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');

    // Link Password State
    const [linkPassword, setLinkPassword] = useState('');
    const [linkConfirmPassword, setLinkConfirmPassword] = useState('');

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

    const handleEmailChange = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updateEmail(currentUser, newEmail);
            alert("Email actualizado correctamente");
            setShowEmailModal(false);
            setNewEmail('');
        } catch (error) {
            console.error(error);
            alert("Error: " + (error.code === 'auth/requires-recent-login' ? "Debes re-autenticarte para este cambio" : error.message));
        } finally { setLoading(false); }
    };

    const handlePinChange = async (e) => {
        e.preventDefault();
        if (newPin !== confirmPin) return alert("Los PINs no coinciden");
        setLoading(true);
        try {
            const settingsRef = doc(db, "user_settings", currentUser.uid);
            const settingsSnap = await getDoc(settingsRef);
            let storedPin = ['0511', 'admin', '1234'];
            if (settingsSnap.exists() && settingsSnap.data().adminPin) storedPin.push(settingsSnap.data().adminPin);
            if (!storedPin.includes(currentPin)) { alert("PIN actual incorrecto"); setLoading(false); return; }
            await setDoc(doc(db, "user_settings", currentUser.uid), { adminPin: newPin }, { merge: true });
            alert("PIN actualizado");
            setShowPinModal(false);
            setNewPin(''); setConfirmPin(''); setCurrentPin('');
        } catch (error) { console.error(error); alert("Error al guardar PIN"); } finally { setLoading(false); }
    };

    const handleLinkPassword = async (e) => {
        e.preventDefault();
        if (linkPassword !== linkConfirmPassword) return alert("No coinciden");
        setLoading(true);
        try {
            await linkEmailPassword(linkPassword);
            alert("Contraseña vinculada");
            setShowLinkPasswordModal(false);
        } catch (error) { console.error(error); alert(error.message); } finally { setLoading(false); }
    };


    const userInitials = currentUser?.email ? currentUser.email.substring(0, 2).toUpperCase() : '??';

    return (
        <div className="relative">
            {/* Trigger Button - Circle Avatar */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm group ${isOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                title="Cuenta de Usuario"
            >
                <span className="text-xs font-black tracking-tighter group-hover:scale-110 transition-transform">{userInitials}</span>
            </button>

            {/* Dropdown Backdrop */}
            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute left-full bottom-0 ml-4 w-72 bg-white dark:bg-slate-900 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in slide-in-from-left-2 duration-200 origin-left">

                    {/* Header */}
                    <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate tracking-tight">{currentUser?.email}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest mt-1">Cuenta de Usuario</p>
                    </div>

                    <div className="p-3 space-y-1">



                        {/* Settings Section */}
                        <div className="px-2 py-2">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 opacity-50">Configuración</p>

                            <div className="space-y-1">
                                <button
                                    onClick={() => { setShowPasswordModal(true); setIsOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <Key size={18} /> Cambiar Contraseña
                                </button>

                                <button
                                    onClick={() => { setShowEmailModal(true); setIsOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <Mail size={18} /> Cambiar Email
                                </button>

                                <button
                                    onClick={() => { setShowPinModal(true); setIsOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <Shield size={18} /> Configurar PIN
                                </button>

                                {!hasPasswordProvider() && (
                                    <button
                                        onClick={() => { setShowLinkPasswordModal(true); setIsOpen(false); }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                    >
                                        <Key size={18} /> Vincular Contraseña
                                    </button>
                                )}

                                {!currentUser?.email?.endsWith('@coat.com.ar') && (
                                    <button
                                        onClick={() => {
                                            const base = currentUser.email.split('@')[0];
                                            setNewEmail(`${base}@coat.com.ar`);
                                            setShowEmailModal(true);
                                            setIsOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors border border-amber-100 dark:border-amber-900/50 mt-1"
                                    >
                                        <Shield size={18} /> Migrar a @coat.com.ar
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

                        {/* Advanced/Performance Section */}
                        <div className="px-2 py-2">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 opacity-50">Rendimiento</p>
                            
                            <button
                                onClick={() => setLowPerfMode(!lowPerfMode)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all ${lowPerfMode ? 'bg-amber-500 text-white shadow-md shadow-amber-200/20 dark:shadow-none' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                            >
                                <span className="flex items-center gap-3">
                                    <Zap size={18} fill={lowPerfMode ? "currentColor" : "none"} /> 
                                    Modo PC Antigua
                                </span>
                                <div className={`w-8 h-4 rounded-full relative transition-colors ${lowPerfMode ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${lowPerfMode ? 'right-1' : 'left-1'}`} />
                                </div>
                            </button>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2 px-1 leading-tight font-medium">
                                Elimina sombras y efectos visuales para maximizar la velocidad en hardware limitado.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {showPasswordModal && (
                <ModalPortal onClose={() => setShowPasswordModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm p-10 animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-6 tracking-tight uppercase">Cambiar Contraseña</h3>
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <input
                                type="password"
                                placeholder="Contraseña Actual"
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Nueva contraseña"
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Confirmar Nueva"
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                            <div className="flex gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowPasswordModal(false)}
                                    className="flex-1 py-4 text-slate-500 dark:text-slate-400 font-black hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-500/10 uppercase text-xs tracking-widest transition-all hover:scale-[1.02]"
                                >
                                    {loading ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalPortal>
            )}

            {/* Change Email Modal */}
            {showEmailModal && (
                <ModalPortal onClose={() => setShowEmailModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm p-10 animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-6 tracking-tight uppercase">Cambiar Email</h3>
                        <form onSubmit={handleEmailChange} className="space-y-4">
                            <input
                                type="email"
                                placeholder="Nuevo correo electrónico"
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                required
                            />
                            <div className="flex gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowEmailModal(false)}
                                    className="flex-1 py-4 text-slate-500 dark:text-slate-400 font-black hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-500/10 uppercase text-xs tracking-widest transition-all hover:scale-[1.02]"
                                >
                                    {loading ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalPortal>
            )}

            {/* Change PIN Modal */}
            {showPinModal && (
                <ModalPortal onClose={() => setShowPinModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm p-10 animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-2 tracking-tight uppercase">PIN de Seguridad</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">Protege acciones sensibles como borrar o editar registros históricos.</p>
                        <form onSubmit={handlePinChange} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 opacity-50">PIN Actual</label>
                                <input
                                    type="text"
                                    placeholder="####"
                                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-[1em] font-black text-xl shadow-inner"
                                    value={currentPin}
                                    onChange={(e) => setCurrentPin(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 opacity-50">Nuevo PIN</label>
                                <input
                                    type="text"
                                    placeholder="####"
                                    className="w-full px-5 py-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-black tracking-[1em] text-3xl shadow-sm"
                                    value={newPin}
                                    onChange={(e) => setNewPin(e.target.value)}
                                    maxLength={8}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 opacity-50">Confirmar PIN</label>
                                <input
                                    type="text"
                                    placeholder="####"
                                    className="w-full px-5 py-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-black tracking-[1em] text-3xl shadow-sm"
                                    value={confirmPin}
                                    onChange={(e) => setConfirmPin(e.target.value)}
                                    maxLength={8}
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowPinModal(false)}
                                    className="flex-1 py-4 text-slate-500 dark:text-slate-400 font-black hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-500/10 uppercase text-xs tracking-widest transition-all hover:scale-[1.02]"
                                >
                                    {loading ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalPortal>
            )}

            {/* Link Password Modal */}
            {showLinkPasswordModal && (
                <ModalPortal onClose={() => setShowLinkPasswordModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm p-10 animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-2 tracking-tight uppercase">Vincular Contraseña</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">Crea una contraseña para acceder con email además de Google.</p>
                        <form onSubmit={handleLinkPassword} className="space-y-4">
                            <input
                                type="password"
                                placeholder="Nueva Contraseña"
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold transition-all"
                                value={linkPassword}
                                onChange={(e) => setLinkPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Confirmar Contraseña"
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold transition-all"
                                value={linkConfirmPassword}
                                onChange={(e) => setLinkConfirmPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                            <div className="flex gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowLinkPasswordModal(false)}
                                    className="flex-1 py-4 text-slate-500 dark:text-slate-400 font-black hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-500/10 uppercase text-xs tracking-widest transition-all hover:scale-[1.02]"
                                >
                                    {loading ? '...' : 'Vincular'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalPortal>
            )}
        </div>
    );
};

export default UserMenu;
