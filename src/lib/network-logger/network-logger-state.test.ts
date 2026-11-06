import { beforeEach, describe, expect, it } from "vitest";

import { networkLoggerState } from "./network-logger-state.svelte";

describe("NetworkLoggerState", () => {
	beforeEach(() => {
		networkLoggerState.clearAll();
	});

	it("captures HTTP requests, completions, and failures", () => {
		const req = networkLoggerState.startHttp({
			method: "POST",
			url: "/v4/faces?geohash=wtw3sj&page=1",
			body: { filter: "online" },
		});

		expect(req.id).toBeDefined();
		expect(req.method).toBe("POST");
		expect(req.path).toBe("/v4/faces");
		expect(req.queryParams).toEqual({ geohash: "wtw3sj", page: "1" });
		expect(req.requestBody).toEqual({ filter: "online" });
		expect(req.status).toBe("pending");
		expect(networkLoggerState.httpLogs.length).toBe(1);

		// Complete HTTP
		networkLoggerState.completeHttp(req.id, {
			status: 200,
			responseBody: { profiles: [{ id: 123 }] },
		});

		const completed = networkLoggerState.httpLogs.find(
			(e) => e.id === req.id,
		);
		expect(completed?.status).toBe(200);
		expect(completed?.durationMs).toBeGreaterThanOrEqual(1);
		expect(completed?.responseBody).toEqual({ profiles: [{ id: 123 }] });
	});

	it("records HTTP failure details", () => {
		const req = networkLoggerState.startHttp({
			method: "GET",
			url: "/v3/me",
		});

		networkLoggerState.failHttp(req.id, {
			status: 401,
			error: "Unauthorized",
			responseBody: { message: "Invalid session" },
		});

		const failed = networkLoggerState.httpLogs.find((e) => e.id === req.id);
		expect(failed?.status).toBe(401);
		expect(failed?.error).toBe("Unauthorized");
		expect(failed?.responseBody).toEqual({ message: "Invalid session" });
	});

	it("captures WebSocket sent and received messages", () => {
		networkLoggerState.addWs({
			direction: "sent",
			type: "chat.v1.message_sent",
			ref: "ref-123",
			payload: { conversationId: "c1", text: "Hello" },
		});

		networkLoggerState.addWs({
			direction: "received",
			type: "tap.v1.tap_sent",
			payload: { senderId: 456, tapType: "flame" },
		});

		expect(networkLoggerState.wsLogs.length).toBe(2);
		expect(networkLoggerState.wsLogs[0]?.type).toBe("tap.v1.tap_sent");
		expect(networkLoggerState.wsLogs[0]?.direction).toBe("received");
		expect(networkLoggerState.wsLogs[1]?.type).toBe("chat.v1.message_sent");
		expect(networkLoggerState.wsLogs[1]?.direction).toBe("sent");
		expect(networkLoggerState.wsLogs[1]?.ref).toBe("ref-123");
	});

	it("clears logs correctly", () => {
		networkLoggerState.startHttp({ method: "GET", url: "/v1/test" });
		networkLoggerState.addWs({ direction: "sent", type: "test" });

		expect(networkLoggerState.httpLogs.length).toBe(1);
		expect(networkLoggerState.wsLogs.length).toBe(1);

		networkLoggerState.activeTab = "http";
		networkLoggerState.clear();
		expect(networkLoggerState.httpLogs.length).toBe(0);
		expect(networkLoggerState.wsLogs.length).toBe(1);

		networkLoggerState.clearAll();
		expect(networkLoggerState.wsLogs.length).toBe(0);
	});

	it("syncs logs across windows via BroadcastChannel", async () => {
		const peerChannel = new BroadcastChannel("open-grind:network-logger");
		const received: Array<{ type: string; entry?: { url: string } }> = [];
		peerChannel.onmessage = (e) => {
			received.push(e.data);
		};

		networkLoggerState.startHttp({ method: "POST", url: "/v1/remote" });

		await new Promise((r) => setTimeout(r, 30));

		expect(
			received.some(
				(m) => m.type === "START_HTTP" && m.entry?.url === "/v1/remote",
			),
		).toBe(true);

		// Simulate peer window posting CLEAR_ALL
		peerChannel.postMessage({ type: "CLEAR_ALL" });
		await new Promise((r) => setTimeout(r, 30));

		expect(networkLoggerState.httpLogs.length).toBe(0);
		peerChannel.close();
	});

	it("records channel for sub HTTP and WS entries correctly", () => {
		const req = networkLoggerState.startHttp({
			method: "GET",
			url: "https://omni-relay.toonhub.top/fem/api/appUserNode/findList?pageNo=1&pageSize=24",
			channel: "sub",
			headers: { "omni-platform": "sub" },
		});

		expect(req.channel).toBe("sub");
		expect(networkLoggerState.httpLogs[0]?.channel).toBe("sub");

		networkLoggerState.addWs({
			channel: "sub",
			direction: "sent",
			type: "[IM WS] messageSend",
			payload: { channel: "sub", target: "1063461581229215744" },
		});

		expect(networkLoggerState.wsLogs[0]?.channel).toBe("sub");
	});
});
