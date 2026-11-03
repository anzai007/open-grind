<script lang="ts">
	import { goto } from "$app/navigation";
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import { channelState } from "$lib/channel/channel-state.svelte";
	import * as Alert from "$lib/components/ui/alert";
	import Link from "$lib/components/ui/link/Link.svelte";

	$effect(() => {
		if (channelState.activeChannel !== "grindr") {
			void goto("/", { replaceState: true });
		}
	});
</script>

<main class="flex flex-1 px-8">
	<Alert.Root class="m-auto w-full max-w-sm">
		<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
		<Alert.Title>Unimplemented</Alert.Title>
		<Alert.Description>
			"Right now" tab is not implemented yet, tracking in <Link
				href="https://git.opengrind.org/open-grind/open-grind/issues/43"
			>
				#43
			</Link>.
		</Alert.Description>
	</Alert.Root>
</main>
