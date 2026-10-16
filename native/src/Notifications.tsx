import React,{useEffect,useEffectEvent} from 'react';
import { Alert,FlatList,Modal,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Award,Sparkles,X } from './icons';
import { IconButton,s } from './components';
import { formatDate } from './model';
import { fonts,type Theme } from './theme';
export function Notifications({visible,onClose,theme,list,onRead}:{visible:boolean;onClose:()=>void;theme:Theme;list:any[];onRead:(ids:string[])=>Promise<void>}) {
  const unread=list.filter(n=>!n.letta).map(n=>n.id).join('|'),read=useEffectEvent(onRead);
  useEffect(()=>{
    if(!visible||!unread)return;
    const timer=setTimeout(()=>{read(unread.split('|')).catch(()=>Alert.alert('Notifiche','Non è stato possibile segnarle come lette. Riapri il pannello per riprovare.'));},1400);
    return ()=>clearTimeout(timer);
  },[visible,unread]);
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:theme.bg}}>
    <View style={[s.modalTop,{borderColor:theme.line}]}><Text accessibilityRole="header" style={[s.modalTitle,{color:theme.ink}]}>Notifiche</Text><IconButton theme={theme} icon={X} label="Chiudi notifiche" onPress={onClose}/></View>
    <FlatList data={list} keyExtractor={n=>n.id} contentContainerStyle={{padding:16,paddingBottom:40}} ListEmptyComponent={<Text style={[s.body,{color:theme.muted}]}>Nessuna notifica per ora. Qui trovi i voti ai tuoi scritti e le novità dell’applicazione.</Text>} renderItem={({item:n})=>{
      const update=n.tipo==='aggiornamento',Icon=update?Sparkles:Award;
      return <View style={[a.card,{backgroundColor:n.letta?theme.panel:theme.soft,borderColor:n.letta?theme.line:theme.accent}]}><Icon size={22} color={update?theme.accent:theme.amber}/><View style={{flex:1}}><Text style={[a.title,{color:theme.ink}]}>{update?n.titolo:`«${n.titolo}»`}</Text><Text style={[s.small,{color:theme.muted,marginTop:5}]}>{update?n.versione:'Hai ricevuto un voto'} · {formatDate(n.timestamp)}</Text><Text style={[s.body,{color:theme.ink,marginTop:12}]}>{update?n.messaggio:`Voto: ${n.voto} su 5`}</Text></View></View>;
    }}/>
  </SafeAreaView></Modal>;
}
const a=StyleSheet.create({card:{flexDirection:'row',gap:13,padding:18,borderWidth:1,borderRadius:16,marginBottom:12},title:{fontFamily:fonts.bold,fontSize:16,lineHeight:23}});
