import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';

const LoginView = () => {
    const { login, loginWithGoogle } = useAuth();
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Automatically append domain if it's just a username
        let effectiveEmail = email;
        if (!email.includes('@')) {
            effectiveEmail = `${email}@coat.com.ar`;
        }

        if (isRegistering && password !== confirmPassword) {
            return setError("Las contraseñas no coinciden");
        }

        try {
            setLoading(true);
            if (isRegistering) {
                await createUserWithEmailAndPassword(auth, effectiveEmail, password);
            } else {
                await login(effectiveEmail, password);
            }
        } catch (err) {
            console.error(err);
            let msg = err.message;
            if (msg.includes('auth/email-already-in-use')) msg = "Este correo ya está registrado.";
            if (msg.includes('auth/weak-password')) msg = "La contraseña debe tener al menos 6 caracteres.";
            if (msg.includes('auth/invalid-credential')) msg = "Credenciales incorrectas.";
            setError(msg);
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setLoading(true);
            await loginWithGoogle();
        } catch (err) {
            console.error(err);
            setError('Error con Google Login: ' + err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Caja de Cirugía</h1>
                    <p className="text-slate-500">{isRegistering ? "Crea una cuenta nueva" : "Inicia sesión para continuar"}</p>
                    <p className="text-[10px] text-amber-600 font-bold uppercase mt-2 tracking-widest bg-amber-50 py-1 rounded-full px-4 inline-block border border-amber-100 italic">Acceso restringido por autorización</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Usuario / Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                required
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder="ej: coat_admin o tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="password"
                                required
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {isRegistering && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Contraseña</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? 'Procesando...' : (isRegistering ? <><UserPlus size={18} /> Crear Cuenta</> : <><LogIn size={18} /> Ingresar</>)}
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <button
                        onClick={() => setIsRegistering(!isRegistering)}
                        className="text-sm text-blue-600 font-medium hover:underline"
                    >
                        {isRegistering ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}
                    </button>
                </div>

                <div className="mt-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">O continuar con</span>
                        </div>
                    </div>

                    <div className="mt-6">
                        <button
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            Acceder con Google
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginView;
