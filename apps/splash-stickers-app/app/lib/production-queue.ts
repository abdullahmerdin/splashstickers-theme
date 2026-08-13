export const PRODUCTION_POLL_INTERVAL_MS = 2_500;
export const PRODUCTION_TIME_ZONE = "Europe/Istanbul";

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: PRODUCTION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type QueueFile = { productionFileStatus: string };
type DatedQueueFile = QueueFile & { createdAt: string | Date };

export function hasActiveProductionFiles(orders: readonly QueueFile[]) {
  return orders.some((order) => order.productionFileStatus === "PENDING" || order.productionFileStatus === "PROCESSING");
}

export function productionDayKey(value: string | Date) {
  const parts = DAY_KEY_FORMATTER.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function groupProductionOrdersByDay<T extends DatedQueueFile>(orders: readonly T[]) {
  const groups = new Map<string, { key: string; date: Date; orders: T[] }>();
  orders.forEach((order) => {
    const key = productionDayKey(order.createdAt);
    const group = groups.get(key);
    if (group) {
      group.orders.push(order);
      return;
    }
    groups.set(key, { key, date: new Date(order.createdAt), orders: [order] });
  });
  return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
}
