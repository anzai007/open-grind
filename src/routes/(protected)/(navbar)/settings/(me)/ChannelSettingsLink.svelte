<script lang="ts">
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import UsersThreeIcon from "phosphor-svelte/lib/UsersThreeIcon";

	import { channelState } from "$lib/channel/channel-state.svelte";
	import * as Item from "$lib/components/ui/item";
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<button
			type="button"
			onclick={() => channelState.openAccountDialog()}
			{...props}
			class="w-full text-left"
		>
			<Item.Media>
				<UsersThreeIcon weight="fill" class="size-5" />
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title
					class="inline-block w-full min-w-0 truncate text-left"
				>
					多渠道与账号设置 (Channels & Accounts)
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</button>
	{/snippet}
</Item.Root>
