import { useCallback,useMemo,useSyncExternalStore } from 'react';
import { collection,doc,getDoc,limit,onSnapshot,orderBy,query,where,writeBatch } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { publicWriting,type Writing } from './model';
import { mergeNotifications,splitNotificationIds,type UpdateAnnouncement } from '../../src/notifications';

type Content={items:Writing[];loading:boolean;error:string;admin:boolean;updates:UpdateAnnouncement[];personal:any[];reads:Record<string,boolean>;readsReady:boolean};
// Each account gets a distinct external store. A late callback from a previous
// account can never populate the new account's screen, even for a single render.
function createSource(uid:string|undefined){
  let state:Content={items:[],loading:!!uid,error:'',admin:false,updates:[],personal:[],reads:{},readsReady:false};
  let active=false,off:(()=>void)[]=[];
  const listeners=new Set<()=>void>();
  const emit=(patch:Partial<Content>)=>{if(!active)return;state={...state,...patch};listeners.forEach(fn=>fn());};
  function start(){
    if(!uid)return;active=true;
    const fail=()=>emit({error:'Non riesco a caricare i dati. Controlla la connessione e riprova.',loading:false});
    off=[
      onSnapshot(query(collection(db,'testi'),where('version','==',2)),s=>emit({items:s.docs.map(d=>publicWriting(d.id,d.data())).filter((x):x is Writing=>x!==null),loading:false,error:''}),fail),
      onSnapshot(query(collection(db,'aggiornamenti'),orderBy('timestamp','desc'),limit(30)),s=>emit({updates:s.docs.map(d=>({id:d.id,...d.data()} as UpdateAnnouncement))}),fail),
      onSnapshot(query(collection(db,'notifiche'),where('userId','==',uid)),s=>emit({personal:s.docs.map(d=>({id:d.id,...d.data()}))}),fail),
      onSnapshot(collection(db,'letture_aggiornamenti',uid,'annunci'),s=>emit({reads:Object.fromEntries(s.docs.map(d=>[d.id,d.data().letta===true])),readsReady:true}),fail),
    ];
    getDoc(doc(db,'admins',uid)).then(s=>emit({admin:s.exists()})).catch(()=>{});
  }
  return {
    getSnapshot:()=>state,
    subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1)start();return()=>{listeners.delete(listener);if(!listeners.size){active=false;off.forEach(fn=>fn());off=[];}};},
  };
}
export function useContent(user:User|null){
  const uid=user?.uid,source=useMemo(()=>createSource(uid),[uid]);
  const state=useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);
  const notifications=useMemo(()=>mergeNotifications(state.personal,state.readsReady?state.updates:[],state.reads),[state.personal,state.updates,state.reads,state.readsReady]);
  const markRead=useCallback(async(ids:string[])=>{
    if(!uid)return;const batch=writeBatch(db),split=splitNotificationIds(ids);
    split.personal.forEach(id=>batch.update(doc(db,'notifiche',id),{letta:true}));
    split.updates.forEach(id=>batch.set(doc(db,'letture_aggiornamenti',uid,'annunci',id),{letta:true,timestamp:Date.now()}));
    await batch.commit();
  },[uid]);
  return {...state,notifications,markRead};
}
