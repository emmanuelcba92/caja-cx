import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock as LockIcon, Mail, AlertCircle, LogIn, ShieldCheck, Zap } from 'lucide-react';

const LoginView = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        let effectiveEmail = email;
        if (!email.includes('@')) {
            effectiveEmail = `${email}@coat.com.ar`;
        }

        try {
            setLoading(true);
            await login(effectiveEmail, password);
        } catch (err) {
            console.error(err);
            let msg = err.message;
            if (msg.includes('auth/invalid-credential') || msg.includes('auth/user-not-found')) msg = "Credenciales incorrectas.";
            if (msg.includes('auth/wrong-password')) msg = "Contraseña incorrecta.";
            setError(msg);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 relative overflow-hidden font-['Outfit']">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 dark:bg-blue-600/20 blur-[120px] rounded-full animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 dark:bg-indigo-600/20 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="w-full max-w-[440px] relative z-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="premium-card p-1 bg-white/50 dark:bg-slate-900/50 backdrop-blur-2xl border-none shadow-2xl">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.9rem] p-10 md:p-12">
                        {/* Header Section */}
                        <div className="text-center mb-10">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-blue-500/30 mb-6 group hover:scale-110 transition-transform duration-500">
                                <Zap size={36} className="group-hover:animate-bounce-slow" />
                            </div>
                            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2">CIRUGIAS COAT</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                Plataforma de Gestión Quirúrgica
                            </p>
                            
                            <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                                <ShieldCheck size={12} className="text-amber-500" />
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest">Acceso Restringido</span>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-2xl mb-8 flex items-center gap-3 text-xs font-bold border border-red-100 dark:border-red-900/30 animate-in slide-in-from-top-2">
                                <AlertCircle size={18} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-4">Identificación</label>
                                <div className="relative group">
                                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                                    <input
                                        type="text"
                                        required
                                        className="input-premium pl-14 h-16 text-lg focus:ring-blue-500/10 focus:border-blue-500/50"
                                        placeholder="usuario o email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-4">Contraseña</label>
                                <div className="relative group">
                                    <LockIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                                    <input
                                        type="password"
                                        required
                                        className="input-premium pl-14 h-16 text-lg focus:ring-blue-500/10 focus:border-blue-500/50"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-4 group"
                            >
                                {loading ? (
                                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <LogIn size={22} />
                                        <span className="uppercase tracking-widest">Entrar al Sistema</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
                
                {/* Footer Info */}
                <p className="mt-8 text-center text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.3em]">
                    v4.0.0 PREMIUM &copy; 2026 COAT DEVELOPMENT
                </p>
            </div>
        </div>
    );
};

export default LoginView;
