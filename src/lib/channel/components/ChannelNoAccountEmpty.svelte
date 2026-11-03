<script lang="ts">
	import ChatsCircleIcon from "phosphor-svelte/lib/ChatsCircleIcon";

	import { Button } from "$lib/components/ui/button";
	import { channelState } from "../channel-state.svelte";

	const currentMeta = $derived(channelState.currentMeta);
</script>

<div
	class="m-auto flex max-w-sm flex-col items-center justify-center p-8 text-center"
>
	<div
		class="flex size-14 items-center justify-center rounded-2xl text-white shadow-md"
		style:background-color={currentMeta.brandColor}
	>
		<ChatsCircleIcon class="size-8" weight="bold" />
	</div>
	<h3 class="mt-4 text-base font-semibold text-foreground">
		尚未配置 {currentMeta.name} 账号
	</h3>
	<p class="mt-1.5 text-xs text-muted-foreground">
		配置并激活 {currentMeta.name} 账号后，即可同步收发私信消息。
	</p>
	<Button
		size="sm"
		class="mt-5 text-xs"
		onclick={() =>
			channelState.openAccountDialog(channelState.activeChannel)}
	>
		前往添加账号
	</Button>
</div>
