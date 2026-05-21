import { db, isLocalEnv } from '../firebase/config';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

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
    }
};

export const seedDefaultRoles = async () => {
    try {
        const rolesCol = collection(db, 'roles');

        // Delete any custom/deprecated roles to leave ONLY default ones
        const snap = await getDocs(rolesCol);
        for (const docSnap of snap.docs) {
            const roleId = docSnap.id;
            if (!['admin', 'secre', 'direccion_medica'].includes(roleId)) {
                console.log(`Removing custom/deprecated role: ${roleId}`);
                await deleteDoc(doc(rolesCol, roleId));
            }
        }

        // Seed/Update default roles
        for (const [key, roleData] of Object.entries(DEFAULT_ROLES)) {
            const roleRef = doc(rolesCol, key);
            await setDoc(roleRef, roleData);
        }
        console.log('Roles seeded successfully.');
    } catch (error) {
        console.error('Error seeding roles:', error);
    }
};

export const getRoles = async () => {
    const snap = await getDocs(collection(db, 'roles'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getRolePermissions = async (roleName) => {
    if (!roleName) return DEFAULT_ROLES.secre.permissions;
    
    try {
        const roleRef = doc(db, 'roles', roleName);
        const roleSnap = await getDoc(roleRef);
        if (roleSnap.exists()) {
            return roleSnap.data().permissions;
        }
    } catch (e) {
        console.error("Error fetching permissions for", roleName, e);
    }

    // Fallback to default if not found in DB
    const defaultRole = DEFAULT_ROLES[roleName] || DEFAULT_ROLES.secre;
    return defaultRole.permissions;
};
export const updateAuthorizedRole = async (recordId, newRole) => {
    const ref = doc(db, 'authorized_emails', recordId);
    await setDoc(ref, { role: newRole }, { merge: true });
};
