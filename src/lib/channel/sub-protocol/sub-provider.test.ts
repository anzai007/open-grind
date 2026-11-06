import { describe, expect, it, vi } from "vitest";

import { SubProvider } from "../providers/sub-provider";
import { CHANNEL_METAS } from "../types";
import {
	DEFAULT_SUB_MEDIA_BASE_URL,
	formatSubGender,
	formatSubRole,
	parseRawSubProfile,
	parseSubGridUser,
	type RawSubProfile,
	subMediaUrl,
} from "./sub-profile-parser";

describe("Sub Profile Parser", () => {
	it("formats Sub media URL correctly", () => {
		expect(subMediaUrl("")).toBe("");
		expect(subMediaUrl(null)).toBe("");
		expect(
			subMediaUrl("/uploads/2026/02/27/HUAWEI-1476732189299449856.jpeg"),
		).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/2026/02/27/HUAWEI-1476732189299449856.jpeg`,
		);
		expect(subMediaUrl("uploads/test.jpg")).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/test.jpg`,
		);
		expect(subMediaUrl("https://example.com/photo.jpg")).toBe(
			"https://example.com/photo.jpg",
		);
	});

	it("formats Sub roles correctly", () => {
		expect(formatSubRole(1)).toBe("S");
		expect(formatSubRole("1")).toBe("S");
		expect(formatSubRole(2)).toBe("M");
		expect(formatSubRole("2")).toBe("M");
		expect(formatSubRole(3)).toBe("Switch");
		expect(formatSubRole(4)).toBe("未决定");
		expect(formatSubRole(null)).toBeUndefined();
		expect(formatSubRole(undefined)).toBeUndefined();
	});

	it("formats Sub gender correctly", () => {
		expect(formatSubGender(1)).toBe("男");
		expect(formatSubGender(2)).toBe("女");
		expect(formatSubGender(0)).toBe("未知");
	});

	it("parses RawSubProfile into UniversalUserProfile correctly", () => {
		const raw: RawSubProfile = {
			userId: "1310577775485472768",
			userName: "Dylan",
			avatar: "/uploads/2025/01/25/HUAWEI-1332565716128321536.jpeg",
			userTag: 1,
			city: "北京市",
			biography: "爱好自由，真诚交流",
			gender: 1,
			height: 180,
			weight: 75,
			isOnline: 1,
			detailAll: {
				avatarImage: {
					webAddr:
						"/uploads/2025/01/25/HUAWEI-1332565716128321536.jpeg",
				},
				photos: [
					"/uploads/2025/01/25/photo2.jpeg",
					"https://external.com/photo3.jpeg",
				],
			},
		};

		const profile = parseRawSubProfile(raw);
		expect(profile.channel).toBe("sub");
		expect(profile.id).toBe("1310577775485472768");
		expect(profile.displayName).toBe("Dylan");
		expect(profile.heightCm).toBe(180);
		expect(profile.weightKg).toBe(75);
		expect(profile.rolePreference).toBe("S");
		expect(profile.about).toBe("爱好自由，真诚交流");
		expect(profile.isOnline).toBe(true);
		expect(profile.communityTags).toContain("S");
		expect(profile.communityTags).toContain("北京市");
		expect(profile.photos.length).toBeGreaterThanOrEqual(2);
		expect(profile.photos[0]?.thumbnailUrl).toContain(
			"https://images.sublifeapp.com/images",
		);
		expect(profile.photos[0]?.isAvatar).toBe(true);
	});

	it("parses RawSubProfile into UniversalGridUser correctly", () => {
		const raw: RawSubProfile = {
			userId: "1063461581229215744",
			userName: "Alex",
			avatar: "/uploads/avatar.jpg",
			userTag: 3,
			city: "上海市",
			isOnline: 1,
		};

		const gridUser = parseSubGridUser(raw);
		expect(gridUser.channel).toBe("sub");
		expect(gridUser.id).toBe("1063461581229215744");
		expect(gridUser.displayName).toBe("Alex");
		expect(gridUser.avatarThumbnailUrl).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/avatar.jpg`,
		);
		expect(gridUser.isOnline).toBe(true);
		expect(gridUser.tags).toContain("Switch");
		expect(gridUser.tags).toContain("上海市");
	});
});

describe("SubProvider Implementation", () => {
	it("initializes with correct channel metadata", () => {
		const provider = new SubProvider();
		expect(provider.channel).toBe("sub");
		expect(provider.meta).toEqual(CHANNEL_METAS.sub);
		expect(provider.meta.brandColor).toBe("#7c3aed");
		expect(provider.meta.interactionName).toBe("SayHi");
	});

	it("dispatches Say Hi interaction with graceful fallback", async () => {
		const provider = new SubProvider();
		const result = await provider.sendInteraction("1063461581229215744");
		expect(result.success).toBe(true);
		expect(result.interactionType).toBe("say_hi");
		expect(result.message).toContain("Say Hi");
		expect(result.targetUserId).toBe("1063461581229215744");
	});

	it("handles getConversations with mapped partner and last message", async () => {
		const provider = new SubProvider();
		// Mock client.request
		const mockRequest = vi
			.fn()
			.mockResolvedValue({
				ret: true,
				data: [
					{
						conversationId:
							"1063461581229215744-1310577775485472768",
						sender: "1063461581229215744",
						target: "1310577775485472768",
						unreadCount: 2,
						lastMessage: {
							messageId: "msg_001",
							conversationId:
								"1063461581229215744-1310577775485472768",
							sender: "1310577775485472768",
							senderTime: "2026-11-06T09:30:00.000Z",
							target: "1063461581229215744",
							messageContent: "你好呀！",
						},
					},
				],
			});

		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const res = await provider.getConversations({
			account: {
				accountIdentifier: "1063461581229215744",
				channel: "sub",
				createdAt: Date.now(),
				id: "sub:1063461581229215744",
				isEnabled: true,
				name: "My Account",
			},
		});

		expect(res.items).toHaveLength(1);
		const conv = res.items[0]!;
		expect(conv.channel).toBe("sub");
		expect(conv.conversationId).toBe(
			"1063461581229215744-1310577775485472768",
		);
		expect(conv.targetUserId).toBe("1310577775485472768");
		expect(conv.lastMessageText).toBe("你好呀！");
		expect(conv.unreadCount).toBe(2);
	});

	it("handles getMessages with formatted media attachments", async () => {
		const provider = new SubProvider();
		const mockRequest = vi
			.fn()
			.mockResolvedValue({
				ret: true,
				data: [
					{
						messageId: "msg_sub_01",
						conversationId:
							"1063461581229215744-1310577775485472768",
						sender: "1310577775485472768",
						target: "1063461581229215744",
						messageContent: null,
						senderTime: "2026-11-06T09:31:00.000Z",
						attachment: {
							type: "image",
							metadata: { url: "/uploads/test_photo.jpg" },
						},
					},
				],
			});

		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const messages = await provider.getMessages(
			"1063461581229215744-1310577775485472768",
			{
				account: {
					accountIdentifier: "1063461581229215744",
					channel: "sub",
					createdAt: Date.now(),
					id: "sub:1063461581229215744",
					isEnabled: true,
					name: "My Account",
				},
			},
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.id).toBe("msg_sub_01");
		expect(messages[0]?.mediaUrl).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/test_photo.jpg`,
		);
		expect(messages[0]?.text).toBe("[图片]");
		expect(messages[0]?.isFromMe).toBe(false);
	});
});
