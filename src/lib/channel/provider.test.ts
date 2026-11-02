import { describe, expect, it } from "vitest";

import { GrindrProvider } from "./providers/grindr-provider";
import { CHANNEL_METAS } from "./types";

describe("GrindrProvider & Channel Metadata", () => {
	it("has correct metadata matching Grindr specifications", () => {
		const provider = new GrindrProvider();
		expect(provider.channel).toBe("grindr");
		expect(provider.meta).toEqual(CHANNEL_METAS.grindr);
		expect(provider.meta.interactionName).toBe("Tap");
		expect(provider.meta.brandColor).toBe("#ffc700");
	});

	it("contains consistent metadata for all supported channels", () => {
		expect(CHANNEL_METAS.grindr.name).toBe("Grindr");
		expect(CHANNEL_METAS.grindr.interactionName).toBe("Tap");

		expect(CHANNEL_METAS.scruff.name).toBe("Scruff");
		expect(CHANNEL_METAS.scruff.interactionName).toBe("Woof");

		expect(CHANNEL_METAS.jackd.name).toBe("Jack'd");
		expect(CHANNEL_METAS.jackd.interactionName).toBe("Wave");
	});

	it("throws on invalid profile id for user details", async () => {
		const provider = new GrindrProvider();
		await expect(provider.getUserDetail("invalid_id")).rejects.toThrow(
			"Invalid Grindr profile ID",
		);
	});
});
