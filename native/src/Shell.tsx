import React,{useCallback,useEffect,useMemo,useState} from 'react';
import { ActivityIndicator,Alert,FlatList,Linking,Pressable,StyleSheet,Text,TextInput,View,useColorScheme,useWindowDimensions } from 'react-native';
import { SafeAreaView,useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { router,useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged,signOut,type User } from 'firebase/auth';
import { doc,getDoc } from 'firebase/firestore';
import { Bell,BookOpen,FileText,LogOut,Moon,Sun,Search,X } from './icons';
import { auth,db } from './firebase';
import { useContent } from './useContent';
import { demoItems } from './fixtures';
import { type Writing } from './model';
import { dark,light,fonts } from './theme';
import { IconButton,Intro,Logo,Reader,WritingCard,s } from './components';
import { Login } from './Login';
import { Notifications } from './Notifications';
const BENCHMARK=Constants.expoConfig?.extra?.benchmark===true;
const WEBSITE='https://ilcircuito.vercel.app';
export function Shell(){
  const system=useColorScheme(),[isDark,setDark]=useState(system==='dark'),[themeReady,setThemeReady]=useState(false),[user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[demo,setDemo]=useState(BENCHMARK);
  const {kind}=useLocalSearchParams<{kind?:string}>(),tab=kind==='complete'?'complete':'diary';
  const setTab=(value:'diary'|'complete')=>router.setParams({kind:value});
  const [search,setSearch]=useState(''),[reader,setReader]=useState<Writing|null>(null),[author,setAuthor]=useState(''),[bell,setBell]=useState(false);
  const {width}=useWindowDimensions(),insets=useSafeAreaInsets(),theme=isDark?dark:light;
  const content=useContent(demo?null:user);
  useEffect(()=>{let active=true;AsyncStorage.getItem('circuito:native:dark').then(v=>{if(active&&v!==null)setDark(v==='1');}).catch(()=>{}).finally(()=>{if(active)setThemeReady(true);});return()=>{active=false;};},[]);
  useEffect(()=>onAuthStateChanged(auth,u=>{setReader(null);setBell(false);setAuthor('');setUser(u);setAuthReady(true);}),[]);
  async function toggleTheme(){const next=!isDark;setDark(next);try{await AsyncStorage.setItem('circuito:native:dark',next?'1':'0');}catch{}}
  const open=useCallback((item:Writing)=>{setAuthor('');setReader(item);},[]);
  useEffect(()=>{
    if(!reader||!content.admin||demo)return;let active=true;
    getDoc(doc(db,'pensieri',reader.id)).then(d=>{if(active&&d.exists())setAuthor(d.data().author||'Autore non disponibile');}).catch(()=>{});
    return()=>{active=false;};
  },[reader,content.admin,demo]);
  const demoNotifications=DEMO_NOTIFICATIONS;
  const [demoRead,setDemoRead]=useState(false);
  const notifications=demo?demoNotifications.map(n=>({...n,letta:demoRead})):content.notifications;
  const markAccountRead=content.markRead;
  const markRead=useCallback(async(ids:string[])=>{if(demo){setDemoRead(true);return;}await markAccountRead(ids);},[demo,markAccountRead]);
  const items=demo?demoItems:content.items,columns=width>=700?2:1,listWidth=Math.min(width,1040),cardWidth=(listWidth-32-(columns-1)*16)/columns;
  const filtered=useMemo(()=>items.filter(t=>t.kind===tab&&(!search.trim()||`${t.title} ${t.kind==='diary'?t.content:t.excerpt}`.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it')))),[items,tab,search]);
  const renderItem=useCallback(({item}:{item:Writing})=><View style={{width:cardWidth}}><WritingCard item={item} theme={theme} onOpen={open} width={cardWidth}/></View>,[cardWidth,theme,open]);
  function leave(){if(demo){setDemo(false);setReader(null);setBell(false);return;}Alert.alert('Esci dal tuo account','Vuoi uscire dall’app di prova?',[{text:'Annulla',style:'cancel'},{text:'Esci',onPress:()=>{signOut(auth).catch(()=>Alert.alert('Accesso','Uscita non riuscita. Riprova.'));}}]);}
  if(!authReady||!themeReady)return <View style={[a.loading,{backgroundColor:theme.bg}]}><ActivityIndicator color={theme.accent}/></View>;
  return <SafeAreaView style={{flex:1,backgroundColor:theme.bg}} edges={['top','left','right']}><StatusBar style={isDark?'light':'dark'}/>
    <View style={[a.header,{backgroundColor:theme.bar,borderColor:theme.line}]}><Logo/><View style={{flex:1}}><Text style={[a.brand,{color:theme.ink}]}>Il Circuito</Text><Text style={[s.small,{color:theme.muted}]}>Archivio di scrittura</Text></View><IconButton theme={theme} icon={isDark?Sun:Moon} label={isDark?'Attiva tema chiaro':'Attiva tema scuro'} onPress={toggleTheme}/>{user||demo?<IconButton theme={theme} icon={Bell} label="Notifiche" badge={notifications.filter(n=>!n.letta).length} onPress={()=>setBell(true)}/>:null}</View>
    {!user&&!demo?<Login theme={theme} onDemo={()=>setDemo(true)}/>:<>
      {demo?<View style={[a.demoBar,{backgroundColor:theme.soft}]}><Text style={[s.small,{color:theme.muted,flex:1}]}>Anteprima offline · dati di esempio</Text><Pressable accessibilityRole="button" onPress={leave}><Text style={[s.small,{color:theme.accent}]}>Accedi</Text></Pressable></View>:null}
      <FlatList key={`${tab}-${columns}`} numColumns={columns} data={filtered} keyExtractor={t=>t.id} renderItem={renderItem} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} columnWrapperStyle={columns>1?{gap:16}:undefined} contentContainerStyle={{padding:16,paddingBottom:28,width:listWidth,alignSelf:'center'}} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View><Text accessibilityRole="header" style={[a.pageTitle,{color:theme.ink}]}>{tab==='diary'?'Diario':'Scritti completi'}</Text><View style={[a.titleRule,{backgroundColor:theme.line}]}><View style={[a.titleDot,{backgroundColor:theme.amber}]}/></View><Intro diary={tab==='diary'} theme={theme}/><View style={[a.search,{backgroundColor:theme.panel,borderColor:theme.line}]}><Search size={19} color={theme.muted}/><TextInput accessibilityLabel="Cerca negli scritti" placeholder={tab==='diary'?'Cerca nel diario…':'Cerca negli scritti…'} placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} style={[a.searchInput,{color:theme.ink}]} autoCorrect={false}/>{search?<IconButton icon={X} label="Cancella ricerca" theme={theme} onPress={()=>setSearch('')}/>:null}</View>{content.error&&!demo?<Text accessibilityRole="alert" style={a.error}>{content.error}</Text>:null}<Text style={[s.small,{color:theme.muted,marginBottom:16}]}>{filtered.length} {tab==='diary'?'pensieri da leggere':'scritti da esplorare'}</Text></View>}
        ListEmptyComponent={content.loading&&!demo?<ActivityIndicator color={theme.accent}/>:<View style={[a.empty,{backgroundColor:theme.panel,borderColor:theme.line}]}><BookOpen size={35} color={theme.diary}/><Text style={[a.sectionTitle,{color:theme.ink,marginTop:16}]}>{search?'Nessun risultato.':'La prossima pagina è da scrivere.'}</Text><Text style={[s.body,{color:theme.muted,marginTop:8}]}>{search?'Prova a cercare un’altra parola.':'Qui appariranno i pensieri condivisi nel Circuito.'}</Text></View>}
        ListFooterComponent={!BENCHMARK?<Pressable accessibilityRole="link" onPress={()=>Linking.openURL(WEBSITE).catch(()=>Alert.alert('Sito','Impossibile aprire il sito.'))} style={a.textButton}><Text style={[s.body,{color:theme.accent,textAlign:'center'}]}>Scrivi e gestisci i tuoi testi sul sito ↗</Text></Pressable>:undefined}/>
      <View style={[a.tabs,{backgroundColor:theme.panel,borderColor:theme.line,paddingBottom:Math.max(insets.bottom,12)}]}>{([{id:'diary',label:'Diario',icon:BookOpen},{id:'complete',label:'Scritti',icon:FileText}] as const).map(t=><Pressable accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{selected:tab===t.id}} key={t.id} onPress={()=>{setTab(t.id);setSearch('');}} style={[a.tab,{backgroundColor:tab===t.id?theme.soft:'transparent'}]}><t.icon size={21} color={tab===t.id?theme.accent:theme.muted}/><Text style={[a.tabText,{color:tab===t.id?theme.accent:theme.muted}]}>{t.label}</Text></Pressable>)}<IconButton icon={LogOut} label={demo?'Esci dall’anteprima':'Esci'} theme={theme} onPress={leave}/></View>
    </>}
    <Reader item={reader} author={author} theme={theme} onClose={()=>setReader(null)}/><Notifications visible={bell} onClose={()=>setBell(false)} theme={theme} list={notifications} onRead={markRead}/>
  </SafeAreaView>;
}
const a=StyleSheet.create({loading:{flex:1,alignItems:'center',justifyContent:'center'},header:{flexDirection:'row',gap:10,alignItems:'center',padding:14,borderBottomWidth:1},brand:{fontFamily:fonts.heading,fontSize:21,letterSpacing:-.5},sectionTitle:{fontFamily:fonts.heading,fontSize:24,lineHeight:30},textButton:{padding:14,alignItems:'center'},error:{fontFamily:fonts.body,color:'#c24132',fontSize:14,lineHeight:21,marginBottom:14},pageTitle:{fontFamily:fonts.heading,fontSize:35,letterSpacing:-1,marginTop:14},titleRule:{height:1,marginTop:20,marginBottom:28},titleDot:{position:'absolute',width:9,height:9,borderRadius:5,top:-4,left:0},search:{flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderRadius:12,paddingHorizontal:13,marginBottom:13},searchInput:{flex:1,fontFamily:fonts.body,fontSize:15,minHeight:50,paddingVertical:12},demoBar:{flexDirection:'row',paddingHorizontal:17,paddingVertical:9},tabs:{flexDirection:'row',gap:10,paddingHorizontal:16,paddingTop:12,borderTopWidth:1,alignItems:'center'},tab:{flex:1,alignItems:'center',justifyContent:'center',gap:5,borderRadius:12,paddingVertical:8},tabText:{fontFamily:fonts.medium,fontSize:12},empty:{padding:25,borderWidth:1,borderRadius:18,marginBottom:20}});
const DEMO_NOTIFICATIONS=[{id:'demo-update',tipo:'aggiornamento',versione:'Anteprima',titolo:'Benvenuto nell’anteprima nativa',messaggio:'Questi sono dati di esempio locali. Accedi per leggere i pensieri e le notifiche del tuo account.',timestamp:1792108800000,letta:false}];
