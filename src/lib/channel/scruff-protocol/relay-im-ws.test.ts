import { describe, expect, it } from "vitest";

import { resolvePartnerProfileId } from "./scruff-base-provider";

describe("resolvePartnerProfileId", () => {
	it("correctly identifies remote partner when target is own account ID", () => {
		const rawConv = {
			conversationId: "202040775-202219818",
			sender: "202040775",
			target: "202219818",
			unreadCount: 1,
		};
		// My profile ID is 202219818
		const partner = resolvePartnerProfileId(rawConv, "202219818");
		expect(partner).toBe("202040775");
	});

	it("correctly identifies remote partner when sender is own account ID", () => {
		const rawConv = {
			conversationId: "202219818:202219908",
			sender: "202219818",
			target: "202219908",
			unreadCount: 0,
		};
		const partner = resolvePartnerProfileId(rawConv, "202219818");
		expect(partner).toBe("202219908");
	});

	it("correctly falls back to parsing composite conversationId when sender or target is empty", () => {
		const rawConv = {
			conversationId: "202219818:202219921",
			sender: "",
			target: "",
		};
		const partner = resolvePartnerProfileId(rawConv, "202219818");
		expect(partner).toBe("202219921");
	});

	it("handles hyphenated composite conversationId", () => {
		const rawConv = { conversationId: "202219921-202219818" };
		const partner = resolvePartnerProfileId(rawConv, "202219818");
		expect(partner).toBe("202219921");
	});
});
