import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, TextInput, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
import { UserPlus, Search, User, ChevronRight, Plus, X, Phone, Mail, Award, Briefcase, Trash2, Edit } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { apiService } from '../services/apiService';

const ProfesionalesScreen = () => {
    const { colors, isDark } = useTheme();
    const [profesionales, setProfesionales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    
    // Form for adding/editing
    const emptyForm = { id: null, nombre: '', rol: 'Médico', especialidad: '', mp: '', celular: '' };
    const [form, setForm] = useState(emptyForm);

    const fetchProfs = async () => {
        try {
            const data = await apiService.getCollection('profesionales', {}, 'nombre');
            setProfesionales(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfs();
    }, []);

    const filteredProfs = useMemo(() => {
        return profesionales.filter(p => 
            p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
            p.especialidad?.toLowerCase().includes(search.toLowerCase()) ||
            p.rol?.toLowerCase().includes(search.toLowerCase())
        );
    }, [search, profesionales]);

    const handleSave = async () => {
        if (!form.nombre) return Alert.alert("Error", "El nombre es obligatorio");
        try {
            if (form.id) {
                await apiService.updateDocument('profesionales', form.id, form);
            } else {
                await apiService.addDocument('profesionales', form);
            }
            setModalVisible(false);
            setForm(emptyForm);
            fetchProfs();
            Alert.alert("Éxito", "Profesional guardado correctamente");
        } catch (error) {
            Alert.alert("Error", error.message);
        }
    };

    const handleDelete = (id) => {
        Alert.alert("Eliminar", "¿Estás seguro de eliminar este profesional?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Eliminar", style: "destructive", onPress: async () => {
                await apiService.deleteDocument('profesionales', id);
                fetchProfs();
            }}
        ]);
    };

    const renderProf = ({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.profHeader}>
                <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                    <User color={colors.primary} size={24} />
                </View>
                <View style={styles.textDetails}>
                    <Text style={[styles.profName, { color: colors.text }]}>{item.nombre}</Text>
                    <View style={styles.badgeRow}>
                        <View style={[styles.roleBadge, { backgroundColor: item.rol === 'Anestesista' ? '#9c27b015' : colors.primary + '15' }]}>
                            <Text style={[styles.roleText, { color: item.rol === 'Anestesista' ? '#9c27b0' : colors.primary }]}>
                                {item.rol?.toUpperCase() || 'MÉDICO'}
                            </Text>
                        </View>
                        {item.especialidad ? (
                            <Text style={[styles.profSpec, { color: colors.subtext }]}>{item.especialidad}</Text>
                        ) : null}
                    </View>
                </View>
                <View style={styles.actionColumn}>
                    <TouchableOpacity onPress={() => { setForm(item); setModalVisible(true); }}>
                        <Edit size={18} color={colors.primary} style={{ marginBottom: 15 }} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id)}>
                        <Trash2 size={18} color={colors.error} />
                    </TouchableOpacity>
                </View>
            </View>
            
            {(item.mp || item.celular) && (
                <View style={[styles.profFooter, { borderTopColor: colors.border + '30' }]}>
                    {item.mp ? (
                        <View style={styles.footerItem}>
                            <Award size={12} color={colors.subtext} />
                            <Text style={[styles.footerText, { color: colors.subtext }]}>MP: {item.mp}</Text>
                        </View>
                    ) : null}
                    {item.celular ? (
                        <View style={styles.footerItem}>
                            <Phone size={12} color={colors.subtext} />
                            <Text style={[styles.footerText, { color: colors.subtext }]}>{item.celular}</Text>
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>PROFESIONALES</Text>
                    <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>Gestión de equipo médico</Text>
                </View>
                <TouchableOpacity 
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                    onPress={() => { setForm(emptyForm); setModalVisible(true); }}
                >
                    <Plus color="#fff" size={24} />
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Search color={colors.subtext} size={20} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Buscar por nombre, especialidad o rol..."
                        placeholderTextColor={colors.subtext}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredProfs}
                    keyExtractor={item => item.id}
                    renderItem={renderProf}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.emptyCenter}>
                            <UserPlus size={60} color={colors.border} />
                            <Text style={{ color: colors.subtext, marginTop: 15, fontSize: 16 }}>No se encontraron profesionales</Text>
                        </View>
                    }
                />
            )}

            {/* Add/Edit Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>{form.id ? 'Editar Profesional' : 'Nuevo Profesional'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <X size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ marginTop: 20 }}>
                            <Text style={styles.fieldLabel}>NOMBRE COMPLETO</Text>
                            <TextInput 
                                style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                                value={form.nombre}
                                onChangeText={t => setForm({...form, nombre: t})}
                                placeholder="Ej: Dr. Juan Pérez"
                                placeholderTextColor={colors.subtext}
                            />

                            <Text style={styles.fieldLabel}>ROL</Text>
                            <View style={styles.rolePicker}>
                                {['Médico', 'Anestesista', 'Instrumentadora', 'Ayudante'].map(r => (
                                    <TouchableOpacity 
                                        key={r} 
                                        style={[styles.roleOption, { 
                                            backgroundColor: form.rol === r ? colors.primary : colors.card,
                                            borderColor: colors.primary
                                        }]}
                                        onPress={() => setForm({...form, rol: r})}
                                    >
                                        <Text style={{ color: form.rol === r ? '#fff' : colors.primary, fontSize: 11, fontWeight: 'bold' }}>{r}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.fieldLabel}>ESPECIALIDAD / DETALLE</Text>
                            <TextInput 
                                style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                                value={form.especialidad}
                                onChangeText={t => setForm({...form, especialidad: t})}
                                placeholder="Ej: Cirujano de Cabeza y Cuello"
                                placeholderTextColor={colors.subtext}
                            />

                            <View style={{ flexDirection: 'row' }}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <Text style={styles.fieldLabel}>MATRÍCULA (MP)</Text>
                                    <TextInput 
                                        style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                                        value={form.mp}
                                        onChangeText={t => setForm({...form, mp: t})}
                                        keyboardType="numeric"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fieldLabel}>TELÉFONO</Text>
                                    <TextInput 
                                        style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                                        value={form.celular}
                                        onChangeText={t => setForm({...form, celular: t})}
                                        keyboardType="phone-pad"
                                    />
                                </View>
                            </View>
                        </ScrollView>

                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>GUARDAR PROFESIONAL</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        padding: 25, paddingTop: 40
    },
    headerTitle: { fontSize: 24, fontWeight: '900', letterSpacing: 1 },
    headerSubtitle: { fontSize: 12, opacity: 0.6 },
    addButton: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    searchContainer: { paddingHorizontal: 25, marginBottom: 15 },
    searchBar: { 
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, 
        height: 52, borderRadius: 16, borderWidth: 1, elevation: 2
    },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
    list: { padding: 25, paddingTop: 10, paddingBottom: 100 },
    card: { 
        borderRadius: 25, marginBottom: 18, borderWidth: 1,
        elevation: 3, padding: 18
    },
    profHeader: { flexDirection: 'row', alignItems: 'center' },
    iconBox: { width: 54, height: 54, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    textDetails: { marginLeft: 16, flex: 1 },
    profName: { fontSize: 17, fontWeight: '800' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
    roleText: { fontSize: 9, fontWeight: '900' },
    profSpec: { fontSize: 11, fontWeight: '600', opacity: 0.7 },
    actionColumn: { alignItems: 'center' },
    profFooter: { marginTop: 15, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row' },
    footerItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
    footerText: { fontSize: 11, fontWeight: '600', marginLeft: 6 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, opacity: 0.4 },
    
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalBox: { width: '100%', borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 30, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    fieldLabel: { fontSize: 10, fontWeight: '900', color: '#999', marginTop: 20, marginBottom: 8 },
    input: { height: 45, borderBottomWidth: 1.5, fontSize: 16, paddingBottom: 5 },
    rolePicker: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
    roleOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8, marginBottom: 8, borderWidth: 1 },
    saveBtn: { height: 55, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 30, elevation: 3 },
    saveBtnText: { color: '#fff', fontWeight: '900', letterSpacing: 1 }
});

export default ProfesionalesScreen;
