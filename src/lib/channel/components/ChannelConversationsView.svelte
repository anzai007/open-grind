<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import CaretLeftIcon from "phosphor-svelte/lib/CaretLeftIcon";
	import ChatsCircleIcon from "phosphor-svelte/lib/ChatsCircleIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import { tick } from "svelte";

	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import { channelChatState } from "../channel-chat-state.svelte";
	import { channelState } from "../channel-state.svelte";
	import ChannelMessageBubble from "./ChannelMessageBubble.svelte";
	import ChannelNoAccountEmpty from "./ChannelNoAccountEmpty.svelte";

	let messageInput = $state("");
	let messagesContainer: HTMLDivElement | null = $state(null);
	let autoScroll = true;

	const currentMeta = $derived(channelState.currentMeta);
	const activeConv = $derived(channelChatState.activeConversation);
	const hasAccount = $derived(
		(channelState.accounts[channelState.activeChannel]?.length ?? 0) > 0,
	);

	const currentScopeKey = $derived(
		`${channelState.activeChannel}:${channelState.currentAccount?.id ?? "none"}`,
	);
	let lastLoadedScopeKey: string | null = null;

	$effect(() => {
		const key = currentScopeKey;
		if (lastLoadedScopeKey === key) return;
		lastLoadedScopeKey = key;
		channelChatState.activeConversationId = null;
		channelChatState.messages = [];
		channelChatState.switchScope();
		if (hasAccount) {
			void channelChatState.loadConversations();
		}
	});

	// 启动 5 秒静默轮询，实时接收新私信
	$effect(() => {
		channelChatState.startPolling(5000);
		return () => {
			channelChatState.stopPolling();
		};
	});

	// 当消息流更新时，平滑滚动至底部
	$effect(() => {
		const msgCount = channelChatState.messages.length;
		if (msgCount > 0 && autoScroll) {
			void scrollToBottom();
		}
	});

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	function handleScroll() {
		if (!messagesContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
		// 距离底部 60px 以内继续自动滚底
		autoScroll = scrollHeight - scrollTop - clientHeight < 60;
	}

	async function handleSend() {
		const text = messageInput.trim();
		if (!text || channelChatState.isSending) return;

		messageInput = "";
		autoScroll = true;
		await channelChatState.sendMessage(text);
		void scrollToBottom();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
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

	function handleBackToList() {
		channelChatState.activeConversationId = null;
	}

	function handleViewProfile(targetUserId: string) {
		void channelState.openProfile(targetUserId);
	}
</script>

<div class="relative flex h-full w-full flex-1 overflow-hidden bg-background">
	{#if !hasAccount}
		<ChannelNoAccountEmpty />
	{:else}
		<!-- 左侧：会话列表 (在移动端若选中对话则隐藏) -->
		<div
			class={[
				"flex h-full w-full flex-col border-r border-border/60 bg-card/40 md:w-80 md:shrink-0 lg:w-96",
				{ "hidden md:flex": channelChatState.activeConversationId },
			]}
		>
			<!-- 会话列表顶栏 -->
			<div
				class="flex items-center justify-between border-b border-border/60 px-4 py-3"
			>
				<div class="flex items-center gap-2">
					<span
						class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs"
						style:background-color={currentMeta.brandColor}
					>
						{currentMeta.shortName}
					</span>
					<span class="text-sm font-semibold text-foreground">
						私信收件箱
					</span>
				</div>
				<button
					type="button"
					onclick={() => void channelChatState.loadConversations()}
					disabled={channelChatState.isLoadingConversations}
					class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
					title="刷新会话"
				>
					<ArrowsClockwiseIcon
						class={[
							"size-4",
							{
								"animate-spin":
									channelChatState.isLoadingConversations,
							},
						]}
					/>
				</button>
			</div>

			<!-- 会话列表滚动区域 -->
			<div class="flex-1 divide-y divide-border/30 overflow-y-auto">
				{#if channelChatState.isLoadingConversations && channelChatState.conversations.length === 0}
					<div
						class="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground"
					>
						<Spinner class="size-4" />
						<span>正在拉取会话列表...</span>
					</div>
				{:else if channelChatState.conversations.length === 0}
					<div
						class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
					>
						<ChatsCircleIcon class="size-10 opacity-30" />
						<p class="mt-2 text-xs">暂无历史聊天会话</p>
					</div>
				{:else}
					{#each channelChatState.conversations as conv (conv.conversationId)}
						{@const isSelected =
							conv.conversationId ===
							channelChatState.activeConversationId}
						<button
							type="button"
							onclick={() =>
								void channelChatState.selectConversation(
									conv.conversationId,
								)}
							class={[
								"flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50",
								{ "bg-primary/10": isSelected },
							]}
						>
							<!-- 头像 -->
							<div
								class="relative size-12 shrink-0 overflow-hidden rounded-full bg-muted"
							>
								{#if conv.targetAvatarUrl}
									<img
										src={conv.targetAvatarUrl}
										alt={conv.targetUserName}
										class="h-full w-full object-cover"
									/>
								{:else}
									<div
										class="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground"
									>
										{conv.targetUserName.slice(0, 1)}
									</div>
								{/if}
							</div>

							<!-- 会话内容信息 -->
							<div class="flex min-w-0 flex-1 flex-col">
								<div class="flex items-center justify-between">
									<span
										class="truncate text-xs font-semibold text-foreground"
									>
										{conv.targetUserName}
									</span>
									<span
										class="text-[10px] text-muted-foreground"
									>
										{formatTime(conv.lastMessageTimestamp)}
									</span>
								</div>
								<div
									class="mt-1 flex items-center justify-between gap-1"
								>
									<span
										class="truncate text-xs text-muted-foreground"
									>
										{conv.lastMessageText || "点击查看消息"}
									</span>
									{#if conv.unreadCount > 0}
										<span
											class="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-bold text-primary-foreground"
										>
											{conv.unreadCount}
										</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<!-- 右侧：当前会话聊天室 -->
		<div
			class={[
				"flex h-full flex-1 flex-col bg-background/50",
				{ "hidden md:flex": !channelChatState.activeConversationId },
			]}
		>
			{#if activeConv}
				<!-- 聊天室顶栏 -->
				<div
					class="flex items-center justify-between border-b border-border/60 bg-card/30 px-4 py-2.5"
				>
					<div class="flex items-center gap-2.5">
						<button
							type="button"
							onclick={handleBackToList}
							class="rounded-lg p-1 text-muted-foreground hover:bg-muted md:hidden"
						>
							<CaretLeftIcon class="size-5" />
						</button>
						<div
							class="size-9 shrink-0 overflow-hidden rounded-full bg-muted"
						>
							{#if activeConv.targetAvatarUrl}
								<img
									src={activeConv.targetAvatarUrl}
									alt={activeConv.targetUserName}
									class="h-full w-full object-cover"
								/>
							{:else}
								<div
									class="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground"
								>
									{activeConv.targetUserName.slice(0, 1)}
								</div>
							{/if}
						</div>
						<div class="flex flex-col">
							<span class="text-xs font-semibold text-foreground">
								{activeConv.targetUserName}
							</span>
							<span
								class="font-mono text-[10px] text-muted-foreground"
							>
								UID: {activeConv.targetUserId}
							</span>
						</div>
					</div>

					<div class="flex items-center gap-1">
						<button
							type="button"
							onclick={() => {
								if (activeConv) {
									void channelChatState.loadMessages(
										activeConv.conversationId,
									);
								}
							}}
							disabled={channelChatState.isLoadingMessages}
							class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
							title="刷新消息"
						>
							<ArrowsClockwiseIcon
								class={[
									"size-4",
									{
										"animate-spin":
											channelChatState.isLoadingMessages,
									},
								]}
							/>
						</button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() =>
								handleViewProfile(activeConv.targetUserId)}
							class="h-7 gap-1 px-2 text-xs"
						>
							<UserIcon class="size-3.5" />
							<span>查看资料</span>
						</Button>
					</div>
				</div>

				<!-- 聊天消息时间线 -->
				<div
					bind:this={messagesContainer}
					onscroll={handleScroll}
					class="flex-1 space-y-3 overflow-y-auto p-4"
				>
					{#if channelChatState.isLoadingMessages && channelChatState.messages.length === 0}
						<div
							class="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"
						>
							<Spinner class="size-4" />
							<span>加载历史消息中...</span>
						</div>
					{:else if channelChatState.messages.length === 0}
						<div
							class="flex h-full flex-col items-center justify-center text-center text-muted-foreground"
						>
							<ChatsCircleIcon class="size-12 opacity-20" />
							<p class="mt-2 text-xs">
								与 {activeConv.targetUserName} 的对话刚开始
							</p>
						</div>
					{:else}
						{#each channelChatState.messages as msg (msg.id)}
							<ChannelMessageBubble {msg} {formatTime} />
						{/each}
					{/if}
				</div>

				<!-- 发送栏 -->
				<div
					class="flex items-center gap-2 border-t border-border/60 bg-card/40 p-3"
				>
					<Input
						type="text"
						placeholder={`发一条私信给 ${activeConv.targetUserName}...`}
						bind:value={messageInput}
						onkeydown={handleKeyDown}
						class="flex-1 text-xs"
					/>
					<Button
						size="sm"
						onclick={handleSend}
						disabled={!messageInput.trim() ||
							channelChatState.isSending}
						class="gap-1 text-xs"
					>
						{#if channelChatState.isSending}
							<Spinner class="size-3.5" />
						{:else}
							<PaperPlaneRightIcon class="size-3.5" />
						{/if}
						<span>发送</span>
					</Button>
				</div>
			{:else}
				<div
					class="m-auto flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
				>
					<ChatsCircleIcon class="size-12 opacity-30" />
					<p class="mt-3 text-sm">选择左侧联系人开始私信对话</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
