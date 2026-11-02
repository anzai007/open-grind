<script lang="ts">
	import ChatTeardropTextIcon from "phosphor-svelte/lib/ChatTeardropTextIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import HandWavingIcon from "phosphor-svelte/lib/HandWavingIcon";
	import PawPrintIcon from "phosphor-svelte/lib/PawPrintIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { channelState } from "../channel-state.svelte";
	import ProfilePhotoCarousel from "./ProfilePhotoCarousel.svelte";
	import ProfileStatsGrid from "./ProfileStatsGrid.svelte";

	let isInteracting = $state(false);
	let interactionSent = $state(false);

	const user = $derived(channelState.selectedUserProfile);
	const currentMeta = $derived(channelState.currentMeta);

	$effect(() => {
		if (channelState.isProfileOpen) {
			interactionSent = false;
		}
	});

	async function handleSendInteraction() {
		if (!user || isInteracting || interactionSent) return;
		isInteracting = true;

		try {
			const res = await channelState.sendInteraction(user.id);
			if (res.success) {
				interactionSent = true;
				toast.success(
					res.message || `已向 ${user.displayName} 发送交互`,
				);
			} else {
				toast.error(res.message || "交互发送失败");
			}
		} catch (e) {
			toast.error(
				`发送失败: ${e instanceof Error ? e.message : String(e)}`,
			);
		} finally {
			isInteracting = false;
		}
	}
</script>

<Dialog.Root bind:open={channelState.isProfileOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs"
		/>
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border bg-background p-0 shadow-2xl"
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
						<span class="mt-3 text-xs">正在载入个人完整资料...</span
						>
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
									<h2
										class="text-xl font-bold text-foreground"
									>
										{user.displayName}
									</h2>
									{#if user.age}
										<span
											class="text-lg text-muted-foreground"
										>
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
					class="flex items-center gap-2 border-t border-border/60 bg-background p-3"
				>
					<Button
						variant="outline"
						onclick={() =>
							toast.info("消息发送会话系统将于 Phase 4 正式接入")}
						class="h-9 flex-1 gap-2 text-xs"
					>
						<ChatTeardropTextIcon class="size-4" />
						<span>发私信</span>
					</Button>

					<Button
						disabled={isInteracting || interactionSent}
						onclick={handleSendInteraction}
						class="h-9 flex-1 gap-2 text-xs"
					>
						{#if isInteracting}
							<Spinner class="size-4" />
							<span>发送中...</span>
						{:else if interactionSent}
							<CheckIcon class="size-4" weight="bold" />
							<span>已发送</span>
						{:else if channelState.activeChannel === "scruff"}
							<PawPrintIcon class="size-4" weight="bold" />
							<span>嗷呜 (Woof)</span>
						{:else if channelState.activeChannel === "jackd"}
							<HandWavingIcon class="size-4" weight="bold" />
							<span>打招呼 (Wave)</span>
						{:else}
							<FireIcon class="size-4" weight="bold" />
							<span>Tap</span>
						{/if}
					</Button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
