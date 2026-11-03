<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { networkLoggerState } from "./network-logger-state.svelte";
	import NetworkLoggerView from "./NetworkLoggerView.svelte";
</script>

<Dialog.Root bind:open={networkLoggerState.open}>
	<Dialog.Content
		class="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1560px] min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-2xl sm:max-w-none"
		style="width: min(96vw, 1560px); max-width: 96vw;"
		showCloseButton={false}
	>
		<NetworkLoggerView
			standalone={false}
			onClose={() => (networkLoggerState.open = false)}
			onDetach={() => {
				networkLoggerState.open = false;
				void networkLoggerState.openDetachedWindow();
			}}
		/>
	</Dialog.Content>
</Dialog.Root>
