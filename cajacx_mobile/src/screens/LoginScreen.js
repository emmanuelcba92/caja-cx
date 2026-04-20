import { StyleSheet, Text, View, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { LogIn, AtSign, Lock, ShieldCheck } from 'lucide-react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

const COLORS = {
  primary: '#008080',
  secondary: '#004d40',
  background: '#f8fafc',
  text: '#0f172a',
  subtext: '#64748b',
  white: '#ffffff',
  accent: '#fef3c7',
  border: '#e2e8f0'
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Por favor, ingresá tus credenciales.');
      return;
    }
    
    setIsLoading(true);
    let finalEmail = email.trim();
    if (!finalEmail.includes('@')) {
        finalEmail += '@coat.com.ar';
    }

    try {
      await signInWithEmailAndPassword(auth, finalEmail, password);
    } catch (error) {
      let msg = 'Error al iniciar sesión.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = 'Usuario o contraseña incorrectos.';
      } else {
        msg += ' ' + error.message;
      }
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.header}>
            <View style={styles.logoContainer}>
                <ShieldCheck color={COLORS.primary} size={40} />
            </View>
            <Text style={styles.title}>CIRUGÍAS COAT</Text>
            <Text style={styles.subtitle}>Sistema de Gestión Clínica Móvil</Text>
        </View>

        <View style={[styles.card, styles.shadow]}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>USUARIO</Text>
            <View style={[styles.inputContainer, { borderColor: COLORS.border }]}>
                <AtSign color={COLORS.subtext} size={18} />
                <TextInput 
                    style={styles.input}
                    placeholder="Nombre de usuario"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#94a3b8"
                />
            </View>
            {!email.includes('@') && email.length > 0 && (
                <Text style={styles.hintText}>Se agregará automáticamente @coat.com.ar</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>CONTRASEÑA</Text>
            <View style={[styles.inputContainer, { borderColor: COLORS.border }]}>
                <Lock color={COLORS.subtext} size={18} />
                <TextInput 
                    style={styles.input}
                    placeholder="••••••••"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholderTextColor="#94a3b8"
                />
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.button, isLoading && styles.buttonDisabled]} 
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Text style={styles.buttonText}>INGRESAR</Text>
                <LogIn color={COLORS.white} size={20} style={{ marginLeft: 10 }} />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.restringidoBadge}>
            <Text style={styles.restringidoText}>ACCESO RESTRINGIDO POR AUTORIZACIÓN</Text>
          </View>
        </View>

        <Text style={styles.footerText}>COAT v2.0 © 2026</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  header: { alignItems: 'center', marginBottom: 35 },
  logoContainer: {
    width: 80, height: 80, borderRadius: 25, backgroundColor: COLORS.white, 
    justifyContent: 'center', alignItems: 'center', marginBottom: 20, 
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10
  },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: 1 },
  subtitle: { fontSize: 13, color: COLORS.subtext, fontWeight: '600', marginTop: 5 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 30, padding: 30,
  },
  shadow: {
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 10, color: COLORS.subtext, marginBottom: 8, fontWeight: '800', letterSpacing: 1 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 15, paddingHorizontal: 15, height: 55, borderWidth: 1.5,
  },
  input: { flex: 1, marginLeft: 12, fontSize: 16, color: COLORS.text, fontWeight: '600' },
  hintText: { fontSize: 10, color: COLORS.primary, marginTop: 6, fontWeight: '700', marginLeft: 4 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 18, height: 58, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 4
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: COLORS.white, fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  restringidoBadge: {
    backgroundColor: COLORS.accent, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, marginTop: 25, alignItems: 'center', borderWidth: 1, borderColor: '#fde68a',
  },
  restringidoText: { fontSize: 9, fontWeight: '800', color: '#92400e' },
  footerText: { textAlign: 'center', color: COLORS.subtext, fontSize: 11, fontWeight: '700', marginTop: 40 },
});
