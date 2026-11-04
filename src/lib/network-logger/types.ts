export interface HttpLogEntry {
	id: string;
	timestamp: number;
	timeStr: string;
	channel?: "grindr" | "scruff" | "jackd" | "heesay";
	method: string;
	url: string;
	path: string;
	queryParams?: Record<string, string>;
	requestHeaders?: Record<string, string>;
	requestBody?: unknown;
	status: number | "pending" | "failed";
	durationMs?: number;
	responseHeaders?: Record<string, string>;
	responseBody?: unknown;
	error?: string;
}

export interface WsLogEntry {
	id: string;
	timestamp: number;
	timeStr: string;
	channel?: "grindr" | "scruff" | "jackd" | "heesay";
	direction: "sent" | "received" | "status";
	type: string;
	ref?: string | null;
	payload?: unknown;
	status?: number | null;
}
