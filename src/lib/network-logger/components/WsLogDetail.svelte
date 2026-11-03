<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import ArrowsLeftRightIcon from "phosphor-svelte/lib/ArrowsLeftRightIcon";
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import JsonViewer from "../JsonViewer.svelte";
	import type { WsLogEntry } from "../types";

	let { entry, onBack }: { entry?: WsLogEntry; onBack: () => void } =
		$props();

	function copyFullLogJson(ws: WsLogEntry) {
		navigator.clipboard.writeText(JSON.stringify(ws, null, 2)).then(
			() => toast.success("已复制完整日志 JSON"),
			() => toast.error("复制失败"),
		);
	}
</script>

{#if entry}
	<div class="flex flex-col gap-4">
		<!-- Mobile back button -->
		<div class="mb-1 flex items-center lg:hidden">
			<Button
				variant="ghost"
				size="xs"
				class="gap-1 text-xs"
				onclick={onBack}
			>
				<ArrowLeftIcon class="size-3.5" />
				<span>返回列表</span>
			</Button>
		</div>

		<!-- WS Overview -->
		<div
			class="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					{#if entry.direction === "sent"}
						<Badge class="bg-sky-500/20 text-sky-500"
							>↑ 发送 (Sent)</Badge
						>
					{:else if entry.direction === "received"}
						<Badge class="bg-emerald-500/20 text-emerald-500"
							>↓ 接收 (Received)</Badge
						>
					{:else}
						<Badge class="bg-neutral-500/20 text-neutral-400"
							>系统状态</Badge
						>
					{/if}

					{#if entry.status}
						<span class="font-mono text-xs text-muted-foreground"
							>状态码: {entry.status}</span
						>
					{/if}

					<span class="font-mono text-xs text-muted-foreground"
						>{entry.timeStr}</span
					>
				</div>

				<Button
					variant="secondary"
					size="xs"
					class="h-6 gap-1 text-2xs"
					onclick={() => copyFullLogJson(entry)}
				>
					<CopyIcon class="size-3" />
					<span>复制消息 JSON</span>
				</Button>
			</div>

			<div
				class="rounded-lg border border-border/40 bg-neutral-950/70 p-2 font-mono text-xs text-foreground/90 select-text"
			>
				事件类型: <span class="font-bold text-primary"
					>{entry.type}</span
				>
				{#if entry.ref}
					<div class="mt-0.5 text-2xs text-muted-foreground">
						ref_id: {entry.ref}
					</div>
				{/if}
			</div>
		</div>

		<!-- WS Payload -->
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<span
					class="flex items-center gap-1.5 text-xs font-semibold text-foreground"
				>
					<span class="size-2 rounded-full bg-primary"></span>
					<span>消息数据载荷 (Message Payload)</span>
				</span>
			</div>

			{#if entry.payload !== undefined && entry.payload !== null}
				<JsonViewer
					title="载荷数据 (Payload)"
					data={entry.payload}
					maxHeight="max-h-120"
				/>
			{:else}
				<div
					class="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground/70"
				>
					（无数据载荷）
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div
		class="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"
	>
		<ArrowsLeftRightIcon class="mb-2 size-10 opacity-30" />
		<p class="text-sm font-medium">请选择左侧 WebSocket 消息</p>
		<p class="mt-1 text-xs text-muted-foreground/70">
			查看消息载荷数据与事件详情
		</p>
	</div>
{/if}
