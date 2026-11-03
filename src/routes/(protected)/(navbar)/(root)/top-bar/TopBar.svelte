<script lang="ts">
	import ChannelSwitcher from "$lib/channel/components/ChannelSwitcher.svelte";
	import CommandCenterTrigger from "$lib/components/command-center/CommandCenterTrigger.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import TopMenu from "$lib/network-logger/TopMenu.svelte";
	import { topChrome } from "$lib/util/screen-chrome.svelte";
	import GridFilters from "../GridFilters.svelte";
	import LocationChange from "../LocationChange.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let openFilters = $state({ all: false, age: false, position: false });
</script>

<ProgressiveBlur
	data-fixed-header
	class="fixed top-0 left-0 z-30 w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-fixed-header"
	direction="topToBottom"
	{@attach topChrome}
>
	<div class="flex items-center justify-between gap-1 p-4 pt-0">
		<div
			data-scroll-intent="x"
			class="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
		>
			<ChannelSwitcher />
			<LocationChange />
			<QuickFilters bind:openFilters />
		</div>
		<div class="flex shrink-0 items-center gap-1 ps-1">
			<CommandCenterTrigger />
			<TopMenu />
		</div>
	</div>
</ProgressiveBlur>
<GridFilters bind:open={openFilters.all} />
