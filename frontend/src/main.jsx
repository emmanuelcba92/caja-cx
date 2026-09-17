import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              background: '#1e293b',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '600'
            }
          }}
        />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
