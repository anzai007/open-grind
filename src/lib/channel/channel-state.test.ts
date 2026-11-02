import { beforeEach, describe, expect, it } from "vitest";

import { ChannelState } from "./channel-state.svelte";
import type { SocialChannelProvider } from "./provider";
import type { ChannelAccount, PageResult, UniversalGridUser } from "./types";

describe("ChannelState", () => {
	let state: ChannelState;

	beforeEach(() => {
		if (
			typeof localStorage !== "undefined" &&
			typeof localStorage.clear === "function"
		) {
			localStorage.clear();
		}
		state = new ChannelState();
	});

	it("initializes with grindr as default channel", () => {
		expect(state.activeChannel).toBe("grindr");
		expect(state.currentMeta.name).toBe("Grindr");
		expect(state.currentProvider.channel).toBe("grindr");
	});

	it("switches channel correctly and updates currentMeta", () => {
		state.switchChannel("scruff");
		expect(state.activeChannel).toBe("scruff");
		expect(state.currentMeta.name).toBe("Scruff");
		expect(state.currentMeta.interactionName).toBe("Woof");

		state.switchChannel("jackd");
		expect(state.activeChannel).toBe("jackd");
		expect(state.currentMeta.name).toBe("Jack'd");
		expect(state.currentMeta.interactionName).toBe("Wave");
	});

	it("adds and manages channel accounts", () => {
		const account: ChannelAccount = {
			id: "acc-1",
			channel: "scruff",
			accountIdentifier: "test@example.com",
			name: "Tester",
			isEnabled: true,
			createdAt: Date.now(),
		};

		state.addAccount(account);
		expect(state.accounts.scruff).toHaveLength(1);
		expect(state.activeAccountIds.scruff).toBe("acc-1");

		state.switchChannel("scruff");
		expect(state.currentAccount?.accountIdentifier).toBe(
			"test@example.com",
		);

		state.removeAccount("scruff", "acc-1");
		expect(state.accounts.scruff).toHaveLength(0);
		expect(state.currentAccount).toBeUndefined();
	});

	it("allows registering and resolving custom channel providers", () => {
		const mockScruffProvider: SocialChannelProvider = {
			channel: "scruff",
			meta: state.currentMeta,
			getNearbyUsers: () =>
				Promise.resolve<PageResult<UniversalGridUser>>({
					items: [],
					offset: 0,
					hasNext: false,
				}),
			getUserDetail: () => Promise.reject(new Error("unimplemented")),
			getConversations: () =>
				Promise.resolve({ items: [], offset: 0, hasNext: false }),
			getMessages: () => Promise.resolve([]),
			sendMessage: () => Promise.reject(new Error("unimplemented")),
			sendInteraction: () =>
				Promise.resolve({
					success: true,
					interactionType: "woof",
					targetUserId: "123",
				}),
		};

		state.registerProvider("scruff", mockScruffProvider);
		expect(state.getProvider("scruff")).toBe(mockScruffProvider);

		state.switchChannel("scruff");
		expect(state.currentProvider).toBe(mockScruffProvider);
	});

	it("controls account dialog visibility and verifies accounts", async () => {
		expect(state.isAccountDialogOpen).toBe(false);
		state.openAccountDialog("jackd");
		expect(state.isAccountDialogOpen).toBe(true);
		expect(state.dialogChannel).toBe("jackd");

		state.closeAccountDialog();
		expect(state.isAccountDialogOpen).toBe(false);

		const account: ChannelAccount = {
			id: "acc-verify-1",
			channel: "scruff",
			accountIdentifier: "bear@example.com",
			name: "Bear User",
			isEnabled: true,
			createdAt: Date.now(),
		};

		const mockVerifyProvider: SocialChannelProvider = {
			channel: "scruff",
			meta: state.currentMeta,
			getNearbyUsers: () =>
				Promise.resolve<PageResult<UniversalGridUser>>({
					items: [],
					offset: 0,
					hasNext: false,
				}),
			getUserDetail: () => Promise.reject(new Error("unimplemented")),
			getConversations: () =>
				Promise.resolve({ items: [], offset: 0, hasNext: false }),
			getMessages: () => Promise.resolve([]),
			sendMessage: () => Promise.reject(new Error("unimplemented")),
			sendInteraction: () =>
				Promise.resolve({
					success: true,
					interactionType: "woof",
					targetUserId: "123",
				}),
			verifyAccount: () =>
				Promise.resolve({
					valid: true,
					displayName: "Verified Bear",
					profileId: "9988",
				}),
		};

		state.registerProvider("scruff", mockVerifyProvider);
		const result = await state.verifyAndSaveAccount("scruff", account);

		expect(result.valid).toBe(true);
		expect(result.displayName).toBe("Verified Bear");
		expect(state.accounts.scruff[0]?.name).toBe("Verified Bear");
		expect(state.accounts.scruff[0]?.extraMeta?.profileId).toBe("9988");
	});
});
