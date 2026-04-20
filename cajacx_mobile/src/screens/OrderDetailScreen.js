import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { ChevronLeft, User, Phone, Clipboard, Calendar, Tag, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { apiService } from '../services/apiService';

const OrderDetailScreen = ({ route, navigation }) => {
  const [order, setOrder] = useState(route.params.order);
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr || 'Sin fecha';
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const handleToggleStatus = async (field, label) => {
    if (!order?.id) {
      Alert.alert('Error', 'No se encontró el ID de la orden.');
      return;
    }

    setLoading(true);
    try {
      const currentValue = order[field] || false;
      const newValue = !currentValue;
      const updateData = { [field]: newValue };
      
      // Si se marca como enviada, asegurar que no esté suspendida
      if (field === 'enviada' && newValue) {
        updateData.suspendida = false;
        updateData.enviadaAt = new Date().toISOString();
      }
      
      await apiService.updateDocument('ordenes_internacion', order.id, updateData);
      
      // Actualizar estado local para feedback inmediato
      setOrder(prev => ({ ...prev, ...updateData }));
      
      Alert.alert('Éxito', `${label} actualizado correctamente.`);
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      Alert.alert('Error', 'No se pudo actualizar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!order?.id) return;
    
    Alert.alert(
      'Cancelar Cirugía',
      '¿Estás seguro de que deseas cancelar esta cirugía? Esta acción marcará la orden como cancelada.',
      [
        { text: 'No, volver', style: 'cancel' },
        { 
          text: 'Sí, cancelar', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const cancelData = { 
                status: 'cancelada',
                suspendida: true,
                canceladaAt: new Date().toISOString()
              };
              await apiService.updateDocument('ordenes_internacion', order.id, cancelData);
              
              // Actualizar estado local antes de salir o simplemente salir
              setOrder(prev => ({ ...prev, ...cancelData }));
              
              Alert.alert('Orden Cancelada', 'La cirugía ha sido marcada como cancelada.');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'No se pudo cancelar: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Custom Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft color={colors.primary} size={28} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Detalle de Cirugía</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Info Card Principal */}
        <View style={[styles.mainCard, { backgroundColor: colors.card, shadowColor: colors.primary }]}>
          <Text style={[styles.patientName, { color: colors.text }]}>
            {typeof order.afiliado === 'string' ? order.afiliado.toUpperCase() : 
             typeof order.paciente === 'string' ? order.paciente.toUpperCase() : 'SIN NOMBRE'}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, order.urgencia ? styles.urgentBadge : { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.badgeText, { color: order.urgencia ? '#dc3545' : colors.primary }]}>
                  {order.urgencia ? 'URGENTE' : 'PROGRAMADA'}
                </Text>
            </View>
            {/* Mostrar estado general solo si no es pendiente o si no se ha enviado/autorizado aún */}
            {order.status !== 'pendiente' ? (
              <View style={[styles.badge, { backgroundColor: order.status === 'cancelada' ? '#fee2e2' : colors.subtext + '20', marginLeft: 10 }]}>
                  <Text style={[styles.badgeText, { color: order.status === 'cancelada' ? '#ef4444' : colors.text }]}>
                    {order.status?.toUpperCase()}
                  </Text>
              </View>
            ) : (!order.enviada && !order.autorizada) && (
              <View style={[styles.badge, { backgroundColor: colors.subtext + '20', marginLeft: 10 }]}>
                  <Text style={[styles.badgeText, { color: colors.text }]}>PENDIENTE</Text>
              </View>
            )}
            {order.enviada && (
              <View style={[styles.badge, { backgroundColor: '#f1f5f9', marginLeft: 10, borderWidth: 1, borderColor: '#cbd5e1' }]}>
                <Text style={[styles.badgeText, { color: '#475569' }]}>ENVIADA</Text>
              </View>
            )}
            {order.autorizada && (
              <View style={[styles.badge, { backgroundColor: '#ccfbf1', marginLeft: 10, borderWidth: 1, borderColor: '#0d9488' }]}>
                <Text style={[styles.badgeText, { color: '#0f766e' }]}>AUTORIZADA</Text>
              </View>
            )}
          </View>

          <View style={styles.infoRow}>
            <User size={20} color={colors.primary} />
            <View style={styles.textCol}>
              <Text style={[styles.label, { color: colors.subtext }]}>Profesional</Text>
              <Text style={[styles.value, { color: colors.text }]}>{order.profesional}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Calendar size={20} color={colors.primary} />
            <View style={styles.textCol}>
              <Text style={[styles.label, { color: colors.subtext }]}>Fecha de Cirugía</Text>
              <Text style={[styles.value, { color: colors.text }]}>{formatDate(order.fechaCirugia)}</Text>
            </View>
          </View>
        </View>

        {/* Datos del Paciente */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.subtext }]}>Paciente</Text>
          <View style={[styles.dataBox, { backgroundColor: colors.card }]}>
            <View style={styles.dataGrid}>
              <View style={styles.dataItemFull}>
                <Text style={[styles.dataLabel, { color: colors.subtext }]}>DNI</Text>
                <Text style={[styles.dataValue, { color: colors.text }]}>{order.dni || 'S/D'}</Text>
              </View>
              <View style={styles.dataItemFull}>
                <Text style={[styles.dataLabel, { color: colors.subtext }]}>N° Afiliado</Text>
                <Text style={[styles.dataValue, { color: colors.text }]}>{order.numAfiliado || 'S/D'}</Text>
              </View>
              <View style={styles.dataItemFull}>
                <Text style={[styles.dataLabel, { color: colors.subtext }]}>Obra Social</Text>
                <Text style={[styles.dataValue, { color: colors.text }]}>{order.obraSocial || 'S/D'}</Text>
              </View>
              <View style={styles.dataItemFull}>
                <Text style={[styles.dataLabel, { color: colors.subtext }]}>Habitación</Text>
                <Text style={[styles.dataValue, { color: colors.text }]}>{order.habitacion || 'S/D'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Detalles Médicos */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.subtext }]}>Detalles Médicos</Text>
          <View style={[styles.dataBox, { backgroundColor: colors.card }]}>
            <View style={styles.detailItem}>
              <Text style={[styles.dataLabel, { color: colors.subtext }]}>Anestesia</Text>
              <Text style={[styles.dataValue, { color: colors.text }]}>{order.anestesia || 'S/D'}</Text>
            </View>
            
            <View style={styles.detailItem}>
              <Text style={[styles.dataLabel, { color: colors.subtext }]}>Diagnóstico</Text>
              <Text style={[styles.dataValue, { color: colors.text }]}>{order.diagnostico || 'Sin diagnóstico'}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={[styles.dataLabel, { color: colors.subtext }]}>Estudio bajo anestesia</Text>
              <Text style={[styles.dataValue, { color: order.estudioBajoAnestesia ? colors.success : colors.subtext }]}>
                {order.estudioBajoAnestesia ? 'SÍ' : 'NO'}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={[styles.dataLabel, { color: colors.subtext, marginBottom: 8 }]}>Códigos de Cirugía</Text>
              <View style={styles.codesContainer}>
                {order.codigosCirugia && order.codigosCirugia.length > 0 ? (
                  order.codigosCirugia.map((item, index) => {
                    const label = typeof item === 'string' ? item : (item.nombre || item.name || '');
                    const value = typeof item === 'object' ? (item.codigo || item.code || '') : '';
                    return (
                      <View key={index} style={[styles.codeTag, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={[styles.codeText, { color: colors.primary }]}>
                          {value ? `${value} - ` : ''}{label}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={{ color: colors.subtext }}>Sin códigos</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Observaciones y Anotaciones */}
        {(order.observaciones || order.anotacionesInternas) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.subtext }]}>Observaciones</Text>
            {order.observaciones && (
              <View style={[styles.obsBox, { backgroundColor: colors.card, borderLeftColor: colors.primary, marginBottom: 10 }]}>
                <Text style={[styles.obsLabel, { color: colors.subtext }]}>Paciente/General</Text>
                <Text style={[styles.obsText, { color: colors.text }]}>{order.observaciones}</Text>
              </View>
            )}
            {order.anotacionesInternas && (
              <View style={[styles.obsBox, { backgroundColor: colors.card, borderLeftColor: '#ffc107' }]}>
                <Text style={[styles.obsLabel, { color: colors.subtext }]}>Internas</Text>
                <Text style={[styles.obsText, { color: colors.text }]}>{order.anotacionesInternas}</Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Botones de Acción Secundarios */}
      <View style={[styles.actionRow, { backgroundColor: colors.card, borderTopColor: colors.border, width: '100%' }]}>
        <TouchableOpacity 
          style={[
            styles.secondaryAction, 
            { 
              backgroundColor: order.enviada ? colors.primary + '15' : colors.background,
              borderColor: order.enviada ? colors.primary : colors.border
            }
          ]}
          onPress={() => handleToggleStatus('enviada', 'ENVIADA')}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading && order.enviada === undefined ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.secondaryActionText, { color: order.enviada ? colors.primary : colors.subtext }]}>
              {order.enviada ? '✓ ENVIADA' : 'Marcar Enviada'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.secondaryAction, 
            { 
              backgroundColor: order.autorizada ? '#ccfbf1' : colors.background,
              borderColor: order.autorizada ? '#0d9488' : colors.border
            }
          ]}
          onPress={() => handleToggleStatus('autorizada', 'AUTORIZADA')}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={[styles.secondaryActionText, { color: order.autorizada ? '#0d9488' : colors.subtext }]}>
            {order.autorizada ? '✓ AUTORIZADA' : 'Marcar Autorizada'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Botón de Acción Principal */}
      <View style={[styles.footer, { backgroundColor: colors.card, width: '100%' }]}>
        <TouchableOpacity 
          style={[styles.cancelAction, { backgroundColor: 'transparent', borderColor: '#ef4444', borderWidth: 1 }]} 
          onPress={handleCancel}
          disabled={loading || order.status === 'cancelada'}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <Text style={[styles.cancelActionText, { color: '#ef4444', fontSize: 13, fontWeight: 'bold' }]}>
              {order.status === 'cancelada' ? 'CIRUGÍA CANCELADA' : 'CANCELAR CIRUGÍA'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
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
  content: { flex: 1, padding: 20 },
  mainCard: { 
    padding: 25, borderRadius: 25, elevation: 5, 
    marginBottom: 20, shadowOpacity: 0.1 
  },
  patientName: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  badgeRow: { marginBottom: 20 },
  badge: { 
    paddingHorizontal: 10, paddingVertical: 5, 
    borderRadius: 8, alignSelf: 'flex-start' 
  },
  urgentBadge: { backgroundColor: '#fff5f5' },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  textCol: { marginLeft: 15 },
  label: { fontSize: 12 },
  value: { fontSize: 16, fontWeight: '500' },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, marginLeft: 5 },
  dataBox: { borderRadius: 20, padding: 20 },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dataItemFull: { width: '48%', marginBottom: 15 },
  dataLabel: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  dataValue: { fontSize: 15, fontWeight: '500' },
  detailItem: { marginBottom: 15 },
  codesContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  codeTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 8, marginBottom: 8 },
  codeText: { fontSize: 12, fontWeight: '700' },
  obsBox: { borderRadius: 20, padding: 15, borderLeftWidth: 4 },
  obsLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 5 },
  obsText: { lineHeight: 22 },
  actionRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 10,
    borderTopWidth: 1
  },
  secondaryAction: {
    flex: 0.48,
    height: 45,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)'
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700'
  },
  footer: { padding: 20, alignItems: 'center' },
  cancelAction: { 
    height: 45, 
    borderRadius: 12, 
    paddingHorizontal: 25,
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1,
    width: '100%'
  },
  cancelActionText: { fontSize: 14, fontWeight: 'bold' }
});

export default OrderDetailScreen;
