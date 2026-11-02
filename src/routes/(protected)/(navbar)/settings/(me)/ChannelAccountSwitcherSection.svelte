<script lang="ts">
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import { toast } from "svelte-sonner";

	import { channelState } from "$lib/channel/channel-state.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { ChannelAccount } from "$lib/channel/types";

	const currentMeta = $derived(channelState.currentMeta);
	const accounts = $derived(
		channelState.accounts[channelState.activeChannel] || [],
	);
	const activeAccountId = $derived(
		channelState.activeAccountIds[channelState.activeChannel],
	);

	function handleSwitchAccount(acc: ChannelAccount) {
		channelState.setActiveAccount(channelState.activeChannel, acc.id);
		toast.success(`已切换账号为: ${acc.name}`);
	}

	function handleOpenAddDialog() {
		channelState.openAccountDialog(channelState.activeChannel);
	}
</script>

<div
	class="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/60 p-3.5 shadow-xs"
>
	<div class="flex items-center justify-between px-1">
		<div class="flex items-center gap-1.5">
			<span
				class="size-2 rounded-full"
				style:background-color={currentMeta.brandColor}
			></span>
			<span class="text-xs font-semibold text-foreground">
				{currentMeta.name} 账号切换 ({accounts.length})
			</span>
		</div>
		<Button
			variant="ghost"
			size="sm"
			onclick={handleOpenAddDialog}
			class="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
		>
			<PlusIcon class="size-3" />
			<span>添加账号</span>
		</Button>
	</div>

	{#if accounts.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-4 text-center text-xs text-muted-foreground"
		>
			<UserIcon class="size-6 opacity-30" />
			<p class="mt-1">尚未添加 {currentMeta.name} 账号</p>
			<Button
				variant="outline"
				size="sm"
				onclick={handleOpenAddDialog}
				class="mt-2 h-7 text-xs"
			>
				立即添加
			</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-1.5">
			{#each accounts as acc (acc.id)}
				{@const isActive = acc.id === activeAccountId}
				<button
					type="button"
					onclick={() => handleSwitchAccount(acc)}
					class={[
						"flex w-full items-center justify-between gap-2.5 rounded-xl border p-2.5 text-left transition-all",
						{
							"border-primary/50 bg-primary/10 shadow-xs":
								isActive,
							"border-border/60 bg-background/50 hover:border-border hover:bg-muted/40":
								!isActive,
						},
					]}
				>
					<div class="flex min-w-0 items-center gap-2.5">
						<Avatar.Root
							class="size-9 shrink-0 border border-border/80"
						>
							{#if acc.avatarUrl}
								<Avatar.Image
									src={acc.avatarUrl}
									alt={acc.name}
								/>
							{/if}
							<Avatar.Fallback
								class="text-xs font-bold text-white"
								style="background-color: {currentMeta.brandColor}"
							>
								{acc.name.slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>

						<div class="flex min-w-0 flex-col">
							<div class="flex items-center gap-1.5">
								<span
									class="truncate text-xs font-medium text-foreground"
								>
									{acc.name}
								</span>
								{#if isActive}
									<Badge
										class="h-3.5 px-1 text-2xs font-bold text-white"
										style="background-color: {currentMeta.brandColor}"
									>
										使用中
									</Badge>
								{/if}
							</div>
							<div
								class="flex items-center gap-2 text-2xs text-muted-foreground"
							>
								<span class="truncate font-mono">
									{acc.accountIdentifier}
								</span>
								{#if acc.lastLocationName}
									<span
										class="shrink-0 font-medium text-foreground/80"
									>
										📍 {acc.lastLocationName}
									</span>
								{/if}
							</div>
						</div>
					</div>

					{#if isActive}
						<CheckIcon
							class="size-4 shrink-0 text-primary"
							weight="bold"
						/>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
