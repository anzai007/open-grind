<script lang="ts">
	import { goto } from "$app/navigation";
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import ChatCircleDotsIcon from "phosphor-svelte/lib/ChatCircleDotsIcon";
	import HandWavingIcon from "phosphor-svelte/lib/HandWavingIcon";
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";
	import PawPrintIcon from "phosphor-svelte/lib/PawPrintIcon";
	import { toast } from "svelte-sonner";

	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { channelChatState } from "../channel-chat-state.svelte";
	import { channelState } from "../channel-state.svelte";
	import type { UniversalConversation } from "../types";

	let { active }: { active?: boolean } = $props();

	let interactions = $state<UniversalConversation[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let sendingInteractions = $state<Record<string, boolean>>({});

	const currentMeta = $derived(channelState.currentMeta);
	const currentAccount = $derived(channelState.currentAccount);
	const hasAccount = $derived(
		channelState.activeChannel === "sub" || Boolean(currentAccount),
	);
	const isJackd = $derived(channelState.activeChannel === "jackd");
	const isSub = $derived(channelState.activeChannel === "sub");

	let lastScopeKey: string | null = null;
	let hasLoadedForScope = false;
	const scopeKey = $derived(
		`${channelState.activeChannel}:${currentAccount?.id ?? "none"}`,
	);

	$effect(() => {
		const key = scopeKey;
		if (!hasAccount) {
			lastScopeKey = null;
			hasLoadedForScope = false;
			interactions = [];
			error = null;
			return;
		}

		if (lastScopeKey !== key) {
			lastScopeKey = key;
			hasLoadedForScope = false;
			interactions = [];
			error = null;
		}

		if (active && !hasLoadedForScope && !isLoading) {
			hasLoadedForScope = true;
			void loadInteractions();
		}
	});

	async function loadInteractions(force = false) {
		if (isLoading && !force) return;
		const provider = channelState.currentProvider;
		if (!provider.getInteractions) {
			interactions = [];
			return;
		}

		isLoading = true;
		error = null;
		try {
			const res = await provider.getInteractions(
				channelState.currentAccount,
			);
			interactions = res;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			isLoading = false;
		}
	}

	async function handleReplyInteraction(
		targetUserId: string,
		targetName: string,
		e: MouseEvent,
	) {
		e.stopPropagation();
		if (sendingInteractions[targetUserId]) return;
		sendingInteractions[targetUserId] = true;

		try {
			const res = await channelState.sendInteraction(targetUserId);
			if (res.success) {
				toast.success(
					res.message ||
						`已向 ${targetName} 回发 ${currentMeta.interactionName}`,
					{ duration: 2000 },
				);
			} else {
				toast.error(res.message || "互动发送失败", { duration: 2000 });
			}
		} catch (err) {
			toast.error(
				`发送失败: ${err instanceof Error ? err.message : String(err)}`,
				{ duration: 2000 },
			);
		} finally {
			sendingInteractions[targetUserId] = false;
		}
	}

	function handleOpenChat(conv: UniversalConversation, e: MouseEvent) {
		e.stopPropagation();
		channelChatState.openChatWithUser({
			id: conv.targetUserId,
			displayName: conv.targetUserName,
			avatarThumbnailUrl: conv.targetAvatarUrl,
		});
		void goto("/chat");
	}

	function formatTime(timestamp: number): string {
		if (!timestamp) return "";
		const date = new Date(timestamp);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		if (isToday) {
			return date.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
		}
		return date.toLocaleDateString([], {
			month: "numeric",
			day: "numeric",
		});
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
						{#if isJackd}
							<HandWavingIcon class="size-8" weight="bold" />
						{:else}
							<PawPrintIcon class="size-8" weight="bold" />
						{/if}
					</div>
					<h3 class="mt-4 text-base font-semibold text-foreground">
						尚未配置 {currentMeta.name} 账号
					</h3>
					<p class="mt-1.5 text-xs text-muted-foreground">
						配置并激活 {currentMeta.name} 账号后，即可在此查看收到的 {currentMeta.interactionName}
						互动。
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
							收到的 {currentMeta.interactionName}
						</span>
						<span
							class="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
						>
							{interactions.length}
						</span>
					</div>

					<button
						type="button"
						onclick={() => void loadInteractions()}
						disabled={isLoading}
						class="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
						title="刷新互动列表"
					>
						<ArrowsClockwiseIcon
							class={["size-4", { "animate-spin": isLoading }]}
						/>
					</button>
				</div>

				<!-- 互动列表区域 -->
				{#if isLoading && interactions.length === 0}
					<div class="space-y-2">
						{#each Array.from({ length: 6 }, (_, i) => i) as idx (idx)}
							<Skeleton
								class="h-20 w-full rounded-2xl bg-muted/70"
							/>
						{/each}
					</div>
				{:else if error && interactions.length === 0}
					<div
						class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
					>
						<p class="text-xs text-destructive">{error}</p>
						<Button
							size="sm"
							variant="outline"
							class="mt-3 text-xs"
							onclick={() => void loadInteractions()}
						>
							重新加载
						</Button>
					</div>
				{:else if interactions.length === 0}
					<div
						class="m-auto flex flex-col items-center justify-center p-12 text-center text-muted-foreground"
					>
						{#if isJackd}
							<HandWavingIcon class="size-12 opacity-30" />
						{:else}
							<PawPrintIcon class="size-12 opacity-30" />
						{/if}
						<p class="mt-3 text-xs">
							暂无收到的 {currentMeta.interactionName} 互动
						</p>
					</div>
				{:else}
					<div class="space-y-2">
						{#each interactions as item (item.conversationId)}
							<button
								type="button"
								onclick={() =>
									void channelState.openProfile(
										item.targetUserId,
									)}
								class="flex w-full items-center justify-between rounded-2xl border border-border/50 bg-card/60 p-3 text-left shadow-2xs transition-all hover:bg-card/90 active:scale-[0.99]"
							>
								<!-- 左侧头像与信息 -->
								<div
									class="flex min-w-0 flex-1 items-center gap-3"
								>
									<div
										class="relative size-12 shrink-0 overflow-hidden rounded-full bg-muted"
									>
										{#if item.targetAvatarUrl}
											<img
												src={item.targetAvatarUrl}
												alt={item.targetUserName}
												class="size-full object-cover"
												loading="lazy"
											/>
										{:else}
											<div
												class="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground"
											>
												{item.targetUserName.slice(
													0,
													1,
												)}
											</div>
										{/if}
										<span
											class="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border-2 border-background text-[9px] font-bold text-white shadow-xs"
											style:background-color={currentMeta.brandColor}
										>
											{#if isJackd}
												👋
											{:else if isSub}
												❤️
											{:else if channelState.activeChannel === "heesay"}
												💬
											{:else}
												🐾
											{/if}
										</span>
									</div>

									<div class="flex min-w-0 flex-col">
										<div class="flex items-center gap-2">
											<span
												class="truncate text-xs font-semibold text-foreground"
											>
												{item.targetUserName}
											</span>
											{#if item.unreadCount > 0}
												<span
													class="py-0.2 rounded-full bg-primary px-1.5 font-mono text-[9px] font-bold text-primary-foreground"
												>
													NEW
												</span>
											{/if}
										</div>
										<p
											class="mt-0.5 truncate text-[11px] text-muted-foreground"
										>
											{item.lastMessageText ||
												`向你发送了 ${currentMeta.interactionName}`}
										</p>
										{#if item.lastMessageTimestamp}
											<span
												class="mt-0.5 font-mono text-[10px] text-muted-foreground/70"
											>
												{formatTime(
													item.lastMessageTimestamp,
												)}
											</span>
										{/if}
									</div>
								</div>

								<!-- 右侧快捷操作按钮 -->
								<div
									class="flex shrink-0 items-center gap-1.5 pl-2"
								>
									<Button
										variant="outline"
										size="sm"
										class="h-7 gap-1 px-2 text-xs"
										disabled={Boolean(
											sendingInteractions[
												item.targetUserId
											],
										)}
										onclick={(e) =>
											handleReplyInteraction(
												item.targetUserId,
												item.targetUserName,
												e,
											)}
									>
										{#if isJackd}
											<HandWavingIcon class="size-3.5" />
										{:else if isSub}
											<HeartIcon
												class="size-3.5 text-rose-500"
												weight="fill"
											/>
										{:else if channelState.activeChannel === "heesay"}
											<ChatCircleDotsIcon
												class="size-3.5"
											/>
										{:else}
											<PawPrintIcon class="size-3.5" />
										{/if}
										<span>{isSub ? "回赞" : "回发"}</span>
									</Button>
									<Button
										variant="ghost"
										size="sm"
										class="h-7 w-7 p-0"
										onclick={(e) => handleOpenChat(item, e)}
										title="发送私信"
									>
										<ChatCircleDotsIcon class="size-4" />
									</Button>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
