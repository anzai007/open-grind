import { invoke, isTauri } from "@tauri-apps/api/core";

import { networkLoggerState } from "$lib/network-logger/network-logger-state.svelte";
import type { ChannelAccount } from "../types";

export interface RelayClientOptions {
	platform: "scruff" | "jackd";
	relayBaseUrl?: string;
	relayKey?: string;
}

export interface RelayRequestOptions {
	path: string;
	method?: "GET" | "POST" | "PUT" | "DELETE";
	query?: Record<string, unknown>;
	body?: unknown;
	account?: ChannelAccount;
	headers?: Record<string, string>;
	timeoutMs?: number;
}

interface RelayHttpResponse {
	body: string;
	headers: Record<string, string>;
	status: number;
}

export class RelayApiError extends Error {
	status: number;
	data?: unknown;

	constructor(message: string, status: number, data?: unknown) {
		super(message);
		this.name = "RelayApiError";
		this.status = status;
		this.data = data;
	}
}

export const DEFAULT_RELAY_BASE_URL = "https://omni-relay.toonhub.top";
export const DEFAULT_RELAY_KEY =
	"omni__nNniWrIV4NTnu1lxBCE_DuwQpj6qqBIAPwWzoWwx8A";

export function isTauriEnvironment(): boolean {
	if (typeof window === "undefined") return false;
	const win = window as unknown as {
		isTauri?: boolean;
		__TAURI_INTERNALS__?: { invoke?: unknown };
		__TAURI__?: unknown;
		__OPEN_GRIND_PLATFORM?: string;
	};
	return Boolean(
		win.__OPEN_GRIND_PLATFORM ||
		win.__TAURI_INTERNALS__ ||
		win.__TAURI__ ||
		win.isTauri ||
		isTauri(),
	);
}

function toBrowserSafeUrl(url: string): string {
	// In test environment (Node/Bun/Vitest), use the absolute upstream URL directly
	if (typeof process !== "undefined" && process.env?.VITEST) {
		return url;
	}
	return url
		.replace(/^https:\/\/omni-relay\.toonhub\.top/i, "/_omni_relay")
		.replace(/^https:\/\/omni-api\.toonhub\.top/i, "/_omni_api");
}

export class RelayClient {
	readonly platform: "scruff" | "jackd";
	readonly relayBaseUrl: string;
	readonly relayKey: string;

	constructor(options: RelayClientOptions) {
		this.platform = options.platform;
		this.relayBaseUrl = (
			options.relayBaseUrl || DEFAULT_RELAY_BASE_URL
		).replace(/\/+$/, "");
		this.relayKey = options.relayKey || DEFAULT_RELAY_KEY;
	}

	async request<T = unknown>(options: RelayRequestOptions): Promise<T> {
		const method = options.method ?? "GET";
		const fullUrl = this.buildUrl(options.path, options.query);

		const effectiveKey = options.account?.relayKey || this.relayKey;
		const headers: Record<string, string> = {
			Accept: "application/json",
			"omni-key": effectiveKey,
			"omni-platform": this.platform,
			...(options.headers ?? {}),
		};

		if (options.account?.accountIdentifier) {
			headers["omni-account"] = options.account.accountIdentifier;
		}

		if (options.account?.proxyUrl?.trim()) {
			headers["omni-proxy"] = options.account.proxyUrl.trim();
		}

		const cleanHeaders: Record<string, string> = {};
		for (const [k, v] of Object.entries(headers)) {
			if (v !== undefined && v !== null && String(v).trim().length > 0) {
				cleanHeaders[k] = String(v).trim();
			}
		}

		let reqBody: string | undefined;
		if (options.body !== undefined && options.body !== null) {
			if (typeof options.body === "string") {
				reqBody = options.body;
			} else {
				reqBody = JSON.stringify(options.body);
				cleanHeaders["Content-Type"] = "application/json";
			}
		}

		// Log to Open Grind Network Logger
		const logQueryParams: Record<string, string> = {};
		if (options.query) {
			for (const [k, v] of Object.entries(options.query)) {
				if (v !== undefined && v !== null) {
					logQueryParams[k] =
						typeof v === "string"
							? v
							: typeof v === "number" || typeof v === "boolean"
								? String(v)
								: JSON.stringify(v);
				}
			}
		}

		const logEntry = networkLoggerState.startHttp({
			body: options.body,
			headers: {
				...cleanHeaders,
				"omni-key": "******", // mask in logger for safety
				...(cleanHeaders["omni-proxy"]
					? { "omni-proxy": "[PROXY CONFIGURED]" }
					: {}),
			},
			method,
			url: fullUrl,
		});

		const timeoutMs = options.timeoutMs ?? 30000;

		try {
			let resStatus: number;
			let text: string;

			if (isTauriEnvironment()) {
				const res = await invoke<RelayHttpResponse>(
					"relay_http_request",
					{
						req: {
							body: reqBody,
							headers: cleanHeaders,
							method,
							timeoutMs,
							url: fullUrl,
						},
					},
				);
				resStatus = res.status;
				text = res.body;
			} else {
				const browserUrl = toBrowserSafeUrl(fullUrl);
				const controller = new AbortController();
				const timeoutId = setTimeout(
					() => controller.abort(),
					timeoutMs,
				);
				try {
					const res = await fetch(browserUrl, {
						body: reqBody,
						headers: cleanHeaders,
						method,
						signal: controller.signal,
					});
					resStatus = res.status;
					text = await res.text();
				} finally {
					clearTimeout(timeoutId);
				}
			}

			let data: unknown;
			try {
				data = text ? JSON.parse(text) : {};
			} catch {
				data = text;
			}

			const recordData = data as Record<string, unknown> | null;
			const isSuccess =
				resStatus >= 200 &&
				resStatus < 300 &&
				(recordData?.ret === undefined || recordData.ret === true);

			if (isSuccess) {
				networkLoggerState.completeHttp(logEntry.id, {
					responseBody: data,
					status: resStatus,
				});
				return data as T;
			}

			let errMsg: string;
			if (typeof recordData?.message === "string" && recordData.message) {
				errMsg = recordData.message;
			} else if (
				typeof recordData?.error === "string" &&
				recordData.error
			) {
				errMsg = recordData.error;
			} else if (
				typeof recordData?.error === "object" &&
				recordData.error &&
				"message" in recordData.error &&
				typeof (recordData.error as Record<string, unknown>).message ===
					"string"
			) {
				errMsg = (recordData.error as Record<string, unknown>)
					.message as string;
			} else {
				errMsg = `Relay error (${resStatus})`;
			}

			networkLoggerState.failHttp(logEntry.id, {
				error: errMsg,
				responseBody: data,
				status: resStatus,
			});

			throw new RelayApiError(errMsg, resStatus, data);
		} catch (error) {
			if (error instanceof RelayApiError) {
				throw error;
			}

			const errMsg =
				error instanceof Error
					? error.message
					: typeof error === "object" && error && "message" in error
						? String(error.message)
						: String(error);

			networkLoggerState.failHttp(logEntry.id, {
				error: errMsg,
				status: 0,
			});

			throw new RelayApiError(errMsg, 0);
		}
	}

	async ping(): Promise<{ message: string; ok: boolean; status: number }> {
		try {
			await this.request<{ ret: boolean }>({
				method: "GET",
				path: "/_private/im/conversations",
				query: { platform: this.platform, user: "ping_check" },
				timeoutMs: 10000,
			});
			return { message: "中继连接正常", ok: true, status: 200 };
		} catch (error) {
			if (error instanceof RelayApiError) {
				return {
					message: error.message,
					ok: false,
					status: error.status,
				};
			}
			return {
				message: error instanceof Error ? error.message : String(error),
				ok: false,
				status: 0,
			};
		}
	}

	static async testConnection(
		baseUrl = DEFAULT_RELAY_BASE_URL,
		key = DEFAULT_RELAY_KEY,
	): Promise<{ message: string; ok: boolean; status: number }> {
		const client = new RelayClient({
			platform: "scruff",
			relayBaseUrl: baseUrl,
			relayKey: key,
		});
		return client.ping();
	}

	private buildUrl(path: string, query?: Record<string, unknown>): string {
		let urlStr = path.startsWith("http")
			? path
			: `${this.relayBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

		if (query && Object.keys(query).length > 0) {
			const sp = new URLSearchParams();
			for (const [k, v] of Object.entries(query)) {
				if (v !== undefined && v !== null) {
					const valStr =
						typeof v === "string"
							? v
							: typeof v === "number" || typeof v === "boolean"
								? String(v)
								: JSON.stringify(v);
					sp.append(k, valStr);
				}
			}
			const qs = sp.toString();
			if (qs) {
				urlStr += (urlStr.includes("?") ? "&" : "?") + qs;
			}
		}

		return urlStr;
	}
}
