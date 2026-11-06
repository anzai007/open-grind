import { describe, expect, it, vi } from "vitest";

import { ScruffProvider } from "../providers/scruff-provider";
import {
	formatScruffLastActive,
	isScruffUserOnline,
	parseRawScruffProfile,
} from "./profile-parser";

describe("Scruff User Online & Last Active Calculation", () => {
	it("correctly identifies active users within 5 minutes as online", () => {
		const now = Date.now();
		const oneMinAgo = new Date(now - 60 * 1000).toUTCString();

		expect(
			isScruffUserOnline({
				id: 1001,
				logged_in: true,
				online: true,
				last_login: oneMinAgo,
			}),
		).toBe(true);

		expect(
			isScruffUserOnline({
				id: 1002,
				logged_in: true,
				recent: true,
				last_login: oneMinAgo,
			}),
		).toBe(true);
	});

	it("identifies users beyond 5 minutes as not currently online even if logged_in/online is true", () => {
		const now = Date.now();
		// Scruff 上游接口常将 1 小时内活跃的用户均标记为 online: true
		const fiftyMinsAgo = new Date(now - 50 * 60 * 1000).toUTCString();

		expect(
			isScruffUserOnline({
				id: 1003,
				logged_in: true,
				online: true,
				recent: true,
				last_login: fiftyMinsAgo,
			}),
		).toBe(false);
	});

	it("formats last active relative time string nicely", () => {
		const now = Date.now();
		const thirtySecsAgo = new Date(now - 30 * 1000).toUTCString();
		const twentyFiveMinsAgo = new Date(now - 25 * 60 * 1000).toUTCString();
		const twoHoursAgo = new Date(now - 2 * 3600 * 1000).toUTCString();

		expect(
			formatScruffLastActive({ id: 1, last_login: thirtySecsAgo }),
		).toBe("刚刚在线");
		expect(
			formatScruffLastActive({ id: 2, last_login: twentyFiveMinsAgo }),
		).toBe("25 分钟前活跃");
		expect(formatScruffLastActive({ id: 3, last_login: twoHoursAgo })).toBe(
			"2 小时前活跃",
		);
	});

	it("integrates online status into parseRawScruffProfile", () => {
		const now = Date.now();
		const activeProfile = parseRawScruffProfile(
			{
				id: "user-1",
				name: "Active Guy",
				logged_in: true,
				online: true,
				last_login: new Date(now - 30 * 1000).toUTCString(),
			},
			"scruff",
		);

		expect(activeProfile.isOnline).toBe(true);
		expect(activeProfile.lastActiveText).toBe("当前在线");

		const idleProfile = parseRawScruffProfile(
			{
				id: "user-2",
				name: "Idle Guy",
				logged_in: true,
				online: true,
				last_login: new Date(now - 35 * 60 * 1000).toUTCString(),
			},
			"scruff",
		);

		expect(idleProfile.isOnline).toBe(false);
		expect(idleProfile.lastActiveText).toBe("35 分钟前活跃");
	});
});

describe("Scruff Channel Messages Fetching & Offline Sync", () => {
	it("fetches offline messages via unified IM relay messages endpoint", async () => {
		const provider = new ScruffProvider();

		// Mock client.request
		const mockRequest = vi.fn().mockImplementation((opts: unknown) => {
			const options = opts as {
				path: string;
				query?: Record<string, unknown>;
			};
			if (options.path === "/_private/im/messages") {
				return Promise.resolve({
					ret: true,
					data: [
						{
							messageId: "msg-offline-1",
							conversationId: "202040775-202219921",
							sender: "202040775",
							target: "202219921",
							senderTime: "2026-11-03T08:10:00.000Z",
							messageContent: "Offline message 1",
						},
						{
							messageId: "msg-offline-2",
							conversationId: "202040775-202219921",
							sender: "202040775",
							target: "202219921",
							senderTime: "2026-11-03T08:11:00.000Z",
							messageContent: "Offline message 2",
						},
					],
				});
			}
			if (options.path === "/app/chat") {
				return Promise.resolve({ results: [] });
			}
			return Promise.resolve({});
		});

		(
			provider as unknown as { client: { request: typeof mockRequest } }
		).client.request = mockRequest;

		const msgs = await provider.getMessages("202040775-202219921", {
			account: {
				id: "acc-1",
				channel: "scruff",
				accountIdentifier: "test@example.com",
				extraMeta: { profileId: "202219921" },
				name: "My Account",
				isEnabled: true,
				createdAt: Date.now(),
			},
		});

		expect(mockRequest).toHaveBeenCalled();
		expect(msgs.length).toBe(2);
		expect(msgs[0]?.text).toBe("Offline message 1");
		expect(msgs[1]?.text).toBe("Offline message 2");
		expect(msgs[0]?.isFromMe).toBe(false);
	});
});
