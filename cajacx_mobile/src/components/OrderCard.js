import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar, User, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const OrderCard = ({ order, onPress }) => {
  const { colors, isDark } = useTheme();

  // Colores para estados
  const statusColors = {
    'urgente': colors.error,
    'en espera': '#ffc107',
    'completado': colors.success,
    'default': colors.primary
  };

  const displayAfiliado = (order.afiliado || order.paciente || 'Sin Nombre').toUpperCase();

  const formatDate = (dateStr) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr || 'Fecha pendiente';
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <TouchableOpacity 
      style={[styles.card, { backgroundColor: colors.card, borderLeftColor: order.urgencia ? colors.error : colors.primary }]} 
      onPress={onPress} 
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={[styles.patientName, { color: colors.text }]}>{displayAfiliado}</Text>
            <View style={styles.badgeContainer}>
              {order.urgencia && (
                <View style={[styles.badge, { backgroundColor: colors.error, marginRight: 4 }]}>
                  <Text style={styles.badgeText}>URGENTE</Text>
                </View>
              )}
              {order.status === 'auditada' && (
                <View style={[styles.badge, { backgroundColor: colors.success, marginRight: 4 }]}>
                  <Text style={styles.badgeText}>AUDITADA</Text>
                </View>
              )}
              {order.autorizada && (
                <View style={[styles.badge, { backgroundColor: '#0d9488', marginRight: 4 }]}>
                  <Text style={styles.badgeText}>AUTORIZADA</Text>
                </View>
              )}
              {order.status === 'aprobada' ? (
                <View style={[styles.badge, { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#22c55e' }]}>
                  <Text style={[styles.badgeText, { color: '#166534' }]}>APROBADA</Text>
                </View>
              ) : order.status === 'rechazada' ? (
                <View style={[styles.badge, { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#ef4444' }]}>
                  <Text style={[styles.badgeText, { color: '#991b1b' }]}>RECHAZADA</Text>
                </View>
              ) : order.suspendida ? (
                <View style={[styles.badge, { backgroundColor: '#334155' }]}>
                  <Text style={styles.badgeText}>SUSPENDIDA</Text>
                </View>
              ) : order.enviada ? (
                <View style={[styles.badge, { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]}>
                  <Text style={[styles.badgeText, { color: '#475569' }]}>ENVIADA</Text>
                </View>
              ) : (
                <View style={[styles.badge, { backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#eab308' }]}>
                  <Text style={[styles.badgeText, { color: '#854d0e' }]}>PENDIENTE</Text>
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.details}>
            <View style={styles.row}>
              <User size={14} color={colors.primary} />
              <Text style={[styles.doctorName, { color: colors.text }]}>{order.profesional}</Text>
            </View>
            <View style={styles.row}>
              <Calendar size={14} color={colors.subtext} />
              <Text style={[styles.date, { color: colors.subtext }]}>{formatDate(order.fechaCirugia)}</Text>
            </View>
          </View>

          {order.codigosCirugia && order.codigosCirugia.length > 0 && (
            <View style={styles.codesContainer}>
              {order.codigosCirugia.slice(0, 2).map((item, idx) => {
                const codeLabel = typeof item === 'string' ? item : (item.nombre || item.name || item.codigo || item.code || '');
                const codeValue = typeof item === 'object' ? (item.codigo || item.code) : '';
                return (
                  <View key={idx} style={[styles.codeTag, { backgroundColor: colors.primary + '10' }]}>
                    <Text style={[styles.codeText, { color: colors.primary }]} numberOfLines={1}>
                      {codeValue ? `${codeValue} - ` : ''}{codeLabel}
                    </Text>
                  </View>
                );
              })}
              {order.codigosCirugia.length > 2 && (
                <Text style={[styles.moreText, { color: colors.subtext }]}>+{order.codigosCirugia.length - 2} más</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.sideInfo}>
          <ChevronRight size={20} color={colors.subtext} />
        </View>
      </View>
      
      {/* Footer del Card */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.footerRow}>
          <Text style={[styles.osText, { color: colors.primary }]}>{order.obraSocial || 'S/D'}</Text>
          <Text style={[styles.habitacionText, { color: colors.subtext }]}>Hab: {order.habitacion || 'S/D'}</Text>
        </View>
        <Text style={[styles.dniText, { color: colors.subtext }]}>DNI: {order.dni || 'S/D'}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#008080'
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mainInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    alignItems: 'center',
  },
  codeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  codeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  moreText: {
    fontSize: 11,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 14,
    color: '#495057',
    marginLeft: 6,
    fontWeight: '600',
  },
  date: {
    fontSize: 13,
    color: '#6c757d',
    marginLeft: 6,
  },
  sideInfo: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  osText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#008080',
    marginRight: 10,
  },
  habitacionText: {
    fontSize: 11,
    color: '#6c757d',
  },
  dniText: {
    fontSize: 11,
    color: '#adb5bd',
  }
});

export default OrderCard;
