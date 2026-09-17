import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock as LockIcon, Mail, AlertCircle, LogIn, ShieldCheck } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-[420px] bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-slate-100">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Recuperar Contraseña</h1>
            <p className="text-sm text-slate-500 mt-2">Ingresa tu usuario y te enviaremos un email</p>
          </div>

          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck size={32} className="text-emerald-600" />
              </div>
              <p className="text-sm text-slate-600">Email de recuperación enviado. Revisa tu bandeja de entrada.</p>
              <button
                onClick={() => { setShowForgotPassword(false); setResetSent(false); setResetEmail(''); }}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
              >
                Volver al login
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {resetError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={14} /> {resetError}
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="usuario o email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
              >
                Enviar email de recuperación
              </button>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="w-full py-3 text-slate-500 text-sm font-semibold hover:text-slate-700 transition-colors"
              >
                Volver al login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 md:p-6 relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-[420px] relative z-10">
        <div className="bg-white/50 backdrop-blur-2xl border-none shadow-2xl p-0.5 rounded-[2.5rem]">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12">
            {/* Header */}
            <div className="text-center mb-8 md:mb-10">
              <div className="flex justify-center mb-4 md:mb-6">
                <img
                  src="/coat_logo.png"
                  alt="COAT Logo"
                  className="h-20 md:h-28 w-auto object-contain drop-shadow-sm hover:scale-105 transition-transform duration-500"
                />
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">CIRUGIAS COAT</h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                Plataforma de Gestión Quirúrgica
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 md:p-4 rounded-2xl mb-6 md:mb-8 flex items-center gap-3 text-xs font-bold border border-red-100 animate-in slide-in-from-top-2">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <div className="space-y-1 md:space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Identificación</label>
                <div className="relative group">
                  <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                  <input
                    type="text"
                    required
                    className="w-full pl-14 pr-4 h-14 md:h-16 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/50 text-base md:text-lg transition-all"
                    placeholder="usuario o email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1 md:space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Contraseña</label>
                <div className="relative group">
                  <LockIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                  <input
                    type="password"
                    required
                    className="w-full pl-14 pr-4 h-14 md:h-16 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/50 text-base md:text-lg transition-all"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 md:h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-base md:text-lg shadow-2xl shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-2 md:mt-4"
              >
                {loading ? (
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn size={20} />
                    Iniciar Sesión
                  </>
                )}
              </button>
            </form>

            {/* Google Login */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-4 text-slate-400 font-medium">o continuá con</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full mt-4 h-14 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
            </div>

            {/* Forgot Password */}
            <button
              onClick={() => setShowForgotPassword(true)}
              className="w-full mt-4 py-3 text-slate-400 text-xs font-semibold hover:text-slate-600 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
