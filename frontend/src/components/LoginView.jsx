import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isLocalEnv } from '../firebase/config';
import { Lock as LockIcon, Mail, AlertCircle, LogIn, ShieldCheck, Eye } from 'lucide-react';
// Logo is in public/ folder, referenced as /coat_logo.png

const LoginView = () => {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

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

  const handleGoogleLogin = async () => {
    setError('');
    try {
      setLoading(true);
      await loginWithGoogle();
    } catch (err) {
      console.error(err);
      setError("Error al iniciar sesión con Google.");
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      const { auth } = await import('../firebase/config');
      let effectiveEmail = resetEmail;
      if (!resetEmail.includes('@')) {
        effectiveEmail = `${resetEmail}@coat.com.ar`;
      }
      await sendPasswordResetEmail(auth, effectiveEmail);
      setResetSent(true);
    } catch (err) {
      setResetError("No se pudo enviar el email de recuperación. Verificá el usuario.");
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--bg-card)] rounded-[2.5rem] shadow-2xl border border-[var(--border-main)] p-8 md:p-10 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <img src="/coat_logo.png" alt="COAT Logo" className="w-16 h-16 object-contain" />
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-[var(--text-main)]">Recuperar Contraseña</h1>
              <p className="text-[var(--text-sub)] text-sm font-medium">Ingresá tu usuario o email y te enviaremos un enlace</p>
            </div>
          </div>

          {resetSent ? (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/20">
                <ShieldCheck size={32} className="text-emerald-600" />
              </div>
              <p className="text-sm text-[var(--text-sub)] font-medium">Email de recuperación enviado. Revisá tu bandeja de entrada.</p>
              <button
                onClick={() => { setShowForgotPassword(false); setResetSent(false); setResetEmail(''); }}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98]"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {resetError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold p-4 rounded-2xl flex items-center gap-3">
                  <AlertCircle size={16} className="shrink-0" /> {resetError}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-sub)] ml-2">Usuario o Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    className="w-full bg-[var(--bg-secondary)] border-2 border-transparent focus:border-blue-600 rounded-2xl py-3.5 pl-12 pr-4 font-bold text-sm text-[var(--text-main)] outline-none transition-all"
                    placeholder="usuario o email@coat.com.ar"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98]"
              >
                Enviar email de recuperación
              </button>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="w-full py-3 text-[var(--text-sub)] text-xs font-bold hover:text-blue-600 transition-colors"
              >
                Volver al inicio de sesión
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-card)] rounded-[2.5rem] shadow-2xl border border-[var(--border-main)] p-8 md:p-10 space-y-8 relative overflow-hidden">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <img src="/coat_logo.png" alt="COAT Logo" className="w-20 h-20 object-contain" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight text-[var(--text-main)]">Cirugías COAT</h1>
            <p className="text-[var(--text-sub)] text-sm font-medium">Gestión Quirúrgica, Estudios y Presupuestos</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold p-4 rounded-2xl text-center flex items-center justify-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-sub)] ml-2">Usuario o Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                required
                className="w-full bg-[var(--bg-secondary)] border-2 border-transparent focus:border-blue-600 rounded-2xl py-3.5 pl-12 pr-4 font-bold text-sm text-[var(--text-main)] outline-none transition-all"
                placeholder="usuario o nombre@coat.com.ar"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-sub)] ml-2">Contraseña</label>
            <div className="relative">
              <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                required
                className="w-full bg-[var(--bg-secondary)] border-2 border-transparent focus:border-blue-600 rounded-2xl py-3.5 pl-12 pr-4 font-bold text-sm text-[var(--text-main)] outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Iniciar Sesión</span>
              </>
            )}
          </button>
        </form>

        {/* Google Login */}
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-main)]"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black">
              <span className="bg-[var(--bg-card)] px-4 text-[var(--text-sub)]">o continuá con</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 bg-[var(--bg-secondary)] hover:bg-blue-600/5 border-2 border-[var(--border-main)] hover:border-blue-500/30 text-[var(--text-main)] rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <button
            onClick={() => setShowForgotPassword(true)}
            className="w-full py-2 text-[var(--text-sub)] text-xs font-bold hover:text-blue-600 transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </button>

          {isLocalEnv && (
            <div className="pt-2 border-t border-[var(--border-main)]">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('coat_preview_mode', 'true');
                  window.location.href = '/?preview=1';
                }}
                className="w-full py-3.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Eye size={16} />
                <span>Vista Previa Local (Datos Ficticios / Sin Firebase)</span>
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-[var(--text-sub)] font-bold uppercase tracking-widest opacity-60">
          © 2026 COAT • Centro Otoaudiológico de Alta Tecnología
        </p>
      </div>
    </div>
  );
};

export default LoginView;
