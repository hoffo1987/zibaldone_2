import { parseDocument } from 'htmlparser2';
import type { AnyNode } from 'domhandler';

export type Stroke = { tool: string; color: string; size?: number; opacity?: number; filled?: boolean; points: {x:number;y:number}[] };
export type Writing = { id:string; kind:'diary'|'complete'; title:string; content:string; excerpt:string; strokes:Stroke[]; w:number; h:number };
// Explicit projection: even a malformed public complete can never expose its full content or attachments.
export function publicWriting(id:string, data:Record<string,unknown>):Writing | null {
  if(data.version !== 2 || !['diary','complete'].includes(String(data.kind))) return null;
  const diary = data.kind === 'diary';
  return { id, kind:diary?'diary':'complete', title:typeof data.title==='string'?data.title:'Senza titolo',
    content:diary && typeof data.content==='string'?data.content:'', excerpt:!diary && typeof data.excerpt==='string'?data.excerpt:'',
    strokes:diary && Array.isArray(data.strokes)?data.strokes as Stroke[]:[], w:diary && typeof data.w==='number'&&data.w>0?data.w:900, h:diary && typeof data.h==='number'&&data.h>0?data.h:600 };
}
const dropped = new Set(['script','style','iframe','object','embed','noscript','svg','math','form','head','audio','video','canvas']);
export function plainText(html:string):string {
  function visit(n:AnyNode):string {
    if(n.type==='text') return n.data;
    if('name' in n && dropped.has(n.name))return '';
    if('name' in n && n.name==='br')return '\n';
    const text='children' in n?n.children.map(visit).join(''):'';
    return 'name' in n && /^(p|div|h[1-6]|li|blockquote)$/.test(n.name)?text+'\n':text;
  }
  return parseDocument(html).children.map(visit).join('').replace(/\n{3,}/g,'\n\n').trim();
}
export const safeImage = (src:string) => /^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(src);
export const ignoredTags = [...dropped, 'input','button','select','textarea','link','meta','base'];
export const formatDate = (value:number) => new Date(value).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
