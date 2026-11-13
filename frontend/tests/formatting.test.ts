import { describe, it, expect } from "vitest";
import { money, periodFor, dateLabel } from "../lib/utils";
describe("report display conventions", () => {
  it("formats currency without mixing units", () => {
    expect(money(1000000, true)).toBe("$1M");
    expect(money(1250)).toBe("$1,250");
  });
  it("uses inclusive ranges", () => {
    const { start, end } = periodFor(30);
    expect((Date.parse(end) - Date.parse(start)) / 86400000).toBe(29);
  });
  it("renders date-only records without timezone drift", () => {
    expect(dateLabel("2026-01-01")).toBe("Jan 1, 2026");
  });
});
