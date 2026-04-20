import React, { createContext, useState, useContext, useEffect } from 'react';
import { useColorScheme } from 'react-native';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');

  const toggleTheme = () => setIsDark(!isDark);

  const theme = {
    isDark,
    colors: isDark ? darkColors : lightColors,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

const lightColors = {
  background: '#f8f9fa',
  card: '#ffffff',
  text: '#212529',
  subtext: '#6c757d',
  primary: '#008080',
  border: '#dee2e6',
  white: '#ffffff',
  error: '#e74c3c',
  success: '#2ecc71'
};

const darkColors = {
  background: '#121212',
  card: '#1e1e1e',
  text: '#f8f9fa',
  subtext: '#adb5bd',
  primary: '#26a69a',
  border: '#333333',
  white: '#ffffff',
  error: '#cf6679',
  success: '#81c784'
};
