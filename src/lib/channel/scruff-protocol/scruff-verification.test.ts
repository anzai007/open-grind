import { describe, expect, it } from "vitest";

import { ScruffProvider } from "../providers/scruff-provider";

describe("Scruff Channel Provider Account Verification", () => {
	it("verifies platform account with unauthenticated proxy and upgrades to platform authenticated proxy", async () => {
		const provider = new ScruffProvider();
		const result = await provider.verifyAccount({
			accountIdentifier: "ldbwkhhy18@gmail.com",
			channel: "scruff",
			createdAt: Date.now(),
			id: "scruff:ldbwkhhy18@gmail.com",
			isEnabled: true,
			name: "Test Account",
			proxyUrl: "http://96.62.193.113:7822", // Unauthenticated user input
		});

		expect(result.valid).toBe(true);
		expect(result.displayName).toBeTruthy();
		expect(result.profileId).toBe("202219921");
		// Verify proxy was upgraded to include credentials to prevent 407
		expect(result.proxyUrl).toContain("96.62.193.113:7822");
		expect(result.proxyUrl).toContain("lhaapyps");
	});

	it("verifies platform account with empty proxy and binds platform proxy automatically", async () => {
		const provider = new ScruffProvider();
		const result = await provider.verifyAccount({
			accountIdentifier: "ldbwkhhy18@gmail.com",
			channel: "scruff",
			createdAt: Date.now(),
			id: "scruff:ldbwkhhy18@gmail.com",
			isEnabled: true,
			name: "Test Account",
			proxyUrl: undefined,
		});

		expect(result.valid).toBe(true);
		expect(result.profileId).toBe("202219921");
		expect(result.proxyUrl).toContain("96.62.193.113:7822");
	});
});
