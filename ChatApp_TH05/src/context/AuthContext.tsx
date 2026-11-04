import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  AuthUser,
  getUserProfile,
  loginUser,
  registerUser,
  logoutUser,
  onAuthChange,
  getCurrentFirebaseUser,
  getAuthErrorMessage,
} from '../services/authService';
import { startPresence } from '../services/presenceService';

interface AuthContextType {
  currentUser: AuthUser | null;
  initializing: boolean;
  sessionError: string;
  retrySession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  connected: boolean | null;
  presenceError: string;
  retryPresence: () => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [presenceError, setPresenceError] = useState('');
  const [presenceAttempt, setPresenceAttempt] = useState(0);
  const mounted = useRef(false);
  const operation = useRef(false);
  const revision = useRef(0);
  const uid = currentUser?.uid;

  useEffect(() => {
    let active = true;
    setConnected(null);
    setPresenceError('');
    if (!uid) {
      return;
    }
    const cleanup = startPresence(
      uid,
      error => {
        if (active) {
          setPresenceError(getAuthErrorMessage(error));
        }
      },
      value => {
        if (active) {
          setConnected(value);
        }
      },
    );
    return () => {
      active = false;
      cleanup();
    };
  }, [uid, presenceAttempt]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const unsubscribe = onAuthChange(user => {
      // createUser phát sự kiện trước khi ghi xong hồ sơ: chờ register hoàn tất.
      if (operation.current) {
        return;
      }
      const request = ++revision.current;
      setInitializing(true);
      setCurrentUser(null);
      setSessionError('');
      if (!user) {
        setInitializing(false);
        return;
      }
      getUserProfile(user)
        .then(profile => {
          if (active && revision.current === request) {
            setCurrentUser(profile);
          }
        })
        .catch(error => {
          if (active && revision.current === request) {
            setSessionError(getAuthErrorMessage(error));
          }
        })
        .finally(() => {
          if (active && revision.current === request) {
            setInitializing(false);
          }
        });
    });
    return () => {
      mounted.current = false;
      active = false;
      unsubscribe();
    };
  }, []);

  const authenticate = async (action: () => Promise<AuthUser>) => {
    if (operation.current) {
      throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất.');
    }
    operation.current = true;
    ++revision.current;
    try {
      const user = await action();
      if (mounted.current) {
        setCurrentUser(user);
        setSessionError('');
      }
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) {
        setInitializing(false);
      }
    }
  };

  const retrySession = async () => {
    const user = getCurrentFirebaseUser();
    if (!user) {
      setSessionError('');
      setInitializing(false);
      return;
    }
    setInitializing(true);
    try {
      await authenticate(() => getUserProfile(user));
    } catch (error) {
      if (mounted.current) {
        setSessionError(getAuthErrorMessage(error));
      }
    }
  };

  const logout = async () => {
    if (operation.current) {
      throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất.');
    }
    operation.current = true;
    ++revision.current;
    try {
      await logoutUser();
      if (mounted.current) {
        setCurrentUser(null);
        setSessionError('');
      }
    } catch (error) {
      if (mounted.current) {
        setPresenceAttempt(previous => previous + 1);
      }
      throw new Error(getAuthErrorMessage(error));
    } finally {
      operation.current = false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        initializing,
        sessionError,
        retrySession,
        login: (email, password) =>
          authenticate(() => loginUser(email, password)),
        register: (name, email, password) =>
          authenticate(() => registerUser(name, email, password)),
        logout,
        connected,
        presenceError,
        retryPresence: () => setPresenceAttempt(previous => previous + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được bọc trong AuthProvider');
  }
  return context;
}
