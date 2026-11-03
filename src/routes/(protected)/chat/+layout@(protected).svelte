<script lang="ts">
	import { channelState } from "$lib/channel/channel-state.svelte";
	import ChannelConversationsView from "$lib/channel/components/ChannelConversationsView.svelte";
	import NavBar from "$lib/components/shared/NavBar.svelte";
	import LegacyGrindrChatLayout from "./_legacy_grindr/LegacyGrindrChatLayout.svelte";
	import { USE_LEGACY_GRINDR_INBOX } from "./grindr-inbox-config";

	let { data }: import("./$types").LayoutProps = $props();
</script>

{#if USE_LEGACY_GRINDR_INBOX && channelState.activeChannel === "grindr"}
	<LegacyGrindrChatLayout ourProfileId={data.ourProfileId} />
{:else}
	<main
		class="flex h-dvh w-full flex-1 flex-col pt-(--safe-area-top) pb-nav-clear"
	>
		<div
			class="mx-auto flex h-full w-full max-w-300 flex-1 overflow-hidden"
		>
			<ChannelConversationsView />
		</div>
	</main>
	<NavBar ourProfileId={data.ourProfileId} />
{/if}
