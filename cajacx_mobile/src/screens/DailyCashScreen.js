import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, SafeAreaView, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { LayoutGrid, Plus, Trash2, Search, Check, Save, Calendar, X, ChevronDown, User, Edit2, Info, MessageSquare } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { apiService } from '../services/apiService';
import { auth } from '../services/firebase';

const DailyCashScreen = () => {
    const { colors, isDark } = useTheme();
    const [loading, setLoading] = useState(true);
    const [profesionales, setProfesionales] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD for DB
    const [displayDate, setDisplayDate] = useState(''); // DD-MM-YYYY for UI
    
    useEffect(() => {
        const [y, m, d] = selectedDate.split('-');
        setDisplayDate(`${d}-${m}-${y}`);
    }, [selectedDate]);

    const [historial, setHistorial] = useState([]);
    
    // UI State
    const [dateModalVisible, setDateModalVisible] = useState(false);
    const [tempDate, setTempDate] = useState(selectedDate);
    const [selectorVisible, setSelectorVisible] = useState(false);
    const [selectorTarget, setSelectorTarget] = useState({ field: null, role: 'medico' });
    const [searchText, setSearchText] = useState('');

    // Editor Form State (Full Web Parity)
    const emptyForm = {
        id: null,
        paciente: '',
        dni: '',
        obra_social: '',
        pesos: '',
        dolares: '',
        prof_1: '', porcentaje_prof_1: '100', liq_prof_1: '', liq_prof_1_currency: 'ARS',
        prof_2: '', porcentaje_prof_2: '0', liq_prof_2: '', liq_prof_2_currency: 'ARS',
        prof_3: '', porcentaje_prof_3: '0', liq_prof_3: '', liq_prof_3_currency: 'ARS',
        anestesista: '', liq_anestesista: '', liq_anestesista_currency: 'ARS',
        comentario: ''
    };
    const [form, setForm] = useState(emptyForm);

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    const loadData = async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        setLoading(true);
        try {
            if (profesionales.length === 0) {
                const profs = await apiService.getCollection('profesionales', { userId });
                profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
                setProfesionales(profs);
            }
            const data = await apiService.getCollection('caja', { fecha: selectedDate, userId });
            setHistorial(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const calculateCOAT = (data) => {
        const totalPesos = parseFloat(data.pesos) || 0;
        const totalDolares = parseFloat(data.dolares) || 0;
        
        let subPesos = 0;
        let subUSD = 0;

        const checkSub = (amt, curr) => {
            if (curr === 'ARS') subPesos += (parseFloat(amt) || 0);
            else subUSD += (parseFloat(amt) || 0);
        };

        checkSub(data.liq_prof_1, data.liq_prof_1_currency);
        checkSub(data.liq_prof_2, data.liq_prof_2_currency);
        checkSub(data.liq_prof_3, data.liq_prof_3_currency);
        checkSub(data.liq_anestesista, data.liq_anestesista_currency);

        return {
            coat_pesos: totalPesos - subPesos,
            coat_dolares: totalDolares - subUSD
        };
    };

    const dayTotals = useMemo(() => {
        return historial.reduce((acc, op) => {
            acc.pesos += (parseFloat(op.pesos) || 0);
            acc.dolares += (parseFloat(op.dolares) || 0);
            acc.coat_pesos += (parseFloat(op.coat_pesos) || 0);
            acc.coat_dolares += (parseFloat(op.coat_dolares) || 0);
            return acc;
        }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 });
    }, [historial]);

    const openSelector = (field, role) => {
        setSelectorTarget({ field, role });
        setSearchText('');
        setSelectorVisible(true);
    };

    const selectProfessional = (prof) => {
        setForm({ ...form, [selectorTarget.field]: prof.nombre });
        setSelectorVisible(false);
    };

    const updateFormValue = (field, value) => {
        let updated = { ...form, [field]: value };
        
        // Auto-calculate liquidation based on percentages (parity logic)
        if (field === 'pesos' || field === 'dolares' || field.includes('porcentaje') || field.includes('currency')) {
            const pPesos = parseFloat(updated.pesos) || 0;
            const pDolares = parseFloat(updated.dolares) || 0;
            
            [1, 2, 3].forEach(num => {
                const pct = parseFloat(updated[`porcentaje_prof_${num}`]) || 0;
                const share = pct / 100;
                const currency = updated[`liq_prof_${num}_currency`];
                
                updated[`liq_prof_${num}`] = (currency === 'ARS' ? pPesos : pDolares) * share;
            });
        }
        setForm(updated);
    };

    const handleSave = async () => {
        if (!form.paciente) return Alert.alert("Error", "Nombre del paciente requerido");
        try {
            const { coat_pesos, coat_dolares } = calculateCOAT(form);
            const data = {
                ...form,
                fecha: selectedDate,
                userId: auth.currentUser?.uid,
                coat_pesos,
                coat_dolares,
                updatedAt: new Date().toISOString()
            };

            if (form.id) {
                await apiService.updateDocument('caja', form.id, data);
            } else {
                await apiService.addDocument('caja', data);
            }
            
            Alert.alert("Éxito", "Operación guardada correctamente");
            setForm(emptyForm);
            loadData();
        } catch (error) {
            Alert.alert("Error", error.message);
        }
    };

    const handleEdit = (op) => {
        setForm({ ...op });
    };

    const handleDelete = (id) => {
        Alert.alert("Eliminar", "¿Estás seguro de eliminar esta operación?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Eliminar", style: "destructive", onPress: async () => {
                await apiService.deleteDocument('caja', id);
                loadData();
            }}
        ]);
    };

    const filteredProfessionals = profesionales.filter(p => {
        const matchesSearch = p.nombre.toLowerCase().includes(searchText.toLowerCase());
        const role = (p.categoria || p.rol || '').toLowerCase();
        
        if (selectorTarget.role === 'anestesia') {
            return matchesSearch && (role.includes('aneste') || role.includes('anestesia'));
        }
        
        const isExcluded = role.includes('aneste') || role.includes('fono') || role.includes('tutor');
        return matchesSearch && !isExcluded;
    });

    if (loading && historial.length === 0) return (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
    );

    const resultCOAT = calculateCOAT(form);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <View>
                    <Text style={[styles.appTitle, { color: colors.text }]}>DIARIO COAT</Text>
                    <Text style={[styles.appSubtitle, { color: colors.subtext }]}>Gestión clínica diaria</Text>
                </View>
                <TouchableOpacity 
                    style={[styles.dateTicket, { backgroundColor: colors.card }]}
                    onPress={() => { setTempDate(displayDate); setDateModalVisible(true); }}
                >
                    <Calendar size={14} color={colors.primary} />
                    <Text style={{ color: colors.text, marginLeft: 6, fontSize: 13, fontWeight: 'bold' }}>{displayDate}</Text>
                    <ChevronDown size={12} color={colors.subtext} style={{ marginLeft: 5 }} />
                </TouchableOpacity>
            </View>

            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: isDark ? '#1b2e25' : '#e8f5e9' }]}>
                    <Text style={[styles.summaryLabel, { color: '#4caf50' }]}>EXCEDENTE ARS</Text>
                    <Text style={[styles.summaryValue, { color: '#4caf50' }]}>$ {dayTotals.coat_pesos.toLocaleString()}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: isDark ? '#1a233a' : '#e3f2fd' }]}>
                    <Text style={[styles.summaryLabel, { color: '#2196f3' }]}>EXCEDENTE USD</Text>
                    <Text style={[styles.summaryValue, { color: '#2196f3' }]}>U$D {dayTotals.coat_dolares.toLocaleString()}</Text>
                </View>
            </View>

            <ScrollView style={styles.content}>
                {/* Editor Section */}
                <View style={[styles.editorSection, { backgroundColor: colors.card, borderColor: colors.primary + '30' }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.primary }]}>{form.id ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</Text>
                        {form.id && (
                            <TouchableOpacity onPress={() => setForm(emptyForm)}>
                                <X size={20} color={colors.error} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={styles.fieldLabel}>PACIENTE</Text>
                    <TextInput 
                        style={[styles.inputLarge, { color: colors.text, borderBottomColor: colors.border }]} 
                        placeholder="Nombre y Apellido..."
                        placeholderTextColor={colors.subtext}
                        value={form.paciente}
                        onChangeText={(t) => updateFormValue('paciente', t)}
                    />

                    <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={styles.fieldLabel}>DNI</Text>
                            <TextInput 
                                style={[styles.inputBase, { color: colors.text, borderBottomColor: colors.border }]} 
                                keyboardType="numeric"
                                placeholder="DNI"
                                value={form.dni}
                                onChangeText={(t) => updateFormValue('dni', t)}
                            />
                        </View>
                        <View style={{ flex: 1.5 }}>
                            <Text style={styles.fieldLabel}>OBRA SOCIAL</Text>
                            <TextInput 
                                style={[styles.inputBase, { color: colors.text, borderBottomColor: colors.border }]} 
                                placeholder="OS / Prepaga"
                                value={form.obra_social}
                                onChangeText={(t) => updateFormValue('obra_social', t)}
                            />
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={[styles.fieldLabel, { color: colors.primary }]}>INGRESOS</Text>
                            <View style={[styles.currencyInput, { backgroundColor: isDark ? '#121212' : '#f8f9fa' }]}>
                                <Text style={{ color: '#4caf50', fontWeight: 'bold' }}>$</Text>
                                <TextInput 
                                    style={[styles.mainAmount, { color: colors.text }]} 
                                    keyboardType="numeric"
                                    value={form.pesos.toString()}
                                    onChangeText={(t) => updateFormValue('pesos', t)}
                                />
                            </View>
                            <View style={[styles.currencyInput, { backgroundColor: isDark ? '#121212' : '#f8f9fa' }]}>
                                <Text style={{ color: '#2196f3', fontWeight: 'bold' }}>U$D</Text>
                                <TextInput 
                                    style={[styles.mainAmount, { color: colors.text }]} 
                                    keyboardType="numeric"
                                    value={form.dolares.toString()}
                                    onChangeText={(t) => updateFormValue('dolares', t)}
                                />
                            </View>
                        </View>

                        <View style={{ flex: 1.4 }}>
                            <Text style={[styles.fieldLabel, { color: colors.primary }]}>LIQUIDACIÓN (%)</Text>
                            {[1, 2, 3].map(num => (
                                <View key={num} style={styles.medicoContainer}>
                                    <TouchableOpacity style={[styles.selector, { borderColor: colors.border }]} onPress={() => openSelector(`prof_${num}`, 'medico')}>
                                        <Text style={{ color: form[`prof_${num}`] ? colors.text : colors.subtext, fontSize: 10 }} numberOfLines={1}>
                                            {form[`prof_${num}`] || `Prof. ${num}...`}
                                        </Text>
                                    </TouchableOpacity>
                                    <View style={styles.flexRow}>
                                        <TextInput 
                                            style={[styles.inputPct, { color: colors.text, borderColor: colors.border }]} 
                                            placeholder="%"
                                            keyboardType="numeric"
                                            value={form[`porcentaje_prof_${num}`].toString()}
                                            onChangeText={(t) => updateFormValue(`porcentaje_prof_${num}`, t)}
                                        />
                                        <TouchableOpacity 
                                            onPress={() => updateFormValue(`liq_prof_${num}_currency`, form[`liq_prof_${num}_currency`] === 'ARS' ? 'USD' : 'ARS')}
                                            style={styles.currencySwitch}
                                        >
                                            <Text style={styles.currencySwitchText}>{form[`liq_prof_${num}_currency`]}</Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.feeVal, { color: colors.text, marginLeft: 5 }]}>
                                            {parseFloat(form[`liq_prof_${num}`] || 0).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.fieldLabel, { color: '#9c27b0' }]}>ANESTESIA</Text>
                            <TouchableOpacity style={[styles.selector, { borderColor: colors.border }]} onPress={() => openSelector('anestesista', 'anestesia')}>
                                <Text style={{ color: form.anestesista ? colors.text : colors.subtext, fontSize: 11 }}>{form.anestesista || 'Sin Anestesista'}</Text>
                            </TouchableOpacity>
                            <TextInput 
                                style={[styles.feeVal, { color: '#9c27b0', borderBottomWidth: 1.5, borderBottomColor: colors.border, height: 25 }]} 
                                placeholder="Honorario"
                                keyboardType="numeric"
                                value={form.liq_anestesista.toString()}
                                onChangeText={(t) => updateFormValue('liq_anestesista', t)}
                            />
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                            <Text style={styles.fieldLabel}>RESTO COAT</Text>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: '#4caf50' }}>$ {resultCOAT.coat_pesos.toLocaleString()}</Text>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#2196f3' }}>U$D {resultCOAT.coat_dolares.toLocaleString()}</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                        <Save size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>{form.id ? 'ACTUALIZAR' : 'GUARDAR'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Historial Section */}
                <View style={styles.historySection}>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 15 }]}>HISTORIAL DEL DÍA</Text>

                    {historial.map((op) => (
                        <View key={op.id} style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={styles.cardMain}>
                                <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '15' }]}>
                                    <Text style={[styles.avatarText, { color: colors.primary }]}>{op.paciente?.charAt(0) || '?'}</Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[styles.patientName, { color: colors.text }]}>{op.paciente?.toUpperCase()}</Text>
                                    <View style={styles.flexRow}>
                                        <Text style={[styles.patientOS, { backgroundColor: '#e0f7fa', color: '#006064' }]}>{op.obra_social || 'S/O'}</Text>
                                    </View>
                                </View>
                                <View style={styles.cardActions}>
                                    <TouchableOpacity onPress={() => handleEdit(op)} style={styles.actionIcon}>
                                        <Edit2 size={16} color={colors.primary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDelete(op.id)} style={styles.actionIcon}>
                                        <Trash2 size={16} color={colors.error} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            
                            <View style={[styles.cardDetails, { borderTopColor: colors.border + '30' }]}>
                                <View style={{ flex: 1.5 }}>
                                    {op.prof_1 ? <Text style={styles.detailValue}>• {op.prof_1}</Text> : null}
                                    {op.prof_2 ? <Text style={styles.detailValue}>• {op.prof_2}</Text> : null}
                                    {op.prof_3 ? <Text style={styles.detailValue}>• {op.prof_3}</Text> : null}
                                    {op.anestesista ? <Text style={[styles.detailValue, { color: '#9c27b0' }]}>• Anest: {op.anestesista}</Text> : null}
                                </View>
                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                    <Text style={[styles.detailTotal, { color: '#4caf50' }]}>$ {parseFloat(op.pesos || 0).toLocaleString()}</Text>
                                    {op.dolares > 0 && <Text style={{ fontSize: 10, color: '#2196f3' }}>U$D {op.dolares}</Text>}
                                    <Text style={{ fontSize: 9, color: '#ff9800', marginTop: 4 }}>COAT: $ {parseFloat(op.coat_pesos || 0).toLocaleString()}</Text>
                                </View>
                            </View>
                        </View>
                    ))}

                    {historial.length === 0 && (
                        <View style={styles.emptyState}>
                            <Info size={40} color={colors.border} />
                            <Text style={{ color: colors.subtext, marginTop: 10 }}>No hay registros.</Text>
                        </View>
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modals */}
            <Modal visible={selectorVisible} animationType="slide" transparent={true}>
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Profesionales</Text>
                            <TouchableOpacity onPress={() => setSelectorVisible(false)}><X size={24} color={colors.text} /></TouchableOpacity>
                        </View>
                        <FlatList 
                            data={filteredProfessionals}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={[styles.profListItem, { borderBottomColor: colors.border }]} onPress={() => selectProfessional(item)}>
                                    <Text style={[styles.profListItemName, { color: colors.text }]}>{item.nombre}</Text>
                                    <Text style={[styles.profListItemRole, { backgroundColor: colors.primary + '10', color: colors.primary }]}>{item.categoria}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <Modal visible={dateModalVisible} animationType="fade" transparent={true}>
                <View style={styles.modalBackdrop}>
                    <View style={[styles.dateModalBox, { backgroundColor: colors.card }]}>
                        <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 20 }]}>Fecha</Text>
                        <TextInput 
                            style={[styles.inputBase, { color: colors.text, borderBottomColor: colors.primary, textAlign: 'center', fontSize: 24 }]}
                            value={tempDate}
                            onChangeText={setTempDate}
                            placeholder="DD-MM-AAAA"
                        />
                        <TouchableOpacity 
                            style={[styles.modalBtn, { backgroundColor: colors.primary, marginTop: 20 }]} 
                            onPress={() => { 
                                const parts = tempDate.split('-');
                                if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
                                    setSelectedDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
                                    setDateModalVisible(false);
                                } else {
                                    Alert.alert("Error", "Formato inválido. Use DD-MM-AAAA");
                                }
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>CARGAR DÍA</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    appTitle: { fontSize: 22, fontWeight: '900' },
    appSubtitle: { fontSize: 11, opacity: 0.6 },
    dateTicket: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, elevation: 2 },
    summaryContainer: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15 },
    summaryCard: { flex: 1, padding: 12, borderRadius: 15, marginRight: 8, elevation: 3 },
    summaryLabel: { fontSize: 9, fontWeight: '800' },
    summaryValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
    content: { padding: 15 },
    editorSection: { padding: 18, borderRadius: 25, marginBottom: 25, borderWidth: 1.5, elevation: 4 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    fieldLabel: { fontSize: 9, fontWeight: 'bold', color: '#999', marginBottom: 4, textTransform: 'uppercase' },
    inputLarge: { height: 38, borderBottomWidth: 1.5, marginBottom: 12, fontSize: 16, fontWeight: '600' },
    inputBase: { height: 32, borderBottomWidth: 1.5, marginBottom: 12, fontSize: 14 },
    row: { flexDirection: 'row', marginBottom: 10 },
    currencyInput: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 10, height: 38, marginBottom: 6 },
    mainAmount: { flex: 1, height: 38, marginLeft: 8, fontSize: 16, fontWeight: 'bold' },
    medicoContainer: { marginBottom: 10 },
    selector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1.2, height: 28, marginBottom: 4 },
    flexRow: { flexDirection: 'row', alignItems: 'center' },
    inputPct: { width: 35, height: 24, borderBottomWidth: 1.2, textAlign: 'center', fontSize: 11, marginRight: 5 },
    currencySwitch: { backgroundColor: '#eee', paddingHorizontal: 5, borderRadius: 4, height: 20, justifyContent: 'center' },
    currencySwitchText: { fontSize: 8, fontWeight: 'bold' },
    feeVal: { fontSize: 12, fontWeight: '800' },
    saveBtn: { flexDirection: 'row', height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 15, elevation: 3 },
    saveBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
    
    historySection: { marginTop: 10 },
    historyCard: { padding: 15, borderRadius: 20, marginBottom: 15, borderWidth: 1, elevation: 2 },
    cardMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    avatarCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 18, fontWeight: 'bold' },
    patientName: { fontSize: 14, fontWeight: '900' },
    patientOS: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden', fontWeight: 'bold', marginRight: 8 },
    cardActions: { flexDirection: 'row' },
    actionIcon: { padding: 8, marginLeft: 5 },
    cardDetails: { borderTopWidth: 1, paddingTop: 10, flexDirection: 'row' },
    detailValue: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
    detailTotal: { fontSize: 14, fontWeight: '900' },
    
    emptyState: { alignItems: 'center', marginTop: 40, opacity: 0.5 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { width: '90%', height: '70%', borderRadius: 25, padding: 25 },
    dateModalBox: { width: '85%', borderRadius: 25, padding: 25 },
    modalBtn: { height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    profListItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
    profListItemName: { fontSize: 15, fontWeight: '600' },
    profListItemRole: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default DailyCashScreen;
