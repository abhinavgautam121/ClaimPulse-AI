import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const money = (v: number | string | undefined, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: "compact" } : {}),
  }).format(Number(v) || 0);
export const number = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    Number(v) || 0,
  );
export const dateLabel = (v: string | undefined) =>
  v
    ? new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
      )
    : "—";
export function periodFor(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
