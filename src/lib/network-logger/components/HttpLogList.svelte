<script lang="ts">
	import PulseIcon from "phosphor-svelte/lib/PulseIcon";
	import SpinnerGapIcon from "phosphor-svelte/lib/SpinnerGapIcon";

	import type { HttpLogEntry } from "../types";

	let {
		logs,
		selectedId,
		onSelect,
	}: {
		logs: HttpLogEntry[];
		selectedId?: string;
		onSelect: (id: string) => void;
	} = $props();
</script>

{#if logs.length === 0}
	<div
		class="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"
	>
		<PulseIcon class="mb-2 size-8 opacity-40" />
		<p class="text-xs">暂无符合条件的 HTTP 请求记录</p>
		<p class="mt-1 text-2xs text-muted-foreground/70">
			在应用中浏览用户、切换定位或发送消息将记录请求
		</p>
	</div>
{:else}
	<div class="divide-y divide-border/60">
		{#each logs as req (req.id)}
			{@const isSelected = req.id === selectedId}
			<button
				type="button"
				class={[
					"flex w-full cursor-pointer flex-col gap-1 p-2.5 text-left transition-colors hover:bg-muted/40",
					{
						"border-l-3 border-primary bg-primary/10": isSelected,
						"border-l-3 border-transparent": !isSelected,
					},
				]}
				onclick={() => onSelect(req.id)}
			>
				<div class="flex items-center justify-between gap-1">
					<div class="flex min-w-0 items-center gap-1.5">
						<!-- Channel badge -->
						{#if req.channel}
							<span
								class={[
									"rounded px-1.5 py-0.5 text-3xs font-semibold tracking-wider uppercase",
									{
										"bg-amber-500/15 text-amber-600 dark:text-amber-400":
											req.channel === "grindr",
										"bg-blue-500/15 text-blue-600 dark:text-blue-400":
											req.channel === "scruff",
										"bg-orange-500/15 text-orange-600 dark:text-orange-400":
											req.channel === "jackd",
										"bg-pink-500/15 text-pink-600 dark:text-pink-400":
											req.channel === "heesay",
										"bg-purple-500/15 text-purple-600 dark:text-purple-400":
											req.channel === "sub",
									},
								]}
							>
								{req.channel}
							</span>
						{/if}

						<!-- Method badge -->
						<span
							class={[
								"rounded px-1.5 py-0.5 font-mono text-3xs font-bold",
								{
									"bg-sky-500/15 text-sky-600 dark:text-sky-400":
										req.method === "GET",
									"bg-emerald-500/15 text-emerald-600 dark:text-emerald-400":
										req.method === "POST",
									"bg-amber-500/15 text-amber-600 dark:text-amber-400":
										req.method === "PUT",
									"bg-rose-500/15 text-rose-600 dark:text-rose-400":
										req.method === "DELETE",
									"bg-neutral-500/15 text-neutral-400": ![
										"GET",
										"POST",
										"PUT",
										"DELETE",
									].includes(req.method),
								},
							]}
						>
							{req.method}
						</span>

						<!-- Status badge -->
						{#if req.status === "pending"}
							<span
								class="flex items-center gap-1 font-mono text-3xs text-amber-500"
							>
								<SpinnerGapIcon class="size-3 animate-spin" />
								<span>pending</span>
							</span>
						{:else if typeof req.status === "number"}
							<span
								class={[
									"rounded px-1 py-0.5 font-mono text-3xs font-semibold",
									{
										"bg-emerald-500/10 text-emerald-500":
											req.status >= 200 &&
											req.status < 300,
										"bg-sky-500/10 text-sky-400":
											req.status >= 300 &&
											req.status < 400,
										"bg-rose-500/15 font-bold text-rose-500":
											req.status >= 400,
									},
								]}
							>
								{req.status}
							</span>
						{:else}
							<span
								class="font-mono text-3xs font-semibold text-rose-500"
								>失败</span
							>
						{/if}
					</div>

					<!-- Duration & Time -->
					<div
						class="flex shrink-0 items-center gap-1.5 font-mono text-3xs text-muted-foreground"
					>
						{#if req.durationMs !== undefined}
							<span
								class={[
									{ "text-amber-500": req.durationMs > 1000 },
								]}>{req.durationMs}ms</span
							>
						{/if}
						<span>{req.timeStr}</span>
					</div>
				</div>

				<!-- URL / Path -->
				<div
					class="max-w-full truncate font-mono text-xs text-foreground/90"
				>
					{req.path || req.url}
				</div>
			</button>
		{/each}
	</div>
{/if}
