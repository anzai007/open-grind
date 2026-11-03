<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import UserCirclePlusIcon from "phosphor-svelte/lib/UserCirclePlusIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";

	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { decodeGeohash } from "$lib/model/geohash";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { channelGridState } from "../channel-grid-state.svelte";
	import { channelState } from "../channel-state.svelte";

	let { geohash }: { geohash: string } = $props();

	const hasAccount = $derived(
		(channelState.accounts[channelState.activeChannel]?.length ?? 0) > 0,
	);
	const currentMeta = $derived(channelState.currentMeta);

	$effect(() => {
		if (!hasAccount) return;
		channelState.recordCurrentLocation(geohash);
		try {
			const { lat, lon } = decodeGeohash(geohash);
			void channelGridState.load(lat, lon, undefined, geohash);
		} catch (e) {
			console.error("Failed to decode geohash:", e);
		}
	});

	function handleOpenAddAccount() {
		channelState.openAccountDialog(channelState.activeChannel);
	}

	function handleRetry() {
		try {
			const { lat, lon } = decodeGeohash(geohash);
			void channelGridState.load(lat, lon, undefined, geohash, true);
		} catch (e) {
			console.error("Retry failed:", e);
		}
	}
</script>

<div class="relative flex flex-1 flex-col">
	{#if !hasAccount}
		<div
			class="mx-auto my-12 flex max-w-sm flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center"
		>
			<div
				class="flex size-14 items-center justify-center rounded-2xl text-white shadow-md"
				style:background-color={currentMeta.brandColor}
			>
				<UserCirclePlusIcon class="size-8" weight="bold" />
			</div>
			<h3 class="mt-4 text-base font-semibold text-foreground">
				尚未配置 {currentMeta.name} 账号
			</h3>
			<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
				配置您的 {currentMeta.name} 注册账号，即可通过安全中继网关同步漫游位置并加载真实附近用户。
			</p>
			<Button
				onclick={handleOpenAddAccount}
				size="sm"
				class="mt-5 gap-1.5 text-xs"
			>
				<PlusIcon class="size-4" />
				<span>添加并激活账号</span>
			</Button>
		</div>
	{:else if channelGridState.loading && channelGridState.items.length === 0}
		<div class="photo-grid">
			{#each Array.from({ length: 24 }, (_, i) => i) as i (i)}
				<div
					class="aspect-square animate-pulse rounded-xl bg-muted/60"
				></div>
			{/each}
		</div>
	{:else if channelGridState.error && channelGridState.items.length === 0}
		<div
			class="mx-auto my-12 flex max-w-md flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center"
		>
			<WarningCircleIcon class="size-10 text-destructive" weight="bold" />
			<h3 class="mt-3 text-sm font-medium text-destructive">
				{currentMeta.name} 数据获取失败
			</h3>
			<p class="mt-1 text-xs break-all text-muted-foreground">
				{channelGridState.error}
			</p>
			<Button
				variant="outline"
				size="sm"
				onclick={handleRetry}
				class="mt-4 gap-1.5 text-xs"
			>
				<ArrowsClockwiseIcon class="size-3.5" />
				<span>重试加载</span>
			</Button>
		</div>
	{:else}
		{#if channelGridState.items.length === 0}
			<div
				class="mx-auto my-16 flex flex-col items-center justify-center text-center text-muted-foreground"
			>
				<UserIcon class="size-12 opacity-30" />
				<p class="mt-3 text-sm">附近暂无发现 {currentMeta.name} 用户</p>
				<p class="text-xs opacity-70">
					可尝试切换定位地点或调整筛选条件
				</p>
			</div>
		{/if}

		<div class="photo-grid">
			{#each channelGridState.items as user (user.id)}
				<button
					type="button"
					onclick={() => channelState.openProfile(user.id)}
					class="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-muted/40 text-left transition-transform outline-none hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#if user.avatarThumbnailUrl}
						<img
							src={user.avatarThumbnailUrl}
							alt={user.displayName}
							class="h-full w-full object-cover transition-opacity duration-300"
							loading="lazy"
						/>
					{:else}
						<div
							class="flex h-full w-full items-center justify-center bg-muted text-lg font-semibold text-muted-foreground"
						>
							{user.displayName.slice(0, 1)}
						</div>
					{/if}

					{#if user.isOnline}
						<span
							class="absolute top-2 right-2 size-2.5 rounded-full bg-emerald-500 ring-2 ring-black/40"
							title="当前在线"
						></span>
					{/if}

					<span
						class="absolute top-2 left-2 rounded px-1 py-0.5 font-mono text-[9px] font-bold text-white shadow-xs"
						style:background-color={currentMeta.brandColor}
					>
						{currentMeta.shortName}
					</span>

					<div
						class="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2 text-white"
					>
						<div class="flex min-w-0 items-baseline gap-1">
							<span
								class="truncate text-xs font-semibold drop-shadow-sm"
							>
								{user.displayName}
							</span>
							{#if user.age}
								<span class="shrink-0 text-[11px] opacity-80">
									{user.age}
								</span>
							{/if}
						</div>

						{#if user.distanceText}
							<span class="text-[10px] text-white/70">
								{user.distanceText}
							</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>

		{#if channelGridState.hasNext}
			<div
				class="flex items-center justify-center py-6 text-muted-foreground"
				use:observeIntersection={{
					handle: () => void channelGridState.loadMore(),
					rootMargin: "400px",
				}}
			>
				{#if channelGridState.isLoadingMore}
					<div class="flex items-center gap-2 text-xs">
						<Spinner class="size-4" />
						<span>加载更多 {currentMeta.name} 用户...</span>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
