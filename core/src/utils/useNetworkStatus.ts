import { useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  wasOffline: boolean;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    wasOffline: false,
  });
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      const reachable = state.isInternetReachable ?? false;
      if (connected) {
        wasOfflineRef.current = false;
      } else {
        wasOfflineRef.current = true;
      }
      setStatus(prev => {
        const wasOffline = wasOfflineRef.current;
        if (prev.isConnected === connected && prev.isInternetReachable === reachable && prev.wasOffline === wasOffline) {
          return prev;
        }
        return { isConnected: connected, isInternetReachable: reachable, wasOffline };
      });
    });
    return () => unsub();
  }, []);

  return status;
}
