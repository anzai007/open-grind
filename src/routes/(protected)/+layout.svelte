<script lang="ts">
	import { onMount } from "svelte";

	import ChannelAccountsDialog from "$lib/channel/components/ChannelAccountsDialog.svelte";
	import DmTemplateManagerDialog from "$lib/channel/components/DmTemplateManagerDialog.svelte";
	import UniversalProfileDialog from "$lib/channel/components/UniversalProfileDialog.svelte";
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import MediaDropOverlay from "$lib/components/shared/MediaDropOverlay.svelte";
	import { restoreStrandedLocation } from "$lib/entitlements/honduras-hold";
	import NetworkLoggerDialog from "$lib/network-logger/NetworkLoggerDialog.svelte";
	import { listenForKeyboardMedia } from "$lib/platform/keyboard-media.svelte";
	import { listenForMedia } from "$lib/platform/media-intake.svelte";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";
	import { guardDeletedPages } from "$lib/util/deleted-pages";
	import { retryBrokenMediaWhenOnline } from "$lib/util/media-retry-signals";

	let { children }: { children: import("svelte").Snippet } = $props();

	guardDeletedPages();

	$effect(() => startOnlineHeartbeat());
	$effect(() => retryBrokenMediaWhenOnline());
	$effect(() => listenForMedia());
	$effect(() => listenForKeyboardMedia());

	onMount(() => {
		restoreStrandedLocation().catch((error: unknown) => {
			console.error("Could not move back from Honduras", error);
		});
	});
</script>

{@render children()}
<CommandCenter />
<MediaDropOverlay />
<NetworkLoggerDialog />
<ChannelAccountsDialog />
<DmTemplateManagerDialog />
<UniversalProfileDialog />
