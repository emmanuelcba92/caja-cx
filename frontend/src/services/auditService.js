import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

/**
 * Registra una acción en el log de auditoría.
 * @param {string} action - Tipo de acción (ej: 'CREAR_REGISTRO_CAJA', 'ELIMINAR_PEDIDO')
 * @param {string} targetId - ID del documento afectado
 * @param {string} targetName - Nombre o descripción del documento afectado
 * @param {object} details - Información adicional (opcional)
 */
export const logAction = async (action, targetId, targetName, details = {}) => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'audit_logs'), {
      timestamp: serverTimestamp(),
      userId: user.uid,
      userEmail: user.email,
      userName: localStorage.getItem('audit_user_name') || user.displayName || 'Usuario sin nombre',
      action,
      targetId,
      targetName,
      details,
      clientInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform
      }
    });
  } catch (error) {
    console.error('Error recording audit log:', error);
    // No lanzamos error para no romper la experiencia del usuario si falla el log
  }
};

export const AUDIT_ACTIONS = {
  // Acciones de Caja
  CREATE_CAJA_ENTRY: 'CREAR_REGISTRO_CAJA',
  EDIT_CAJA_ENTRY: 'EDITAR_REGISTRO_CAJA',
  DELETE_CAJA_ENTRY: 'ELIMINAR_REGISTRO_CAJA',
  AUTHORIZE_CAJA_ENTRY: 'AUTORIZAR_REGISTRO_CAJA',
  
  // Acciones de Órdenes de Internación / Cirugía
  CREATE_ORDER: 'CREAR_PEDIDO',
  EDIT_ORDER: 'EDITAR_PEDIDO',
  DELETE_ORDER: 'ELIMINAR_PEDIDO',
  
  // Acciones de Profesionales
  CREATE_PROFESSIONAL: 'CREAR_PROFESIONAL',
  EDIT_PROFESSIONAL: 'EDITAR_PROFESIONAL',
  DELETE_PROFESSIONAL: 'ELIMINAR_PROFESIONAL',
  
  // Acciones de Configuración Administrativa
  ADMIN_CHANGE_SETTINGS: 'CAMBIO_CONFIGURACION',
  
  // Autenticación
  AUTH_LOGIN: 'INICIO_SESION'
};
