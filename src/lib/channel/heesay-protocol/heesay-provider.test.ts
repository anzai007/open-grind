import { describe, expect, it, vi } from "vitest";

import { HeesayProvider } from "../providers/heesay-provider";
import { CHANNEL_METAS } from "../types";
import {
	formatHeesayRole,
	parseRawHeesayProfile,
	type RawHeesayProfile,
} from "./heesay-profile-parser";

describe("Heesay Profile Parser", () => {
	it("formats Heesay roles correctly", () => {
		expect(formatHeesayRole("1")).toBe("1号 (Top)");
		expect(formatHeesayRole(1)).toBe("1号 (Top)");
		expect(formatHeesayRole("0")).toBe("0号 (Bottom)");
		expect(formatHeesayRole("0.5")).toBe("0.5 (Versatile)");
		expect(formatHeesayRole("-1")).toBe("保密");
		expect(formatHeesayRole(null)).toBeUndefined();
	});

	it("parses RawHeesayProfile into UniversalUserProfile correctly", () => {
		const raw: RawHeesayProfile = {
			uid: "10023456",
			name: "Leo",
			avatar: "https://web-sg.bldimg.com/avatar/main.jpg",
			vice_avatar: "https://web-sg.bldimg.com/avatar/vice.jpg",
			age: 26,
			height: 180,
			weight: 75,
			role: "1",
			description: "Nice to meet you!",
			distance: 1.5,
			online_state: 1,
			looking_for: ["dating", "chat"],
			album: [{ url: "https://web-sg.bldimg.com/album/photo1.jpg" }],
		};

		const profile = parseRawHeesayProfile(raw);
		expect(profile.channel).toBe("heesay");
		expect(profile.id).toBe("10023456");
		expect(profile.displayName).toBe("Leo");
		expect(profile.age).toBe(26);
		expect(profile.heightCm).toBe(180);
		expect(profile.weightKg).toBe(75);
		expect(profile.rolePreference).toBe("1号 (Top)");
		expect(profile.about).toBe("Nice to meet you!");
		expect(profile.distanceMeters).toBe(1500);
		expect(profile.distanceText).toBe("1.5 km");
		expect(profile.isOnline).toBe(true);
		expect(profile.communityTags).toEqual(["dating", "chat"]);
		expect(profile.photos).toHaveLength(3);
		expect(profile.photos[0]?.thumbnailUrl).toBe(
			"https://web-sg.bldimg.com/avatar/main.jpg",
		);
		expect(profile.photos[0]?.isAvatar).toBe(true);
	});
});

describe("HeesayProvider Implementation", () => {
	it("initializes with correct channel metadata", () => {
		const provider = new HeesayProvider();
		expect(provider.channel).toBe("heesay");
		expect(provider.meta).toEqual(CHANNEL_METAS.heesay);
		expect(provider.meta.brandColor).toBe("#0066ff");
		expect(provider.meta.interactionName).toBe("SayHi");
	});

	it("dispatches Say Hi interaction with graceful fallback", async () => {
		const provider = new HeesayProvider();
		const result = await provider.sendInteraction("1009999");
		expect(result.success).toBe(true);
		expect(result.interactionType).toBe("say_hi");
		expect(result.message).toContain("Say Hi");
		expect(result.targetUserId).toBe("1009999");
	});

	it("handles getNearbyUsers with mock client response", async () => {
		const provider = new HeesayProvider();
		// Mock client.request
		const mockRequest = vi.fn().mockResolvedValue({
			code: 200,
			data: [
				{
					uid: "2001",
					name: "User 2001",
					avatar: "https://web-sg.bldimg.com/u1.jpg",
					distance: 0.8,
					age: 24,
					role: "0",
				},
				{
					uid: "2002",
					name: "User 2002",
					avatar: "https://web-sg.bldimg.com/u2.jpg",
					distance: 2.3,
					age: 30,
					role: "0.5",
				},
			],
		});
		// @ts-expect-error override private client for test
		provider.client.request = mockRequest;

		const res = await provider.getNearbyUsers({
			lat: 31.23,
			lon: 121.47,
			offset: 0,
		});

		expect(res.items).toHaveLength(2);
		expect(res.items[0]?.id).toBe("2001");
		expect(res.items[0]?.displayName).toBe("User 2001");
		expect(res.items[0]?.distanceMeters).toBe(800);
		expect(res.items[1]?.id).toBe("2002");
		expect(mockRequest).toHaveBeenCalledWith(
			expect.objectContaining({ path: "/users", method: "GET" }),
		);
	});

	it("caches getUserDetail to avoid redundant relay calls", async () => {
		const provider = new HeesayProvider();
		const mockRequest = vi
			.fn()
			.mockResolvedValue({
				code: 200,
				data: [
					{
						uid: "3001",
						name: "CachedUser",
						avatar: "https://web-sg.bldimg.com/cached.jpg",
						age: 28,
					},
				],
			});
		// @ts-expect-error override private client for test
		provider.client.request = mockRequest;

		const p1 = await provider.getUserDetail("3001");
		expect(p1.displayName).toBe("CachedUser");
		expect(mockRequest).toHaveBeenCalledTimes(2); // user_info + albums

		// Second call should hit the in-memory cache
		const p2 = await provider.getUserDetail("3001");
		expect(p2.displayName).toBe("CachedUser");
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("handles getConversations with partner id resolution", async () => {
		const provider = new HeesayProvider();
		const mockRequest = vi
			.fn()
			.mockResolvedValue({
				ret: true,
				data: [
					{
						conversation_id: "me_uid:target_999",
						target_user_id: "target_999",
						target_name: "Friendly Buddy",
						last_message_content: "Hey, nice to meet you!",
						last_message_at: "2026-11-04T00:00:00.000Z",
						unread_count: 1,
					},
				],
			});
		// @ts-expect-error override private client for test
		provider.client.request = mockRequest;

		const res = await provider.getConversations();
		expect(res.items).toHaveLength(1);
		expect(res.items[0]?.targetUserId).toBe("target_999");
		expect(res.items[0]?.targetUserName).toBe("Friendly Buddy");
		expect(res.items[0]?.lastMessageText).toBe("Hey, nice to meet you!");
		expect(res.items[0]?.unreadCount).toBe(1);
	});
});
