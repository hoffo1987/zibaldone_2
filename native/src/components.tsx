import React, { memo,useMemo } from 'react';
import { View,Text,Pressable,StyleSheet,ScrollView,Modal,useWindowDimensions,Linking,Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg,{Path,Circle,Rect,Line,Ellipse,Polygon,Polyline,Defs,Pattern,LinearGradient as SvgGradient,Stop} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen,ArrowUpRight,EyeOff,LockKeyhole,X,FileText,type LucideIcon } from './icons';
import RenderHTML,{defaultSystemFonts} from '@native-html/render';
import type { Theme } from './theme';
import { fonts } from './theme';
import { ignoredTags,plainText,safeImage,type Stroke,type Writing } from './model';

export function Logo({size=38}:{size?:number}) {
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Il Circuito"><Defs><SvgGradient id="logo" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><Stop stopColor="#17C3AE"/><Stop offset="1" stopColor="#0A4F49"/></SvgGradient></Defs><Rect width="64" height="64" rx="17" fill="url(#logo)"/><Rect x=".75" y=".75" width="62.5" height="62.5" rx="16.25" stroke="#ffffff55" fill="none"/><Path d="M43.5 22.4A15 15 0 1 0 43.5 41.6M31 32H47" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none"/><Circle cx="43.5" cy="22.4" r="4.2" fill="#fff"/><Circle cx="43.5" cy="41.6" r="4.2" fill="#FBBF24"/><Circle cx="31" cy="32" r="3.2" fill="#fff"/></Svg>;
}
export function IconButton({icon:Icon,label,onPress,theme,badge=0}:{icon:LucideIcon;label:string;onPress:()=>void;theme:Theme;badge?:number}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.icon,{backgroundColor:pressed?theme.line:theme.soft,borderColor:theme.line}]}><Icon size={21} color={theme.ink}/>{badge>0?<View style={[s.badge,{backgroundColor:theme.accent}]}><Text style={s.badgeText}>{badge>99?'99+':badge}</Text></View>:null}</Pressable>;
}
export function Intro({diary,theme}:{diary:boolean;theme:Theme}) {
  const Icon=diary?BookOpen:FileText,color=diary?theme.diary:theme.accent;
  return <LinearGradient colors={[diary?theme.intro:theme.soft,theme.panel]} start={{x:0,y:0}} end={{x:1,y:1}} style={[s.intro,{borderColor:theme.line,borderTopColor:color}]}>
    <View style={s.introSymbol}><Icon color={color} size={100}/></View>
    <Text style={[s.eyebrow,{color}]}>{diary?'IL QUADERNO DEL CIRCUITO':'LA BIBLIOTECA DEL CIRCUITO'}</Text>
    <Text accessibilityRole="header" style={[s.introTitle,{color:theme.ink}]}>{diary?'Una pausa, una pagina.':'Scritti che prendono forma.'}</Text>
    <Text style={[s.body,{color:theme.muted}]}>{diary?'Le cose che passano per la testa, senza dover diventare un tema. Qui ogni pensiero ha spazio: lo leggiamo per intero, senza nomi, voti o classifiche.':'Temi, racconti e riflessioni a cui dedicare tempo. Qui trovi gli estratti; l’amministratore legge i testi integrali e seleziona gli scritti per il podio del mese.'}</Text>
    <View style={s.promises}><EyeOff size={15} color={theme.muted}/><Text style={[s.small,{color:theme.muted}]}>{diary?'Anonimo agli altri utenti':'Lettura anonima'}</Text></View>
    <View style={s.promises}>{diary?<BookOpen size={15} color={theme.muted}/>:<LockKeyhole size={15} color={theme.muted}/>}<Text style={[s.small,{color:theme.muted}]}>{diary?'Lettura integrale':'Solo un estratto pubblico'}</Text></View>
    <Pressable accessibilityRole="link" onPress={()=>Linking.openURL('https://ilcircuito.vercel.app').catch(()=>Alert.alert('Sito','Impossibile aprire il sito.'))} style={{padding:13,marginTop:20,borderRadius:12,borderWidth:1,borderColor:theme.line,backgroundColor:theme.panel,flexDirection:'row',alignItems:'center',gap:8}}><Text style={{fontFamily:fonts.medium,color:theme.ink,flex:1,fontSize:14}}>{diary?'Affida un pensiero al diario':'Scrivi uno scritto completo'}</Text><ArrowUpRight size={18} color={theme.ink}/></Pressable>
    <Text style={[s.small,{color:theme.muted,marginTop:6}]}>L’editor si apre sul sito.</Text>
  </LinearGradient>;
}
function Shape({stroke:a}:{stroke:Stroke}) {
  if(!a.points?.length)return null;const first=a.points[0],last=a.points[a.points.length-1];
  const common={stroke:a.color,strokeWidth:a.size||3,strokeOpacity:a.opacity??1,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,fill:'none'};
  if(a.tool==='line')return <Line x1={first.x} y1={first.y} x2={last.x} y2={last.y} {...common}/>;
  if(a.tool==='rect'||a.tool==='ellipse'){
    const x=Math.min(first.x,last.x),y=Math.min(first.y,last.y),w=Math.abs(last.x-first.x),h=Math.abs(last.y-first.y),fill={fill:a.filled?a.color:'none',fillOpacity:a.opacity??1};
    return a.tool==='rect'?<Rect x={x} y={y} width={w} height={h} {...common} {...fill}/>:<Ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} {...common} {...fill}/>;
  }
  const points=a.points.map(p=>`${p.x},${p.y}`).join(' ');
  return a.tool==='fill'?<Polygon points={points} {...common} fill={a.color} fillOpacity={a.opacity??1}/>:<Polyline points={points} {...common}/>;
}
export const Drawing=memo(function Drawing({item,width,preview=false}:{item:Writing;width:number;preview?:boolean}) {
  if(!item.strokes.length)return null;
  return <Svg width={width} height={preview?Math.min(90,width*item.h/item.w):width*item.h/item.w} viewBox={`0 0 ${item.w} ${item.h}`} preserveAspectRatio="xMinYMin meet" accessibilityLabel="Disegno del pensiero">{item.strokes.map((stroke,i)=><Shape key={i} stroke={stroke}/>)}</Svg>;
});
export const WritingCard=memo(function WritingCard({item,theme,onOpen,width}:{item:Writing;theme:Theme;onOpen:(item:Writing)=>void;width:number}) {
  const text=useMemo(()=>item.kind==='diary'?plainText(item.content):item.excerpt,[item]);
  const diary=item.kind==='diary';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Leggi ${diary?'il pensiero':'lo scritto'} ${item.title}`} onPress={()=>onOpen(item)} style={({pressed})=>[s.card,{backgroundColor:theme.panel,borderColor:theme.line,opacity:pressed?.85:1}]}>
    <View style={s.cardTop}><BookOpen size={17} color={theme.muted}/><Text style={[s.small,{color:theme.muted,flex:1}]}>{diary?'Pensiero anonimo':'Scritto completo'}</Text><ArrowUpRight size={18} color={theme.muted}/></View>
    <View style={[s.paper,diary?s.diaryPaper:null]}>
      {diary?<View style={StyleSheet.absoluteFill} pointerEvents="none">{Array.from({length:15},(_,i)=><View key={i} style={[s.rule,{top:27+i*28}]}/>)}</View>:null}
      <Text style={s.paperTitle} numberOfLines={2}>{item.title}</Text><Text style={s.paperText} numberOfLines={6}>{text||'Un pensiero disegnato, oltre le parole.'}{!diary&&text?'…':''}</Text>
      <Drawing item={item} width={Math.max(80,width-76)} preview/>
    </View>
    <Text style={[s.small,{color:theme.muted,marginTop:15}]}>{diary?'Un pensiero da leggere, senza giudizi.':'Il testo integrale rimane riservato.'}</Text>
  </Pressable>;
});
const systemFonts=[...defaultSystemFonts,...Object.values(fonts)];
const tagsStyles={body:{color:'#322c23',fontSize:17,lineHeight:28,fontFamily:fonts.body},p:{marginTop:0,marginBottom:18},h2:{fontFamily:fonts.heading,fontSize:25,lineHeight:33},b:{fontFamily:fonts.bold},strong:{fontFamily:fonts.bold}};
const rendererProps={a:{onPress:()=>{}},img:{enableExperimentalPercentWidth:true}};
function ignoreNode(node:any){return node.type==='tag'&&node.name==='img'&&!safeImage(node.attribs?.src||'');}
export function Reader({item,theme,onClose,author}:{item:Writing|null;theme:Theme;onClose:()=>void;author?:string}) {
  const {width}=useWindowDimensions(),contentWidth=Math.min(width,800)-64;
  const source=useMemo(()=>({html:item?.content||''}),[item?.content]);
  if(!item)return null;const diary=item.kind==='diary';
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={[s.modal,{backgroundColor:theme.bg}]}>
      <View style={[s.modalTop,{borderColor:theme.line}]}><Text style={[s.modalTitle,{color:theme.ink}]} numberOfLines={2}>{item.title}</Text><IconButton icon={X} label="Chiudi lettura" theme={theme} onPress={onClose}/></View>
      <ScrollView contentContainerStyle={s.readerContent}>
        <View style={[s.notice,{backgroundColor:theme.soft,borderColor:theme.line}]}>{diary?<EyeOff size={22} color={theme.diary}/>:<LockKeyhole size={22} color={theme.accent}/>}<View style={{flex:1}}><Text style={[s.noticeTitle,{color:theme.ink}]}>{diary?'Pensiero del diario · lettura integrale':'Stai leggendo soltanto un estratto'}</Text><Text style={[s.small,{color:theme.muted,marginTop:5}]}>{diary?'Il nome dell’autore è visibile solo all’amministratore e all’autore stesso. Questo pensiero non riceve voti, categorie o posizioni in classifica.':'Il testo integrale, le immagini e i disegni sono riservati all’autore e all’amministratore.'}</Text>{author?<Text style={[s.small,{color:theme.accent,marginTop:8}]}>Autore (amministratore): {author}</Text>:null}</View></View>
        <View style={[s.readerPaper,diary?s.diaryPaper:null,{minHeight:Math.max(320,(contentWidth+32)*item.h/item.w)}]}>
          {diary?<Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%"><Defs><Pattern id="reader-rules" patternUnits="userSpaceOnUse" width="10" height="28"><Line x1="0" y1="27.5" x2="10" y2="27.5" stroke="rgba(120,95,65,.12)" strokeWidth="1"/></Pattern></Defs><Rect width="100%" height="100%" fill="url(#reader-rules)"/></Svg>:null}
          {item.strokes.length?<View pointerEvents="none" style={StyleSheet.absoluteFill}><Drawing item={item} width={contentWidth+32}/></View>:null}
          {diary?<RenderHTML contentWidth={contentWidth} source={source} systemFonts={systemFonts} tagsStyles={tagsStyles} ignoredDomTags={ignoredTags} ignoreDomNode={ignoreNode} renderersProps={rendererProps} ignoredStyles={['fontFamily','width','height','maxHeight','opacity','display']} defaultTextProps={{selectable:true}}/>:<Text selectable style={s.paperText}>{item.excerpt||'Nessun estratto testuale disponibile.'}{item.excerpt?'…':''}</Text>}
          {!diary?<Text style={[s.small,{color:'#5B706D',marginTop:32}]}>Il resto dello scritto rimane riservato.</Text>:null}
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
export const s=StyleSheet.create({
  body:{fontFamily:fonts.body,fontSize:15,lineHeight:24},small:{fontFamily:fonts.body,fontSize:12,lineHeight:18},icon:{height:44,width:44,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},badge:{position:'absolute',top:-5,right:-5,minWidth:19,height:19,paddingHorizontal:4,borderRadius:10,alignItems:'center',justifyContent:'center'},badgeText:{fontFamily:fonts.bold,fontSize:10,color:'#042f2a'},
  intro:{borderWidth:1,borderTopWidth:3,borderRadius:18,padding:24,overflow:'hidden',marginBottom:24},introSymbol:{position:'absolute',right:14,top:22,opacity:.12,transform:[{rotate:'-12deg'}]},eyebrow:{fontFamily:fonts.bold,fontSize:10,letterSpacing:1.6},introTitle:{fontFamily:fonts.heading,fontSize:29,lineHeight:34,letterSpacing:-.7,marginTop:12,marginBottom:15,maxWidth:350},promises:{flexDirection:'row',alignItems:'center',gap:7,marginTop:13},
  card:{borderWidth:1,borderRadius:18,padding:20,marginBottom:20,boxShadow:'0 4px 14px -8px rgba(14,31,29,0.22)'},cardTop:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:16},paper:{backgroundColor:'#fff',padding:20,minHeight:205,borderRadius:10,overflow:'hidden'},diaryPaper:{backgroundColor:'#fbf6eb',borderLeftWidth:2,borderLeftColor:'#d4ac7c',borderTopLeftRadius:2,borderBottomLeftRadius:2},paperTitle:{fontFamily:fonts.heading,fontSize:21,lineHeight:27,color:'#322c23',letterSpacing:-.4},paperText:{fontFamily:fonts.body,fontSize:16,lineHeight:28,color:'#322c23',marginTop:14},rule:{position:'absolute',height:1,left:0,right:0,backgroundColor:'rgba(120,95,65,.12)'},
  modal:{flex:1},modalTop:{padding:16,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1},modalTitle:{flex:1,fontFamily:fonts.heading,fontSize:23},readerContent:{padding:16,paddingBottom:48,alignSelf:'center',width:'100%',maxWidth:800},readerPaper:{padding:16,backgroundColor:'#fff',borderRadius:12,minHeight:320,marginTop:20},notice:{flexDirection:'row',gap:12,padding:18,borderRadius:14,borderWidth:1},noticeTitle:{fontFamily:fonts.bold,fontSize:14,lineHeight:21},
});
