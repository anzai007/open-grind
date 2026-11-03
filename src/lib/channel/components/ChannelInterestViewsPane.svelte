<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { channelState } from "../channel-state.svelte";
	import type { UniversalGridUser } from "../types";

	let viewers = $state<UniversalGridUser[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	const currentMeta = $derived(channelState.currentMeta);
	const currentAccount = $derived(channelState.currentAccount);
	const hasAccount = $derived(Boolean(currentAccount));

	let lastScopeKey: string | null = null;
	const scopeKey = $derived(
		`${channelState.activeChannel}:${currentAccount?.id ?? "none"}`,
	);

	$effect(() => {
		const key = scopeKey;
		if (lastScopeKey === key) return;
		lastScopeKey = key;
		if (hasAccount) {
			void loadViewers();
		} else {
			viewers = [];
			error = null;
		}
	});

	async function loadViewers(force = false) {
		if (isLoading && !force) return;
		const provider = channelState.currentProvider;
		if (!provider.getViewers) {
			viewers = [];
			return;
		}

		isLoading = true;
		error = null;
		try {
			const res = await provider.getViewers(channelState.currentAccount);
			viewers = res;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="screen-nav-host">
	<div class="pull-scroller overscroll-x-auto">
		<div
			class="mx-auto min-h-overscrollable flex w-full max-w-120 flex-col gap-3 px-4 pt-header-clear-16 pb-nav-clear"
		>
			{#if !hasAccount}
				<div
					class="m-auto flex max-w-sm flex-col items-center justify-center p-8 text-center"
				>
					<div
						class="flex size-14 items-center justify-center rounded-2xl text-white shadow-md"
						style:background-color={currentMeta.brandColor}
					>
						<EyeIcon class="size-8" weight="bold" />
					</div>
					<h3 class="mt-4 text-base font-semibold text-foreground">
						尚未配置 {currentMeta.name} 账号
					</h3>
					<p class="mt-1.5 text-xs text-muted-foreground">
						配置并激活 {currentMeta.name} 账号后，即可在此查看最近谁浏览过你的资料。
					</p>
					<Button
						size="sm"
						class="mt-5 text-xs"
						onclick={() =>
							channelState.openAccountDialog(
								channelState.activeChannel,
							)}
					>
						前往添加账号
					</Button>
				</div>
			{:else}
				<!-- 工具栏 -->
				<div
					class="flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 px-3.5 py-2.5 shadow-2xs backdrop-blur-xs"
				>
					<div class="flex items-center gap-2">
						<span
							class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs"
							style:background-color={currentMeta.brandColor}
						>
							{currentMeta.shortName}
						</span>
						<span class="text-xs font-semibold text-foreground">
							最近来访
						</span>
						<span
							class="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
						>
							{viewers.length}
						</span>
					</div>

					<button
						type="button"
						onclick={() => void loadViewers()}
						disabled={isLoading}
						class="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
						title="刷新来访列表"
					>
						<ArrowsClockwiseIcon
							class={["size-4", { "animate-spin": isLoading }]}
						/>
					</button>
				</div>

				<!-- 来访网格区域 -->
				{#if isLoading && viewers.length === 0}
					<div class="grid grid-cols-3 gap-2">
						{#each Array.from({ length: 12 }, (_, i) => i) as idx (idx)}
							<Skeleton
								class="aspect-3/4 w-full rounded-xl bg-muted/70"
							/>
						{/each}
					</div>
				{:else if error && viewers.length === 0}
					<div
						class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
					>
						<p class="text-xs text-destructive">{error}</p>
						<Button
							size="sm"
							variant="outline"
							class="mt-3 text-xs"
							onclick={() => void loadViewers()}
						>
							重新加载
						</Button>
					</div>
				{:else if viewers.length === 0}
					<div
						class="m-auto flex flex-col items-center justify-center p-12 text-center text-muted-foreground"
					>
						<EyeSlashIcon class="size-12 opacity-30" />
						<p class="mt-3 text-xs">暂无最近来访记录</p>
					</div>
				{:else}
					<div class="grid grid-cols-3 gap-2">
						{#each viewers as viewer (viewer.id)}
							<button
								type="button"
								onclick={() =>
									void channelState.openProfile(viewer.id)}
								class="group relative aspect-3/4 w-full overflow-hidden rounded-xl border border-border/40 bg-muted text-left transition-transform active:scale-[0.98]"
							>
								{#if viewer.avatarThumbnailUrl}
									<img
										src={viewer.avatarThumbnailUrl}
										alt={viewer.displayName}
										class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
										loading="lazy"
									/>
								{:else}
									<div
										class="flex size-full items-center justify-center text-xl font-bold text-muted-foreground"
									>
										{viewer.displayName.slice(0, 1)}
									</div>
								{/if}

								<!-- 在线状态指示 -->
								{#if viewer.isOnline}
									<span
										class="absolute top-2 right-2 size-2.5 rounded-full border-2 border-background bg-emerald-500 shadow-xs"
										title="在线"
									></span>
								{/if}

								<!-- 底部半透明名字遮罩 -->
								<div
									class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-2 text-white"
								>
									<div
										class="flex items-center justify-between gap-1"
									>
										<span
											class="truncate text-xs leading-tight font-semibold drop-shadow-xs"
										>
											{viewer.displayName}
										</span>
										{#if viewer.age}
											<span
												class="font-mono text-[10px] text-white/80"
											>
												{viewer.age}
											</span>
										{/if}
									</div>
									{#if viewer.headline}
										<p
											class="mt-0.5 line-clamp-1 text-[10px] text-white/70"
										>
											{viewer.headline}
										</p>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
