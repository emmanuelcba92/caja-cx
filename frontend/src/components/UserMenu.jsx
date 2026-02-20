import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    User, Settings, LogOut, Moon, Sun, ChevronDown,
    Shield, Mail, Key, Users, Check
} from 'lucide-react';
import { updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const UserMenu = () => {
    const { currentUser, logout, viewingUid, sharedAccounts, switchContext, linkEmailPassword, hasPasswordProvider } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // Modal States
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showLinkPasswordModal, setShowLinkPasswordModal] = useState(false);

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
            // Re-authenticate
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);

            // Update
            await updatePassword(currentUser, newPassword);
            alert("Contraseña actualizada correctamente");
            setShowPasswordModal(false);
            setNewPassword('');
            setConfirmPassword('');
            setCurrentPassword('');
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/wrong-password') {
                alert("La contraseña actual es incorrecta.");
            } else if (error.code === 'auth/requires-recent-login') {
                alert("Por seguridad, inicia sesión nuevamente.");
            } else {
                alert("Error: " + error.message);
            }
        } finally {
            setLoading(false);
        }
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
            if (error.code === 'auth/requires-recent-login') {
                alert("Por seguridad, debes cerrar sesión y volver a entrar para cambiar el email.");
            } else {
                alert("Error al actualizar email: " + error.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePinChange = async (e) => {
        e.preventDefault();
        if (newPin !== confirmPin) return alert("Los PINs nuevos no coinciden");

        setLoading(true);
        try {
            // Verify Old PIN if exists
            const settingsRef = doc(db, "user_settings", currentUser.uid);
            const settingsSnap = await getDoc(settingsRef);

            let storedPin = ['0511', 'admin', '1234']; // Default valid pins
            let actualCurrentPin = null;
            if (settingsSnap.exists() && settingsSnap.data().adminPin) {
                actualCurrentPin = settingsSnap.data().adminPin;
                storedPin.push(actualCurrentPin);
            }

            // Check if input currentPin is valid
            if (!storedPin.includes(currentPin)) {
                alert("El PIN actual es incorrecto.");
                setLoading(false);
                return;
            }

            // Save to user_settings collection with doc ID = user UID
            await setDoc(doc(db, "user_settings", currentUser.uid), {
                adminPin: newPin
            }, { merge: true });

            alert("PIN de seguridad actualizado correctamente");
            setShowPinModal(false);
            setNewPin('');
            setConfirmPin('');
            setCurrentPin('');
        } catch (error) {
            console.error("Error saving PIN:", error);
            alert("Error al guardar el PIN.");
        } finally {
            setLoading(false);
        }
    };

    const handleLinkPassword = async (e) => {
        e.preventDefault();
        if (linkPassword !== linkConfirmPassword) return alert("Las contraseñas no coinciden");
        if (linkPassword.length < 6) return alert("La contraseña debe tener al menos 6 caracteres");

        setLoading(true);
        try {
            await linkEmailPassword(linkPassword);
            alert("¡Contraseña vinculada correctamente! Ahora puedes iniciar sesión con email/contraseña.");
            setShowLinkPasswordModal(false);
            setLinkPassword('');
            setLinkConfirmPassword('');
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/provider-already-linked') {
                alert("Ya tienes una contraseña vinculada.");
            } else if (error.code === 'auth/requires-recent-login') {
                alert("Por seguridad, cierra sesión y vuelve a entrar con Google.");
            } else {
                alert("Error: " + error.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative z-50">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 transition-all group"
            >
                <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-slate-700">{currentUser?.email}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium group-hover:text-blue-500 transition-colors">
                        {viewingUid === currentUser.uid ? 'Mi Caja' : 'Caja Compartida'}
                    </p>
                </div>
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                    <User size={20} />
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Backdrop */}
            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">

                    {/* Header */}
                    <div className="p-4 bg-slate-50 border-b border-slate-100">
                        <p className="text-sm font-bold text-slate-900 truncate">{currentUser?.email}</p>
                        <p className="text-xs text-slate-400">Cuenta de Usuario</p>
                    </div>

                    <div className="p-2 space-y-1">

                        {/* Context Switcher Section */}
                        <div className="px-2 py-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cajas Disponibles</p>

                            <button
                                onClick={() => { switchContext(currentUser.uid); setIsOpen(false); }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${viewingUid === currentUser.uid ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                <span className="flex items-center gap-2">
                                    <Shield size={16} /> Mi Caja
                                </span>
                                {viewingUid === currentUser.uid && <Check size={16} />}
                            </button>

                            {sharedAccounts.map(acc => (
                                <button
                                    key={acc.id}
                                    onClick={() => { switchContext(acc.ownerUid); setIsOpen(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${viewingUid === acc.ownerUid ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <Users size={16} /> {acc.ownerEmail.split('@')[0]}
                                    </span>
                                    {viewingUid === acc.ownerUid && <Check size={16} />}
                                </button>
                            ))}
                        </div>

                        <div className="h-px bg-slate-100 my-1" />

                        {/* Settings Section */}
                        <div className="px-2 py-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Configuración</p>

                            <button
                                onClick={() => { setShowPasswordModal(true); setIsOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                <Key size={16} /> Cambiar Contraseña
                            </button>

                            <button
                                onClick={() => { setShowEmailModal(true); setIsOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                <Mail size={16} /> Cambiar Email
                            </button>

                            <button
                                onClick={() => { setShowPinModal(true); setIsOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                <Shield size={16} /> Configurar PIN de Seguridad
                            </button>

                            {/* Link Password - Solo mostrar si aún no tiene contraseña */}
                            {!hasPasswordProvider() && (
                                <button
                                    onClick={() => { setShowLinkPasswordModal(true); setIsOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                                >
                                    <Key size={16} /> Vincular Contraseña
                                </button>
                            )}

                            {/* Migrar a coat.com.ar */}
                            {!currentUser?.email?.endsWith('@coat.com.ar') && (
                                <button
                                    onClick={() => {
                                        const base = currentUser.email.split('@')[0];
                                        setNewEmail(`${base}@coat.com.ar`);
                                        setShowEmailModal(true);
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors border border-amber-100 mt-1"
                                >
                                    <Shield size={16} /> Migrar a @coat.com.ar
                                </button>
                            )}
                        </div>

                        <div className="h-px bg-slate-100 my-1" />

                        <button
                            onClick={logout}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <LogOut size={16} /> Cerrar Sesión
                        </button>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Cambiar Contraseña</h3>
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div>
                                <input
                                    type="password"
                                    placeholder="Contraseña Actual"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    placeholder="Nueva conraseña (min 6 caracteres)"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    minLength={6}
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    placeholder="Confirmar Nueva Contraseña"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    minLength={6}
                                    required
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPasswordModal(false)}
                                    className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {loading ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Change Email Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Cambiar Email</h3>
                        <form onSubmit={handleEmailChange}>
                            <input
                                type="email"
                                placeholder="Nuevo correo electrónico"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                required
                            />
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowEmailModal(false)}
                                    className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {loading ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Change PIN Modal */}
            {showPinModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Configurar PIN de Admin</h3>
                        <p className="text-xs text-slate-500 mb-4">Protege acciones sensibles (borrar, editar en modo seguro).</p>
                        <form onSubmit={handlePinChange} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">PIN Actual</label>
                                <input
                                    type="text"
                                    placeholder="PIN Actual (ej: 1234)"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-widest"
                                    value={currentPin}
                                    onChange={(e) => setCurrentPin(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Nuevo PIN</label>
                                <input
                                    type="text"
                                    placeholder="Nuevo PIN"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold tracking-widest text-xl"
                                    value={newPin}
                                    onChange={(e) => setNewPin(e.target.value)}
                                    maxLength={8}
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Confirmar Nuevo PIN</label>
                                <input
                                    type="text"
                                    placeholder="Repetir Nuevo PIN"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold tracking-widest text-xl"
                                    value={confirmPin}
                                    onChange={(e) => setConfirmPin(e.target.value)}
                                    maxLength={8}
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPinModal(false)}
                                    className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {loading ? '...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Link Password Modal */}
            {showLinkPasswordModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Vincular Contraseña</h3>
                        <p className="text-xs text-slate-500 mb-4">Crea una contraseña para acceder con email y contraseña además de Google.</p>
                        <form onSubmit={handleLinkPassword} className="space-y-4">
                            <div>
                                <input
                                    type="password"
                                    placeholder="Nueva Contraseña (min 6 caracteres)"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    value={linkPassword}
                                    onChange={(e) => setLinkPassword(e.target.value)}
                                    minLength={6}
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    placeholder="Confirmar Contraseña"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    value={linkConfirmPassword}
                                    onChange={(e) => setLinkConfirmPassword(e.target.value)}
                                    minLength={6}
                                    required
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowLinkPasswordModal(false)}
                                    className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {loading ? '...' : 'Vincular'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserMenu;
