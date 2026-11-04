import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSetPreferences, mockPreferencesSnapshot } = vi.hoisted(() => ({
	mockSetPreferences: vi.fn(() => Promise.resolve()),
	mockPreferencesSnapshot: vi.fn(() => ({ geohash: "te7u8" })),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: mockPreferencesSnapshot,
	setPreferences: mockSetPreferences,
}));

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

		state.switchChannel("heesay");
		expect(state.activeChannel).toBe("heesay");
		expect(state.currentMeta.name).toBe("Heesay");
		expect(state.currentMeta.interactionName).toBe("SayHi");
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

	it("opens and closes user profiles and sends interactions", async () => {
		const mockDetailProvider: SocialChannelProvider = {
			channel: "scruff",
			meta: state.currentMeta,
			getNearbyUsers: () =>
				Promise.resolve({ items: [], offset: 0, hasNext: false }),
			getUserDetail: (id) =>
				Promise.resolve({
					channel: "scruff",
					id,
					displayName: "Super Star",
					photos: [],
					isOnline: true,
				}),
			getConversations: () =>
				Promise.resolve({ items: [], offset: 0, hasNext: false }),
			getMessages: () => Promise.resolve([]),
			sendMessage: () => Promise.reject(new Error("unimplemented")),
			sendInteraction: (targetUserId) =>
				Promise.resolve({
					success: true,
					interactionType: "woof",
					targetUserId,
					message: "嗷呜成功",
				}),
		};

		state.registerProvider("scruff", mockDetailProvider);
		state.switchChannel("scruff");

		expect(state.isProfileOpen).toBe(false);
		await state.openProfile("star-77");
		expect(state.isProfileOpen).toBe(true);
		expect(state.selectedUserProfile?.displayName).toBe("Super Star");

		const actionRes = await state.sendInteraction("star-77");
		expect(actionRes.success).toBe(true);
		expect(actionRes.interactionType).toBe("woof");

		state.closeProfile();
		expect(state.isProfileOpen).toBe(false);
		expect(state.selectedUserProfile).toBeNull();
	});

	it("supports switching between multiple accounts and binds per-account location", () => {
		const account1: ChannelAccount = {
			id: "acc-mumbai",
			channel: "scruff",
			accountIdentifier: "mumbai@example.com",
			name: "Mumbai User",
			isEnabled: true,
			createdAt: Date.now(),
			lastGeohash: "te7u8",
			lastLocationName: "印度·孟买",
		};

		const account2: ChannelAccount = {
			id: "acc-tokyo",
			channel: "scruff",
			accountIdentifier: "tokyo@example.com",
			name: "Tokyo User",
			isEnabled: true,
			createdAt: Date.now(),
			lastGeohash: "xn76u",
			lastLocationName: "日本·东京",
		};

		state.addAccount(account1);
		state.addAccount(account2);

		expect(state.accounts.scruff).toHaveLength(2);

		// Switch to account 1
		state.switchChannel("scruff");
		state.setActiveAccount("scruff", "acc-mumbai");
		expect(state.currentAccount?.id).toBe("acc-mumbai");
		expect(state.currentAccount?.lastGeohash).toBe("te7u8");
		expect(state.currentAccount?.lastLocationName).toBe("印度·孟买");

		// Record a new location for account 1
		state.recordCurrentLocation("dr5ru", "美国·纽约");
		expect(state.currentAccount?.lastGeohash).toBe("dr5ru");
		expect(state.currentAccount?.lastLocationName).toBe("美国·纽约");

		// Switch to account 2
		state.setActiveAccount("scruff", "acc-tokyo");
		expect(state.currentAccount?.id).toBe("acc-tokyo");
		expect(state.currentAccount?.lastGeohash).toBe("xn76u");
		expect(state.currentAccount?.lastLocationName).toBe("日本·东京");

		// Switch back to account 1 and ensure updated location was persisted
		state.setActiveAccount("scruff", "acc-mumbai");
		expect(state.currentAccount?.id).toBe("acc-mumbai");
		expect(state.currentAccount?.lastGeohash).toBe("dr5ru");
		expect(state.currentAccount?.lastLocationName).toBe("美国·纽约");
	});

	it("automatically repairs corrupted geohash when lastLocationName is Tokyo but geohash points to Germany", () => {
		// Germany Frankfurt geohash: u0pj
		const germanyGeohash = "u0pjz8146789";
		const corruptedAccount: ChannelAccount = {
			id: "acc-corrupted-tokyo",
			channel: "scruff",
			accountIdentifier: "zoptjzmm43@gmail.com",
			name: "Tokyo Account",
			isEnabled: true,
			createdAt: Date.now(),
			lastGeohash: germanyGeohash,
			lastLocationName: "日本东京",
		};

		state.addAccount(corruptedAccount);
		state.switchChannel("scruff");
		state.setActiveAccount("scruff", "acc-corrupted-tokyo");

		// Should automatically detect and restore Tokyo coordinates (starting with xn76)
		expect(state.currentAccount?.lastGeohash).toMatch(/^xn76/);
		expect(mockSetPreferences).toHaveBeenCalledWith(
			expect.objectContaining({
				geohash: expect.stringMatching(/^xn76/),
			}),
		);
	});
});
