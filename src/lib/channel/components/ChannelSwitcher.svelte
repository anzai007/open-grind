<script lang="ts">
	import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import GearSixIcon from "phosphor-svelte/lib/GearSixIcon";
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { channelState } from "../channel-state.svelte";
	import { templateState } from "../template-state.svelte";
	import {
		CHANNEL_METAS,
		type ChannelAccount,
		type SocialChannelType,
	} from "../types";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	const currentMeta = $derived(channelState.currentMeta);
	const currentAccount = $derived(channelState.currentAccount);
	const activeChannel = $derived(channelState.activeChannel);
	const currentChannelAccounts = $derived(
		channelState.accounts[activeChannel] || [],
	);
	const activeAccountId = $derived(
		channelState.activeAccountIds[activeChannel],
	);

	function handleSwitch(ch: SocialChannelType) {
		channelState.switchChannel(ch);
	}

	function handleSwitchAccount(acc: ChannelAccount) {
		channelState.setActiveAccount(activeChannel, acc.id);
		toast.success(`已切换账号为: ${acc.name}`);
	}

	function handleOpenAddDialog() {
		channelState.openAccountDialog(activeChannel);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="secondary"
				size="sm"
				class={[
					"h-8 gap-1.5 rounded-full px-2.5 text-xs font-semibold shadow-xs transition-colors hover:bg-secondary/80",
					className,
				]}
				aria-label="切换社交渠道"
				title="当前渠道: {currentMeta.name}{currentAccount
					? ` (${currentAccount.name})`
					: ''}"
			>
				<span
					class="size-2.5 shrink-0 rounded-full"
					style:background-color={currentMeta.brandColor}
				></span>
				<span class="max-w-28 truncate">
					{currentMeta.shortName}{currentAccount &&
					activeChannel !== "grindr"
						? ` · ${currentAccount.name}`
						: ""}
				</span>
				<CaretDownIcon class="size-3 text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="start" class="w-60 p-1.5 shadow-xl">
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading
				class="px-2 py-1 text-xs font-medium text-muted-foreground"
			>
				切换活跃渠道
			</DropdownMenu.GroupHeading>

			{#each Object.values(CHANNEL_METAS) as meta (meta.type)}
				{@const isCurrent = meta.type === channelState.activeChannel}
				{@const accountCount =
					channelState.accounts[meta.type]?.length ?? 0}
				<DropdownMenu.Item
					onSelect={() => handleSwitch(meta.type)}
					class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-accent"
				>
					<div class="flex items-center gap-2">
						<span
							class="size-2.5 shrink-0 rounded-full"
							style:background-color={meta.brandColor}
						></span>
						<span
							class={[
								"text-sm font-medium",
								{ "font-semibold": isCurrent },
							]}
						>
							{meta.name}
						</span>
					</div>

					<div class="flex items-center gap-1.5">
						{#if meta.type !== "grindr" && accountCount > 0}
							<Badge
								variant="secondary"
								class="h-4.5 px-1.5 text-[10px]"
							>
								{accountCount}
							</Badge>
						{/if}
						{#if isCurrent}
							<CheckIcon
								class="size-4 text-primary"
								weight="bold"
							/>
						{/if}
					</div>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Group>

		{#if activeChannel !== "grindr"}
			<DropdownMenu.Separator class="my-1" />

			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading
					class="px-2 py-1 text-xs font-medium text-muted-foreground"
				>
					{currentMeta.name} 账号切换
				</DropdownMenu.GroupHeading>

				{#each currentChannelAccounts as acc (acc.id)}
					{@const isAccActive = acc.id === activeAccountId}
					<DropdownMenu.Item
						onSelect={() => handleSwitchAccount(acc)}
						class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent"
					>
						<div class="flex min-w-0 flex-col">
							<span
								class={[
									"truncate text-xs font-medium",
									{
										"font-semibold text-primary":
											isAccActive,
									},
								]}
							>
								{acc.name}
							</span>
							<span
								class="truncate text-[10px] text-muted-foreground"
							>
								{acc.accountIdentifier}{acc.lastLocationName
									? ` · 📍 ${acc.lastLocationName}`
									: ""}
							</span>
						</div>

						{#if isAccActive}
							<CheckIcon
								class="size-3.5 shrink-0 text-primary"
								weight="bold"
							/>
						{/if}
					</DropdownMenu.Item>
				{/each}

				<DropdownMenu.Item
					onSelect={handleOpenAddDialog}
					class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-accent"
				>
					<PlusIcon class="size-3.5" />
					<span>添加新 {currentMeta.name} 账号</span>
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		{/if}

		<DropdownMenu.Separator class="my-1" />

		<DropdownMenu.Item
			onSelect={() => templateState.openDirectDmDialog()}
			class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<PaperPlaneRightIcon class="size-3.5 text-primary" weight="bold" />
			<span>快捷私信指定 (ID/模版)...</span>
		</DropdownMenu.Item>

		<DropdownMenu.Item
			onSelect={() => channelState.openAccountDialog()}
			class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<GearSixIcon class="size-3.5" />
			<span>渠道与账号设置...</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
