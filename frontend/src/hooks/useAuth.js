import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

/** Acceso al estado de sesión. Debe usarse dentro de <AuthProvider>. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
