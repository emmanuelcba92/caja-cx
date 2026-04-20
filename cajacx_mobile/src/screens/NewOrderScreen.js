import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Switch, ActivityIndicator, Platform } from 'react-native';
import { ChevronLeft, Save, User, Clipboard, Phone, Stethoscope, Plus, Trash2, Calendar, Clock, AlertCircle, Search } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiService } from '../services/apiService';
import { auth } from '../services/firebase';
import { useTheme } from '../context/ThemeContext';
import SearchModal from '../components/SearchModal';
import { CODIGOS_CIRUGIA, MODULOS_SM, OBRAS_SOCIALES } from '../data/codigos';

const NewOrderScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDocDatePicker, setShowDocDatePicker] = useState(false);

  // Autocomplete state
  const [profesionales, setProfesionales] = useState([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchType, setSearchType] = useState(''); // 'profesional' | 'codigo'
  const [activeCodeIndex, setActiveCodeIndex] = useState(null);

  const [form, setForm] = useState({
    afiliado: '',
    numAfiliado: '',
    dni: '',
    obraSocial: '',
    profesional: '',
    habitacion: '',
    telefono: '',
    fechaCirugia: new Date().toISOString().split('T')[0],
    hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    fechaDocumento: new Date().toISOString().split('T')[0],
    anestesia: 'General',
    estudioBajoAnestesia: false,
    incluirMaterial: false,
    urgencia: false,
    diagnostico: '',
    observaciones: '',
    anotacionesInternas: '',
    codigosCirugia: [{ code: '', name: '' }],
    tipo: 'cirugia',
    status: 'pendiente',
    createdAt: new Date().toISOString()
  });

  const formatDate = (dateStr) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr || 'Sin fecha';
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  useEffect(() => {
    fetchProfesionales();
  }, []);

  const fetchProfesionales = async () => {
    try {
      const ownerToUse = auth.currentUser?.uid;
      if (!ownerToUse) return;
      
      const data = await apiService.getCollection('profesionales', { userId: ownerToUse });
      // Filtrar por categorías relevantes como en la web
      const filtered = data
        .filter(p => p.categoria === 'ORL' || p.categoria === 'Estetica' || p.categoria === 'Tutoras' || p.categoria === 'Residente')
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      setProfesionales(filtered);
    } catch (error) {
      console.error("Error fetching professionals:", error);
    }
  };

  const addCodigo = () => {
    setForm({
      ...form,
      codigosCirugia: [...form.codigosCirugia, { code: '', name: '' }]
    });
  };

  const updateCodigo = (index, field, value) => {
    const newCodigos = [...form.codigosCirugia];
    newCodigos[index][field] = value;
    
    // Si se está escribiendo un código, intentar buscar la descripción automáticamente
    if (field === 'code' && value.length >= 4) {
      // 1. Buscar en códigos generales
      let found = CODIGOS_CIRUGIA.find(c => c.codigo === value);
      
      // 2. Si no se encuentra y es IOSFA o Swiss Medical, buscar en sus listas
      if (!found) {
        found = CODIGOS_IOSFA.find(c => c.codigo === value);
      }
      if (!found) {
        found = MODULOS_SM.find(c => c.codigo === value);
      }

      if (found) {
        newCodigos[index].name = found.nombre;
      }
    }
    
    setForm({ ...form, codigosCirugia: newCodigos });
  };

  const removeCodigo = (index) => {
    if (form.codigosCirugia.length > 1) {
      const newCodigos = form.codigosCirugia.filter((_, i) => i !== index);
      setForm({ ...form, codigosCirugia: newCodigos });
    }
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setForm({ ...form, fechaCirugia: selectedDate.toISOString().split('T')[0] });
    }
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const timeStr = selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      setForm({ ...form, hora: timeStr });
    }
  };

  const onDocDateChange = (event, selectedDate) => {
    setShowDocDatePicker(false);
    if (selectedDate) {
      setForm({ ...form, fechaDocumento: selectedDate.toISOString().split('T')[0] });
    }
  };

  const handleSave = async () => {
    if (!form.afiliado || !form.profesional) {
      alert('Por favor, completa al menos el nombre del paciente y el profesional.');
      return;
    }

    setLoading(true);
    try {
      // Transformar códigos de cirugía de objetos a strings para compatibilidad si es necesario, 
      // o guardarlos como objetos si la base de datos lo soporta (la web usa objetos en un array)
      const processedForm = {
        ...form,
        userId: auth.currentUser?.uid || null,
        afiliado: form.afiliado.toUpperCase(),
        // Mantenemos la estructura de objetos para los códigos, igual que en la web
        codigosCirugia: form.codigosCirugia.filter(c => c.code || c.name)
      };

      await apiService.addDocument('ordenes_internacion', processedForm);
      alert('¡Orden de cirugía creada con éxito!');
      navigation.goBack();
    } catch (error) {
      alert('Error al guardar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openSearch = (type, index = null) => {
    setSearchType(type);
    setActiveCodeIndex(index);
    setSearchModalVisible(true);
  };

  const handleSelectResult = (item) => {
    if (searchType === 'profesional') {
      setForm({ ...form, profesional: item.nombre });
    } else if (searchType === 'obraSocial') {
      setForm({ ...form, obraSocial: typeof item === 'string' ? item : item.nombre || item });
    } else if (searchType === 'codigo') {
      const newCodigos = [...form.codigosCirugia];
      newCodigos[activeCodeIndex] = {
        code: item.codigo,
        name: item.nombre
      };
      setForm({ ...form, codigosCirugia: newCodigos });
    }
    setSearchModalVisible(false);
  };

  const getSearchData = () => {
    if (searchType === 'profesional') return profesionales;
    if (searchType === 'obraSocial') return OBRAS_SOCIALES.map(os => ({ nombre: os }));
    if (searchType === 'codigo') {
      const isSwiss = form.obraSocial.toUpperCase().includes('SWISS');
      const isIosfa = form.obraSocial.toUpperCase().includes('IOSFA');
      
      if (isSwiss) {
        return [...MODULOS_SM, ...CODIGOS_CIRUGIA];
      }
      if (isIosfa) {
        // En IOSFA devolvemos los códigos específicos
        return CODIGOS_IOSFA.map(c => ({
          ...c,
          // Guardamos el código general como nombre secundario para que se vea
          nombre: `${c.nombre} (Cod. Gral: ${c.codigoGeneral})`
        }));
      }
      return CODIGOS_CIRUGIA;
    }
    return [];
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft color={colors.primary} size={28} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Nueva Orden de Cirugía</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.saveHeaderButton}>
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Save color={colors.primary} size={24} />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* SECCIÓN 1: PROFESIONAL Y PACIENTE */}
        <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Información General</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Profesional Responsable</Text>
          <TouchableOpacity 
            style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => openSearch('profesional')}
          >
            <Stethoscope size={18} color={colors.primary} />
            <View style={styles.input}>
              <Text style={{ color: form.profesional ? colors.text : colors.subtext, fontSize: 16 }}>
                {form.profesional || "Seleccionar Profesional"}
              </Text>
            </View>
            {form.profesional ? (
                <TouchableOpacity onPress={() => setForm({...form, profesional: ''})}><X size={18} color={colors.subtext} /></TouchableOpacity>
            ) : <Search size={18} color={colors.subtext} />}
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Apellido y Nombre del Paciente</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <User size={18} color={colors.primary} />
            <TextInput 
              style={[styles.input, { color: colors.text }]} 
              placeholder="EJ: PEREZ JUAN"
              placeholderTextColor={colors.subtext}
              value={form.afiliado}
              autoCapitalize="characters"
              onChangeText={(t) => setForm({...form, afiliado: t})}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 2, marginRight: 10 }]}>
            <Text style={[styles.label, { color: colors.text }]}>Obra Social</Text>
            <TouchableOpacity 
              style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openSearch('obraSocial')}
            >
              <Clipboard size={18} color={colors.primary} />
              <View style={styles.input}>
                <Text style={{ color: form.obraSocial ? colors.text : colors.subtext, fontSize: 16 }}>
                  {form.obraSocial || "OSDE, PAMI..."}
                </Text>
              </View>
              <Search size={18} color={colors.subtext} />
            </TouchableOpacity>
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>Habitación</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput 
                style={[styles.input, { color: colors.text, marginLeft: 0 }]} 
                placeholder="N° / Letra"
                placeholderTextColor={colors.subtext}
                value={form.habitacion}
                onChangeText={(t) => setForm({...form, habitacion: t})}
              />
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={[styles.label, { color: colors.text }]}>DNI</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput 
                style={[styles.input, { color: colors.text, marginLeft: 0 }]} 
                placeholder="Sin puntos"
                placeholderTextColor={colors.subtext}
                keyboardType="numeric"
                value={form.dni}
                onChangeText={(t) => setForm({...form, dni: t})}
              />
            </View>
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>N° Afiliado</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput 
                style={[styles.input, { color: colors.text, marginLeft: 0 }]} 
                placeholder="N° de Carnet"
                placeholderTextColor={colors.subtext}
                value={form.numAfiliado}
                onChangeText={(t) => setForm({...form, numAfiliado: t})}
              />
            </View>
          </View>
        </View>

        {/* SECCIÓN 2: DATOS DE LA CIRUGÍA */}
        <View style={[styles.sectionHeader, { marginTop: 10 }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Detalles de la Cirugía</Text>
        </View>

        <View style={styles.row}>
            <TouchableOpacity 
                style={[styles.dateSelector, { backgroundColor: colors.card, borderColor: colors.border, flex: 1, marginRight: 10 }]}
                onPress={() => setShowDatePicker(true)}
            >
                <Calendar size={18} color={colors.primary} />
                <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.dateLabel, { color: colors.subtext }]}>Fecha</Text>
                    <Text style={[styles.dateValue, { color: colors.text }]}>{formatDate(form.fechaCirugia)}</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.dateSelector, { backgroundColor: colors.card, borderColor: colors.border, flex: 0.8 }]}
                onPress={() => setShowTimePicker(true)}
            >
                <Clock size={18} color={colors.primary} />
                <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.dateLabel, { color: colors.subtext }]}>Hora</Text>
                    <Text style={[styles.dateValue, { color: colors.text }]}>{form.hora}</Text>
                </View>
            </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Anestesia</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput 
              style={[styles.input, { color: colors.text, marginLeft: 0 }]} 
              placeholder="General, Local, Sedación..."
              placeholderTextColor={colors.subtext}
              value={form.anestesia}
              onChangeText={(t) => setForm({...form, anestesia: t})}
            />
          </View>
        </View>

        <View style={[styles.switchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.switchInfo}>
            <Text style={[styles.switchTitle, { color: colors.text }]}>Estudio Bajo Anestesia</Text>
            <Text style={[styles.switchDesc, { color: colors.subtext }]}>Cambia el formato del documento</Text>
          </View>
          <Switch 
            value={form.estudioBajoAnestesia}
            onValueChange={(v) => setForm({...form, estudioBajoAnestesia: v})}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        <View style={[styles.switchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.switchInfo}>
            <Text style={[styles.switchTitle, { color: colors.text }]}>Urgencia</Text>
            <Text style={[styles.switchDesc, { color: colors.subtext }]}>Marca la orden como prioritaria</Text>
          </View>
          <Switch 
            value={form.urgencia}
            onValueChange={(v) => setForm({...form, urgencia: v})}
            trackColor={{ false: colors.border, true: '#dc3545' }}
          />
        </View>

        {/* CÓDIGOS DE CIRUGÍA */}
        {!form.estudioBajoAnestesia && (
          <View style={styles.codesSection}>
            <View style={styles.codesHeader}>
              <Text style={[styles.label, { color: colors.text, marginBottom: 0 }]}>Procedimientos / Códigos</Text>
              <TouchableOpacity onPress={addCodigo} style={styles.smallAddBtn}>
                <Plus size={14} color="#fff" />
              </TouchableOpacity>
            </View>

            {form.codigosCirugia.map((cod, index) => (
              <View key={index} style={styles.codeRow}>
                <TextInput 
                  style={[styles.codeInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, width: '30%' }]} 
                  placeholder="Cód."
                  placeholderTextColor={colors.subtext}
                  value={cod.code}
                  onChangeText={(t) => updateCodigo(index, 'code', t)}
                />
                <TextInput 
                  style={[styles.codeInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, flex: 1, marginHorizontal: 10 }]} 
                  placeholder="Descripción"
                  placeholderTextColor={colors.subtext}
                  value={cod.name}
                  onChangeText={(t) => updateCodigo(index, 'name', t)}
                />
                <TouchableOpacity onPress={() => openSearch('codigo', index)} style={[styles.removeBtn, { marginRight: 10 }]}>
                  <Search size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeCodigo(index)} style={styles.removeBtn}>
                  <Trash2 size={18} color="#dc3545" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* DIAGNÓSTICO Y NOTAS */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Diagnóstico</Text>
          <TextInput 
            style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
            placeholder="Motivo de la cirugía..."
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={3}
            value={form.diagnostico}
            onChangeText={(t) => setForm({...form, diagnostico: t})}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Observaciones del Paciente</Text>
          <TextInput 
            style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
            placeholder="Alergias, materiales específicos, etc."
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={2}
            value={form.observaciones}
            onChangeText={(t) => setForm({...form, observaciones: t})}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Anotaciones Internas (Privado)</Text>
          <TextInput 
            style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, borderLeftColor: '#ffc107', borderLeftWidth: 4 }]} 
            placeholder="Solo visible por administración..."
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={2}
            value={form.anotacionesInternas}
            onChangeText={(t) => setForm({...form, anotacionesInternas: t})}
          />
        </View>

        <TouchableOpacity 
            style={[styles.submitButton, { backgroundColor: colors.primary }]} 
            onPress={handleSave} 
            disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>CREAR ORDEN DE CIRUGÍA</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      <SearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onSelect={handleSelectResult}
        data={getSearchData()}
        title={
          searchType === 'profesional' ? 'Buscar Profesional' : 
          searchType === 'obraSocial' ? 'Buscar Obra Social' : 
          'Buscar Práctica/Código'
        }
        placeholder={
          searchType === 'profesional' ? 'Nombre del médico...' : 
          searchType === 'obraSocial' ? 'Nombre de la OS...' : 
          'Código o nombre...'
        }
        searchKey="nombre"
        secondaryKey={searchType === 'profesional' ? 'categoria' : 'codigo'}
        type={
          searchType === 'profesional' ? 'professional' : 
          searchType === 'obraSocial' ? 'text' : 
          'code'
        }
      />

      {/* DateTimePickers */}
        {showDatePicker && (
          <DateTimePicker
            value={new Date(form.fechaCirugia + 'T12:00:00')}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={new Date('2024-01-01T' + (form.hora || '12:00'))}
            mode="time"
            display="default"
            onChange={onTimeChange}
          />
        )}

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    padding: 15, elevation: 2, borderBottomWidth: 1
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  backButton: { padding: 5 },
  saveHeaderButton: { padding: 5 },
  content: { padding: 20 },
  sectionHeader: { marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 5, textTransform: 'uppercase', opacity: 0.6 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', 
    borderRadius: 15, paddingHorizontal: 15, borderWidth: 1
  },
  input: { flex: 1, height: 50, marginLeft: 10, fontSize: 16 },
  row: { flexDirection: 'row', marginBottom: 20 },
  dateSelector: {
    flexDirection: 'row', alignItems: 'center', 
    padding: 12, borderRadius: 15, borderWidth: 1
  },
  dateLabel: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  dateValue: { fontSize: 15, fontWeight: '600' },
  switchCard: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    padding: 15, borderRadius: 18, marginBottom: 15, borderWidth: 1
  },
  switchInfo: { flex: 1, marginRight: 10 },
  switchTitle: { fontSize: 14, fontWeight: 'bold' },
  switchDesc: { fontSize: 11 },
  codesSection: { marginBottom: 25 },
  codesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  smallAddBtn: { backgroundColor: '#008080', width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  codeInput: { height: 45, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  removeBtn: { padding: 5 },
  textArea: { 
    borderRadius: 15, borderWidth: 1, padding: 15, 
    fontSize: 15, minHeight: 80, textAlignVertical: 'top' 
  },
  submitButton: { 
    height: 60, borderRadius: 20, 
    justifyContent: 'center', alignItems: 'center', 
    marginTop: 10, marginBottom: 50, elevation: 3
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 }
});

export default NewOrderScreen;
