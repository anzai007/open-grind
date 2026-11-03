import { describe, expect, it } from "vitest";

import { decodeGeohash } from "$lib/model/geohash";
import {
	findGeohashByLocationName,
	getGeohashLocationLabel,
	resolveGeohashForAccount,
} from "./location-helper";
import type { ChannelAccount } from "./types";

describe("location-helper", () => {
	describe("findGeohashByLocationName", () => {
		it("finds Tokyo geohash by Japanese and English names", () => {
			const hash1 = findGeohashByLocationName("日本东京");
			expect(hash1).not.toBeNull();
			const coord1 = decodeGeohash(hash1!);
			expect(coord1.lat).toBeCloseTo(35.6762, 1);
			expect(coord1.lon).toBeCloseTo(139.6503, 1);

			const hash2 = findGeohashByLocationName("📍 🇯🇵 东京");
			expect(hash2).not.toBeNull();
			expect(hash2).toBe(hash1);

			const hash3 = findGeohashByLocationName("Tokyo");
			expect(hash3).not.toBeNull();
			expect(hash3).toBe(hash1);
		});

		it("finds Frankfurt geohash for Germany", () => {
			const hash = findGeohashByLocationName("法兰克福");
			expect(hash).not.toBeNull();
			const coord = decodeGeohash(hash!);
			expect(coord.lat).toBeCloseTo(50.1109, 1);
			expect(coord.lon).toBeCloseTo(8.6821, 1);
		});
	});

	describe("resolveGeohashForAccount", () => {
		it("returns existing valid geohash when consistent", () => {
			const tokyoGeohash = findGeohashByLocationName("东京")!;
			const acc: ChannelAccount = {
				id: "acc-1",
				channel: "scruff",
				accountIdentifier: "test@example.com",
				name: "Test",
				isEnabled: true,
				createdAt: Date.now(),
				lastGeohash: tokyoGeohash,
				lastLocationName: "日本东京",
			};

			const resolved = resolveGeohashForAccount(acc);
			expect(resolved).toBe(tokyoGeohash);
		});

		it("auto-heals corrupted Germany geohash when lastLocationName is Tokyo", () => {
			const frankfurtGeohash = findGeohashByLocationName("法兰克福")!;
			const acc: ChannelAccount = {
				id: "acc-corrupted",
				channel: "scruff",
				accountIdentifier: "zoptjzmm43@gmail.com",
				name: "Scruff User",
				isEnabled: true,
				createdAt: Date.now(),
				lastGeohash: frankfurtGeohash,
				lastLocationName: "日本东京",
			};

			const resolved = resolveGeohashForAccount(acc);
			expect(resolved).not.toBe(frankfurtGeohash);
			const coord = decodeGeohash(resolved);
			expect(coord.lat).toBeCloseTo(35.6762, 1);
			expect(coord.lon).toBeCloseTo(139.6503, 1);
			expect(acc.lastGeohash).toBe(resolved);
		});

		it("derives geohash from lastLocationName when lastGeohash is missing", () => {
			const acc: ChannelAccount = {
				id: "acc-no-geo",
				channel: "scruff",
				accountIdentifier: "test@example.com",
				name: "Test",
				isEnabled: true,
				createdAt: Date.now(),
				lastLocationName: "日本东京",
			};

			const resolved = resolveGeohashForAccount(acc);
			expect(resolved).toMatch(/^xn76/);
			expect(acc.lastGeohash).toBe(resolved);
		});
	});

	describe("getGeohashLocationLabel", () => {
		it("formats Tokyo geohash nicely", () => {
			const tokyoGeohash = findGeohashByLocationName("东京")!;
			const label = getGeohashLocationLabel(tokyoGeohash);
			expect(label).toContain("东京");
		});
	});
});
