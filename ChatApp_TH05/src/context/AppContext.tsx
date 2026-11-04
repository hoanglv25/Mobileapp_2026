import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { AppNotification } from '../types';
import { mockNotifications } from '../data/mockData';
import { lightTheme, darkTheme, ThemeColors } from '../theme';

interface AppContextType {
  notifications: AppNotification[];
  isDarkMode: boolean;
  notificationsEnabled: boolean;
  theme: ThemeColors;
  unreadNotificationsCount: number;
  toggleDarkMode: () => void;
  toggleNotificationsEnabled: () => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
}
const AppContext = createContext<AppContextType | undefined>(undefined);
export function AppProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const theme = useMemo(
    () => (isDarkMode ? darkTheme : lightTheme),
    [isDarkMode],
  );
  return (
    <AppContext.Provider
      value={{
        notifications,
        isDarkMode,
        notificationsEnabled,
        theme,
        unreadNotificationsCount: notifications.filter(item => !item.isRead)
          .length,
        toggleDarkMode: () => setIsDarkMode(previous => !previous),
        toggleNotificationsEnabled: () =>
          setNotificationsEnabled(previous => !previous),
        markNotificationAsRead: id =>
          setNotifications(previous =>
            previous.map(item =>
              item.id === id ? { ...item, isRead: true } : item,
            ),
          ),
        markAllNotificationsAsRead: () =>
          setNotifications(previous =>
            previous.map(item => ({ ...item, isRead: true })),
          ),
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
