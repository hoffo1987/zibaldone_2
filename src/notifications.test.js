import { mergeNotifications, splitNotificationIds } from './notifications';
const update = { id: 'a'.repeat(40), titolo: 'Novità', messaggio: 'App aggiornata', versione: '1.0.5', timestamp: 20 };
test('gli annunci si uniscono ai voti senza modificarli e si ordinano per data', () => {
  const vote = { id:'vote', titolo:'Scritto', voto:4, timestamp:10, letta:false };
  const result = mergeNotifications([vote], [update], {});
  expect(result[0]).toMatchObject({ tipo:'aggiornamento', id:`update:${update.id}`, letta:false });
  expect(result[1]).toBe(vote);
});
test('la lettura di un annuncio è indipendente per ogni account', () => {
  expect(mergeNotifications([], [update], { [update.id]:true })[0].letta).toBe(true);
  expect(mergeNotifications([], [update], {})[0].letta).toBe(false);
});
test('le ricevute degli annunci non vengono scritte nella collezione dei voti', () => {
  expect(splitNotificationIds(['vote',`update:${update.id}`])).toEqual({ personal:['vote'],updates:[update.id],derived:[] });
});
test('scintille ed echi si uniscono alle altre, ordinati per giorno, e si leggono a parte', () => {
  const vote = { id:'vote', titolo:'Scritto', voto:4, timestamp:10, letta:false };
  const spark = { id:'scintilla:s_p1_3', key:'s_p1_3', tipo:'scintilla', conteggio:2, timestamp:3 * 864e5, letta:false };
  const eco = { id:'eco:e_x', key:'e_x', tipo:'eco', timestamp:2 * 864e5, letta:true };
  const result = mergeNotifications([vote], [update], {}, [eco, spark]);
  expect(result.map((n) => n.id)).toEqual(['scintilla:s_p1_3', 'eco:e_x', `update:${update.id}`, 'vote']);
  expect(splitNotificationIds(['vote', spark.id, eco.id, `update:${update.id}`])).toEqual({ personal:['vote'], updates:[update.id], derived:['s_p1_3', 'e_x'] });
});
