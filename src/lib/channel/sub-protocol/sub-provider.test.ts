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
		expect(subMediaUrl("1568424771448250368")).toBe("");
		expect(subMediaUrl("0")).toBe("");
		expect(
			subMediaUrl("/uploads/2026/02/27/HUAWEI-1476732189299449856.jpeg"),
		).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/2026/02/27/HUAWEI-1476732189299449856.jpeg`,
		);
		expect(subMediaUrl("uploads/test.jpg")).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/test.jpg`,
		);
		expect(
			subMediaUrl(
				"https://images.sublifeapp.com/uploads/2026/02/27/test.jpeg",
			),
		).toBe(
			"https://images.sublifeapp.com/images/uploads/2026/02/27/test.jpeg",
		);
		expect(
			subMediaUrl(
				"https://images.sublifeapp.com/images/uploads/2026/02/27/test.jpeg",
			),
		).toBe(
			"https://images.sublifeapp.com/images/uploads/2026/02/27/test.jpeg",
		);
		expect(subMediaUrl("/images/uploads/test.jpg")).toBe(
			"https://images.sublifeapp.com/images/uploads/test.jpg",
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

	it("parses RawSubProfile with native avatarImage object and numeric attachmentId", () => {
		const raw: RawSubProfile = {
			id: "1568424445622132736",
			userName: "长期爹系成都大叔",
			avatar: "1568424771448250368",
			avatarImage: {
				attachmentId: "1568424771448250368",
				webAddr: "/uploads/2026/11/07/HUAWEI-1568424771448250368.jpeg",
				miniImageUrl:
					"/uploads/2026/11/07/HUAWEI-1568424771448250368.jpeg?x-image-process=image/resize,p_90/quality,q_80/marker,u_plus",
			},
			userTag: "3",
			city: "成都",
			isOnline: "1",
		};

		const gridUser = parseSubGridUser(raw);
		expect(gridUser.displayName).toBe("长期爹系成都大叔");
		expect(gridUser.avatarThumbnailUrl).toBe(
			"https://images.sublifeapp.com/images/uploads/2026/11/07/HUAWEI-1568424771448250368.jpeg?x-image-process=image/resize,p_90/quality,q_80/marker,u_plus",
		);
		expect(gridUser.avatarFullUrl).toBe(
			"https://images.sublifeapp.com/images/uploads/2026/11/07/HUAWEI-1568424771448250368.jpeg",
		);
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
		const mockRequest = vi
			.fn()
			.mockResolvedValue({ code: 200, data: { success: true } });
		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const result = await provider.sendInteraction("1063461581229215744");
		expect(result.success).toBe(true);
		expect(result.interactionType).toBe("say_hi");
		expect(result.message).toContain("Say Hi");
		expect(result.targetUserId).toBe("1063461581229215744");
		expect(mockRequest).toHaveBeenCalled();
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

	it("fetches nearby users via findList and parses distance correctly", async () => {
		const provider = new SubProvider();
		const mockRequest = vi
			.fn()
			.mockImplementation((opts: { path: string }) => {
				if (opts.path.includes("appUserNode/findList")) {
					return {
						status: 200,
						data: {
							records: [
								{
									userId: "2001",
									userName: "NearbyBob",
									avatar: "/uploads/bob.jpg",
									userTag: 1,
									city: "深圳市",
									gps: 150.5,
									isOnline: 1,
								},
								{
									userId: "2002",
									userName: "NearbyCharlie",
									avatar: "/uploads/charlie.jpg",
									userTag: 2,
									gps: 1250,
									isOnline: 0,
								},
							],
							total: 2,
						},
					};
				}
				return { status: 200, data: {} };
			});

		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const res = await provider.getNearbyUsers({
			lat: 22.5431,
			lon: 114.0579,
			account: {
				id: "sub:1001",
				channel: "sub",
				accountIdentifier: "1001",
				name: "Sub Test",
				createdAt: Date.now(),
				isEnabled: true,
			},
		});

		expect(res.items).toHaveLength(2);
		expect(res.items[0]!.id).toBe("2001");
		expect(res.items[0]!.displayName).toBe("NearbyBob");
		expect(res.items[0]!.distanceMeters).toBe(151);
		expect(res.items[0]!.distanceText).toBe("151 m");
		expect(res.items[1]!.id).toBe("2002");
		expect(res.items[1]!.distanceMeters).toBe(1250);
		expect(res.items[1]!.distanceText).toBe("1.3 km");
	});

	it("fetches user details and caches result", async () => {
		const provider = new SubProvider();
		const mockRequest = vi
			.fn()
			.mockImplementation((opts: { path: string }) => {
				if (opts.path.includes("appUser/appUserInfo")) {
					return {
						status: 200,
						data: {
							userId: "3001",
							userName: "TargetAlice",
							userTag: 2,
							avatar: "/uploads/alice.jpg",
							city: "广州市",
							height: 172,
							weight: 60,
							gender: 2,
							isOnline: 1,
							biography: "Hello Sub!",
						},
					};
				}
				if (opts.path.includes("appUserPhoto/findList")) {
					return {
						status: 200,
						data: {
							records: [
								{
									id: "p1",
									file: { webAddr: "/uploads/album1.jpg" },
								},
							],
						},
					};
				}
				return { status: 200, data: {} };
			});

		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const detail = await provider.getUserDetail("3001");
		expect(detail.id).toBe("3001");
		expect(detail.displayName).toBe("TargetAlice");
		expect(detail.rolePreference).toBe("M");
		expect(detail.heightCm).toBe(172);
		expect(detail.weightKg).toBe(60);
		expect(detail.about).toBe("Hello Sub!");
		expect(detail.photos.length).toBeGreaterThanOrEqual(1);

		// Cache check: calling again should return cached profile without calling appUserInfo again
		mockRequest.mockClear();
		const cachedDetail = await provider.getUserDetail("3001");
		expect(cachedDetail.displayName).toBe("TargetAlice");
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it("sends relationship like and hello message", async () => {
		const provider = new SubProvider();
		const mockRequest = vi
			.fn()
			.mockResolvedValue({ status: 200, data: { success: true } });
		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const result = await provider.sendInteraction("4001", {
			id: "sub:1001",
			channel: "sub",
			accountIdentifier: "1001",
			name: "Sub Test",
			createdAt: Date.now(),
			isEnabled: true,
		});

		expect(result.success).toBe(true);
		expect(result.targetUserId).toBe("4001");
		expect(mockRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "https://omni-relay.toonhub.top/fem/api/appUserNode/saveRelationship",
				body: { isLike: "1", targetUserId: "4001" },
			}),
		);
	});

	it("fetches profile visitors via appAccessRecord", async () => {
		const provider = new SubProvider();
		const mockRequest = vi
			.fn()
			.mockImplementation((opts: { path: string }) => {
				if (opts.path.includes("appAccessRecord/findList")) {
					return {
						status: 200,
						data: {
							records: [
								{
									userId: "5001",
									userName: "VisitorOne",
									avatar: "/uploads/visitor1.jpg",
									userTag: 1,
									accessTime: "2026-11-06T10:00:00Z",
								},
							],
							total: 1,
						},
					};
				}
				return { status: 200, data: {} };
			});

		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client = { request: mockRequest };

		const viewers = await provider.getViewers({
			id: "sub:1001",
			channel: "sub",
			accountIdentifier: "1001",
			name: "Sub Test",
			createdAt: Date.now(),
			isEnabled: true,
		});

		expect(viewers).toHaveLength(1);
		expect(viewers[0]!.id).toBe("5001");
		expect(viewers[0]!.displayName).toBe("VisitorOne");
	});

	it("formats and returns image message on sendMessage", async () => {
		const provider = new SubProvider();
		const msg = await provider.sendMessage({
			account: {
				id: "sub:1001",
				channel: "sub",
				accountIdentifier: "1001",
				name: "Sub Test",
				createdAt: Date.now(),
				isEnabled: true,
			},
			targetUserId: "2001",
			text: "",
			mediaUrl: "/uploads/my_photo.jpg",
		});

		expect(msg.channel).toBe("sub");
		expect(msg.mediaUrl).toBe(
			`${DEFAULT_SUB_MEDIA_BASE_URL}/uploads/my_photo.jpg`,
		);
		expect(msg.text).toBe("[图片]");
		expect(msg.isFromMe).toBe(true);
	});
});
