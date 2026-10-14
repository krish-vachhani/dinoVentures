import { describe, expect, it } from "vitest";
import { formatCoins, formatMoney, formatSignedCoins } from "./format";

describe("formatMoney", () => {
  it("converts minor units to a currency string", () => {
    expect(formatMoney(49_900, "INR")).toBe("₹499");
    expect(formatMoney(9_950, "INR")).toBe("₹99.50");
  });
});

describe("formatCoins", () => {
  it("groups thousands", () => {
    expect(formatCoins(1_400)).toBe("1,400");
  });
});

describe("formatSignedCoins", () => {
  it("shows the direction of a ledger entry", () => {
    expect(formatSignedCoins(600)).toBe("+600");
    expect(formatSignedCoins(-250)).toBe("−250");
    expect(formatSignedCoins(0)).toBe("0");
  });
});
