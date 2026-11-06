<script lang="ts">
	import { goto } from "$app/navigation";
	import ChatCircleDotsIcon from "phosphor-svelte/lib/ChatCircleDotsIcon";
	import ChatTeardropTextIcon from "phosphor-svelte/lib/ChatTeardropTextIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import HandWavingIcon from "phosphor-svelte/lib/HandWavingIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import PawPrintIcon from "phosphor-svelte/lib/PawPrintIcon";
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import { channelChatState } from "../channel-chat-state.svelte";
	import { channelState } from "../channel-state.svelte";
	import { templateState } from "../template-state.svelte";
	import ProfilePhotoCarousel from "./ProfilePhotoCarousel.svelte";
	import ProfileStatsGrid from "./ProfileStatsGrid.svelte";

	let isInteracting = $state(false);
	let interactionSent = $state(false);
	let quickMessage = $state("");
	let isSendingQuick = $state(false);

	const user = $derived(channelState.selectedUserProfile);
	const currentMeta = $derived(channelState.currentMeta);

	$effect(() => {
		if (channelState.isProfileOpen) {
			interactionSent = false;
		}
	});

	$effect(() => {
		if (user) {
			const avatar =
				user.photos.find((p) => p.isAvatar)?.thumbnailUrl ||
				user.photos[0]?.thumbnailUrl;
			channelChatState.updateConversationUserProfile(user.id, {
				displayName: user.displayName,
				avatarUrl: avatar,
			});
		}
	});

	async function handleSendInteraction() {
		if (!user || isInteracting || interactionSent) return;
		isInteracting = true;

		try {
			const res = await channelState.sendInteraction(user.id);
			if (res.success) {
				interactionSent = true;
				const toastId = toast.success(
					res.message || `已向 ${user.displayName} 发送交互`,
					{ duration: 2000, closeButton: true },
				);
				setTimeout(() => toast.dismiss(toastId), 2000);
			} else {
				const toastId = toast.error(res.message || "交互发送失败", {
					duration: 2000,
					closeButton: true,
				});
				setTimeout(() => toast.dismiss(toastId), 2500);
			}
		} catch (e) {
			const toastId = toast.error(
				`发送失败: ${e instanceof Error ? e.message : String(e)}`,
				{ duration: 2000, closeButton: true },
			);
			setTimeout(() => toast.dismiss(toastId), 2500);
		} finally {
			isInteracting = false;
		}
	}

	function handleStartChat() {
		if (!user) return;
		channelChatState.openChatWithUser({
			id: user.id,
			displayName: user.displayName,
			avatarThumbnailUrl: user.photos?.[0]?.thumbnailUrl,
		});
		channelState.closeProfile();
		void goto("/chat");
	}

	async function handleSendQuickMessage() {
		const text = quickMessage.trim();
		if (!text || !user || isSendingQuick) return;
		isSendingQuick = true;

		try {
			channelChatState.openChatWithUser({
				id: user.id,
				displayName: user.displayName,
				avatarThumbnailUrl: user.photos?.[0]?.thumbnailUrl,
			});

			const sent = await channelChatState.sendMessage(text);
			if (sent) {
				const toastId = toast.success(
					`已向 ${user.displayName || "该用户"} 发送私信`,
					{ duration: 2000, closeButton: true },
				);
				setTimeout(() => toast.dismiss(toastId), 2000);
				quickMessage = "";
			} else {
				const toastId = toast.error("私信发送失败，请稍后重试", {
					duration: 2000,
					closeButton: true,
				});
				setTimeout(() => toast.dismiss(toastId), 2500);
			}
		} catch (e) {
			const toastId = toast.error(
				`发送失败: ${e instanceof Error ? e.message : String(e)}`,
				{ duration: 2000, closeButton: true },
			);
			setTimeout(() => toast.dismiss(toastId), 2500);
		} finally {
			isSendingQuick = false;
		}
	}

	function handleQuickKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSendQuickMessage();
		}
	}
</script>

<Dialog.Root bind:open={channelState.isProfileOpen}>
	<Dialog.Content
		class="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-background p-0 shadow-2xl"
		showCloseButton={false}
	>
		<div
			class="relative flex items-center justify-between border-b border-border/40 px-4 py-3"
		>
			<div class="flex items-center gap-2">
				<span
					class="size-3 shrink-0 rounded-full"
					style:background-color={currentMeta.brandColor}
				></span>
				<span class="text-sm font-semibold">
					{user?.displayName || currentMeta.name + " 资料"}
				</span>
				<Badge
					variant="outline"
					class="h-4.5 px-1.5 font-mono text-[10px] capitalize"
				>
					{channelState.activeChannel}
				</Badge>
			</div>

			<Dialog.Close>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="size-7 rounded-full text-muted-foreground hover:text-foreground"
						aria-label="关闭"
					>
						<XIcon class="size-4" />
					</Button>
				{/snippet}
			</Dialog.Close>
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if channelState.isProfileLoading}
				<div
					class="flex flex-col items-center justify-center py-24 text-muted-foreground"
				>
					<Spinner class="size-8" />
					<span class="mt-3 text-xs">正在载入个人完整资料...</span>
				</div>
			{:else if channelState.profileError}
				<div
					class="flex flex-col items-center justify-center p-8 text-center text-destructive"
				>
					<WarningCircleIcon class="size-10" weight="bold" />
					<p class="mt-2 text-sm font-medium">资料加载失败</p>
					<p class="mt-1 text-xs opacity-80">
						{channelState.profileError}
					</p>
				</div>
			{:else if user}
				<ProfilePhotoCarousel
					photos={user.photos || []}
					displayName={user.displayName}
				/>

				<div class="flex flex-col gap-4 p-5">
					<div class="flex items-start justify-between gap-3">
						<div class="flex flex-col">
							<div class="flex items-center gap-2">
								<h2 class="text-xl font-bold text-foreground">
									{user.displayName}
								</h2>
								{#if user.age}
									<span class="text-lg text-muted-foreground">
										{user.age}
									</span>
								{/if}
							</div>

							<div
								class="mt-1 flex items-center gap-2 text-xs text-muted-foreground"
							>
								{#if user.isOnline}
									<span
										class="flex items-center gap-1 font-medium text-emerald-500"
									>
										<span
											class="size-2 rounded-full bg-emerald-500"
										></span>
										当前在线
									</span>
								{:else if user.lastActiveText}
									<span class="text-muted-foreground/80">
										{user.lastActiveText}
									</span>
								{/if}
								{#if user.distanceText}
									<span>距你 {user.distanceText}</span>
								{/if}
							</div>
						</div>
					</div>

					{#if user.communityTags && user.communityTags.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each user.communityTags as tag (tag)}
								<Badge
									variant="secondary"
									class="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-normal text-primary"
								>
									#{tag}
								</Badge>
							{/each}
						</div>
					{/if}

					{#if user.about}
						<div
							class="rounded-2xl border border-border/60 bg-muted/20 p-3.5"
						>
							<p
								class="text-xs leading-relaxed whitespace-pre-wrap text-foreground"
							>
								{user.about}
							</p>
						</div>
					{/if}

					<ProfileStatsGrid {user} />
				</div>
			{/if}
		</div>

		{#if user}
			<div
				class="flex flex-col gap-2.5 border-t border-border/60 bg-background/95 p-3 backdrop-blur-md"
			>
				<div class="flex items-center gap-2">
					<Input
						placeholder={`发送快捷私信给 ${user.displayName || "该用户"}...`}
						bind:value={quickMessage}
						onkeydown={handleQuickKeyDown}
						disabled={isSendingQuick}
						class="h-9 flex-1 text-xs"
					/>
					<Button
						size="sm"
						disabled={isSendingQuick || !quickMessage.trim()}
						onclick={handleSendQuickMessage}
						class="h-9 gap-1.5 px-3.5 text-xs"
					>
						{#if isSendingQuick}
							<Spinner class="size-3.5" />
						{:else}
							<PaperPlaneRightIcon
								class="size-3.5"
								weight="bold"
							/>
						{/if}
						<span>发送</span>
					</Button>
				</div>

				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						onclick={() => {
							if (user) {
								templateState.openDirectDmDialog({
									channel: channelState.activeChannel,
									userId: user.id,
								});
							}
						}}
						class="h-8.5 flex-1 gap-1.5 text-xs text-primary"
						title="使用私信模版直接发送给该用户"
					>
						<SparkleIcon class="size-3.5" weight="bold" />
						<span>模版私信</span>
					</Button>

					<Button
						variant="outline"
						onclick={handleStartChat}
						class="h-8.5 flex-1 gap-1.5 text-xs"
					>
						<ChatTeardropTextIcon class="size-3.5" />
						<span>完整会话</span>
					</Button>

					<Button
						disabled={isInteracting || interactionSent}
						onclick={handleSendInteraction}
						variant="secondary"
						class="h-8.5 flex-1 gap-1.5 text-xs"
					>
						{#if isInteracting}
							<Spinner class="size-3.5" />
							<span>发送中...</span>
						{:else if interactionSent}
							<CheckIcon class="size-3.5" weight="bold" />
							<span>已发送</span>
						{:else if channelState.activeChannel === "scruff"}
							<PawPrintIcon class="size-3.5" weight="bold" />
							<span>嗷呜 (Woof)</span>
						{:else if channelState.activeChannel === "jackd"}
							<HandWavingIcon class="size-3.5" weight="bold" />
							<span>打招呼 (Wave)</span>
						{:else if channelState.activeChannel === "heesay" || channelState.activeChannel === "sub"}
							<ChatCircleDotsIcon
								class="size-3.5"
								weight="bold"
							/>
							<span>打招呼 (Say Hi)</span>
						{:else}
							<FireIcon class="size-3.5" weight="bold" />
							<span>Tap</span>
						{/if}
					</Button>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
