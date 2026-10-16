export type NotificationEvent = {
  source_type: string;
  source_id: string;
  occurred_at: string;
  is_read: boolean;
};

export function groupNotificationsByEvent<T extends NotificationEvent>(items: readonly T[]): Array<T & { duplicateCount: number }> {
  const groups = new Map<string, T & { duplicateCount: number }>();

  for (const item of items) {
    const key = `${item.source_type}\u0000${item.source_id}`;
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...item, duplicateCount: 1 });
      continue;
    }

    const latest = new Date(item.occurred_at).getTime() > new Date(previous.occurred_at).getTime()
      ? item
      : previous;
    groups.set(key, {
      ...latest,
      is_read: previous.is_read && item.is_read,
      duplicateCount: previous.duplicateCount + 1,
    });
  }

  return [...groups.values()];
}
