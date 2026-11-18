import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { lightTheme, darkTheme, ThemeColors } from '../theme';

interface AppContextType {
  isDarkMode: boolean;
  notificationsEnabled: boolean;
  theme: ThemeColors;
  toggleDarkMode: () => void;
  toggleNotificationsEnabled: () => void;
}
const AppContext = createContext<AppContextType | undefined>(undefined);
export function AppProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const theme = useMemo(
    () => (isDarkMode ? darkTheme : lightTheme),
    [isDarkMode],
  );
  return (
    <AppContext.Provider
      value={{
        isDarkMode,
        notificationsEnabled,
        theme,
        toggleDarkMode: () => setIsDarkMode(previous => !previous),
        toggleNotificationsEnabled: () =>
          setNotificationsEnabled(previous => !previous),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp phải được bọc trong AppProvider');
  }
  return context;
}
