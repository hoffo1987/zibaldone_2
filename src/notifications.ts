export type UpdateAnnouncement = {
  id: string; titolo: string; messaggio: string; versione: string; timestamp: number;
};
export const updateNotificationId = (id: string) => `update:${id}`;
export function mergeNotifications(personal: any[], updates: UpdateAnnouncement[], reads: Record<string, boolean>) {
  return [...personal, ...updates.map(n => ({ ...n, id: updateNotificationId(n.id), updateId: n.id, tipo: "aggiornamento", letta: !!reads[n.id] }))]
    .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}
// Separately persisted: reading a release must never mark another user's notification as read.
export const splitNotificationIds = (ids: string[]) => ({
  updates: ids.filter(id => id.startsWith("update:")).map(id => id.slice(7)),
  personal: ids.filter(id => !id.startsWith("update:")),
});
