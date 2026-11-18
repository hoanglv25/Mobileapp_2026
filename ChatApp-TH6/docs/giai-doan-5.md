# Giai đoạn 5 — Gửi vị trí hiện tại

## Mục tiêu và kết quả

- locationService dùng @react-native-community/geolocation 3.4.0 đã cài; không dùng Expo, geolocation-service hoặc @react-native-firebase.
- Android xin ACCESS_FINE_LOCATION và ACCESS_COARSE_LOCATION cùng nhau. Nếu chỉ cấp gần đúng, vẫn cho lấy vị trí với enableHighAccuracy=false. Nếu từ chối/chặn vĩnh viễn, không lấy GPS hoặc ghi tin.
- iOS đặt authorizationLevel='whenInUse', skipPermissionRequests=true qua setRNConfiguration rồi gọi requestAuthorization(success, error). Thư viện community này không nhận chuỗi 'whenInUse' ở requestAuthorization; đó là API của thư viện khác.
- getCurrentLocation bọc getCurrentPosition bằng Promise, timeout native 15 giây và watchdog JS 20 giây sau khi hoàn thành bước xin quyền. Dùng maximumAge=0; kiểm tra tọa độ hợp lệ, phân biệt lỗi quyền, unavailable/GPS và timeout. Callback trễ sau khi promise kết thúc bị bỏ qua, timer được dọn.
- Không tạo watchPosition hoặc listener GPS liên tục. Native single-request có thể còn kết thúc sau khi màn hình đóng; screen bỏ kết quả và không tự gửi nếu người dùng đã rời Chat hoặc app xuống nền.
- Chat có nút ghim vị trí, loading Đang lấy/Đang gửi, khóa gửi trùng dùng chung với văn bản, giữ nguyên draft khi gửi vị trí. Lỗi lấy vị trí có Alert với lựa chọn Mở Cài đặt; lỗi Firebase ghi tin hiển thị ở banner của Chat.
- sendLocationMessage dùng chung hàm ghi atomic với sendTextMessage: message type location có latitude/longitude, text và preview là “📍 Vị trí”, cùng timestamp và increment unread như tin thường.
- MessageBubble có card vị trí, biểu tượng ghim, tọa độ 5 chữ số thập phân và dòng Nhấn để mở Google Maps. URL Maps dùng tọa độ gốc không làm tròn. Lỗi mở URL có thông báo; tọa độ sai bị chặn.
- mapService mở URL HTTPS https://www.google.com/maps/search/?api=1&query=lat,lng, không cần thêm thư viện bản đồ hoặc Maps API key.
- Bổ sung nội dung NSLocationWhenInUseUsageDescription trong Info.plist. AndroidManifest đã có INTERNET/FINE/COARSE nên không sửa thêm. Không xin quyền vị trí nền.
- Giữ Dark Mode, timestamp, vị trí bong bóng và cleanup ở giai đoạn trước. Home vẫn mock đến bước 6; Thông báo vẫn mockNotifications.

## Cài đặt và native

Không cài package mới. React Native CLI đã nhận autolinking Geolocation cho Android và iOS qua react-native config.

Build lại Android để bảo đảm binary có native module:

```powershell
npm.cmd run android
```

Metro chạy ở terminal khác nếu chưa bật:

```powershell
npm.cmd start
```

Trên macOS, cập nhật Pods và build iOS:

```sh
cd ios
bundle exec pod install
cd ..
npm run ios
```

Lệnh Pods/iOS chưa chạy trong môi trường Windows này.

Tài liệu API Geolocation: https://github.com/michalchudziak/react-native-geolocation
Tài liệu quyền vị trí Android: https://developer.android.com/develop/sensors-and-location/location/permissions/runtime

## Rules và dữ liệu

Không đổi rules. Vị trí dùng đúng các đường dẫn của bước 4:

| Ghi/đọc | Rule cho phép |
| --- | --- |
| Đọc users/{partnerUid} | users/.read hoặc users/$uid/.read cho auth != null |
| Ghi messages/{chatId}/{pushKey} với latitude/longitude | messages/$chatId/.write cho UID người đăng nhập nằm trong chatId |
| Cập nhật preview userChats/{A}/{B} và userChats/{B}/{A} | userChats/$uid/$partnerUid/.write = auth != null |
| increment unread người nhận | Cùng quyền write trên userChats/$uid/$partnerUid |

Ví dụ tin vị trí sau khi server xác nhận:

```json
{
  "id": "pushKey",
  "senderId": "uidA",
  "receiverId": "uidB",
  "type": "location",
  "text": "📍 Vị trí",
  "latitude": 10.7769,
  "longitude": 106.7009,
  "createdAt": 1790000000000
}
```

createdAt thực tế do serverTimestamp tạo. Chỉ gửi snapshot tọa độ tại thời điểm bấm; không theo dõi vị trí liên tục. Khi chọn quyền gần đúng, kết quả có thể là vị trí gần đúng do hệ điều hành cung cấp.

## Kiểm tra tự động và giới hạn

- TypeScript: thành công.
- ESLint các file thay đổi: thành công, không lỗi/cảnh báo.
- Jest: 10 suites, 46 tests thành công.
- Ca mới: quyền Android cả fine/coarse, gần đúng, denied và never ask again; cấu hình iOS và callback API; native error 1/2/3; watchdog và callback trễ; mở Cài đặt thất bại; atomic location và preview hai bên; chặn tọa độ sai; chống gửi trùng, giữ draft, từ chối không ghi tin, rời màn hình không gửi muộn; Maps đúng tọa độ âm và lỗi mở URL/card sai.
- React Native CLI xác nhận autolinking package Geolocation ở cả hai nền tảng.
- Test dùng native/Firebase mock. Chưa build/chạy emulator, chưa xin quyền hệ điều hành thật hoặc kiểm tra GPS và Google Maps thực tế.
- Mất mạng giữa lúc ghi Firebase có thể giữ pending chờ nối lại như bước 4. Khi chưa kết nối, nút vị trí bị khóa. Không lưu vị trí lấy được để tự gửi lại ngoài ý muốn.
- Lấy vị trí có thể không thành công nếu GPS tắt, không có tín hiệu hoặc emulator chưa được đặt vị trí. Nút Mở Cài đặt mở trang cài đặt ứng dụng; việc bật GPS toàn thiết bị cần thực hiện ở cài đặt vị trí của hệ điều hành.

## Nội dung đầy đủ các file

### src/services/locationService.ts

```tsx
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, {
  GeolocationError,
} from '@react-native-community/geolocation';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

type LocationErrorCode =
  | 'permission-denied'
  | 'permission-blocked'
  | 'unavailable'
  | 'timeout';
export class LocationError extends Error {
  constructor(public code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationError';
  }
}

function nativeError(error: Pick<GeolocationError, 'code'>): LocationError {
  if (error.code === 1) {
    return new LocationError(
      'permission-denied',
      'Bạn chưa cho phép truy cập vị trí. Hãy cấp quyền trong Cài đặt để gửi vị trí.',
    );
  }
  if (error.code === 3) {
    return new LocationError(
      'timeout',
      'Lấy vị trí quá lâu. Hãy kiểm tra GPS, ra nơi thoáng hoặc đặt vị trí giả trên emulator rồi thử lại.',
    );
  }
  return new LocationError(
    'unavailable',
    'Không lấy được vị trí. Hãy bật dịch vụ vị trí/GPS trong Cài đặt và thử lại.',
  );
}

export async function requestLocationPermission(): Promise<void> {
  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    authorizationLevel: 'whenInUse',
    enableBackgroundLocationUpdates: false,
  });
  if (Platform.OS === 'android') {
    // Android 12+ cho phép người dùng chỉ cấp quyền gần đúng.
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fine = result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const coarse =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    if (
      fine === PermissionsAndroid.RESULTS.GRANTED ||
      coarse === PermissionsAndroid.RESULTS.GRANTED
    ) {
      return;
    }
    if (
      fine === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
      coarse === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ) {
      throw new LocationError(
        'permission-blocked',
        'Quyền vị trí đã bị chặn. Hãy mở Cài đặt ứng dụng và cấp quyền Vị trí.',
      );
    }
    throw new LocationError(
      'permission-denied',
      'Bạn đã từ chối quyền vị trí. Cấp quyền khi thử lại hoặc mở Cài đặt ứng dụng.',
    );
  }
  if (Platform.OS === 'ios') {
    // API community/geolocation dùng callback; whenInUse nằm trong configuration.
    await new Promise<void>((resolve, reject) => {
      Geolocation.requestAuthorization(resolve, error =>
        reject(nativeError(error)),
      );
    });
    return;
  }
  throw new LocationError(
    'unavailable',
    'Thiết bị này không hỗ trợ tính năng gửi vị trí.',
  );
}

export async function getCurrentLocation(): Promise<Coordinates> {
  await requestLocationPermission();
  const highAccuracy =
    Platform.OS !== 'android' ||
    (await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (point?: Coordinates, error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      if (point) {
        resolve(point);
      } else {
        reject(error);
      }
    };
    // Giới hạn chờ JS phòng trường hợp native không gọi lại; callback trễ bị bỏ qua.
    const watchdog = setTimeout(
      () => finish(undefined, nativeError({ code: 3 })),
      20000,
    );
    try {
      Geolocation.getCurrentPosition(
        position => {
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          if (!isValidCoordinates(point)) {
            finish(undefined, nativeError({ code: 2 }));
            return;
          }
          finish(point);
        },
        error => finish(undefined, nativeError(error)),
        { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 0 },
      );
    } catch (error) {
      finish(undefined, error);
    }
  });
}

export function showLocationError(error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : 'Không thể lấy vị trí. Hãy kiểm tra quyền và GPS rồi thử lại.';
  Alert.alert('Không thể gửi vị trí', message, [
    { text: 'Đóng', style: 'cancel' },
    {
      text: 'Mở Cài đặt',
      onPress: () => {
        Linking.openSettings().catch(() =>
          Alert.alert(
            'Không mở được Cài đặt',
            'Hãy mở Cài đặt của thiết bị để kiểm tra quyền Vị trí và GPS.',
          ),
        );
      },
    },
  ]);
}

```

### src/services/mapService.ts

```tsx
import { Linking } from 'react-native';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

export async function openLocationInMaps(point: Coordinates): Promise<void> {
  if (!isValidCoordinates(point)) {
    throw new Error('Tọa độ vị trí không hợp lệ.');
  }
  // URL HTTPS hoạt động cả khi không cài ứng dụng Google Maps.
  await Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`,
  );
}

```

### src/utils/coordinates.ts

```tsx
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const point = value as Partial<Coordinates>;
  return (
    typeof point.latitude === 'number' &&
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

```

### src/services/chatService.ts

```tsx
import {
  get,
  increment,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update,
} from 'firebase/database';
import { auth, database } from './firebase';
import { AuthUser } from './authService';
import { ChatMessage } from '../types';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

export const MAX_MESSAGE_LENGTH = 2000;

function validUid(uid: string) {
  return (
    !!uid &&
    [...uid].every(
      character =>
        character.charCodeAt(0) >= 32 &&
        character.charCodeAt(0) !== 127 &&
        !'.#$[]/'.includes(character),
    )
  );
}

export function getChatId(firstUid: string, secondUid: string): string {
  if (!validUid(firstUid) || !validUid(secondUid) || firstUid === secondUid) {
    throw new Error(
      'Người nhận không hợp lệ. Hãy chọn người dùng khác trong Danh bạ.',
    );
  }
  return [firstUid, secondUid].sort().join('_');
}

function requireUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  }
}

export function subscribeMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `messages/${chatId}`),
    snapshot => {
      const messages: ChatMessage[] = [];
      snapshot.forEach(child => {
        const value = child.val();
        if (
          !child.key ||
          !value ||
          typeof value.senderId !== 'string' ||
          typeof value.receiverId !== 'string' ||
          typeof value.text !== 'string' ||
          !Number.isFinite(value.createdAt) ||
          !['text', 'location'].includes(value.type)
        ) {
          return;
        }
        messages.push({
          id: child.key,
          senderId: value.senderId,
          receiverId: value.receiverId,
          type: value.type,
          text: value.text,
          createdAt: value.createdAt,
          ...(typeof value.latitude === 'number'
            ? { latitude: value.latitude }
            : {}),
          ...(typeof value.longitude === 'number'
            ? { longitude: value.longitude }
            : {}),
        });
      });
      // Thay cả snapshot thay vì nối mảng: một push key chỉ tạo một dòng.
      messages.sort(
        (a, b) =>
          a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      callback(messages);
    },
    onError,
  );
}

export async function sendTextMessage(
  sender: AuthUser,
  partnerUid: string,
  text: string,
): Promise<void> {
  requireUser(sender.uid);
  getChatId(sender.uid, partnerUid);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Không thể gửi tin nhắn rỗng.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`);
  }
  await sendMessage(sender, partnerUid, { type: 'text', text: trimmed });
}

export async function sendLocationMessage(
  sender: AuthUser,
  partnerUid: string,
  point: Coordinates,
): Promise<void> {
  if (!isValidCoordinates(point)) {
    throw new Error('Tọa độ vị trí không hợp lệ.');
  }
  await sendMessage(sender, partnerUid, {
    type: 'location',
    text: '📍 Vị trí',
    latitude: point.latitude,
    longitude: point.longitude,
  });
}

async function sendMessage(
  sender: AuthUser,
  partnerUid: string,
  content: {
    type: 'text' | 'location';
    text: string;
    latitude?: number;
    longitude?: number;
  },
): Promise<void> {
  requireUser(sender.uid);
  const chatId = getChatId(sender.uid, partnerUid);
  // Không tạo dữ liệu Firebase cho contact ID mẫu còn ở Home của giai đoạn trước.
  const partnerSnapshot = await get(ref(database, `users/${partnerUid}`));
  if (!partnerSnapshot.exists()) {
    throw new Error(
      'Người nhận không tồn tại. Hãy chọn tài khoản trong Danh bạ.',
    );
  }
  const partner = partnerSnapshot.val();
  requireUser(sender.uid);
  const messageRef = push(ref(database, `messages/${chatId}`));
  if (!messageRef.key) {
    throw new Error('Không thể tạo tin nhắn. Vui lòng thử lại.');
  }
  const createdAt = serverTimestamp();
  const changes: Record<string, unknown> = {
    [`messages/${chatId}/${messageRef.key}`]: {
      id: messageRef.key,
      senderId: sender.uid,
      receiverId: partnerUid,
      ...content,
      createdAt,
    },
  };
  const participants = [
    {
      owner: sender.uid,
      contact: partnerUid,
      name:
        typeof partner.displayName === 'string'
          ? partner.displayName
          : 'Người dùng',
      avatar: typeof partner.avatar === 'string' ? partner.avatar : '',
    },
    {
      owner: partnerUid,
      contact: sender.uid,
      name: sender.displayName,
      avatar: sender.avatar,
    },
  ];
  participants.forEach(item => {
    const base = `userChats/${item.owner}/${item.contact}`;
    Object.entries({
      chatId,
      contactId: item.contact,
      name: item.name,
      avatar: item.avatar,
      lastMessage: content.text,
      lastMessageTime: createdAt,
    }).forEach(([field, value]) => {
      changes[`${base}/${field}`] = value;
    });
  });
  changes[`userChats/${partnerUid}/${sender.uid}/unreadCount`] = increment(1);
  // Không ghi đè cả userChats node hoặc reset unread của người gửi.
  await update(ref(database), changes);
}

export function subscribeUnreadCount(
  myUid: string,
  partnerUid: string,
  callback: (count: number) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `userChats/${myUid}/${partnerUid}/unreadCount`),
    snapshot => {
      const value = snapshot.val();
      callback(typeof value === 'number' && value > 0 ? value : 0);
    },
    onError,
  );
}

export async function markAsRead(
  myUid: string,
  partnerUid: string,
): Promise<void> {
  requireUser(myUid);
  getChatId(myUid, partnerUid);
  // Transaction chỉ ở counter của mình: không cần quyền đọc nhánh người nhận.
  // null/0 không ghi, tránh tạo cuộc trò chuyện rỗng ngay khi mở Chat.
  await runTransaction(
    ref(database, `userChats/${myUid}/${partnerUid}/unreadCount`),
    count => (typeof count === 'number' && count > 0 ? 0 : undefined),
    { applyLocally: false },
  );
}

```

### src/screens/ChatScreen.tsx

```tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatScreenProps, ChatMessage } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Spacing, FontSize, BorderRadius } from '../theme';
import { getAuthErrorMessage } from '../services/authService';
import { subscribeStatus, UserStatus } from '../services/userService';
import {
  getCurrentLocation,
  showLocationError,
} from '../services/locationService';
import {
  getChatId,
  subscribeMessages,
  sendTextMessage,
  sendLocationMessage,
  markAsRead,
  subscribeUnreadCount,
  MAX_MESSAGE_LENGTH,
} from '../services/chatService';

export function ChatScreen(props: ChatScreenProps) {
  const { currentUser } = useAuth();
  // Đổi đối tác/UID sẽ hủy toàn bộ listener và state của cuộc trò chuyện cũ.
  return (
    <ChatContent
      key={`${currentUser?.uid}_${props.route.params.contactId}`}
      {...props}
    />
  );
}

function ChatContent({ route, navigation }: ChatScreenProps) {
  const { contactId, contactName, contactAvatar } = route.params;
  const { theme } = useApp();
  const { currentUser, connected } = useAuth();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [locationPhase, setLocationPhase] = useState<
    'locating' | 'sending' | null
  >(null);
  const [loadError, setLoadError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [sendError, setSendError] = useState('');
  const [readError, setReadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const sendLock = useRef(false);
  const ready = useRef({ focused, foreground, connected });
  ready.current = { focused, foreground, connected };
  const list = useRef<FlatList<ChatMessage>>(null);
  const uid = currentUser?.uid;
  let chatId = '';
  try {
    if (uid) {
      chatId = getChatId(uid, contactId);
    }
  } catch {
    /* Hiển thị route lỗi ở dưới. */
  }

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', value =>
      setForeground(value === 'active'),
    );
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setLoadError('');
    if (!chatId) {
      setLoadError('Cuộc trò chuyện không hợp lệ. Hãy quay lại Danh bạ.');
      setLoading(false);
      return;
    }
    let active = true;
    const unsubscribe = subscribeMessages(
      chatId,
      value => {
        if (!active) {
          return;
        }
        setMessages(value);
        setLoading(false);
        setLoadError('');
      },
      error => {
        if (!active) {
          return;
        }
        setLoadError(getAuthErrorMessage(error));
        setLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chatId, attempt]);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    let active = true;
    setStatus(null);
    setStatusError('');
    const unsubscribe = subscribeStatus(
      contactId,
      value => {
        if (!active) {
          return;
        }
        setStatus(value);
        setStatusError('');
      },
      error => {
        if (!active) {
          return;
        }
        setStatus(null);
        setStatusError(getAuthErrorMessage(error));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chatId, contactId, attempt]);

  useEffect(() => {
    if (!uid || !chatId || !focused || !foreground) {
      return;
    }
    let active = true;
    let pending = false;
    let dirty = false;
    const read = async () => {
      dirty = true;
      if (pending) {
        return;
      }
      pending = true;
      try {
        // Nếu counter tăng khi một lần reset còn chờ, xử lý tiếp sau khi hoàn tất.
        while (active && dirty) {
          dirty = false;
          await markAsRead(uid, contactId);
          if (active) {
            setReadError('');
          }
        }
      } catch (error) {
        if (active) {
          setReadError(getAuthErrorMessage(error));
        }
      } finally {
        pending = false;
      }
    };
    read();
    const unsubscribe = subscribeUnreadCount(
      uid,
      contactId,
      count => {
        if (active && count > 0) {
          read();
        }
      },
      error => {
        if (active) {
          setReadError(getAuthErrorMessage(error));
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, chatId, contactId, focused, foreground, attempt]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (
      !text ||
      !currentUser ||
      !chatId ||
      connected !== true ||
      sendLock.current
    ) {
      return;
    }
    sendLock.current = true;
    setSending(true);
    setSendError('');
    try {
      await sendTextMessage(currentUser, contactId, text);
      if (mounted.current) {
        setInputText('');
      }
    } catch (error) {
      if (mounted.current) {
        setSendError(getAuthErrorMessage(error));
      }
    } finally {
      sendLock.current = false;
      if (mounted.current) {
        setSending(false);
      }
    }
  };

  const canSend =
    !!inputText.trim() && !!chatId && connected === true && !sending;
  const canSendLocation = !!chatId && connected === true && !sending;
  const handleLocation = async () => {
    if (!currentUser || !chatId || connected !== true || sendLock.current) {
      return;
    }
    sendLock.current = true;
    setSending(true);
    setLocationPhase('locating');
    setSendError('');
    let locating = true;
    try {
      const point = await getCurrentLocation();
      // Người dùng rời Chat trong lúc GPS chạy thì không tự gửi vị trí sau đó.
      if (
        !mounted.current ||
        !ready.current.focused ||
        !ready.current.foreground
      ) {
        return;
      }
      locating = false;
      if (ready.current.connected !== true) {
        setSendError('Đã mất kết nối. Hãy kết nối lại rồi nhấn gửi vị trí.');
        return;
      }
      setLocationPhase('sending');
      await sendLocationMessage(currentUser, contactId, point);
      // Giữ nguyên draft văn bản khi gửi vị trí.
    } catch (failure) {
      if (
        !mounted.current ||
        !ready.current.focused ||
        !ready.current.foreground
      ) {
        return;
      }
      if (locating) {
        showLocationError(failure);
      } else {
        setSendError(getAuthErrorMessage(failure));
      }
    } finally {
      sendLock.current = false;
      if (mounted.current) {
        setSending(false);
        setLocationPhase(null);
      }
    }
  };
  const displayedError = loadError || sendError || readError || statusError;
  const online = status?.isOnline === true;
  const retry = () => {
    setAttempt(previous => previous + 1);
    setSendError('');
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Avatar
          uri={contactAvatar}
          size={40}
          style={styles.headerAvatar}
          showOnline={!!status}
          isOnline={online}
        />
        <View style={styles.headerInfo}>
          <Text
            style={[styles.headerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {contactName}
          </Text>
          <Text
            style={[
              styles.headerStatus,
              { color: online ? theme.online : theme.textSecondary },
            ]}
          >
            {statusError
              ? 'Không đọc được trạng thái'
              : !status
              ? 'Đang cập nhật trạng thái…'
              : online
              ? 'Đang hoạt động'
              : 'Ngoại tuyến'}
          </Text>
        </View>
      </View>
      {connected !== true && (
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          {sending
            ? 'Mất kết nối. Đang chờ xác nhận gửi; hãy giữ ứng dụng mở.'
            : 'Chưa kết nối Firebase. Bạn có thể soạn tin và gửi khi kết nối lại.'}
        </Text>
      )}
      {!!displayedError && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {displayedError}
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}>
            <Text style={[styles.retry, { color: theme.primary }]}>
              Thử tải lại
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!!locationPhase && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.notice, { color: theme.textSecondary }]}
        >
          {locationPhase === 'locating'
            ? 'Đang lấy vị trí hiện tại…'
            : 'Đang gửi vị trí…'}
        </Text>
      )}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMe={item.senderId === uid} />
          )}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            list.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="large" color={theme.primary} />
            ) : loadError ? undefined : (
              <EmptyState
                iconName="chatbubbles-outline"
                title="Chưa có tin nhắn"
                message={`Hãy gửi lời chào đến ${contactName}!`}
              />
            )
          }
        />
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: theme.card, borderTopColor: theme.border },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Gửi vị trí hiện tại"
            accessibilityState={{
              disabled: !canSendLocation,
              busy: !!locationPhase,
            }}
            style={styles.locationButton}
            disabled={!canSendLocation}
            onPress={handleLocation}
          >
            {locationPhase ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Icon
                name="location-outline"
                size={25}
                color={canSendLocation ? theme.primary : theme.textMuted}
              />
            )}
          </TouchableOpacity>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.inputBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <TextInput
              accessibilityLabel="Tin nhắn"
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Nhập tin nhắn..."
              placeholderTextColor={theme.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              editable={!sending}
            />
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
            accessibilityState={{ disabled: !canSend, busy: sending }}
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? theme.primary : theme.border },
            ]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {sending && !locationPhase ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Icon
                name="send"
                size={18}
                color={canSend ? theme.white : theme.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  locationButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  notice: { padding: Spacing.md },
  retry: { paddingVertical: Spacing.sm },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  headerAvatar: {
    marginRight: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  headerStatus: {
    fontSize: FontSize.xs - 1,
  },
  headerRightAction: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  chatArea: {
    flex: 1,
  },
  messageList: {
    paddingVertical: Spacing.md,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
    marginTop: Spacing.xxxl * 2,
  },
  emptyChatText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 100,
    minHeight: 40,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: FontSize.md,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
});

```

### src/components/chat/MessageBubble.tsx

```tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatMessage } from '../../types';
import { formatTime } from '../../utils/formatTime';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';
import { isValidCoordinates } from '../../utils/coordinates';
import { openLocationInMaps } from '../../services/mapService';

interface Props {
  message: ChatMessage;
  isMe: boolean;
}

export const MessageBubble: React.FC<Props> = ({ message, isMe }) => {
  const { theme } = useApp();
  const point = { latitude: message.latitude, longitude: message.longitude };
  const validLocation = isValidCoordinates(point);
  const textColor = isMe ? theme.myBubbleText : theme.otherBubbleText;
  const openMap = async () => {
    if (!isValidCoordinates(point)) {
      return;
    }
    try {
      await openLocationInMaps(point);
    } catch {
      Alert.alert(
        'Không mở được Google Maps',
        'Vui lòng kiểm tra kết nối hoặc trình duyệt và thử lại.',
      );
    }
  };

  return (
    <View
      style={[styles.wrapper, isMe ? styles.wrapperMe : styles.wrapperOther]}
    >
      <View
        style={[
          styles.bubble,
          isMe
            ? [styles.bubbleMe, { backgroundColor: theme.myBubble }]
            : [styles.bubbleOther, { backgroundColor: theme.otherBubble }],
        ]}
      >
        {message.type === 'location' ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              validLocation
                ? 'Mở vị trí trên Google Maps'
                : 'Vị trí không hợp lệ'
            }
            disabled={!validLocation}
            onPress={openMap}
            style={styles.locationCard}
          >
            <View style={styles.locationHeading}>
              <Icon name="location" size={25} color={textColor} />
              <Text style={[styles.locationTitle, { color: textColor }]}>
                Vị trí đã chia sẻ
              </Text>
            </View>
            <Text style={[styles.messageText, { color: textColor }]}>
              {validLocation
                ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
                : 'Tọa độ không hợp lệ'}
            </Text>
            {validLocation && (
              <Text style={[styles.mapHint, { color: textColor }]}>
                Nhấn để mở Google Maps
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <Text
            style={[
              styles.messageText,
              { color: isMe ? theme.myBubbleText : theme.otherBubbleText },
            ]}
          >
            {message.text}
          </Text>
        )}
        <Text
          style={[
            styles.timestamp,
            isMe
              ? styles.myTimestamp
              : [styles.otherTimestamp, { color: theme.textMuted }],
          ]}
        >
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  locationCard: { paddingVertical: Spacing.sm, gap: Spacing.sm },
  locationHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  locationTitle: { fontSize: FontSize.md, fontWeight: '700', flexShrink: 1 },
  mapHint: { fontSize: FontSize.sm, textDecorationLine: 'underline' },
  myTimestamp: { color: 'rgba(255, 255, 255, 0.75)', textAlign: 'right' },
  otherTimestamp: { textAlign: 'left' },
  wrapper: {
    marginVertical: 4,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
  },
  wrapperMe: {
    justifyContent: 'flex-end',
  },
  wrapperOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderRadius: BorderRadius.lg,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: FontSize.xs - 1,
    marginTop: 4,
  },
});

```

### ios/ChatApp/Info.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CADisableMinimumFrameDurationOnPhone</key>
	<true/>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>ChatApp</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleSignature</key>
	<string>????</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>NSAppTransportSecurity</key>
	<dict>
	  <!-- Do not change NSAllowsArbitraryLoads to true, or you will risk app rejection! -->
		<key>NSAllowsArbitraryLoads</key>
		<false/>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>Ứng dụng cần truy cập vị trí khi sử dụng để bạn gửi vị trí hiện tại trong cuộc trò chuyện.</string>
	<key>RCTNewArchEnabled</key>
	<true/>
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
		<false/>
		<key>UISceneConfigurations</key>
		<dict>
			<key>UIWindowSceneSessionRoleApplication</key>
			<array>
				<dict>
					<key>UISceneConfigurationName</key>
					<string>Default Configuration</string>
					<key>UISceneDelegateClassName</key>
					<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
				</dict>
			</array>
		</dict>
	</dict>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>arm64</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<false/>
	<key>UIAppFonts</key>
	<array>
		<string>Ionicons.ttf</string>
	</array>
</dict>
</plist>

```

### __tests__/App.test.tsx

```tsx
/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
jest.mock('../src/services/locationService', () => ({}));
jest.mock('../src/services/chatService', () => ({}));
jest.mock('../src/services/userService', () => ({
  subscribeContacts: jest.fn(() => jest.fn()),
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
// Kiểm tra giao diện không gọi Firebase thật trong Jest.
jest.mock('../src/services/presenceService', () => ({
  startPresence: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/authService', () => ({
  onAuthChange: (callback: (user: null) => void) => {
    callback(null);
    return jest.fn();
  },
}));

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: 'Email' }),
  ).not.toHaveLength(0);
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
});

```

### __tests__/ChatScreen.test.tsx

```tsx
import React from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppProvider } from '../src/context/AppContext';
import { ChatScreen } from '../src/screens/ChatScreen';
import { MessageBubble } from '../src/components/chat/MessageBubble';
import * as chat from '../src/services/chatService';
import { subscribeStatus } from '../src/services/userService';
import {
  getCurrentLocation,
  showLocationError,
} from '../src/services/locationService';
import { ChatMessage, ChatScreenProps } from '../src/types';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      uid: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      avatar: 'alice.png',
    },
    connected: true,
  }),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));
jest.mock('../src/services/userService', () => ({
  subscribeStatus: jest.fn(),
}));
jest.mock('../src/services/chatService', () => ({
  getChatId: (a: string, b: string) => [a, b].sort().join('_'),
  subscribeMessages: jest.fn(),
  subscribeUnreadCount: jest.fn(),
  sendTextMessage: jest.fn(),
  sendLocationMessage: jest.fn(),
  markAsRead: jest.fn(),
  MAX_MESSAGE_LENGTH: 2000,
}));
jest.mock('../src/services/locationService', () => ({
  getCurrentLocation: jest.fn(),
  showLocationError: jest.fn(),
}));

let renderer: ReactTestRenderer;
let publish: (messages: ChatMessage[]) => void;
let unread: (count: number) => void;
let changeAppState: (state: AppStateStatus) => void;
let publishStatus: Parameters<typeof subscribeStatus>[1];
const unsubscribeMessages = jest.fn();
const unsubscribeStatus = jest.fn();
const unsubscribeUnread = jest.fn();
const removeState = jest.fn();
const props = {
  route: {
    params: { contactId: 'bob', contactName: 'Bob', contactAvatar: 'bob.png' },
  },
  navigation: { goBack: jest.fn() },
} as unknown as ChatScreenProps;
const view = (screenProps = props) => (
  <AppProvider>
    <ChatScreen {...screenProps} />
  </AppProvider>
);
function sendButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityLabel === 'Gửi tin nhắn')!;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocused = true;
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changeAppState = callback;
      return { remove: removeState };
    });
  jest.mocked(chat.subscribeMessages).mockImplementation((_id, callback) => {
    publish = callback;
    return unsubscribeMessages;
  });
  jest
    .mocked(chat.subscribeUnreadCount)
    .mockImplementation((_uid, _partner, callback) => {
      unread = callback;
      return unsubscribeUnread;
    });
  jest.mocked(subscribeStatus).mockImplementation((_uid, callback) => {
    publishStatus = callback;
    return unsubscribeStatus;
  });
  jest.mocked(chat.markAsRead).mockResolvedValue(undefined);
  jest.mocked(chat.sendTextMessage).mockResolvedValue(undefined);
  jest.mocked(chat.sendLocationMessage).mockResolvedValue(undefined);
  await act(async () => {
    renderer = create(view());
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('repeated snapshots do not duplicate rows and bubble sides use real UIDs', async () => {
  const messages: ChatMessage[] = [
    {
      id: '1',
      senderId: 'alice',
      receiverId: 'bob',
      type: 'text',
      text: 'Hello',
      createdAt: 10,
    },
    {
      id: '2',
      senderId: 'bob',
      receiverId: 'alice',
      type: 'text',
      text: 'Hi',
      createdAt: 20,
    },
  ];
  await act(async () => {
    publish(messages);
    publish(messages);
  });
  expect(renderer.root.findByType(FlatList).props.data).toHaveLength(2);
  expect(
    renderer.root.findAllByType(MessageBubble).map(bubble => bubble.props.isMe),
  ).toEqual([true, false]);
});

test('blocks blank/duplicate sends, trims text and retains draft on a failed write', async () => {
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText('   '),
  );
  expect(sendButton().props.disabled).toBe(true);
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText(' Hello '),
  );
  let fail!: (error: Error) => void;
  jest.mocked(chat.sendTextMessage).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const press = sendButton().props.onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(chat.sendTextMessage).toHaveBeenCalledTimes(1);
  expect(chat.sendTextMessage).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'alice' }),
    'bob',
    'Hello',
  );
  expect(sendButton().props.disabled).toBe(true);
  await act(async () => {
    fail(new Error('PERMISSION_DENIED'));
    await pending;
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe(' Hello ');
  await act(async () => {
    await sendButton().props.onPress();
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
});

test('resets unread on open/new counter, stops reading on blur and resumes on focus', async () => {
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(1));
  expect(chat.markAsRead).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await act(async () => renderer.update(view()));
  expect(unsubscribeUnread).toHaveBeenCalledTimes(1);
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(2));
  expect(chat.markAsRead).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => renderer.update(view()));
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
});

test('switching partners empties history, cleans subscriptions and ignores late old snapshots', async () => {
  const oldPublish = publish;
  const next = {
    ...props,
    route: {
      ...props.route,
      params: {
        contactId: 'charlie',
        contactName: 'Charlie',
        contactAvatar: 'c.png',
      },
    },
  } as ChatScreenProps;
  await act(async () => renderer.update(view(next)));
  expect(unsubscribeMessages).toHaveBeenCalledTimes(1);
  expect(unsubscribeStatus).toHaveBeenCalledTimes(1);
  expect(unsubscribeUnread).toHaveBeenCalledTimes(1);
  expect(removeState).toHaveBeenCalledTimes(1);
  await act(async () =>
    oldPublish([
      {
        id: 'old',
        senderId: 'bob',
        receiverId: 'alice',
        type: 'text',
        text: 'Old',
        createdAt: 1,
      },
    ]),
  );
  expect(renderer.root.findByType(FlatList).props.data).toEqual([]);
});

test('background suspends markAsRead and partner status updates the header', async () => {
  await act(async () => publishStatus({ isOnline: false, lastChanged: 1 }));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Ngoại tuyến'),
  ).toBe(true);
  await act(async () => publishStatus({ isOnline: true, lastChanged: 2 }));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Đang hoạt động'),
  ).toBe(true);
  await act(async () => changeAppState('background'));
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(1));
  expect(chat.markAsRead).not.toHaveBeenCalled();
  await act(async () => changeAppState('active'));
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
});

function locationButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityLabel === 'Gửi vị trí hiện tại')!;
}

test('location loading blocks duplicate sends, sends coordinates and preserves text draft', async () => {
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText('Draft'),
  );
  let locate!: (point: { latitude: number; longitude: number }) => void;
  jest.mocked(getCurrentLocation).mockReturnValueOnce(
    new Promise(resolve => {
      locate = resolve;
    }),
  );
  let pending!: Promise<void>;
  const press = locationButton().props.onPress;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(getCurrentLocation).toHaveBeenCalledTimes(1);
  expect(locationButton().props.disabled).toBe(true);
  expect(sendButton().props.disabled).toBe(true);
  await act(async () => {
    locate({ latitude: 10.7, longitude: 106.6 });
    await pending;
  });
  expect(chat.sendLocationMessage).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'alice' }),
    'bob',
    { latitude: 10.7, longitude: 106.6 },
  );
  expect(renderer.root.findByType(TextInput).props.value).toBe('Draft');
});

test('location refusal shows guidance and never writes a message', async () => {
  const denied = new Error('Quyền vị trí bị từ chối');
  jest.mocked(getCurrentLocation).mockRejectedValueOnce(denied);
  await act(async () => {
    await locationButton().props.onPress();
  });
  expect(showLocationError).toHaveBeenCalledWith(denied);
  expect(chat.sendLocationMessage).not.toHaveBeenCalled();
  expect(locationButton().props.disabled).toBe(false);
});

test('leaving Chat while GPS is pending does not send a location later', async () => {
  let locate!: (point: { latitude: number; longitude: number }) => void;
  jest.mocked(getCurrentLocation).mockReturnValueOnce(
    new Promise(resolve => {
      locate = resolve;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = locationButton().props.onPress();
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    locate({ latitude: 0, longitude: 0 });
    await pending;
  });
  expect(chat.sendLocationMessage).not.toHaveBeenCalled();
});

```

### __tests__/chatService.test.ts

```tsx
import {
  get,
  increment,
  onValue,
  push,
  runTransaction,
  update,
} from 'firebase/database';
import { auth } from '../src/services/firebase';
import {
  getChatId,
  markAsRead,
  sendTextMessage,
  sendLocationMessage,
  subscribeMessages,
} from '../src/services/chatService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path?: string) => ({ path: path || '/' }),
  get: jest.fn(),
  onValue: jest.fn(),
  push: jest.fn(),
  runTransaction: jest.fn(),
  update: jest.fn(),
  increment: jest.fn((value: number) => ({ '.sv': { increment: value } })),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));
const sender = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatar: 'alice.png',
};

beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  jest.mocked(get).mockResolvedValue({
    exists: () => true,
    val: () => ({ displayName: 'Bob', avatar: 'bob.png' }),
  } as unknown as Awaited<ReturnType<typeof get>>);
  jest
    .mocked(push)
    .mockReturnValue({ key: 'push-1' } as ReturnType<typeof push>);
  jest.mocked(update).mockResolvedValue(undefined);
});

test('chat ID is the same in both directions and invalid routes are rejected', () => {
  expect(getChatId('bob', 'alice')).toBe('alice_bob');
  expect(getChatId('alice', 'bob')).toBe('alice_bob');
  expect(() => getChatId('alice', 'alice')).toThrow();
  expect(() => getChatId('alice', 'bad/id')).toThrow();
});

test('one atomic update writes the message, both previews and receiver increment only', async () => {
  await sendTextMessage(sender, 'bob', '  Xin chào  ');
  expect(update).toHaveBeenCalledTimes(1);
  const changes = jest.mocked(update).mock.calls[0][1] as Record<
    string,
    unknown
  >;
  expect(changes['messages/alice_bob/push-1']).toEqual({
    id: 'push-1',
    senderId: 'alice',
    receiverId: 'bob',
    type: 'text',
    text: 'Xin chào',
    createdAt: { '.sv': 'timestamp' },
  });
  expect(changes['userChats/alice/bob/name']).toBe('Bob');
  expect(changes['userChats/bob/alice/name']).toBe('Alice');
  expect(changes['userChats/alice/bob/lastMessage']).toBe('Xin chào');
  expect(changes['userChats/bob/alice/unreadCount']).toEqual({
    '.sv': { increment: 1 },
  });
  expect(increment).toHaveBeenCalledWith(1);
  expect(changes).not.toHaveProperty('userChats/alice/bob/unreadCount');
  expect(changes).not.toHaveProperty('userChats/bob/alice');
});

test('blank text, nonexistent recipient and a changed session never write a message', async () => {
  await expect(sendTextMessage(sender, 'bob', ' \n ')).rejects.toThrow('rỗng');
  expect(get).not.toHaveBeenCalled();
  jest
    .mocked(get)
    .mockResolvedValueOnce({ exists: () => false } as Awaited<
      ReturnType<typeof get>
    >);
  await expect(sendTextMessage(sender, 'missing', 'Hello')).rejects.toThrow(
    'không tồn tại',
  );
  jest.mocked(get).mockImplementationOnce(async () => {
    (auth as unknown as { currentUser: { uid: string } }).currentUser = {
      uid: 'charlie',
    };
    return { exists: () => true, val: () => ({}) } as Awaited<
      ReturnType<typeof get>
    >;
  });
  await expect(sendTextMessage(sender, 'bob', 'Hello')).rejects.toThrow(
    'Phiên đăng nhập',
  );
  expect(update).not.toHaveBeenCalled();
});

test('snapshots use push keys as IDs, sort by time, replace history and propagate unsubscribe/errors', () => {
  let listener!: (snapshot: unknown) => void;
  const unsubscribe = jest.fn();
  const report = jest.fn();
  jest.mocked(onValue).mockImplementation((_ref, callback) => {
    listener = callback as unknown as typeof listener;
    return unsubscribe;
  });
  const receive = jest.fn();
  expect(subscribeMessages('alice_bob', receive, report)).toBe(unsubscribe);
  const rows = [
    {
      key: 'b',
      val: () => ({
        id: 'wrong-id',
        senderId: 'bob',
        receiverId: 'alice',
        type: 'text',
        text: 'second',
        createdAt: 20,
      }),
    },
    {
      key: 'a',
      val: () => ({
        senderId: 'alice',
        receiverId: 'bob',
        type: 'text',
        text: 'first',
        createdAt: 10,
      }),
    },
    { key: 'bad', val: () => ({ text: 'malformed' }) },
  ];
  const snapshot = {
    forEach: (callback: (row: (typeof rows)[number]) => void) =>
      rows.forEach(callback),
  };
  listener(snapshot);
  listener(snapshot);
  expect(
    receive.mock.lastCall[0].map((item: { id: string }) => item.id),
  ).toEqual(['a', 'b']);
  const onError = jest.mocked(onValue).mock.calls[0][2] as (
    error: Error,
  ) => void;
  const denied = new Error('PERMISSION_DENIED');
  onError(denied);
  expect(report).toHaveBeenCalledWith(denied);
});

test('markAsRead only resets the current user counter, without creating empty chats', async () => {
  jest
    .mocked(runTransaction)
    .mockResolvedValue({ committed: true } as Awaited<
      ReturnType<typeof runTransaction>
    >);
  await markAsRead('alice', 'bob');
  const [reference, change, options] =
    jest.mocked(runTransaction).mock.calls[0];
  expect(reference).toEqual({ path: 'userChats/alice/bob/unreadCount' });
  expect(change(4)).toBe(0);
  expect(change(0)).toBeUndefined();
  expect(change(null)).toBeUndefined();
  expect(options).toEqual({ applyLocally: false });
  await expect(markAsRead('bob', 'alice')).rejects.toThrow('Phiên đăng nhập');
});

test('location uses the atomic message path and location preview for both participants', async () => {
  await sendLocationMessage(sender, 'bob', { latitude: 0, longitude: 106.6 });
  expect(update).toHaveBeenCalledTimes(1);
  const changes = jest.mocked(update).mock.calls[0][1] as Record<
    string,
    unknown
  >;
  expect(changes['messages/alice_bob/push-1']).toEqual(
    expect.objectContaining({
      type: 'location',
      text: '📍 Vị trí',
      latitude: 0,
      longitude: 106.6,
    }),
  );
  expect(changes['userChats/alice/bob/lastMessage']).toBe('📍 Vị trí');
  expect(changes['userChats/bob/alice/lastMessage']).toBe('📍 Vị trí');
  expect(changes['userChats/bob/alice/unreadCount']).toEqual({
    '.sv': { increment: 1 },
  });
});

test('invalid coordinates cannot create a Firebase write', async () => {
  await expect(
    sendLocationMessage(sender, 'bob', { latitude: 91, longitude: 0 }),
  ).rejects.toThrow('Tọa độ');
  await expect(
    sendLocationMessage(sender, 'bob', { latitude: 0, longitude: Number.NaN }),
  ).rejects.toThrow('Tọa độ');
  expect(update).not.toHaveBeenCalled();
});

```

### __tests__/locationService.test.ts

```tsx
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, {
  GeolocationResponse,
} from '@react-native-community/geolocation';
import {
  getCurrentLocation,
  requestLocationPermission,
  showLocationError,
} from '../src/services/locationService';

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    requestAuthorization: jest.fn(),
    getCurrentPosition: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
      PermissionsAndroid.RESULTS.GRANTED,
    [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]:
      PermissionsAndroid.RESULTS.GRANTED,
  } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success =>
    success({
      coords: { latitude: 10.7, longitude: 106.6 },
    } as GeolocationResponse),
  );
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('Android asks both permissions and returns current coordinates', async () => {
  await expect(getCurrentLocation()).resolves.toEqual({
    latitude: 10.7,
    longitude: 106.6,
  });
  expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
  expect(jest.getTimerCount()).toBe(0);
});

test('approximate Android permission is accepted without requesting precise GPS', async () => {
  jest.mocked(PermissionsAndroid.requestMultiple).mockResolvedValueOnce({
    [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
      PermissionsAndroid.RESULTS.DENIED,
    [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]:
      PermissionsAndroid.RESULTS.GRANTED,
  } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.mocked(PermissionsAndroid.check).mockResolvedValueOnce(false);
  await getCurrentLocation();
  expect(
    jest.mocked(Geolocation.getCurrentPosition).mock.calls[0][2]
      ?.enableHighAccuracy,
  ).toBe(false);
});

test.each([
  [PermissionsAndroid.RESULTS.DENIED, 'permission-denied'],
  [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, 'permission-blocked'],
])(
  'permission result %s prevents any location lookup',
  async (result, code) => {
    jest.mocked(PermissionsAndroid.requestMultiple).mockResolvedValueOnce({
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: result,
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: result,
    } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
    await expect(getCurrentLocation()).rejects.toMatchObject({ code });
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
  },
);

test('iOS configures whenInUse and uses the community callback API', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest
    .mocked(Geolocation.requestAuthorization)
    .mockImplementation(success => success?.());
  await requestLocationPermission();
  expect(Geolocation.setRNConfiguration).toHaveBeenCalledWith(
    expect.objectContaining({
      authorizationLevel: 'whenInUse',
      skipPermissionRequests: true,
      enableBackgroundLocationUpdates: false,
    }),
  );
  expect(Geolocation.requestAuthorization).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
  );
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
});

test.each([
  [1, 'permission-denied'],
  [2, 'unavailable'],
  [3, 'timeout'],
])(
  'native location code %s becomes an actionable error',
  async (code, expected) => {
    jest
      .mocked(Geolocation.getCurrentPosition)
      .mockImplementation((_success, failure) =>
        failure?.({
          code,
          message: 'Native error',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        }),
      );
    await expect(getCurrentLocation()).rejects.toMatchObject({
      code: expected,
    });
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('watchdog settles a silent native request and ignores a late result', async () => {
  let late!: Parameters<typeof Geolocation.getCurrentPosition>[0];
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success => {
    late = success;
  });
  const pending = getCurrentLocation();
  await Promise.all([
    expect(pending).rejects.toMatchObject({ code: 'timeout' }),
    jest.advanceTimersByTimeAsync(20000),
  ]);
  late({ coords: { latitude: 0, longitude: 0 } } as GeolocationResponse);
  expect(jest.getTimerCount()).toBe(0);
});

test('permission guidance offers Settings and handles a failed Settings link', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  jest
    .spyOn(Linking, 'openSettings')
    .mockRejectedValueOnce(new Error('No settings'));
  showLocationError(new Error('Quyền bị từ chối'));
  const buttons = alert.mock.calls[0][2]!;
  const settings = buttons.find(button => button.text === 'Mở Cài đặt')!;
  settings.onPress?.();
  await Promise.resolve();
  expect(Linking.openSettings).toHaveBeenCalled();
  expect(alert).toHaveBeenLastCalledWith(
    'Không mở được Cài đặt',
    expect.any(String),
  );
});

```

### __tests__/MessageBubble.test.tsx

```tsx
import React from 'react';
import { Alert, Linking, Text, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MessageBubble } from '../src/components/chat/MessageBubble';
import { AppProvider } from '../src/context/AppContext';
import { openLocationInMaps } from '../src/services/mapService';
import { ChatMessage } from '../src/types';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
const message: ChatMessage = {
  id: 'location-1',
  senderId: 'alice',
  receiverId: 'bob',
  type: 'location',
  text: '📍 Vị trí',
  latitude: -10.75,
  longitude: 106.6,
  createdAt: 1000,
};
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert');
});
afterEach(async () => {
  if (renderer) {
    await act(async () => renderer!.unmount());
    renderer = undefined;
  }
  jest.restoreAllMocks();
});

test('location card opens Google Maps with exact signed coordinates', async () => {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <MessageBubble message={message} isMe />
      </AppProvider>,
    );
  });
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(text => text.props.children === 'Nhấn để mở Google Maps'),
  ).toBe(true);
  await act(async () => {
    await renderer!.root.findByType(TouchableOpacity).props.onPress();
  });
  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://www.google.com/maps/search/?api=1&query=-10.75,106.6',
  );
});

test('map launch failure is reported instead of becoming an unhandled rejection', async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No handler'));
  await act(async () => {
    renderer = create(
      <AppProvider>
        <MessageBubble message={message} isMe={false} />
      </AppProvider>,
    );
  });
  await act(async () => {
    await renderer!.root.findByType(TouchableOpacity).props.onPress();
  });
  expect(Alert.alert).toHaveBeenCalledWith(
    'Không mở được Google Maps',
    expect.any(String),
  );
});

test('invalid coordinates disable the card and cannot launch a URL', async () => {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <MessageBubble message={{ ...message, latitude: 100 }} isMe />
      </AppProvider>,
    );
  });
  expect(renderer!.root.findByType(TouchableOpacity).props.disabled).toBe(true);
  await expect(
    openLocationInMaps({ latitude: 0, longitude: Number.NaN }),
  ).rejects.toThrow('Tọa độ');
  expect(Linking.openURL).not.toHaveBeenCalled();
});

```
## Cách kiểm tra

1. Build lại Android bằng npm.cmd run android. Nếu chưa cấu hình Authentication, bật Email/Password trong project chatapp-th05 trước khi đăng ký/đăng nhập. Dùng hai tài khoản A/B, mở Chat từ Danh bạ.
2. Trên Android Emulator, mở Extended controls (nút ba chấm) → Location → Single points, đặt tọa độ, nhấn Set location/Send theo phiên bản emulator. Bật dịch vụ Location trong Android.
3. Ở A nhấn nút ghim, chọn cho phép trong khi dùng app. Phải thấy loading rồi card vị trí ở cả A và B. Draft văn bản trước đó vẫn còn.
4. Nhấn card ở B: Google Maps hoặc trình duyệt mở đúng tọa độ đã đặt. Thử điểm có vĩ độ/kinh độ âm nếu cần kiểm tra dấu.
5. Firebase Console: messages/{chatId}/{pushKey} có type location, latitude/longitude dạng số, createdAt dạng số. userChats của hai bên có lastMessage “📍 Vị trí”. Counter người nhận tăng/reset theo focus như tin thường.
6. Thử từ chối quyền: có Alert giải thích, không có message mới. Thử chặn quyền trong Cài đặt hoặc chọn không hỏi lại: có gợi ý Mở Cài đặt. Cấp lại quyền và nhấn gửi lần nữa.
7. Trên Android 12+, thử chỉ cho vị trí gần đúng: app vẫn gửi được vị trí mà hệ điều hành cung cấp.
8. Tắt GPS hoặc không đặt vị trí emulator: nhận lỗi unavailable hoặc timeout, không tạo message, nút được mở lại. Sau khi bật GPS/đặt vị trí, thử lại.
9. Trong lúc lấy vị trí, bấm nhanh nhiều lần: chỉ một yêu cầu đang chạy. Rời Chat trước khi GPS trả kết quả: không có tin vị trí gửi muộn. Nhập draft, gửi vị trí: draft vẫn nguyên.
10. Trên iOS/macOS, pod install/build lại, đặt vị trí simulator qua Features → Location và thử cho phép/từ chối. Kiểm tra hộp thoại hiển thị đúng mô tả mục đích gửi vị trí.
11. Nếu báo native module Geolocation chưa có, build lại binary sau khi dependency được cài; trên iOS chạy pod install. Fast Refresh đơn thuần không thêm native module vào binary cũ.
12. Khi kiểm tra ổn, gõ “tiếp tục” để làm giai đoạn 6: Home và badge unread realtime.
