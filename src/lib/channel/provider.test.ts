import { describe, expect, it } from "vitest";

import { GrindrProvider } from "./providers/grindr-provider";
import { HeesayProvider } from "./providers/heesay-provider";
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

	it("has correct metadata matching Heesay specifications", () => {
		const provider = new HeesayProvider();
		expect(provider.channel).toBe("heesay");
		expect(provider.meta).toEqual(CHANNEL_METAS.heesay);
		expect(provider.meta.interactionName).toBe("SayHi");
		expect(provider.meta.brandColor).toBe("#0066ff");
	});

	it("contains consistent metadata for all supported channels", () => {
		expect(CHANNEL_METAS.grindr.name).toBe("Grindr");
		expect(CHANNEL_METAS.grindr.interactionName).toBe("Tap");

		expect(CHANNEL_METAS.scruff.name).toBe("Scruff");
		expect(CHANNEL_METAS.scruff.interactionName).toBe("Woof");

		expect(CHANNEL_METAS.jackd.name).toBe("Jack'd");
		expect(CHANNEL_METAS.jackd.interactionName).toBe("Wave");

		expect(CHANNEL_METAS.heesay.name).toBe("Heesay");
		expect(CHANNEL_METAS.heesay.interactionName).toBe("SayHi");
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

	it("dispatches Woof interaction in ScruffProvider successfully with graceful fallback", async () => {
		const provider = new ScruffProvider();
		const result = await provider.sendInteraction("user_12345");
		expect(result.success).toBe(true);
		expect(result.interactionType).toBe("woof");
		expect(result.message).toContain("Woof");
		expect(result.targetUserId).toBe("user_12345");
	});

	it("dispatches Wave interaction in JackdProvider successfully with graceful fallback", async () => {
		const provider = new JackdProvider();
		const result = await provider.sendInteraction("user_67890");
		expect(result.success).toBe(true);
		expect(result.interactionType).toBe("wave");
		expect(result.message).toContain("Wave");
		expect(result.targetUserId).toBe("user_67890");
	});

	it("dispatches Say Hi interaction in HeesayProvider successfully with graceful fallback", async () => {
		const provider = new HeesayProvider();
		const result = await provider.sendInteraction("user_111117647");
		expect(result.success).toBe(true);
		expect(result.interactionType).toBe("say_hi");
		expect(result.message).toContain("Say Hi");
		expect(result.targetUserId).toBe("user_111117647");
	});
});
