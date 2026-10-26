export type UpdateAnnouncement = {
  id: string; titolo: string; messaggio: string; versione: string; timestamp: number;
};
export const updateNotificationId = (id: string) => `update:${id}`;
// derived: notifiche calcolate dal client dell'autore (scintille ed echi, vedi scintille.ts), già con il loro stato di lettura
export function mergeNotifications(personal: any[], updates: UpdateAnnouncement[], reads: Record<string, boolean>, derived: any[] = []) {
  return [...personal, ...derived, ...updates.map(n => ({ ...n, id: updateNotificationId(n.id), updateId: n.id, tipo: "aggiornamento", letta: !!reads[n.id] }))]
    .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}
const isDerived = (id: string) => id.startsWith("scintilla:") || id.startsWith("eco:");
// Separately persisted: reading a release must never mark another user's notification as read; scintille and echoes are
// not documents at all, only private "seen" receipts.
export const splitNotificationIds = (ids: string[]) => ({
  updates: ids.filter(id => id.startsWith("update:")).map(id => id.slice(7)),
  derived: ids.filter(isDerived).map(id => id.slice(id.indexOf(":") + 1)),
  personal: ids.filter(id => !id.startsWith("update:") && !isDerived(id)),
});
