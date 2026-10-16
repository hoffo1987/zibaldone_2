import { publicWriting, type Writing } from './model';
// Local, synthetic content only. This mode never authenticates or writes to Firebase.
export const demoItems:Writing[] = Array.from({length:80},(_,i)=>publicWriting(`demo-${i}`,{
  version:2,kind:'diary',title:['Le cose piccole','Tra una parola e l’altra','Un posto dove fermarsi','La luce del pomeriggio'][i%4],
  content:`<p>Ci sono giorni in cui basta fermarsi un momento. Guardare la luce sulla pagina, ascoltare il rumore della pioggia, lasciare spazio a un pensiero.</p><p><b>Non tutto deve diventare una risposta.</b> A volte scrivere serve soltanto a riconoscere quello che sentiamo.</p><p>Una pagina aperta, e il tempo di abitarla.</p>`,
  strokes:i%3===0?[{tool:'pen',color:'#9a6332',size:3,points:[{x:35,y:35},{x:80,y:15},{x:120,y:40},{x:170,y:15},{x:220,y:35}]}]:[],w:300,h:70,
})!);
demoItems.push(...Array.from({length:4},(_,i)=>publicWriting(`complete-${i}`,{version:2,kind:'complete',title:['Il tempo delle parole','Una città da ascoltare','Il valore di una domanda','Ritrovare un sentiero'][i],excerpt:'Quando ci fermiamo a osservare, le cose di tutti i giorni acquistano una forma diversa. Le parole ci aiutano a riconoscerla.'})!));
