import React,{useState} from 'react';
import { ActivityIndicator,Alert,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { sendPasswordResetEmail,signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';
import { Logo,s } from './components';
import { fonts,type Theme } from './theme';
export function Login({theme,onDemo}:{theme:Theme;onDemo:()=>void}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function login(){
    if(!email.trim()||!password){setError('Inserisci email e password.');return;}
    setBusy(true);setError('');
    try{await signInWithEmailAndPassword(auth,email.trim(),password);}catch(e:any){setError(e.code==='auth/network-request-failed'?'Connessione non disponibile. Riprova.':e.code==='auth/too-many-requests'?'Troppi tentativi. Attendi qualche minuto.':'Email o password non corrette.');}finally{setBusy(false);}
  }
  async function reset(){
    if(!email.trim()){setError('Inserisci prima la tua email.');return;}
    try{await sendPasswordResetEmail(auth,email.trim());Alert.alert('Controlla la posta','Se l’indirizzo è associato a un account, riceverai le istruzioni per recuperare la password.');}catch{setError('Invio non riuscito. Controlla l’indirizzo e riprova.');}
  }
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={a.outer}>
    <View style={[a.card,{backgroundColor:theme.panel,borderColor:theme.line}]}><Logo size={64}/><Text style={[a.title,{color:theme.ink}]}>Il Circuito</Text><Text style={[s.body,{color:theme.muted,marginBottom:28}]}>Uno spazio per scrivere, leggere e ritrovarsi.</Text>
      <Text accessibilityRole="header" style={[a.subtitle,{color:theme.ink}]}>Bentornato.</Text><Text style={[s.body,{color:theme.muted,marginBottom:20}]}>Accedi con il tuo account.</Text>
      <Text style={[a.label,{color:theme.ink}]}>Email</Text><TextInput accessibilityLabel="Email" style={[a.input,{backgroundColor:theme.soft,color:theme.ink,borderColor:theme.line}]} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder="nome@esempio.it" placeholderTextColor={theme.muted} editable={!busy}/>
      <Text style={[a.label,{color:theme.ink}]}>Password</Text><TextInput accessibilityLabel="Password" style={[a.input,{backgroundColor:theme.soft,color:theme.ink,borderColor:theme.line}]} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" editable={!busy} onSubmitEditing={login} returnKeyType="go"/>
      {error?<Text accessibilityRole="alert" style={a.error}>{error}</Text>:null}
      <Pressable accessibilityRole="button" accessibilityLabel="Accedi" onPress={login} disabled={busy} style={[a.primary,{backgroundColor:theme.accent,opacity:busy?.6:1}]}>{busy?<ActivityIndicator color={theme.bg}/>:<Text style={[a.primaryText,{color:theme.bg}]}>Accedi ↗</Text>}</Pressable>
      <Pressable accessibilityRole="button" onPress={reset} disabled={busy} style={a.textButton}><Text style={[s.small,{color:theme.muted}]}>Hai dimenticato la password?</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Esplora anteprima offline" onPress={onDemo} style={a.textButton}><Text style={[s.body,{color:theme.accent}]}>Esplora l’anteprima offline</Text></Pressable><Text style={[s.small,{color:theme.muted,textAlign:'center'}]}>L’anteprima contiene solo pensieri di esempio.</Text>
  </ScrollView></KeyboardAvoidingView>;
}
const a=StyleSheet.create({outer:{flexGrow:1,padding:20,justifyContent:'center',maxWidth:560,width:'100%',alignSelf:'center',paddingBottom:50},card:{padding:26,borderWidth:1,borderRadius:24},title:{fontFamily:fonts.heading,fontSize:38,letterSpacing:-1,marginTop:20,marginBottom:6},subtitle:{fontFamily:fonts.heading,fontSize:24,lineHeight:30},label:{fontFamily:fonts.medium,fontSize:14,marginBottom:7},input:{borderWidth:1,borderRadius:12,padding:14,fontFamily:fonts.body,fontSize:16,marginBottom:17},primary:{borderRadius:12,padding:16,alignItems:'center',marginTop:10},primaryText:{fontFamily:fonts.bold,fontSize:16},textButton:{padding:14,alignItems:'center'},error:{fontFamily:fonts.body,color:'#c24132',fontSize:14,lineHeight:21,marginBottom:14}});
