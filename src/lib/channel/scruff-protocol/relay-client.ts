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

		let reqBody: string | undefined;
		if (options.body !== undefined && options.body !== null) {
			if (typeof options.body === "string") {
				reqBody = options.body;
			} else {
				reqBody = JSON.stringify(options.body);
				headers["Content-Type"] = "application/json";
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
			method,
			url: fullUrl,
			queryParams:
				Object.keys(logQueryParams).length > 0
					? logQueryParams
					: undefined,
			headers: {
				...headers,
				"omni-key": "******", // mask in logger for safety
				...(headers["omni-proxy"]
					? { "omni-proxy": "[PROXY CONFIGURED]" }
					: {}),
			},
			body: options.body,
		});

		const timeoutMs = options.timeoutMs ?? 30000;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetch(fullUrl, {
				method,
				headers,
				body: reqBody,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			const text = await res.text();
			let data: unknown;
			try {
				data = text ? JSON.parse(text) : {};
			} catch {
				data = text;
			}

			const recordData = data as Record<string, unknown> | null;
			const isSuccess =
				res.ok &&
				(recordData?.ret === undefined || recordData.ret === true);

			if (isSuccess) {
				networkLoggerState.completeHttp(logEntry.id, {
					status: res.status,
					body: data,
				});
				return data as T;
			}

			const errMsg =
				(typeof recordData?.message === "string" &&
					recordData.message) ||
				(typeof recordData?.error === "string" && recordData.error) ||
				`Relay error (${res.status})`;

			networkLoggerState.failHttp(logEntry.id, {
				status: res.status,
				error: errMsg,
				body: data,
			});

			throw new RelayApiError(errMsg, res.status, data);
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof RelayApiError) {
				throw error;
			}

			const errMsg =
				error instanceof Error ? error.message : String(error);
			networkLoggerState.failHttp(logEntry.id, {
				status: 0,
				error: errMsg,
			});

			throw new RelayApiError(errMsg, 0);
		}
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
