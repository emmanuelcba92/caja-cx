import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, signInWithPopup, GoogleAuthProvider, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { db } from '../firebase/config';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getRolePermissions, seedDefaultRoles } from '../services/roleService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [viewingUid, setViewingUid] = useState(null);
    const [sharedAccounts, setSharedAccounts] = useState([]); // Accounts shared WITH me
    const [loading, setLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [userRole, setUserRole] = useState('user'); // 'user', 'admin', 'coat', 'prueba'
    const [permissions, setPermissions] = useState({}); // New Permissions Object
    const [catalogOwnerUid, setCatalogOwnerUid] = useState(null);
    const SUPER_ADMIN_EMAIL = "emmanuel.ag92@gmail.com";

    const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
    const logout = () => signOut(auth);
    const resetPassword = (email) => sendPasswordResetEmail(auth, email);
    const loginWithGoogle = () => {
        const provider = new GoogleAuthProvider();
        return signInWithPopup(auth, provider);
    };

    // Check if current user has email/password provider linked
    const hasPasswordProvider = () => {
        if (!auth.currentUser) return false;
        return auth.currentUser.providerData.some(p => p.providerId === 'password');
    };

    // Link email/password to current Google account
    const linkEmailPassword = async (password) => {
        if (!auth.currentUser || !auth.currentUser.email) {
            throw new Error("No hay usuario logueado o no tiene email.");
        }
        const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
        return linkWithCredential(auth.currentUser, credential);
    };

    useEffect(() => {
        seedDefaultRoles(); // Seed roles on mount
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            try {
                if (user) {
                    // Determine Role & Authorization
                    let role = 'user';
                    let authorized = false;

                    if (user.email === SUPER_ADMIN_EMAIL) {
                        authorized = true;
                        role = 'superadmin';
                        setCatalogOwnerUid(user.uid);
                        // Super Manager has all permissions effectively, but let's give them a god object or just standard admin + extra
                        setPermissions({
                            can_view_admin: true,
                            can_manage_users: true,
                            can_view_shared_catalog: false, // Super admin sees their own catalog naturally
                            can_view_ordenes: true,
                            can_share_ordenes: true,
                            can_delete_data: true,
                            is_ephemeral: false
                        });
                    } else {
                        const q = query(collection(db, "authorized_emails"), where("email", "==", user.email));
                        const snap = await getDocs(q);
                        if (!snap.empty) {
                            authorized = true;
                            const authData = snap.docs[0].data();
                            role = authData.role || 'user';

                            // Load Permissions
                            const perms = await getRolePermissions(role);
                            setPermissions(perms);

                            // If COAT (or has shared permission), use the stamped ownerUid
                            if (perms.can_view_shared_catalog || role === 'coat') {
                                if (authData.ownerUid) {
                                    setCatalogOwnerUid(authData.ownerUid);
                                } else {
                                    // Fallback (Old method)
                                    const qIdx = query(collection(db, "profiles"), where("email", "==", SUPER_ADMIN_EMAIL));
                                    const sapSnap = await getDocs(qIdx);
                                    if (!sapSnap.empty) {
                                        setCatalogOwnerUid(sapSnap.docs[0].id);
                                    } else {
                                        setCatalogOwnerUid(user.uid);
                                    }
                                }
                            } else {
                                setCatalogOwnerUid(user.uid);
                            }
                        }
                    }

                    setIsAuthorized(authorized);
                    setUserRole(role);

                    // Sync Profile to Firestore
                    try {
                        await setDoc(doc(db, "profiles", user.uid), {
                            email: user.email,
                            displayName: user.displayName || user.email.split('@')[0],
                            lastLogin: new Date().toISOString()
                        }, { merge: true });
                    } catch (err) {
                        console.error("Error syncing profile:", err);
                    }
                } else {
                    setIsAuthorized(false);
                    setUserRole('user');
                    setCatalogOwnerUid(null);
                }
            } catch (error) {
                console.error("Auth Logic Error:", error);
                setIsAuthorized(false);
                setUserRole('user');
            } finally {
                setCurrentUser(user);
                setLoading(false);
            }
        });
        return unsubscribe;
    }, []);

    // --- Sharing Logic ---

    // 1. Fetch accounts that have granted access to ME
    useEffect(() => {
        if (!currentUser || !isAuthorized) {
            setSharedAccounts([]);
            setViewingUid(null);
            return;
        }

        const fetchSharedAccounts = async () => {
            try {
                // Find grants where viewerEmail == my email
                const q = query(collection(db, "access_grants"), where("viewerEmail", "==", currentUser.email));
                const snapshot = await getDocs(q);
                const accounts = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                console.log("Cuentas compartidas conmigo:", accounts);
                setSharedAccounts(accounts);
            } catch (error) {
                console.error("Error fetching shared accounts:", error);
            }
        };

        fetchSharedAccounts();

        // Default to viewing my own data if not set
        if (!viewingUid) {
            setViewingUid(currentUser.uid);
        }
    }, [currentUser, isAuthorized]);


    const grantAccess = async (viewerEmail, role = 'editor') => {
        if (!currentUser) return;
        // Check if already exists
        const q = query(
            collection(db, "access_grants"),
            where("ownerUid", "==", currentUser.uid),
            where("viewerEmail", "==", viewerEmail)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) throw new Error("Ya compartiste acceso con este email.");

        await addDoc(collection(db, "access_grants"), {
            ownerUid: currentUser.uid,
            ownerEmail: currentUser.email, // Store for display name
            viewerEmail: viewerEmail,
            role: role,
            grantedAt: new Date().toISOString()
        });
    };

    const revokeAccess = async (grantId) => {
        await deleteDoc(doc(db, "access_grants", grantId));
    };

    const switchContext = (uid) => {
        console.log("Switching context to:", uid);
        setViewingUid(uid);
    };

    // Determine permission for current viewingUid
    // If viewing own data -> 'owner' (full access)
    // If viewing shared -> get role from sharedAccounts
    const currentPermission = (() => {
        if (!currentUser || !viewingUid || viewingUid === currentUser.uid) return 'owner';
        const sharedAccount = sharedAccounts.find(acc => acc.ownerUid === viewingUid);
        return sharedAccount ? (sharedAccount.role || 'editor') : 'viewer'; // Default to viewer if unknown, or editor for back-compat? Safe default: viewer. But legacy is editor.
    })();

    const value = {
        currentUser,
        isAuthorized,
        userRole,
        permissions, // Export permissions
        catalogOwnerUid,
        isSuperAdmin: currentUser?.email === SUPER_ADMIN_EMAIL,
        viewingUid: viewingUid || (currentUser ? currentUser.uid : null),
        sharedAccounts,
        permission: currentPermission, // Export permission
        switchContext,
        grantAccess,
        revokeAccess,
        login,
        logout,
        resetPassword,
        loginWithGoogle,
        linkEmailPassword,
        hasPasswordProvider
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
