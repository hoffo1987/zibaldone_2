import type { Persistence } from 'firebase/auth';
import type AsyncStorage from '@react-native-async-storage/async-storage';
// The Firebase RN runtime exports this API; its shared browser declaration omits it.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: Pick<typeof AsyncStorage,'getItem'|'setItem'|'removeItem'>): Persistence;
}
