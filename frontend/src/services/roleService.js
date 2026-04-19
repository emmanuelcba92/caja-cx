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
            can_delete_data: true,
            is_ephemeral: false
        }
    },
    secretaria: {
        name: 'Secretaria',
        isSystem: true,
        permissions: {
            can_view_admin: false,
            can_manage_users: false,
            can_view_shared_catalog: true,
            can_view_ordenes: true,
            can_share_ordenes: true,
            can_delete_data: false,
            can_edit_own: true,
            can_delete_own: true,
            is_ephemeral: false
        }
    },
    directora: {
        name: 'Directora Médica',
        isSystem: true,
        permissions: {
            can_view_admin: false,
            can_manage_users: false,
            can_view_shared_catalog: true,
            can_view_ordenes: true,
            can_share_ordenes: true,
            can_delete_data: false,
            readonly_caja: true,
            is_ephemeral: false
        }
    }
};

export const seedDefaultRoles = async () => {
    try {
        const rolesCol = collection(db, 'roles');

        // Delete deprecated 'doctor' role if it exists
        const deprecatedRoles = ['doctor'];
        for (const deprecatedRole of deprecatedRoles) {
            if (isLocalEnv) continue;
            const deprecatedRef = doc(rolesCol, deprecatedRole);
            const deprecatedSnap = await getDoc(deprecatedRef);
            if (deprecatedSnap.exists()) {
                console.log(`Removing deprecated role: ${deprecatedRole}`);
                await deleteDoc(deprecatedRef);
            }
        }

        // Seed/Update default roles
        for (const [key, roleData] of Object.entries(DEFAULT_ROLES)) {
            const roleRef = doc(rolesCol, key);
            const roleSnap = await getDoc(roleRef);

            if (!roleSnap.exists() || roleData.isSystem) {
                console.log(`Seeding/Updating system role: ${key}`);
                // Use overwrite (no merge) for system roles to ensure permissions are always up to date
                await setDoc(roleRef, roleData);
            }
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
    if (!roleName) return DEFAULT_ROLES.user.permissions;
    // Handle legacy/fallback if role doesn't exist in DB yet (or just read from DB)
    try {
        const roleRef = doc(db, 'roles', roleName);
        const roleSnap = await getDoc(roleRef);
        if (roleSnap.exists()) {
            return roleSnap.data().permissions;
        }
    } catch (e) {
        console.error("Error fetching permissions for", roleName, e);
    }

    // Fallback to default if not found in DB (e.g. before seeding finishes)
    const defaultRole = DEFAULT_ROLES[roleName] || DEFAULT_ROLES.user;
    return defaultRole.permissions;
};
