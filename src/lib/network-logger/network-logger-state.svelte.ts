import { listen } from "@tauri-apps/api/event";

import type { HttpLogEntry, WsLogEntry } from "./types";

class NetworkLoggerState {
	open = $state(false);
	activeTab = $state<"http" | "ws">("http");

	httpLogs = $state<HttpLogEntry[]>([]);
	wsLogs = $state<WsLogEntry[]>([]);

	selectedHttpId = $state<string | null>(null);
	selectedWsId = $state<string | null>(null);

	searchQuery = $state("");
	httpStatusFilter = $state<"all" | "2xx" | "4xx+" | "pending">("all");
	wsDirectionFilter = $state<"all" | "sent" | "received">("all");

	wsConnected = $state(false);

	readonly MAX_ENTRIES = 500;

	constructor() {
		if (
			typeof window !== "undefined" &&
			("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
		) {
			// Listen to ws:raw_event from Tauri backend
			listen<{ type: string; payload: unknown }>(
				"ws:raw_event",
				(event) => {
					this.addWs({
						direction: "received",
						type: event.payload.type,
						payload: event.payload.payload,
						timestamp: Date.now(),
					});
				},
			).catch((err) => console.error("ws:raw_event listener error", err));

			listen<void>("ws:connected", () => {
				this.wsConnected = true;
				this.addWs({
					direction: "status",
					type: "连接成功 (Connected)",
					payload: { state: "connected" },
					timestamp: Date.now(),
				});
			}).catch((err) => console.error(err));

			listen<void>("ws:disconnected", () => {
				this.wsConnected = false;
				this.addWs({
					direction: "status",
					type: "连接断开 (Disconnected)",
					payload: { state: "disconnected" },
					timestamp: Date.now(),
				});
			}).catch((err) => console.error(err));
		}
	}

	startHttp(options: {
		method: string;
		url: string;
		body?: unknown;
		headers?: Record<string, string>;
	}): HttpLogEntry {
		const now = Date.now();
		const date = new Date(now);
		const timeStr = `${date.toTimeString().split(" ")[0]}.${String(date.getMilliseconds()).padStart(3, "0")}`;
		const id = `http_${now}_${Math.random().toString(36).slice(2, 7)}`;

		let path = options.url;
		let queryParams: Record<string, string> | undefined = undefined;
		try {
			const u = new URL(options.url, "https://grindrapp.com");
			path = u.pathname;
			if (u.search) {
				queryParams = Object.fromEntries(u.searchParams.entries());
			}
		} catch {
			// fallback
		}

		// Deep clone body if it's an object to prevent later mutation
		let requestBody: unknown = options.body;
		if (options.body !== undefined && options.body !== null) {
			try {
				requestBody = JSON.parse(JSON.stringify(options.body));
			} catch {
				requestBody = options.body;
			}
		}

		const entry: HttpLogEntry = {
			id,
			timestamp: now,
			timeStr,
			method: options.method.toUpperCase(),
			url: options.url,
			path,
			queryParams,
			requestHeaders: options.headers,
			requestBody,
			status: "pending",
		};

		this.httpLogs.unshift(entry);
		if (this.httpLogs.length > this.MAX_ENTRIES) {
			this.httpLogs.pop();
		}

		return entry;
	}

	completeHttp(
		id: string,
		result: {
			status: number;
			responseBody?: unknown;
			headers?: Record<string, string>;
		},
	) {
		const entry = this.httpLogs.find((e) => e.id === id);
		if (entry) {
			entry.status = result.status;
			entry.durationMs = Math.max(1, Date.now() - entry.timestamp);
			entry.responseBody = result.responseBody;
			entry.responseHeaders = result.headers;
		}
	}

	failHttp(
		id: string,
		errorInfo: { status?: number; error?: string; responseBody?: unknown },
	) {
		const entry = this.httpLogs.find((e) => e.id === id);
		if (entry) {
			entry.status =
				errorInfo.status && errorInfo.status > 0
					? errorInfo.status
					: "failed";
			entry.durationMs = Math.max(1, Date.now() - entry.timestamp);
			entry.error = errorInfo.error;
			if (errorInfo.responseBody !== undefined) {
				entry.responseBody = errorInfo.responseBody;
			}
		}
	}

	addWs(entry: {
		direction: "sent" | "received" | "status";
		type: string;
		payload?: unknown;
		ref?: string | null;
		status?: number | null;
		timestamp?: number;
	}) {
		const now = entry.timestamp ?? Date.now();
		const date = new Date(now);
		const timeStr = `${date.toTimeString().split(" ")[0]}.${String(date.getMilliseconds()).padStart(3, "0")}`;
		const id = `ws_${now}_${Math.random().toString(36).slice(2, 7)}`;

		let payload = entry.payload;
		if (payload !== undefined && payload !== null) {
			try {
				payload = JSON.parse(JSON.stringify(payload));
			} catch {
				// use as is
			}
		}

		const logEntry: WsLogEntry = {
			id,
			timestamp: now,
			timeStr,
			direction: entry.direction,
			type: entry.type,
			ref: entry.ref,
			payload,
			status: entry.status,
		};

		this.wsLogs.unshift(logEntry);
		if (this.wsLogs.length > this.MAX_ENTRIES) {
			this.wsLogs.pop();
		}
	}

	clear() {
		if (this.activeTab === "http") {
			this.httpLogs = [];
			this.selectedHttpId = null;
		} else {
			this.wsLogs = [];
			this.selectedWsId = null;
		}
	}

	clearAll() {
		this.httpLogs = [];
		this.wsLogs = [];
		this.selectedHttpId = null;
		this.selectedWsId = null;
	}
}

export const networkLoggerState = new NetworkLoggerState();
