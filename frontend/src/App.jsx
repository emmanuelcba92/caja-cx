import React from 'react';
import { useAuth } from './context/AuthContext.jsx';
import LoginView from './components/LoginView';
import SurgeryApp from './SurgeryApp.jsx';

function App() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <LoginView />;
  }

  return <SurgeryApp />;
}

export default App;
