<script lang="ts">
	import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import GearSixIcon from "phosphor-svelte/lib/GearSixIcon";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { channelState } from "../channel-state.svelte";
	import { CHANNEL_METAS, type SocialChannelType } from "../types";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	const currentMeta = $derived(channelState.currentMeta);

	function handleSwitch(ch: SocialChannelType) {
		channelState.switchChannel(ch);
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
				title="当前渠道: {currentMeta.name}"
			>
				<span
					class="size-2.5 shrink-0 rounded-full"
					style:background-color={currentMeta.brandColor}
				></span>
				<span class="max-w-20 truncate">{currentMeta.shortName}</span>
				<CaretDownIcon class="size-3 text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="start" class="w-52 p-1.5 shadow-xl">
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

		<DropdownMenu.Separator class="my-1" />

		<DropdownMenu.Item
			onSelect={() => channelState.openAccountDialog()}
			class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<GearSixIcon class="size-3.5" />
			<span>渠道与账号设置...</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
