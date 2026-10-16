import { ActivityIndicator, View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import type { ReactNode } from 'react';

export default function App({children}:{children:ReactNode}) {
  const [loaded,error]=useFonts({InstrumentSans_400Regular,InstrumentSans_600SemiBold,InstrumentSans_700Bold,BricolageGrotesque_700Bold});
  if(!loaded) return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#EDF2F1'}}>{error?<Text>Impossibile caricare i caratteri. Chiudi e riapri l’app.</Text>:<ActivityIndicator color="#0F8B7A"/>}</View>;
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
