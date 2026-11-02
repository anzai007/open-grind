import { describe, expect, it } from "vitest";

import { COUNTRIES, findLocationInfo, formatLocalTime } from "./cities";

describe("cities database & location info", () => {
	it("should contain major countries including China and India", () => {
		const cn = COUNTRIES.find((c) => c.code === "CN");
		const inCountry = COUNTRIES.find((c) => c.code === "IN");
		expect(cn).toBeDefined();
		expect(inCountry).toBeDefined();
		expect(cn?.cities.some((c) => c.name === "北京")).toBe(true);
		expect(inCountry?.cities.some((c) => c.name.includes("德里"))).toBe(
			true,
		);
	});

	it("should find accurate city, country and timezone for exact coordinates", () => {
		// Shanghai: 31.2304, 121.4737
		const shInfo = findLocationInfo(31.2304, 121.4737);
		expect(shInfo.country).toBe("中国");
		expect(shInfo.city).toBe("上海");
		expect(shInfo.flag).toBe("🇨🇳");
		expect(shInfo.coordsText).toBe("31.23°N, 121.47°E");
		expect(shInfo.timezone).toBe("Asia/Shanghai");

		// New Delhi: 28.6139, 77.2090
		const delhiInfo = findLocationInfo(28.6139, 77.209);
		expect(delhiInfo.country).toBe("印度");
		expect(delhiInfo.city).toContain("德里");
		expect(delhiInfo.flag).toBe("🇮🇳");
		expect(delhiInfo.coordsText).toBe("28.61°N, 77.21°E");
		expect(delhiInfo.timezone).toBe("Asia/Kolkata");
	});

	it("should format south/west coordinates correctly", () => {
		// Sydney, Australia: -33.8688, 151.2093
		const sydneyInfo = findLocationInfo(-33.8688, 151.2093);
		expect(sydneyInfo.country).toBe("澳大利亚");
		expect(sydneyInfo.city).toBe("悉尼");
		expect(sydneyInfo.coordsText).toBe("33.87°S, 151.21°E");
		expect(sydneyInfo.timezone).toBe("Australia/Sydney");

		// New York, USA: 40.7128, -74.0060
		const nyInfo = findLocationInfo(40.7128, -74.006);
		expect(nyInfo.country).toBe("美国");
		expect(nyInfo.city).toBe("纽约");
		expect(nyInfo.coordsText).toBe("40.71°N, 74.01°W");
		expect(nyInfo.timezone).toBe("America/New_York");
	});

	it("should format local time in Y-m-d H:i format", () => {
		// Specific UTC time: 2026-11-01 16:30:00 UTC
		const testDate = new Date("2026-11-01T16:30:00Z");

		// Shanghai is UTC+8 -> 2026-11-02 00:30
		const shTime = formatLocalTime(testDate, "Asia/Shanghai");
		expect(shTime).toBe("2026-11-02 00:30");

		// Tokyo is UTC+9 -> 2026-11-02 01:30
		const tokyoTime = formatLocalTime(testDate, "Asia/Tokyo");
		expect(tokyoTime).toBe("2026-11-02 01:30");

		// New York is UTC-5 (or UTC-4 if DST, in November standard time is UTC-5) -> 2026-11-01 11:30 or 12:30
		const nyTime = formatLocalTime(testDate, "America/New_York");
		expect(nyTime).toMatch(/^2026-11-01 (11|12):30$/);

		// London is UTC+0 in Nov -> 2026-11-01 16:30
		const londonTime = formatLocalTime(testDate, "Europe/London");
		expect(londonTime).toBe("2026-11-01 16:30");
	});

	it("should fallback gracefully for extreme remote locations (> 1500km from any city)", () => {
		// Remote point in Pacific Ocean
		const remoteInfo = findLocationInfo(0, -160);
		expect(remoteInfo.country).toBe("全球");
		expect(remoteInfo.city).toBe("自选位置");
	});
});
