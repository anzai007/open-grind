import { RelayClient } from "./relay-client";

export interface PlatformAccountInfo {
	id?: number;
	platformName?: string;
	account: string;
	platformUserId?: string;
	proxyUrl?: string;
	hasAccessToken?: boolean;
}

/**
 * Extract host:port from a proxy URL (stripping protocol and credentials).
 * e.g. "http://user:pass@96.62.193.113:7822" -> "96.62.193.113:7822"
 */
export function getProxyHostPort(proxyUrl?: string): string {
	if (!proxyUrl?.trim()) return "";
	try {
		const parsed = new URL(proxyUrl.trim());
		return parsed.host;
	} catch {
		const match = proxyUrl.trim().match(/@?([a-zA-Z0-9.-]+:\d+)/);
		return match?.[1] ? match[1] : proxyUrl.trim();
	}
}

/**
 * Mask proxy credentials for safe UI display.
 * e.g. "http://user:pass@96.62.193.113:7822" -> "http://96.62.193.113:7822"
 */
export function maskProxyUrl(proxyUrl?: string): string {
	if (!proxyUrl?.trim()) return "";
	try {
		const parsed = new URL(proxyUrl.trim());
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return proxyUrl.trim();
	}
}

/**
 * Resolves effective proxy URL by matching user input with platform database proxy.
 * If user entered an unauthenticated URL like "http://96.62.193.113:7822", but the
 * platform has the authenticated "http://user:pass@96.62.193.113:7822",
 * this automatically returns the authenticated platform proxy URL to avoid 407 errors.
 */
export function resolveEffectiveProxy(
	userEnteredProxy?: string,
	platformProxy?: string,
): string | undefined {
	const userTrimmed = userEnteredProxy?.trim();
	const platTrimmed = platformProxy?.trim();

	if (!userTrimmed) {
		return platTrimmed || undefined;
	}
	if (!platTrimmed) {
		return userTrimmed;
	}

	const userHostPort = getProxyHostPort(userTrimmed);
	const platHostPort = getProxyHostPort(platTrimmed);

	// If host and port match (e.g. 96.62.193.113:7822), prefer the platform's
	// authenticated credentials URL.
	if (userHostPort && platHostPort && userHostPort === platHostPort) {
		return platTrimmed;
	}

	return userTrimmed;
}

/**
 * Fetch account binding info from ai-growth platform database with a strict short timeout.
 */
export async function queryPlatformAccount(
	platform: "scruff" | "jackd" | "heesay",
	accountEmail: string,
	timeoutMs = 4000,
): Promise<PlatformAccountInfo | null> {
	const trimmed = accountEmail.trim();
	if (!trimmed) return null;

	try {
		const client = new RelayClient({ platform });
		const res = await client.request<{
			ret?: boolean;
			data?: PlatformAccountInfo;
		}>({
			method: "GET",
			path: `https://omni-api.toonhub.top/platform/accounts/${platform}/${encodeURIComponent(trimmed)}`,
			headers: { "omni-platform": platform },
			timeoutMs,
		});

		if (res.ret && res.data && res.data.account) {
			return res.data;
		}
		return null;
	} catch {
		return null;
	}
}
