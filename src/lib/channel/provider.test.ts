import { describe, expect, it } from "vitest";

import { GrindrProvider } from "./providers/grindr-provider";
import { JackdProvider } from "./providers/jackd-provider";
import { ScruffProvider } from "./providers/scruff-provider";
import { CHANNEL_METAS } from "./types";

describe("Channel Providers & Metadata", () => {
	it("has correct metadata matching Grindr specifications", () => {
		const provider = new GrindrProvider();
		expect(provider.channel).toBe("grindr");
		expect(provider.meta).toEqual(CHANNEL_METAS.grindr);
		expect(provider.meta.interactionName).toBe("Tap");
		expect(provider.meta.brandColor).toBe("#ffc700");
	});

	it("has correct metadata matching Scruff specifications", () => {
		const provider = new ScruffProvider();
		expect(provider.channel).toBe("scruff");
		expect(provider.meta).toEqual(CHANNEL_METAS.scruff);
		expect(provider.meta.interactionName).toBe("Woof");
		expect(provider.meta.brandColor).toBe("#2da44e");
	});

	it("has correct metadata matching Jack'd specifications", () => {
		const provider = new JackdProvider();
		expect(provider.channel).toBe("jackd");
		expect(provider.meta).toEqual(CHANNEL_METAS.jackd);
		expect(provider.meta.interactionName).toBe("Wave");
		expect(provider.meta.brandColor).toBe("#ff6600");
	});

	it("contains consistent metadata for all supported channels", () => {
		expect(CHANNEL_METAS.grindr.name).toBe("Grindr");
		expect(CHANNEL_METAS.grindr.interactionName).toBe("Tap");

		expect(CHANNEL_METAS.scruff.name).toBe("Scruff");
		expect(CHANNEL_METAS.scruff.interactionName).toBe("Woof");

		expect(CHANNEL_METAS.jackd.name).toBe("Jack'd");
		expect(CHANNEL_METAS.jackd.interactionName).toBe("Wave");
	});

	it("throws on invalid profile id for user details in Grindr", async () => {
		const provider = new GrindrProvider();
		await expect(provider.getUserDetail("invalid_id")).rejects.toThrow(
			"Invalid Grindr profile ID",
		);
	});

	it("attempts verifyAccount against relay and handles network failure gracefully", async () => {
		const provider = new ScruffProvider();
		const res = await provider.verifyAccount({
			id: "scruff:fake@test.com",
			channel: "scruff",
			accountIdentifier: "fake@test.com",
			name: "Fake",
			isEnabled: true,
			createdAt: Date.now(),
		});

		expect(res.valid).toBe(false);
		expect(typeof res.errorMessage).toBe("string");
	});
});
