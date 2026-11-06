import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { SocialChannelType } from "$lib/channel/types";
import type { HttpLogEntry, WsLogEntry } from "./types";

type LoggerBroadcastMessage =
	| { type: "START_HTTP"; entry: HttpLogEntry }
	| {
			type: "COMPLETE_HTTP";
			id: string;
			result: {
				status: number;
				responseBody?: unknown;
				headers?: Record<string, string>;
			};
	  }
	| {
			type: "FAIL_HTTP";
			id: string;
			errorInfo: {
				status?: number;
				error?: string;
				responseBody?: unknown;
			};
	  }
	| { type: "ADD_WS"; entry: WsLogEntry }
	| { type: "CLEAR"; tab: "http" | "ws" }
	| { type: "CLEAR_ALL" }
	| { type: "SYNC_REQUEST" }
	| {
			type: "SYNC_SNAPSHOT";
			httpLogs: HttpLogEntry[];
			wsLogs: WsLogEntry[];
			wsConnected: boolean;
	  };

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
	private broadcastChannel: BroadcastChannel | null = null;

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

		if (
			typeof window !== "undefined" &&
			typeof BroadcastChannel !== "undefined"
		) {
			try {
				this.broadcastChannel = new BroadcastChannel(
					"open-grind:network-logger",
				);
				this.broadcastChannel.onmessage = (
					event: MessageEvent<LoggerBroadcastMessage>,
				) => {
					this.handleBroadcastMessage(event.data);
				};
				// 刚打开新窗口时向已有主窗口请求日志快照
				this.broadcast({ type: "SYNC_REQUEST" });
			} catch (e) {
				console.warn("BroadcastChannel not supported", e);
			}
		}
	}

	private broadcast(msg: LoggerBroadcastMessage) {
		if (this.broadcastChannel) {
			try {
				this.broadcastChannel.postMessage(msg);
			} catch {
				// ignore
			}
		}
	}

	private handleBroadcastMessage(msg: LoggerBroadcastMessage) {
		if (!msg || !msg.type) return;
		switch (msg.type) {
			case "SYNC_REQUEST":
				if (this.httpLogs.length > 0 || this.wsLogs.length > 0) {
					this.broadcast({
						type: "SYNC_SNAPSHOT",
						httpLogs: this.httpLogs.slice(0, this.MAX_ENTRIES),
						wsLogs: this.wsLogs.slice(0, this.MAX_ENTRIES),
						wsConnected: this.wsConnected,
					});
				}
				break;
			case "SYNC_SNAPSHOT":
				if (this.httpLogs.length === 0 && this.wsLogs.length === 0) {
					this.httpLogs = msg.httpLogs;
					this.wsLogs = msg.wsLogs;
					this.wsConnected = msg.wsConnected;
				}
				break;
			case "START_HTTP":
				if (!this.httpLogs.some((e) => e.id === msg.entry.id)) {
					this.httpLogs.unshift(msg.entry);
					if (this.httpLogs.length > this.MAX_ENTRIES) {
						this.httpLogs.pop();
					}
				}
				break;
			case "COMPLETE_HTTP": {
				const entry = this.httpLogs.find((e) => e.id === msg.id);
				if (entry) {
					entry.status = msg.result.status;
					entry.durationMs = Math.max(
						1,
						Date.now() - entry.timestamp,
					);
					entry.responseBody = msg.result.responseBody;
					entry.responseHeaders = msg.result.headers;
				}
				break;
			}
			case "FAIL_HTTP": {
				const entry = this.httpLogs.find((e) => e.id === msg.id);
				if (entry) {
					entry.status =
						msg.errorInfo.status && msg.errorInfo.status > 0
							? msg.errorInfo.status
							: "failed";
					entry.durationMs = Math.max(
						1,
						Date.now() - entry.timestamp,
					);
					entry.error = msg.errorInfo.error;
					if (msg.errorInfo.responseBody !== undefined) {
						entry.responseBody = msg.errorInfo.responseBody;
					}
				}
				break;
			}
			case "ADD_WS":
				if (!this.wsLogs.some((e) => e.id === msg.entry.id)) {
					this.wsLogs.unshift(msg.entry);
					if (this.wsLogs.length > this.MAX_ENTRIES) {
						this.wsLogs.pop();
					}
				}
				break;
			case "CLEAR":
				if (msg.tab === "http") {
					this.httpLogs = [];
					this.selectedHttpId = null;
				} else {
					this.wsLogs = [];
					this.selectedWsId = null;
				}
				break;
			case "CLEAR_ALL":
				this.httpLogs = [];
				this.wsLogs = [];
				this.selectedHttpId = null;
				this.selectedWsId = null;
				break;
		}
	}

	async openDetachedWindow(): Promise<void> {
		this.open = false;
		if (typeof window !== "undefined" && isTauri()) {
			try {
				await invoke("open_network_logger_window");
				return;
			} catch (e) {
				console.error(
					"Failed to open network logger window via Tauri",
					e,
				);
			}
		}
		if (typeof window !== "undefined") {
			window.open(
				"/network-logger",
				"network-logger",
				"width=1100,height=750,menubar=no,toolbar=no,location=no",
			);
		}
	}

	startHttp(options: {
		method: string;
		url: string;
		body?: unknown;
		headers?: Record<string, string>;
		channel?: SocialChannelType;
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
			channel: options.channel,
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

		this.broadcast({ type: "START_HTTP", entry });
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
			this.broadcast({ type: "COMPLETE_HTTP", id, result });
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
			this.broadcast({ type: "FAIL_HTTP", id, errorInfo });
		}
	}

	addWs(entry: {
		direction: "sent" | "received" | "status";
		type: string;
		payload?: unknown;
		ref?: string | null;
		status?: number | null;
		timestamp?: number;
		channel?: SocialChannelType;
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
			channel: entry.channel,
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

		this.broadcast({ type: "ADD_WS", entry: logEntry });
	}

	clear() {
		if (this.activeTab === "http") {
			this.httpLogs = [];
			this.selectedHttpId = null;
		} else {
			this.wsLogs = [];
			this.selectedWsId = null;
		}
		this.broadcast({ type: "CLEAR", tab: this.activeTab });
	}

	clearAll() {
		this.httpLogs = [];
		this.wsLogs = [];
		this.selectedHttpId = null;
		this.selectedWsId = null;
		this.broadcast({ type: "CLEAR_ALL" });
	}
}

export const networkLoggerState = new NetworkLoggerState();
