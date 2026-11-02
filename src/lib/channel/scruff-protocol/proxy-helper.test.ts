import { describe, expect, it } from "vitest";

import {
	getProxyHostPort,
	maskProxyUrl,
	resolveEffectiveProxy,
} from "./proxy-helper";

describe("proxy-helper", () => {
	it("extracts host and port correctly", () => {
		expect(
			getProxyHostPort("http://lhaapyps:hmvon9vvzzje@96.62.193.113:7822"),
		).toBe("96.62.193.113:7822");
		expect(getProxyHostPort("http://96.62.193.113:7822")).toBe(
			"96.62.193.113:7822",
		);
		expect(getProxyHostPort("socks5://user:pass@127.0.0.1:1080")).toBe(
			"127.0.0.1:1080",
		);
		expect(getProxyHostPort("")).toBe("");
		expect(getProxyHostPort(undefined)).toBe("");
	});

	it("masks proxy credentials for UI display", () => {
		expect(
			maskProxyUrl("http://lhaapyps:hmvon9vvzzje@96.62.193.113:7822"),
		).toBe("http://96.62.193.113:7822");
		expect(maskProxyUrl("socks5://u:p@1.2.3.4:1080")).toBe(
			"socks5://1.2.3.4:1080",
		);
		expect(maskProxyUrl("http://96.62.193.113:7822")).toBe(
			"http://96.62.193.113:7822",
		);
		expect(maskProxyUrl("")).toBe("");
	});

	it("resolves effective proxy by upgrading unauthenticated input to platform authenticated proxy", () => {
		const platformProxy = "http://lhaapyps:hmvon9vvzzje@96.62.193.113:7822";
		const unauthenticatedUserProxy = "http://96.62.193.113:7822";

		// Match host:port -> upgrade to platform authenticated URL
		expect(
			resolveEffectiveProxy(unauthenticatedUserProxy, platformProxy),
		).toBe(platformProxy);

		// If user didn't enter anything -> use platform proxy
		expect(resolveEffectiveProxy("", platformProxy)).toBe(platformProxy);
		expect(resolveEffectiveProxy(undefined, platformProxy)).toBe(
			platformProxy,
		);

		// If user entered completely different proxy -> keep user proxy
		expect(
			resolveEffectiveProxy("http://1.2.3.4:8888", platformProxy),
		).toBe("http://1.2.3.4:8888");
	});
});
