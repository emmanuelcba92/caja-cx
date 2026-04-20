import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { ChevronLeft, Save, User, DollarSign, Calculator, Calendar, Stethoscope, Plus, Trash2, MessageSquare, X, Check } from 'lucide-react-native';
import { apiService } from '../services/apiService';
import { useTheme } from '../context/ThemeContext';
import { auth } from '../services/firebase';

const AddMovementScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [profesionales, setProfesionales] = useState([]);
  const [isProfModalVisible, setIsProfModalVisible] = useState(false);
  const [activeProfField, setActiveProfField] = useState(null); // { type: 'prof', index: 0 } or { type: 'anes' }

  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    paciente: '',
    dni: '',
    obra_social: '',
    pesos: 0,
    dolares: 0,
    // Web parity fields
    prof_1: '', prof_2: '', prof_3: '',
    porcentaje_prof_1: 100, porcentaje_prof_2: 0, porcentaje_prof_3: 0,
    liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
    liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
    liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
    anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS', liq_anestesista_secondary: 0, liq_anestesista_currency_secondary: 'USD', showSecondaryAnes: false,
    coat_pesos: 0, coat_dolares: 0,
    comentario: '',
    showProf2: false,
    showProf3: false
  });

  useEffect(() => {
    const fetchProfs = async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return;
        try {
            const data = await apiService.getCollection('profesionales', { userId }, 'nombre');
            setProfesionales(data);
        } catch (error) {
            console.error(error);
        }
    };
    fetchProfs();
  }, []);

  // Professional filters
  const anestesistas = useMemo(() => profesionales.filter(p => p.categoria === 'Anestesista'), [profesionales]);
  const medicos = useMemo(() => profesionales.filter(p => p.categoria !== 'Anestesista'), [profesionales]);

  // Calculation Logic (same as web app)
  useEffect(() => {
    const payPesos = parseFloat(form.pesos) || 0;
    const payDolares = parseFloat(form.dolares) || 0;

    const calculateLiquidation = (pct, currency, secondaryCurrency, showSecondary) => {
        const share = (parseFloat(pct) || 0) / 100;
        let primary = (currency === 'ARS' ? payPesos : payDolares) * share;
        let secondary = 0;
        if (showSecondary) {
            secondary = (secondaryCurrency === 'USD' ? payDolares : payPesos) * share;
        }
        return { primary, secondary };
    };

    const liq1 = calculateLiquidation(form.porcentaje_prof_1, form.liq_prof_1_currency, form.liq_prof_1_currency_secondary, form.showSecondary_1);
    const liq2 = calculateLiquidation(form.porcentaje_prof_2, form.liq_prof_2_currency, form.liq_prof_2_currency_secondary, form.showSecondary_2);
    const liq3 = calculateLiquidation(form.porcentaje_prof_3, form.liq_prof_3_currency, form.liq_prof_3_currency_secondary, form.showSecondary_3);
    
    // Simple anestesia calc
    const liqAnes = parseFloat(form.liq_anestesista) || 0;
    const liqAnesSec = parseFloat(form.liq_anestesista_secondary) || 0;

    // Calculate COAT Balance
    let totalSubPesos = 0;
    let totalSubUSD = 0;

    const addSub = (amt, curr) => {
        if (curr === 'ARS') totalSubPesos += amt;
        else totalSubUSD += amt;
    };

    addSub(liq1.primary, form.liq_prof_1_currency);
    if (form.showSecondary_1) addSub(liq1.secondary, form.liq_prof_1_currency_secondary);
    
    if (form.showProf2) {
        addSub(liq2.primary, form.liq_prof_2_currency);
        if (form.showSecondary_2) addSub(liq2.secondary, form.liq_prof_2_currency_secondary);
    }
    
    if (form.showProf3) {
        addSub(liq3.primary, form.liq_prof_3_currency);
        if (form.showSecondary_3) addSub(liq3.secondary, form.liq_prof_3_currency_secondary);
    }

    addSub(liqAnes, form.liq_anestesista_currency);
    if (form.showSecondaryAnes) addSub(liqAnesSec, form.liq_anestesista_currency_secondary);

    setForm(prev => ({
        ...prev,
        liq_prof_1: liq1.primary,
        liq_prof_1_secondary: liq1.secondary,
        liq_prof_2: liq2.primary,
        liq_prof_2_secondary: liq2.secondary,
        liq_prof_3: liq3.primary,
        liq_prof_3_secondary: liq3.secondary,
        coat_pesos: payPesos - totalSubPesos,
        coat_dolares: payDolares - totalSubUSD
    }));
  }, [
    form.pesos, form.dolares, 
    form.porcentaje_prof_1, form.porcentaje_prof_2, form.porcentaje_prof_3,
    form.liq_prof_1_currency, form.liq_prof_2_currency, form.liq_prof_3_currency,
    form.liq_anestesista, form.liq_anestesista_currency,
    form.showProf2, form.showProf3,
    form.showSecondary_1, form.showSecondary_2, form.showSecondary_3, form.showSecondaryAnes
  ]);

  const handleSave = async () => {
    if (!form.paciente || form.paciente.length < 4) {
      Alert.alert('Error', 'Por favor, ingresa el nombre del paciente (mín. 4 letras).');
      return;
    }

    setLoading(true);
    try {
      const { showProf2, showProf3, ...cleanForm } = form;
      const dataToSave = {
        ...cleanForm,
        userId: auth.currentUser?.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || 'unknown'
      };

      await apiService.addDocument('caja', dataToSave);
      Alert.alert('¡Éxito!', 'Operación guardada correctamente.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openProfPicker = (type, index = null) => {
    setActiveProfField({ type, index });
    setIsProfModalVisible(true);
  };

  const selectProf = (prof) => {
    if (activeProfField.type === 'prof') {
        const fieldName = `prof_${activeProfField.index + 1}`;
        setForm({ ...form, [fieldName]: prof.nombre });
    } else {
        setForm({ ...form, anestesista: prof.nombre });
    }
    setIsProfModalVisible(false);
  };

  const renderProfItem = ({ item }) => (
    <TouchableOpacity 
        style={[styles.modalItem, { borderBottomColor: colors.border }]} 
        onPress={() => selectProf(item)}
    >
        <Text style={[styles.modalItemText, { color: colors.text }]}>{item.nombre}</Text>
        <Text style={[styles.modalItemSubtext, { color: colors.subtext }]}>{item.categoria}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft color={colors.primary} size={28} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Nueva Operación</Text>
            <Text style={[styles.headerSubTitle, { color: colors.subtext }]}>{new Date(form.fecha).toLocaleDateString('es-AR')}</Text>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.saveHeaderButton}>
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Save color={colors.primary} size={24} />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Paciente Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>DATOS DEL PACIENTE</Text>
            <TextInput 
                style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]} 
                placeholder="Nombre Completo..."
                placeholderTextColor={colors.subtext}
                value={form.paciente}
                onChangeText={(t) => setForm({...form, paciente: t})}
            />
            <View style={styles.row}>
                <TextInput 
                    style={[styles.input, { flex: 1, color: colors.text, borderBottomColor: colors.border, marginRight: 10 }]} 
                    placeholder="Documento..."
                    placeholderTextColor={colors.subtext}
                    value={form.dni}
                    onChangeText={(t) => setForm({...form, dni: t.replace(/\D/g, '')})}
                    keyboardType="numeric"
                />
                <TextInput 
                    style={[styles.input, { flex: 1, color: colors.text, borderBottomColor: colors.border }]} 
                    placeholder="Prepaga / OS..."
                    placeholderTextColor={colors.subtext}
                    value={form.obra_social}
                    onChangeText={(t) => setForm({...form, obra_social: t})}
                />
            </View>
        </View>

        {/* Pagos Section */}
        <View style={styles.row}>
            <View style={[styles.section, { flex: 1, marginRight: 10, backgroundColor: colors.card }]}>
                <Text style={[styles.sectionLabel, { color: '#28a745' }]}>PAGO PESOS</Text>
                <View style={styles.amountInput}>
                    <Text style={{ color: colors.text, fontSize: 18, marginRight: 5 }}>$</Text>
                    <TextInput 
                        style={[styles.input, { flex: 1, color: colors.text, borderBottomColor: colors.border, fontSize: 18, fontWeight: 'bold' }]} 
                        placeholder="0,00"
                        placeholderTextColor={colors.subtext}
                        value={form.pesos === 0 ? '' : form.pesos.toString()}
                        onChangeText={(t) => setForm({...form, pesos: t.replace(',', '.')})}
                        keyboardType="numeric"
                    />
                </View>
            </View>
            <View style={[styles.section, { flex: 1, backgroundColor: colors.card }]}>
                <Text style={[styles.sectionLabel, { color: '#007bff' }]}>PAGO USD</Text>
                <View style={styles.amountInput}>
                    <Text style={{ color: colors.text, fontSize: 18, marginRight: 5 }}>U$D</Text>
                    <TextInput 
                        style={[styles.input, { flex: 1, color: colors.text, borderBottomColor: colors.border, fontSize: 18, fontWeight: 'bold' }]} 
                        placeholder="0"
                        placeholderTextColor={colors.subtext}
                        value={form.dolares === 0 ? '' : form.dolares.toString()}
                        onChangeText={(t) => setForm({...form, dolares: t.replace(',', '.')})}
                        keyboardType="numeric"
                    />
                </View>
            </View>
        </View>

        {/* Honorarios Médicos */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
            <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>LIQUIDACIÓN PROFESIONALES</Text>
                <TouchableOpacity onPress={() => {
                    if (!form.showProf2) setForm({...form, showProf2: true});
                    else if (!form.showProf3) setForm({...form, showProf3: true});
                }}>
                    <Plus color={colors.primary} size={20} />
                </TouchableOpacity>
            </View>
            
            {[0, 1, 2].map((idx) => {
                const isVisible = idx === 0 || (idx === 1 && form.showProf2) || (idx === 2 && form.showProf3);
                if (!isVisible) return null;

                const profKey = `prof_${idx + 1}`;
                const pctKey = `porcentaje_prof_${idx + 1}`;
                const liqKey = `liq_prof_${idx + 1}`;
                const currKey = `liq_prof_${idx + 1}_currency`;

                return (
                    <View key={idx} style={styles.profCard}>
                        <View style={styles.row}>
                            <TouchableOpacity 
                                style={[styles.selectBox, { flex: 3, borderBottomColor: colors.border }]} 
                                onPress={() => openProfPicker('prof', idx)}
                            >
                                <Text style={{ color: form[profKey] ? colors.text : colors.subtext }}>
                                    {form[profKey] || `Médico ${idx + 1}...`}
                                </Text>
                            </TouchableOpacity>
                            <TextInput 
                                style={[styles.input, { flex: 1, color: colors.text, borderBottomColor: colors.border, textAlign: 'center', marginHorizontal: 10 }]} 
                                placeholder="%"
                                placeholderTextColor={colors.subtext}
                                value={form[pctKey].toString()}
                                onChangeText={(t) => setForm({...form, [pctKey]: t})}
                                keyboardType="numeric"
                            />
                            <TouchableOpacity 
                                style={[styles.currencyToggle, { backgroundColor: form[currKey] === 'ARS' ? '#e8f5e9' : '#e3f2fd' }]}
                                onPress={() => setForm({...form, [currKey]: form[currKey] === 'ARS' ? 'USD' : 'ARS'})}
                            >
                                <Text style={{ color: form[currKey] === 'ARS' ? '#2e7d32' : '#1565c0', fontWeight: 'bold', fontSize: 10 }}>
                                    {form[currKey]}
                                </Text>
                            </TouchableOpacity>
                            {idx > 0 && (
                                <TouchableOpacity 
                                    onPress={() => setForm({...form, [idx === 1 ? 'showProf2' : 'showProf3']: false})}
                                    style={{ marginLeft: 10 }}
                                >
                                    <Trash2 color={colors.error} size={18} />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={[styles.row, { marginTop: 10 }]}>
                            <Text style={[styles.liqAmount, { color: colors.subtext }]}>
                                Liq: <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                                    {form[currKey] === 'ARS' ? '$' : 'U$D'} {form[liqKey].toLocaleString('es-AR', {minimumFractionDigits: 2})}
                                </Text>
                            </Text>
                        </View>
                    </View>
                );
            })}
        </View>

        {/* Anestesia Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: '#6f42c1' }]}>ANESTESIA</Text>
            <View style={styles.row}>
                <TouchableOpacity 
                    style={[styles.selectBox, { flex: 2, borderBottomColor: colors.border, marginRight: 10 }]} 
                    onPress={() => openProfPicker('anes')}
                >
                    <Text style={{ color: form.anestesista ? colors.text : colors.subtext }}>
                        {form.anestesista || "Anestesista..."}
                    </Text>
                </TouchableOpacity>
                <TextInput 
                    style={[styles.input, { flex: 1, color: colors.text, borderBottomColor: colors.border }]} 
                    placeholder="Honorario"
                    placeholderTextColor={colors.subtext}
                    value={form.liq_anestesista === 0 ? '' : form.liq_anestesista.toString()}
                    onChangeText={(t) => setForm({...form, liq_anestesista: t.replace(',', '.')})}
                    keyboardType="numeric"
                />
            </View>
        </View>

        {/* Totales COAT */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1e1e1e' : '#f8f9fa', borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>BALANCE COAT (EXCEDENTE)</Text>
            <View style={styles.row}>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: colors.subtext }}>PESOS</Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: form.coat_pesos >= 0 ? '#198754' : '#dc3545' }}>
                        $ {form.coat_pesos.toLocaleString('es-AR')}
                    </Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: colors.subtext }}>DOLARES</Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: form.coat_dolares >= 0 ? '#0d6efd' : '#dc3545' }}>
                        U$D {form.coat_dolares.toLocaleString('es-AR')}
                    </Text>
                </View>
            </View>
        </View>

        {/* Observaciones */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>OBSERVACIONES</Text>
            <TextInput 
                style={[styles.input, { color: colors.text, borderBottomColor: 'transparent', minHeight: 80, textAlignVertical: 'top' }]} 
                placeholder="Notas adicionales..."
                placeholderTextColor={colors.subtext}
                multiline
                value={form.comentario}
                onChangeText={(t) => setForm({...form, comentario: t})}
            />
        </View>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>GUARDAR OPERACIÓN</Text>}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Professional Picker Modal */}
      <Modal visible={isProfModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Seleccionar Profesional</Text>
                    <TouchableOpacity onPress={() => setIsProfModalVisible(false)}>
                        <X color={colors.text} size={24} />
                    </TouchableOpacity>
                </View>
                <FlatList 
                    data={activeProfField?.type === 'anes' ? anestesistas : medicos}
                    keyExtractor={(item) => item.id}
                    renderItem={renderProfItem}
                    ListEmptyComponent={<Text style={{ textAlign: 'center', padding: 20, color: colors.subtext }}>No hay profesionales cargados</Text>}
                />
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
    padding: 15, borderBottomWidth: 1
  },
  headerTitleContainer: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  headerSubTitle: { fontSize: 12 },
  content: { padding: 15 },
  section: { padding: 15, borderRadius: 20, marginBottom: 15, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  input: { height: 45, borderBottomWidth: 1, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  amountInput: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  profCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', marginBottom: 5 },
  selectBox: { height: 45, borderBottomWidth: 1, justifyContent: 'center' },
  currencyToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 5 },
  liqAmount: { fontSize: 13, marginTop: 5 },
  saveButton: { 
    height: 55, borderRadius: 15, 
    justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 4
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1 },
  modalItemText: { fontSize: 16, fontWeight: '600' },
  modalItemSubtext: { fontSize: 12, marginTop: 2 }
});

export default AddMovementScreen;
