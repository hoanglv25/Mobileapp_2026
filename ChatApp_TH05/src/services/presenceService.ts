import { AppState } from 'react-native';
import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
} from 'firebase/database';
import { auth, database } from './firebase';

interface PresenceSession {
  uid: string;
  stop: () => Promise<void>;
}
let session: PresenceSession | undefined;
// Giữ thứ tự ghi qua cả cleanup/Fast Refresh/đổi tài khoản.
let writes: Promise<void> = Promise.resolve();
function enqueue(action: () => Promise<void>): Promise<void> {
  const result = writes.then(action);
  writes = result.catch(() => {});
  return result;
}
const offline = () => ({ isOnline: false, lastChanged: serverTimestamp() });

export function startPresence(
  uid: string,
  onError: (error: unknown) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  session?.stop().catch(onError);
  const statusRef = ref(database, `status/${uid}`);
  const disconnect = onDisconnect(statusRef);
  let disposed = false;
  let connected = false;
  let foreground = AppState.currentState === 'active';
  let revision = 0;
  let stopping: Promise<void> | undefined;

  const update = () => {
    const request = ++revision;
    enqueue(async () => {
      const valid = () =>
        !disposed &&
        connected &&
        request === revision &&
        auth.currentUser?.uid === uid;
      if (!valid()) {
        return;
      }
      if (foreground) {
        // Server phải xác nhận onDisconnect trước khi đánh dấu online.
        await disconnect.set(offline());
        if (!valid() || !foreground) {
          return;
        }
        await set(statusRef, {
          isOnline: true,
          lastChanged: serverTimestamp(),
        });
      } else {
        await set(statusRef, offline());
      }
    }).catch(error => {
      if (!disposed) {
        onError(error);
      }
    });
  };

  const unsubscribe = onValue(
    ref(database, '.info/connected'),
    snapshot => {
      if (disposed) {
        return;
      }
      connected = snapshot.val() === true;
      onConnection(connected);
      update();
    },
    error => {
      if (!disposed) {
        onError(error);
      }
    },
  );
  const appStateSubscription = AppState.addEventListener('change', state => {
    foreground = state === 'active';
    update();
  });

  const current: PresenceSession = {
    uid,
    stop: () => {
      if (stopping) {
        return stopping;
      }
      disposed = true;
      ++revision;
      unsubscribe();
      appStateSubscription.remove();
      if (session === current) {
        session = undefined;
      }
      stopping = enqueue(async () => {
        if (auth.currentUser?.uid !== uid) {
          return;
        }
        await set(statusRef, offline());
        await disconnect.cancel();
      });
      return stopping;
    },
  };
  session = current;
  return () => {
    current.stop().catch(onError);
  };
}

/** Dừng listener trước khi ghi offline để callback reconnect không ghi đè thành online. */
export function stopPresence(uid: string): Promise<void> {
  if (session?.uid === uid) {
    return session.stop();
  }
  return enqueue(async () => {
    if (auth.currentUser?.uid === uid) {
      await set(ref(database, `status/${uid}`), offline());
    }
  });
}
