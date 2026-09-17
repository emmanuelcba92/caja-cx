import { db, isLocalEnv } from '../firebase/config';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

/**
 * Roles predefinidos del sistema.
 * Se pueden agregar/modificar desde Firebase Console en la colección 'roles'.
 */
export const DEFAULT_ROLES = {
  admin: {
    name: 'Administrador',
    isSystem: true,
    permissions: {
      can_view_admin: true,
      can_manage_users: true,
      can_view_shared_catalog: true,
      can_view_ordenes: true,
      can_share_ordenes: true,
      can_view_stats: true,
      can_delete_data: true,
      can_edit_data: true,
      can_edit_own: true,
      can_delete_own: true,
      readonly_caja: false,
      is_ephemeral: false
    }
  },
  secre: {
    name: 'Secretaria',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: true,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_own: true,
      can_delete_own: true,
      readonly_caja: false,
      is_ephemeral: false
    }
  },
  secre_estudios: {
    name: 'Secretaria de Estudios',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_view_stats: false,
      can_delete_data: false,
      can_edit_data: true,
      can_edit_own: true,
      can_delete_own: false,
      readonly_caja: true,
      only_estudios: true,
      is_ephemeral: false
    }
  },
  direccion_medica: {
    name: 'Dirección Médica',
    isSystem: true,
    permissions: {
      can_view_admin: true,
      can_view_stats: true,
      can_manage_users: false,
      can_view_shared_catalog: true,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_data: false,
      can_edit_own: false,
      can_delete_own: false,
      readonly_caja: true,
      is_ephemeral: false
    }
  },
  medico: {
    name: 'Médico',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_data: false,
      can_edit_own: true,
      can_delete_own: false,
      readonly_caja: true,
      is_ephemeral: false
    }
  },
  residente: {
    name: 'Residente',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_data: false,
      can_edit_own: true,
      can_delete_own: false,
      readonly_caja: true,
      is_ephemeral: false
    }
  },
  coat: {
    name: 'COAT (Solo Caja)',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: false,
      can_share_ordenes: false,
      can_view_stats: false,
      can_delete_data: false,
      can_edit_data: true,
      can_edit_own: true,
      can_delete_own: true,
      readonly_caja: false,
      is_ephemeral: false
    }
  }
};

/**
 * Sembrar roles por defecto en Firestore (solo si no existen)
 */
export const seedDefaultRoles = async () => {
  if (isLocalEnv) return; // No sembrar en local

  try {
    const rolesCol = collection(db, 'roles');

    // Eliminar roles custom/deprecated que no estén en DEFAULT_ROLES
    const snap = await getDocs(rolesCol);
    for (const docSnap of snap.docs) {
      const roleId = docSnap.id;
      if (!Object.keys(DEFAULT_ROLES).includes(roleId)) {
        console.log(`Removing custom/deprecated role: ${roleId}`);
        await deleteDoc(doc(rolesCol, roleId));
      }
    }

    // Crear/Actualizar roles por defecto
    for (const [key, roleData] of Object.entries(DEFAULT_ROLES)) {
      const roleRef = doc(rolesCol, key);
      await setDoc(roleRef, roleData, { merge: true });
    }
    console.log('[RoleService] Roles seeded successfully');
  } catch (error) {
    console.error('[RoleService] Error seeding roles:', error);
  }
};

/**
 * Obtener todos los roles
 */
export const getRoles = async () => {
  if (isLocalEnv) {
    return Object.entries(DEFAULT_ROLES).map(([id, data]) => ({ id, ...data }));
  }

  const snap = await getDocs(collection(db, 'roles'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/**
 * Obtener permisos de un rol específico
 */
export const getRolePermissions = async (roleName) => {
  if (!roleName) return DEFAULT_ROLES.secre.permissions;

  // Primero intentar de Firebase
  if (!isLocalEnv) {
    try {
      const roleRef = doc(db, 'roles', roleName);
      const roleSnap = await getDoc(roleRef);
      if (roleSnap.exists()) {
        return roleSnap.data().permissions;
      }
    } catch (e) {
      console.error('[RoleService] Error fetching permissions for', roleName, e);
    }
  }

  // Fallback a defaults
  const defaultRole = DEFAULT_ROLES[roleName] || DEFAULT_ROLES.secre;
  return defaultRole.permissions;
};

/**
 * Actualizar el rol de un usuario autorizado
 */
export const updateAuthorizedRole = async (recordId, newRole) => {
  const ref = doc(db, 'authorized_emails', recordId);
  await setDoc(ref, { role: newRole }, { merge: true });
};
