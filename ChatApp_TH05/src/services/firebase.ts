/**
 * firebase.ts
 * Khởi tạo Firebase app MỘT LẦN DUY NHẤT.
 * Tránh lỗi "auth/already-initialized" khi Fast Refresh bằng cách
 * kiểm tra getApps() trước khi gọi initializeApp().
 */
import { getApps, initializeApp, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseError } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyBiCfQuZnNFCHohw5rqGJA-oTvTYS9ACok',
  authDomain: 'chatapp-th05.firebaseapp.com',
  databaseURL: 'https://chatapp-th05-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'chatapp-th05',
  storageBucket: 'chatapp-th05.firebasestorage.app',
  messagingSenderId: '328990775353',
  appId: '1:328990775353:web:c9d4de7f14e97b7a6355e8',
  measurementId: 'G-ZY25QZRR0S',
};

// Khởi tạo app: chỉ gọi initializeApp nếu chưa có app nào
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Khởi tạo Auth với AsyncStorage persistence:
// - Nếu app vừa được khởi tạo (mới) → dùng initializeAuth
// - Nếu app đã tồn tại (Fast Refresh) → dùng getAuth để tránh lỗi "already-initialized"
let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  if (!(error instanceof FirebaseError) || error.code !== 'auth/already-initialized') {
    throw error;
  }
  // Đã được khởi tạo trước đó (Fast Refresh) → lấy instance hiện có
  auth = getAuth(app);
}

// Khởi tạo Realtime Database (dùng databaseURL đã có trong config)
const database = getDatabase(app);

export { app, auth, database };

