import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
                    <div className="bg-white p-8 rounded-3xl shadow-xl max-w-2xl w-full border border-red-100">
                        <div className="flex items-center gap-4 mb-6 text-red-600">
                            <div className="p-3 bg-red-100 rounded-full">
                                <ShieldAlert size={32} />
                            </div>
                            <h1 className="text-2xl font-black uppercase tracking-tight">Algo salió mal</h1>
                        </div>

                        <p className="text-slate-600 font-medium mb-6">
                            Ha ocurrido un error inesperado en la aplicación. Por favor, intenta recargar.
                            Si el error persiste, envía una captura de esta pantalla al soporte.
                        </p>

                        <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-auto max-h-64 mb-6 border border-slate-700">
                            <p className="text-red-400 font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
                            <pre className="opacity-70 whitespace-pre-wrap">
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-200"
                        >
                            <RefreshCw size={20} />
                            Recargar Aplicación
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
