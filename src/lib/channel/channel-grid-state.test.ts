import { beforeEach, describe, expect, it } from "vitest";

import { ChannelGridState } from "./channel-grid-state.svelte";
import { channelState } from "./channel-state.svelte";
import type { SocialChannelProvider } from "./provider";
import type { PageResult, UniversalGridUser } from "./types";

describe("ChannelGridState", () => {
	let gridState: ChannelGridState;

	beforeEach(() => {
		gridState = new ChannelGridState();
	});

	it("initializes with empty items and loading false", () => {
		expect(gridState.items).toEqual([]);
		expect(gridState.loading).toBe(false);
		expect(gridState.offset).toBe(0);
		expect(gridState.hasNext).toBe(true);
	});

	it("loads initial users and advances offset by 100", async () => {
		const mockUsers: UniversalGridUser[] = [
			{
				channel: "scruff",
				id: "u1",
				displayName: "Scruff Guy 1",
				avatarThumbnailUrl: "https://example.com/1.jpg",
				isOnline: true,
			},
			{
				channel: "scruff",
				id: "u2",
				displayName: "Scruff Guy 2",
				avatarThumbnailUrl: "https://example.com/2.jpg",
				isOnline: false,
			},
		];

		const mockProvider: SocialChannelProvider = {
			channel: "scruff",
			meta: channelState.currentMeta,
			getNearbyUsers: (params) =>
				Promise.resolve<PageResult<UniversalGridUser>>({
					items: mockUsers,
					offset: params.offset ?? 0,
					nextOffset: (params.offset ?? 0) + 100,
					hasNext: true,
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
					targetUserId: "u1",
				}),
		};

		channelState.registerProvider("scruff", mockProvider);
		channelState.switchChannel("scruff");

		await gridState.load(31.23, 121.47);

		expect(gridState.items).toHaveLength(2);
		expect(gridState.items[0]?.displayName).toBe("Scruff Guy 1");
		expect(gridState.offset).toBe(100);
		expect(gridState.hasNext).toBe(true);
		expect(gridState.loading).toBe(false);
	});

	it("loads more users and appends without duplicates", async () => {
		const page1: UniversalGridUser[] = [
			{
				channel: "scruff",
				id: "u1",
				displayName: "Scruff Guy 1",
				avatarThumbnailUrl: "https://example.com/1.jpg",
				isOnline: true,
			},
		];
		const page2: UniversalGridUser[] = [
			{
				channel: "scruff",
				id: "u1", // Duplicate
				displayName: "Scruff Guy 1",
				avatarThumbnailUrl: "https://example.com/1.jpg",
				isOnline: true,
			},
			{
				channel: "scruff",
				id: "u3", // New
				displayName: "Scruff Guy 3",
				avatarThumbnailUrl: "https://example.com/3.jpg",
				isOnline: true,
			},
		];

		let callCount = 0;
		const mockProvider: SocialChannelProvider = {
			channel: "scruff",
			meta: channelState.currentMeta,
			getNearbyUsers: () => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						items: page1,
						offset: 0,
						nextOffset: 100,
						hasNext: true,
					});
				}
				return Promise.resolve({
					items: page2,
					offset: 100,
					nextOffset: 200,
					hasNext: false,
				});
			},
			getUserDetail: () => Promise.reject(new Error("unimplemented")),
			getConversations: () =>
				Promise.resolve({ items: [], offset: 0, hasNext: false }),
			getMessages: () => Promise.resolve([]),
			sendMessage: () => Promise.reject(new Error("unimplemented")),
			sendInteraction: () =>
				Promise.resolve({
					success: true,
					interactionType: "woof",
					targetUserId: "u1",
				}),
		};

		channelState.registerProvider("scruff", mockProvider);
		channelState.switchChannel("scruff");

		await gridState.load(31.23, 121.47);
		expect(gridState.items).toHaveLength(1);

		await gridState.loadMore();
		expect(gridState.items).toHaveLength(2);
		expect(gridState.items.map((u) => u.id)).toEqual(["u1", "u3"]);
	});

	it("handles fetch errors gracefully", async () => {
		const failingProvider: SocialChannelProvider = {
			channel: "scruff",
			meta: channelState.currentMeta,
			getNearbyUsers: () => Promise.reject(new Error("Relay timeout")),
			getUserDetail: () => Promise.reject(new Error("unimplemented")),
			getConversations: () =>
				Promise.resolve({ items: [], offset: 0, hasNext: false }),
			getMessages: () => Promise.resolve([]),
			sendMessage: () => Promise.reject(new Error("unimplemented")),
			sendInteraction: () =>
				Promise.resolve({
					success: true,
					interactionType: "woof",
					targetUserId: "u1",
				}),
		};

		channelState.registerProvider("scruff", failingProvider);
		channelState.switchChannel("scruff");

		await gridState.load(31.23, 121.47);
		expect(gridState.error).toBe("Relay timeout");
		expect(gridState.loading).toBe(false);
	});
});
