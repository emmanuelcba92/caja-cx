import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput, Modal, ScrollView, Platform, Alert } from 'react-native';
import { apiService } from '../services/apiService';
import { auth } from '../services/firebase';
import OrderCard from '../components/OrderCard';
import { Search, Plus, Filter, Calendar as CalendarIcon, Download, FileText, X, ChevronDown, Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { COAT_LOGO } from '../constants/logo';

const HomeScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  
  // Filter States
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [filterType, setFilterType] = useState('Próximas'); // Todas, Próximas, Realizadas, Hoy
  const [selProf, setSelProf] = useState('Todos');
  const [selOS, setSelOS] = useState('Todas');
  const [selStatus, setSelStatus] = useState('Todos');
  const [selAudit, setSelAudit] = useState('Todas');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  // Search within filters
  const [profSearch, setProfSearch] = useState('');
  const [osSearch, setOsSearch] = useState('');

  // Lists for filters
  const professionals = useMemo(() => ['Todos', ...new Set(orders.map(o => o.profesional).filter(Boolean))], [orders]);
  const obrasSociales = useMemo(() => ['Todas', ...new Set(orders.map(o => o.obraSocial).filter(Boolean))], [orders]);

  const filteredProfList = useMemo(() => {
    if (!profSearch) return professionals;
    return professionals.filter(p => p.toLowerCase().includes(profSearch.toLowerCase()) || p === 'Todos');
  }, [professionals, profSearch]);

  const filteredOSList = useMemo(() => {
    if (!osSearch) return obrasSociales;
    return obrasSociales.filter(os => os.toLowerCase().includes(osSearch.toLowerCase()) || os === 'Todas');
  }, [obrasSociales, osSearch]);

  const fetchOrders = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      
      const filters = {};
      if (auth.currentUser) {
        filters.userId = auth.currentUser.uid;
      }
      
      const data = await apiService.getCollection('ordenes_internacion', filters);
      
      // Ordenar en cliente para mayor seguridad (campo fecha o createdAt)
      data.sort((a, b) => {
        const dateA = a.fechaCirugia || a.fecha || a.createdAt || '';
        const dateB = b.fechaCirugia || b.fecha || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });

      setOrders(data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      Alert.alert("Error", "No se pudieron cargar las órdenes. Verifique su conexión o permisos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    const todayStr = todayLocal.toISOString().split('T')[0];

    return orders.filter(order => {
      // Search filter (Patient search as in web)
      const matchesSearch = !search || order.afiliado?.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      // Professional filter
      if (selProf !== 'Todos' && order.profesional !== selProf) return false;

      // OS filter
      if (selOS !== 'Todas' && order.obraSocial?.trim().toUpperCase() !== selOS.toUpperCase()) return false;

      // Status filter (Web parity: enviada vs pendiente)
      if (selStatus !== 'Todos') {
        if (selStatus === 'Enviadas' && (!order.enviada || order.suspendida)) return false;
        if (selStatus === 'Pendientes' && (order.enviada || order.suspendida)) return false;
      }

      // Audit filter (Web parity: status === 'auditada')
      if (selAudit !== 'Todas') {
        if (selAudit === 'Auditadas' && order.status !== 'auditada') return false;
        if (selAudit === 'Pendientes' && order.status === 'auditada') return false;
      }

      // Date Range filter
      if (startDate || endDate) {
        const orderDateStr = order.fechaCirugia || order.fecha || '';
        if (!orderDateStr) return false;
        if (startDate && orderDateStr < startDate.toISOString().split('T')[0]) return false;
        if (endDate && orderDateStr > endDate.toISOString().split('T')[0]) return false;
      }

      // Period filter (Web parity)
      const targetDateStr = order.fechaCirugia || order.fecha || '';
      if (filterType !== 'Todas') {
        if (filterType === 'Hoy') {
          if (targetDateStr !== todayStr) return false;
        } else if (filterType === 'Próximas') {
          if (!(targetDateStr >= todayStr && !order.suspendida && order.status !== 'cancelada')) return false;
        } else if (filterType === 'Realizadas') {
          if (!(targetDateStr < todayStr && !order.suspendida && order.status !== 'cancelada')) return false;
        } else if (filterType === 'Suspendidas') {
          if (!order.suspendida && order.status !== 'cancelada') return false;
        }
      }

      return true;
    });
  }, [orders, search, selProf, selOS, selStatus, selAudit, startDate, endDate, filterType]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const clearFilters = () => {
    setFilterType('Próximas'); // Default to Próximas as in web
    setSelProf('Todos');
    setSelOS('Todas');
    setSelStatus('Todos');
    setSelAudit('Todas');
    setStartDate(null);
    setEndDate(null);
    setProfSearch('');
    setOsSearch('');
    setIsFilterModalVisible(false);
  };

  const formatJSDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const selectCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay(); // 0 (Sun) to 6 (Sat)
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    setStartDate(monday);
    setEndDate(sunday);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.welcomeText, { color: colors.subtext }]}>Hola, Profesional</Text>
          <Text style={[styles.mainTitle, { color: colors.text }]}>Cirugías</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: colors.primary, marginLeft: 10 }]} 
            onPress={() => navigation.navigate('NewOrder')}
          >
            <Plus color="#fff" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filtros Rápidos */}
      <View style={styles.quickFilters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {['Todas', 'Próximas', 'Realizadas', 'Suspendidas', 'Hoy'].map((t) => (
            <TouchableOpacity 
              key={t}
              onPress={() => setFilterType(t)}
              style={[
                styles.quickFilterItem, 
                { backgroundColor: filterType === t ? colors.primary : colors.card, borderColor: colors.border }
              ]}
            >
              <Text style={[styles.quickFilterText, { color: filterType === t ? '#fff' : colors.text }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Barra de Búsqueda */}
      <View style={styles.filterSection}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search color={colors.subtext} size={20} />
          <TextInput 
            placeholder="Buscar paciente..."
            placeholderTextColor={colors.subtext}
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity 
          style={[styles.filterIcon, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setIsFilterModalVisible(true)}
        >
          <Filter color={colors.primary} size={20} />
          {(selProf !== 'Todos' || selOS !== 'Todas' || startDate || endDate) && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      {/* Listado */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.subtext }]}>Cargando cirugías...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <OrderCard 
              order={item} 
              onPress={() => navigation.navigate('OrderDetail', { order: item })} 
            />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                {search ? 'No se encontraron resultados.' : 'No hay cirugías programadas.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Filter Modal */}
      <Modal visible={isFilterModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Filtros Avanzados</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)}>
                <X color={colors.text} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>

              <Text style={[styles.filterLabel, { color: colors.subtext }]}>Profesional</Text>
              <View style={[styles.modalSearch, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Search size={14} color={colors.subtext} />
                <TextInput 
                  placeholder="Buscar profesional..."
                  placeholderTextColor={colors.subtext}
                  style={[styles.modalSearchInput, { color: colors.text }]}
                  value={profSearch}
                  onChangeText={setProfSearch}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {filteredProfList.map(prof => (
                  <TouchableOpacity 
                    key={prof} 
                    onPress={() => setSelProf(prof)}
                    style={[styles.chip, { backgroundColor: selProf === prof ? colors.primary : colors.background, borderColor: colors.border }]}
                  >
                    <Text style={{ color: selProf === prof ? '#fff' : colors.text }}>{prof}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.filterLabel, { color: colors.subtext, marginTop: 20 }]}>Estado</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['Todos', 'Pendientes', 'Enviadas'].map(s => (
                  <TouchableOpacity 
                    key={s} 
                    onPress={() => setSelStatus(s)}
                    style={[styles.chip, { backgroundColor: selStatus === s ? colors.primary : colors.background, borderColor: colors.border }]}
                  >
                    <Text style={{ color: selStatus === s ? '#fff' : colors.text }}>{s.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.filterLabel, { color: colors.subtext, marginTop: 20 }]}>Auditoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['Todas', 'Auditadas', 'Pendientes'].map(a => (
                  <TouchableOpacity 
                    key={a} 
                    onPress={() => setSelAudit(a)}
                    style={[styles.chip, { backgroundColor: selAudit === a ? colors.primary : colors.background, borderColor: colors.border }]}
                  >
                    <Text style={{ color: selAudit === a ? '#fff' : colors.text }}>{a.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.filterLabel, { color: colors.subtext, marginTop: 20 }]}>Obra Social</Text>
              <View style={[styles.modalSearch, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Search size={14} color={colors.subtext} />
                <TextInput 
                  placeholder="Buscar obra social..."
                  placeholderTextColor={colors.subtext}
                  style={[styles.modalSearchInput, { color: colors.text }]}
                  value={osSearch}
                  onChangeText={setOsSearch}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {filteredOSList.map(os => (
                  <TouchableOpacity 
                    key={os} 
                    onPress={() => setSelOS(os)}
                    style={[styles.chip, { backgroundColor: selOS === os ? colors.primary : colors.background, borderColor: colors.border }]}
                  >
                    <Text style={{ color: selOS === os ? '#fff' : colors.text }}>{os}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.filterLabel, { color: colors.subtext, marginTop: 20 }]}>Rango de Fechas</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity 
                  onPress={() => setShowStartPicker(true)}
                  style={[styles.dateInput, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <CalendarIcon size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, marginLeft: 8 }}>
                    {startDate ? formatJSDate(startDate) : 'Desde'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setShowEndPicker(true)}
                  style={[styles.dateInput, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <CalendarIcon size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, marginLeft: 8 }}>
                    {endDate ? formatJSDate(endDate) : 'Hasta'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                onPress={selectCurrentWeek}
                style={[styles.weekButton, { borderColor: colors.primary }]}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Seleccionar Semana Actual</Text>
              </TouchableOpacity>

              {showStartPicker && (
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  onChange={(event, date) => {
                    setShowStartPicker(false);
                    if (date) setStartDate(date);
                  }}
                />
              )}
              {showEndPicker && (
                <DateTimePicker
                  value={endDate || new Date()}
                  mode="date"
                  onChange={(event, date) => {
                    setShowEndPicker(false);
                    if (date) setEndDate(date);
                  }}
                />
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
                <Text style={{ color: colors.error }}>Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setIsFilterModalVisible(false)} 
                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    elevation: 4,
  },
  welcomeText: { fontSize: 13, fontWeight: '600' },
  mainTitle: { fontSize: 26, fontWeight: 'bold' },
  addButton: { padding: 10, borderRadius: 12 },
  actionButton: { padding: 10, borderRadius: 12 },
  quickFilters: { marginTop: 15, marginBottom: 5 },
  quickFilterItem: { 
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, 
    marginRight: 10, borderWidth: 1 
  },
  quickFilterText: { fontSize: 13, fontWeight: '600' },
  filterSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    marginRight: 10,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  filterIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  filterDot: {
    position: 'absolute', top: 12, right: 12, 
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4d4d'
  },
  listContent: { padding: 20, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10 },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { fontSize: 16 },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalBody: { marginBottom: 20 },
  filterLabel: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10 },
  chipScroll: { marginBottom: 5 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1 },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10
  },
  modalSearchInput: { flex: 1, marginLeft: 8, fontSize: 14, paddingVertical: 5 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dateInput: { 
    flex: 1, height: 45, borderRadius: 12, borderWidth: 1, 
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginHorizontal: 5
  },
  weekButton: {
    marginTop: 15,
    height: 45,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5
  },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  clearBtn: { padding: 15 },
  applyBtn: { paddingHorizontal: 40, paddingVertical: 15, borderRadius: 15 }
});

export default HomeScreen;
