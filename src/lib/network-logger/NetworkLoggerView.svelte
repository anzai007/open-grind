<script lang="ts">
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import PulseIcon from "phosphor-svelte/lib/PulseIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import HttpLogDetail from "./components/HttpLogDetail.svelte";
	import HttpLogList from "./components/HttpLogList.svelte";
	import WsLogDetail from "./components/WsLogDetail.svelte";
	import WsLogList from "./components/WsLogList.svelte";
	import { networkLoggerState } from "./network-logger-state.svelte";
	import type { HttpLogEntry, WsLogEntry } from "./types";

	interface Props {
		standalone?: boolean;
		onClose?: () => void;
		onDetach?: () => void;
	}

	let { standalone = false, onClose, onDetach }: Props = $props();

	type HttpStatusFilter = "all" | "2xx" | "4xx+" | "pending";
	type WsDirectionFilter = "all" | "sent" | "received";
	type ChannelFilter = "all" | "grindr" | "scruff" | "jackd" | "heesay";

	let searchInput = $state("");
	let httpStatusFilter = $state<HttpStatusFilter>("all");
	let wsDirectionFilter = $state<WsDirectionFilter>("all");
	let channelFilter = $state<ChannelFilter>("all");
	let mobileView = $state<"list" | "detail">("list");

	const CHANNEL_FILTERS: Array<{ id: ChannelFilter; label: string }> = [
		{ id: "all", label: "全部" },
		{ id: "grindr", label: "Grindr" },
		{ id: "scruff", label: "Scruff" },
		{ id: "jackd", label: "Jack'd" },
		{ id: "heesay", label: "Heesay" },
	];

	const HTTP_FILTERS: Array<{ id: HttpStatusFilter; label: string }> = [
		{ id: "all", label: "全部" },
		{ id: "2xx", label: "2xx 成功" },
		{ id: "4xx+", label: "4xx+ 异常" },
		{ id: "pending", label: "进行中" },
	];

	const WS_FILTERS: Array<{ id: WsDirectionFilter; label: string }> = [
		{ id: "all", label: "全部" },
		{ id: "sent", label: "↑ 发送" },
		{ id: "received", label: "↓ 接收" },
	];

	function matchesChannel(
		entry: HttpLogEntry,
		filter: ChannelFilter,
	): boolean {
		if (filter === "all") return true;
		if (entry.channel) {
			return entry.channel === filter;
		}

		const platformHdr = (
			entry.requestHeaders?.["omni-platform"] ||
			entry.requestHeaders?.["Omni-Platform"] ||
			""
		).toLowerCase();
		const urlLower = entry.url.toLowerCase();
		const pathLower = entry.path.toLowerCase();

		const isScruff =
			platformHdr === "scruff" ||
			urlLower.includes("scruff") ||
			pathLower.includes("scruff");

		const isJackd =
			platformHdr === "jackd" ||
			urlLower.includes("jackd") ||
			pathLower.includes("jackd");

		const isHeesay =
			platformHdr === "heesay" ||
			urlLower.includes("heesay") ||
			pathLower.includes("heesay");

		const isNonGrindr =
			isScruff ||
			isJackd ||
			isHeesay ||
			urlLower.includes("omni-") ||
			pathLower.includes("omni-");

		if (filter === "scruff") return isScruff;
		if (filter === "jackd") return isJackd;
		if (filter === "heesay") return isHeesay;
		if (filter === "grindr") return !isNonGrindr;
		return true;
	}

	const filteredHttpLogs = $derived.by(() => {
		const q = searchInput.trim().toLowerCase();
		return networkLoggerState.httpLogs.filter((entry) => {
			if (!matchesChannel(entry, channelFilter)) return false;

			if (httpStatusFilter === "2xx") {
				if (
					typeof entry.status !== "number" ||
					entry.status < 200 ||
					entry.status >= 300
				)
					return false;
			} else if (httpStatusFilter === "4xx+") {
				if (typeof entry.status === "number" && entry.status < 400)
					return false;
				if (entry.status === "pending") return false;
			} else if (httpStatusFilter === "pending") {
				if (entry.status !== "pending") return false;
			}

			if (!q) return true;
			return (
				entry.url.toLowerCase().includes(q) ||
				entry.method.toLowerCase().includes(q) ||
				(entry.requestBody &&
					JSON.stringify(entry.requestBody)
						.toLowerCase()
						.includes(q)) ||
				(entry.responseBody &&
					JSON.stringify(entry.responseBody)
						.toLowerCase()
						.includes(q))
			);
		});
	});

	const filteredWsLogs = $derived.by(() => {
		const q = searchInput.trim().toLowerCase();
		return networkLoggerState.wsLogs.filter((entry) => {
			if (wsDirectionFilter === "sent" && entry.direction !== "sent")
				return false;
			if (
				wsDirectionFilter === "received" &&
				entry.direction !== "received"
			)
				return false;

			if (!q) return true;
			return (
				entry.type.toLowerCase().includes(q) ||
				(entry.payload &&
					JSON.stringify(entry.payload).toLowerCase().includes(q))
			);
		});
	});

	const selectedHttpEntry = $derived.by<HttpLogEntry | undefined>(() => {
		if (!networkLoggerState.selectedHttpId) return undefined;
		return networkLoggerState.httpLogs.find(
			(e) => e.id === networkLoggerState.selectedHttpId,
		);
	});

	const selectedWsEntry = $derived.by<WsLogEntry | undefined>(() => {
		if (!networkLoggerState.selectedWsId) return undefined;
		return networkLoggerState.wsLogs.find(
			(e) => e.id === networkLoggerState.selectedWsId,
		);
	});

	function selectHttp(id: string) {
		networkLoggerState.selectedHttpId = id;
		mobileView = "detail";
	}

	function selectWs(id: string) {
		networkLoggerState.selectedWsId = id;
		mobileView = "detail";
	}
</script>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Header -->
	<div
		class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
			>
				<PulseIcon class="size-4.5" weight="bold" />
			</div>
			<div>
				<h2 class="text-base leading-tight font-semibold">
					请求与网络日志
				</h2>
				<p class="text-xs text-muted-foreground">
					监控所有对外的 HTTP 请求和实时 WebSocket 消息
				</p>
			</div>
		</div>

		<!-- Tabs & Status -->
		<div class="flex items-center gap-2">
			<div class="flex items-center rounded-lg bg-muted p-0.5 text-xs">
				<button
					type="button"
					class={[
						"flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
						{
							"bg-background text-foreground shadow-xs":
								networkLoggerState.activeTab === "http",
							"text-muted-foreground hover:text-foreground":
								networkLoggerState.activeTab !== "http",
						},
					]}
					onclick={() => {
						networkLoggerState.activeTab = "http";
						mobileView = "list";
					}}
				>
					<span>HTTP 请求</span>
					<Badge variant="secondary" class="h-4.5 px-1.5 text-3xs">
						{networkLoggerState.httpLogs.length}
					</Badge>
				</button>

				<button
					type="button"
					class={[
						"flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
						{
							"bg-background text-foreground shadow-xs":
								networkLoggerState.activeTab === "ws",
							"text-muted-foreground hover:text-foreground":
								networkLoggerState.activeTab !== "ws",
						},
					]}
					onclick={() => {
						networkLoggerState.activeTab = "ws";
						mobileView = "list";
					}}
				>
					<span
						class={[
							"size-2 rounded-full",
							{
								"animate-pulse bg-emerald-500":
									networkLoggerState.wsConnected,
								"bg-muted-foreground/50":
									!networkLoggerState.wsConnected,
							},
						]}
					></span>
					<span>WebSocket</span>
					<Badge variant="secondary" class="h-4.5 px-1.5 text-3xs">
						{networkLoggerState.wsLogs.length}
					</Badge>
				</button>
			</div>

			<!-- Clear button -->
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
				onclick={() => networkLoggerState.clear()}
				title="清空当前 Tab 日志"
			>
				<TrashIcon class="size-4" />
			</Button>

			{#if !standalone}
				<!-- Detach to independent OS window button -->
				<Button
					variant="ghost"
					size="icon-sm"
					class="text-muted-foreground hover:bg-primary/10 hover:text-primary"
					onclick={() => onDetach?.()}
					title="拆为独立窗口 (一边操作一边观察)"
				>
					<ArrowSquareOutIcon class="size-4" />
				</Button>

				<!-- Close button -->
				<Button
					variant="ghost"
					size="icon-sm"
					class="text-muted-foreground hover:text-foreground"
					onclick={() => onClose?.()}
					title="关闭弹窗"
				>
					<XIcon class="size-4" />
				</Button>
			{/if}
		</div>
	</div>

	<!-- Toolbar: Filters & Search -->
	<div
		class="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-background/50 px-4 py-2"
	>
		<!-- Search -->
		<div class="relative max-w-sm min-w-56 flex-1">
			<MagnifyingGlassIcon
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="text"
				placeholder={networkLoggerState.activeTab === "http"
					? "过滤 URL / 方法 / 参数 / 响应内容..."
					: "过滤事件类型 / 载荷内容..."}
				bind:value={searchInput}
				class="h-7.5 bg-muted/30 ps-8 text-xs"
			/>
			{#if searchInput}
				<button
					type="button"
					class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					onclick={() => (searchInput = "")}
				>
					<XIcon class="size-3" />
				</button>
			{/if}
		</div>

		<!-- Filter Pills -->
		<div class="flex flex-wrap items-center gap-2 text-xs">
			{#if networkLoggerState.activeTab === "http"}
				<div class="flex items-center gap-1">
					<span class="me-1 text-2xs text-muted-foreground"
						>渠道:</span
					>
					{#each CHANNEL_FILTERS as filter (filter.id)}
						<button
							type="button"
							class={[
								"rounded-md px-2 py-0.5 text-2xs font-medium transition-colors",
								{
									"bg-primary font-semibold text-primary-foreground":
										channelFilter === filter.id,
									"text-muted-foreground hover:bg-muted/50 hover:text-foreground":
										channelFilter !== filter.id,
								},
							]}
							onclick={() => (channelFilter = filter.id)}
						>
							{filter.label}
						</button>
					{/each}
				</div>
				<div class="h-3.5 w-px bg-border/60"></div>
				<div class="flex items-center gap-1">
					<span class="me-1 text-2xs text-muted-foreground"
						>状态:</span
					>
					{#each HTTP_FILTERS as filter (filter.id)}
						<button
							type="button"
							class={[
								"rounded-md px-2 py-0.5 text-2xs font-medium transition-colors",
								{
									"bg-secondary font-semibold text-secondary-foreground":
										httpStatusFilter === filter.id,
									"text-muted-foreground hover:bg-muted/50 hover:text-foreground":
										httpStatusFilter !== filter.id,
								},
							]}
							onclick={() => (httpStatusFilter = filter.id)}
						>
							{filter.label}
						</button>
					{/each}
				</div>
			{:else}
				<span class="me-1 text-2xs text-muted-foreground">方向:</span>
				{#each WS_FILTERS as filter (filter.id)}
					<button
						type="button"
						class={[
							"rounded-md px-2 py-0.5 text-2xs font-medium transition-colors",
							{
								"bg-secondary font-semibold text-secondary-foreground":
									wsDirectionFilter === filter.id,
								"text-muted-foreground hover:bg-muted/50 hover:text-foreground":
									wsDirectionFilter !== filter.id,
							},
						]}
						onclick={() => (wsDirectionFilter = filter.id)}
					>
						{filter.label}
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Main Split View -->
	<div class="relative flex min-h-0 w-full flex-1 overflow-hidden">
		<!-- LEFT PANE: List -->
		<div
			class={[
				"scrollbar-thin flex flex-col overflow-y-auto border-r border-border bg-card transition-all",
				{
					"hidden lg:flex lg:w-[380px] lg:min-w-[340px] lg:shrink-0":
						mobileView === "detail",
					"w-full lg:w-[380px] lg:min-w-[340px] lg:shrink-0":
						mobileView !== "detail",
				},
			]}
		>
			{#if networkLoggerState.activeTab === "http"}
				<HttpLogList
					logs={filteredHttpLogs}
					selectedId={networkLoggerState.selectedHttpId ?? undefined}
					onSelect={selectHttp}
				/>
			{:else}
				<WsLogList
					logs={filteredWsLogs}
					selectedId={networkLoggerState.selectedWsId ?? undefined}
					onSelect={selectWs}
				/>
			{/if}
		</div>

		<!-- RIGHT PANE: Details -->
		<div
			class={[
				"scrollbar-thin min-w-0 flex-1 flex-col overflow-y-auto bg-card p-4 transition-all",
				{
					"hidden lg:flex": mobileView === "list",
					"flex w-full": mobileView !== "list",
				},
			]}
		>
			{#if networkLoggerState.activeTab === "http"}
				<HttpLogDetail
					entry={selectedHttpEntry}
					onBack={() => (mobileView = "list")}
				/>
			{:else}
				<WsLogDetail
					entry={selectedWsEntry}
					onBack={() => (mobileView = "list")}
				/>
			{/if}
		</div>
	</div>
</div>
