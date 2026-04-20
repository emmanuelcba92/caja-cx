import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { User, Settings, ShieldCheck, HelpCircle, Moon, Sun, LogOut } from 'lucide-react-native';
import { auth } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { useTheme } from '../context/ThemeContext';

const ProfileScreen = () => {
    const user = auth.currentUser;
    const { isDark, toggleTheme, colors } = useTheme();

    const handleLogout = () => {
        signOut(auth).catch(err => alert(err.message));
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <View style={[styles.avatarContainer, { backgroundColor: isDark ? '#333' : '#e7f5ff' }]}>
                    <User color={colors.primary} size={50} />
                </View>
                <Text style={[styles.userName, { color: colors.text }]}>
                    {user?.email?.split('@')[0].toUpperCase() || 'USUARIO'}
                </Text>
                <Text style={[styles.userEmail, { color: colors.subtext }]}>{user?.email}</Text>
            </View>

            <View style={styles.menu}>
                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]} onPress={toggleTheme}>
                    {isDark ? <Sun color={colors.primary} size={20} /> : <Moon color="#6c757d" size={20} />}
                    <Text style={[styles.menuText, { color: colors.text }]}>Modo {isDark ? 'Claro' : 'Oscuro'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                    <Settings color="#6c757d" size={20} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Configuración App</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                    <ShieldCheck color="#6c757d" size={20} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Privacidad y Seguridad</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                    <HelpCircle color="#6c757d" size={20} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Centro de Ayuda</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={[styles.menuItem, styles.logout]} onPress={handleLogout}>
                    <LogOut color={colors.error} size={20} />
                    <Text style={[styles.menuText, { color: colors.error }]}>Cerrar Sesión</Text>
                </TouchableOpacity>
            </View>

            <Text style={[styles.version, { color: colors.subtext }]}>Versión 1.0.0 (COAT Digital)</Text>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { alignItems: 'center', padding: 40, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
    avatarContainer: { 
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#e7f5ff', 
        justifyContent: 'center', alignItems: 'center', marginBottom: 15
    },
    userName: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
    userEmail: { fontSize: 14, color: '#adb5bd', marginTop: 5 },
    menu: { padding: 20 },
    menuItem: { 
        flexDirection: 'row', alignItems: 'center', paddingVertical: 18, 
        borderBottomWidth: 1, borderBottomColor: '#f1f3f5' 
    },
    menuText: { fontSize: 16, color: '#495057', marginLeft: 15, fontWeight: '500' },
    divider: { height: 20 },
    logout: { borderBottomWidth: 0 },
    version: { textAlign: 'center', color: '#dee2e6', fontSize: 12, marginTop: 40 },
});

export default ProfileScreen;
