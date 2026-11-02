import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { networkLoggerState } from "$lib/network-logger/network-logger-state.svelte";
import { RelayClient } from "./relay-client";

describe("RelayClient", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		networkLoggerState.clearAll();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("constructs correct headers including platform, key, account, and proxy", async () => {
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};

		globalThis.fetch = vi.fn().mockImplementation((url, init) => {
			capturedUrl = String(url);
			capturedHeaders = init?.headers as Record<string, string>;
			return Promise.resolve({
				ok: true,
				status: 200,
				text: () =>
					Promise.resolve(JSON.stringify({ ret: true, results: [] })),
			} as Response);
		});

		const client = new RelayClient({
			platform: "scruff",
			relayBaseUrl: "https://custom-relay.example.com",
			relayKey: "test-omni-key",
		});

		const res = await client.request<{ ret: boolean }>({
			path: "/app/location",
			method: "GET",
			query: { lat: 31.2, lon: 121.4 },
			account: {
				id: "acc-1",
				channel: "scruff",
				accountIdentifier: "user@scruff.com",
				name: "User",
				proxyUrl: "socks5://127.0.0.1:1080",
				isEnabled: true,
				createdAt: Date.now(),
			},
		});

		expect(res.ret).toBe(true);
		expect(capturedUrl).toContain(
			"https://custom-relay.example.com/app/location",
		);
		expect(capturedUrl).toContain("lat=31.2");
		expect(capturedUrl).toContain("lon=121.4");
		expect(capturedHeaders["omni-platform"]).toBe("scruff");
		expect(capturedHeaders["omni-key"]).toBe("test-omni-key");
		expect(capturedHeaders["omni-account"]).toBe("user@scruff.com");
		expect(capturedHeaders["omni-proxy"]).toBe("socks5://127.0.0.1:1080");

		// Verify logger recorded the request
		expect(networkLoggerState.httpLogs).toHaveLength(1);
		expect(networkLoggerState.httpLogs[0].status).toBe(200);
	});

	it("correctly sets omni-platform to jackd for Jack'd requests", async () => {
		let capturedHeaders: Record<string, string> = {};

		globalThis.fetch = vi.fn().mockImplementation((_, init) => {
			capturedHeaders = init?.headers as Record<string, string>;
			return Promise.resolve({
				ok: true,
				status: 200,
				text: () => Promise.resolve(JSON.stringify({ ret: true })),
			} as Response);
		});

		const client = new RelayClient({ platform: "jackd" });
		await client.request({ path: "/app/profile" });

		expect(capturedHeaders["omni-platform"]).toBe("jackd");
	});

	it("throws RelayApiError when response has ret: false or status >= 400", async () => {
		globalThis.fetch = vi.fn().mockImplementation(() => {
			return Promise.resolve({
				ok: true,
				status: 200,
				text: () =>
					Promise.resolve(
						JSON.stringify({
							ret: false,
							message: "Token expired",
						}),
					),
			} as Response);
		});

		const client = new RelayClient({ platform: "scruff" });
		await expect(client.request({ path: "/app/chat" })).rejects.toThrow(
			"Token expired",
		);

		// Verify failed in logger
		expect(networkLoggerState.httpLogs[0].error).toBe("Token expired");
	});
});
