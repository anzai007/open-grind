<script lang="ts">
	import ArrowDownLeftIcon from "phosphor-svelte/lib/ArrowDownLeftIcon";
	import ArrowsLeftRightIcon from "phosphor-svelte/lib/ArrowsLeftRightIcon";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";

	import type { WsLogEntry } from "../types";

	let {
		logs,
		selectedId,
		onSelect,
	}: {
		logs: WsLogEntry[];
		selectedId?: string;
		onSelect: (id: string) => void;
	} = $props();
</script>

{#if logs.length === 0}
	<div
		class="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"
	>
		<ArrowsLeftRightIcon class="mb-2 size-8 opacity-40" />
		<p class="text-xs">暂无符合条件的 WebSocket 消息记录</p>
	</div>
{:else}
	<div class="divide-y divide-border/60">
		{#each logs as ws (ws.id)}
			{@const isSelected = ws.id === selectedId}
			<button
				type="button"
				class={[
					"flex w-full cursor-pointer flex-col gap-1 p-2.5 text-left transition-colors hover:bg-muted/40",
					{
						"border-l-3 border-primary bg-primary/10": isSelected,
						"border-l-3 border-transparent": !isSelected,
					},
				]}
				onclick={() => onSelect(ws.id)}
			>
				<div class="flex items-center justify-between gap-1">
					<div class="flex min-w-0 items-center gap-1.5">
						{#if ws.channel}
							<span
								class={[
									"rounded px-1.5 py-0.5 text-3xs font-semibold tracking-wider uppercase",
									{
										"bg-amber-500/15 text-amber-600 dark:text-amber-400":
											ws.channel === "grindr",
										"bg-blue-500/15 text-blue-600 dark:text-blue-400":
											ws.channel === "scruff",
										"bg-orange-500/15 text-orange-600 dark:text-orange-400":
											ws.channel === "jackd",
										"bg-pink-500/15 text-pink-600 dark:text-pink-400":
											ws.channel === "heesay",
										"bg-purple-500/15 text-purple-600 dark:text-purple-400":
											ws.channel === "sub",
									},
								]}
							>
								{ws.channel}
							</span>
						{/if}
						{#if ws.direction === "sent"}
							<span
								class="flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-3xs font-medium text-sky-500"
							>
								<ArrowUpRightIcon class="size-3" />
								<span>发送</span>
							</span>
						{:else if ws.direction === "received"}
							<span
								class="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-3xs font-medium text-emerald-500"
							>
								<ArrowDownLeftIcon class="size-3" />
								<span>接收</span>
							</span>
						{:else}
							<span
								class="flex items-center gap-0.5 rounded bg-neutral-500/15 px-1.5 py-0.5 font-mono text-3xs font-medium text-neutral-400"
							>
								<span>系统</span>
							</span>
						{/if}

						{#if ws.status}
							<span
								class="font-mono text-3xs text-muted-foreground"
								>({ws.status})</span
							>
						{/if}
					</div>

					<span
						class="shrink-0 font-mono text-3xs text-muted-foreground"
						>{ws.timeStr}</span
					>
				</div>

				<div
					class="max-w-full truncate font-mono text-xs font-medium text-foreground"
				>
					{ws.type}
				</div>
			</button>
		{/each}
	</div>
{/if}
