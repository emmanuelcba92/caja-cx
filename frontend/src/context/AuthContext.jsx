import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, isLocalEnv } from '../firebase/config';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getRolePermissions, seedDefaultRoles } from '../services/roleService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [viewingUid, setViewingUid] = useState(null);
  const [sharedAccounts, setSharedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userRole, setUserRole] = useState('user');
  const [permissions, setPermissions] = useState({});
  const [catalogOwnerUid, setCatalogOwnerUid] = useState(null);
  const [linkedProfesionalName, setLinkedProfesionalName] = useState(null);

  // Emails de super-admin (acceso total)
  const SUPER_ADMIN_EMAILS = ["emmanuel.ag92@gmail.com", "egomez@coat.com.ar"];
  const isSuperAdminEmail = (email) => SUPER_ADMIN_EMAILS.includes(email);

  // Login con email/password
  const login = async (email, password) => {
    await setPersistence(auth, browserSessionPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Logout
  const logout = () => {
    sessionStorage.removeItem('session_start_time');
    setViewingUid(null);
    setCatalogOwnerUid(null);
    return signOut(auth);
  };

  // Reset password
  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  // Login con Google
  const loginWithGoogle = async () => {
    await setPersistence(auth, browserSessionPersistence);
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  // Verificar si el usuario tiene proveedor de contraseña vinculado
  const hasPasswordProvider = () => {
    if (!auth.currentUser) return false;
    return auth.currentUser.providerData.some(p => p.providerId === 'password');
  };

  // Vincular contraseña a cuenta de Google
  const linkEmailPassword = async (password) => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error("No hay usuario logueado o no tiene email.");
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
    return linkWithCredential(auth.currentUser, credential);
  };

  // Conceder acceso a otro usuario
  const grantAccess = async (email, role = 'editor') => {
    if (!currentUser) throw new Error("No hay usuario logueado");

    const q = query(
      collection(db, "access_grants"),
      where("ownerUid", "==", currentUser.uid),
      where("grantedEmail", "==", email)
    );
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Ya le concediste acceso a este usuario");

    await addDoc(collection(db, "access_grants"), {
      ownerUid: currentUser.uid,
      grantedEmail: email,
      role,
      createdAt: new Date()
    });
  };

  // Revocar acceso
  const revokeAccess = async (grantId) => {
    await deleteDoc(doc(db, "access_grants", grantId));
  };

  // Obtener cuentas que me compartieron acceso
  const fetchSharedAccounts = async (userEmail) => {
    try {
      const q = query(
        collection(db, "access_grants"),
        where("grantedEmail", "==", userEmail)
      );
      const snap = await getDocs(q);
      const accounts = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setSharedAccounts(accounts);
      return accounts;
    } catch (error) {
      console.error("[Auth] Error fetching shared accounts:", error);
      return [];
    }
  };

  // Cambiar contexto (ver caja de otro usuario)
  const switchContext = (targetUid) => {
    setViewingUid(targetUid);
    setCatalogOwnerUid(targetUid);
  };

  // Restaurar contexto propio
  const restoreMyContext = () => {
    setViewingUid(null);
    setCatalogOwnerUid(null);
  };

  // Efecto principal de autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // --- SECURITY: Sesión máxima de 5 horas ---
          const startTime = sessionStorage.getItem('session_start_time');
          const now = Date.now();
          const FIVE_HOURS = 5 * 60 * 60 * 1000;

          if (startTime && (now - parseInt(startTime)) > FIVE_HOURS) {
            console.log("[Auth] Sesión expirada (Límite 5hs)");
            logout();
            return;
          }
          if (!startTime) {
            sessionStorage.setItem('session_start_time', now.toString());
          }

          // --- SECURITY: Timer de inactividad (1 hora) ---
          let inactivityTimer;
          const ONE_HOUR = 1 * 60 * 60 * 1000;

          const resetInactivityTimer = () => {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
              console.log("[Auth] Cerrando sesión por inactividad (1h)");
              logout();
            }, ONE_HOUR);
          };

          window.addEventListener('mousemove', resetInactivityTimer);
          window.addEventListener('keydown', resetInactivityTimer);
          window.addEventListener('click', resetInactivityTimer);
          window.addEventListener('scroll', resetInactivityTimer);
          resetInactivityTimer();

          setCurrentUser({ ...user, nombre: user.displayName || user.email || 'Usuario' });
          setViewingUid(user.uid);
          setCatalogOwnerUid(user.uid);

          // Verificar si es super-admin
          const isSuperAdmin = isSuperAdminEmail(user.email);

          // Obtener rol y permisos
          let role = 'user';
          let userPermissions = {};

          if (isSuperAdmin) {
            role = 'admin';
            userPermissions = {
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
            };
          } else {
            // Buscar email en authorized_emails
            try {
              const authQuery = query(
                collection(db, "authorized_emails"),
                where("email", "==", user.email)
              );
              const authSnap = await getDocs(authQuery);

              if (!authSnap.empty) {
                const authRecord = authSnap.docs[0].data();
                role = authRecord.role || 'user';
                userPermissions = await getRolePermissions(role);
                setIsAuthorized(true);

                // Buscar nombre del profesional vinculado
                if (authRecord.profesionalName) {
                  setLinkedProfesionalName(authRecord.profesionalName);
                }
              } else {
                setIsAuthorized(false);
                role = 'unauthorized';
              }
            } catch (e) {
              console.error("[Auth] Error checking authorization:", e);
              setIsAuthorized(false);
            }
          }

          setUserRole(role);
          setPermissions(userPermissions);

          // Cargar cuentas compartidas
          await fetchSharedAccounts(user.email);

          // Sembrar roles si es admin
          if (isSuperAdmin) {
            await seedDefaultRoles();
          }

          console.log(`[Auth] User authenticated: ${user.email} | Role: ${role}`);
        } else {
          setCurrentUser(null);
          setIsAuthorized(false);
          setUserRole('user');
          setPermissions({});
          setSharedAccounts([]);
          setLinkedProfesionalName(null);
        }
      } catch (error) {
        console.error("[Auth] Error in onAuthStateChanged:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    viewingUid,
    sharedAccounts,
    catalogOwnerUid,
    linkedProfesionalName,
    loading,
    isAuthorized,
    isSuperAdmin: currentUser ? isSuperAdminEmail(currentUser.email) : false,
    userRole,
    permissions,
    login,
    logout,
    resetPassword,
    loginWithGoogle,
    hasPasswordProvider,
    linkEmailPassword,
    grantAccess,
    revokeAccess,
    switchContext,
    restoreMyContext
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
