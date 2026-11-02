<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";

	import type { UniversalMessage } from "../types";

	let {
		msg,
		formatTime,
	}: { msg: UniversalMessage; formatTime: (ts: number) => string } = $props();
</script>

<div
	class={[
		"flex flex-col",
		{ "items-end": msg.isFromMe, "items-start": !msg.isFromMe },
	]}
>
	<!-- 消息气泡 -->
	<div
		class={[
			"max-w-[75%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-xs",
			{
				"rounded-tr-xs bg-primary text-primary-foreground":
					msg.isFromMe,
				"rounded-tl-xs bg-muted text-foreground": !msg.isFromMe,
			},
		]}
	>
		{#if msg.mediaUrl}
			<div class="mb-1.5 overflow-hidden rounded-lg">
				<img
					src={msg.mediaUrl}
					alt="Chat Media"
					class="max-h-60 w-auto rounded object-cover"
				/>
			</div>
		{/if}
		{#if msg.text}
			<p class="break-words whitespace-pre-wrap">
				{msg.text}
			</p>
		{/if}
		<div
			class={[
				"mt-1 flex items-center justify-end gap-1 text-[9px]",
				{
					"text-primary-foreground/75": msg.isFromMe,
					"text-muted-foreground": !msg.isFromMe,
				},
			]}
		>
			<span>{formatTime(msg.timestamp)}</span>
			{#if msg.isFromMe}
				{#if msg.status === "sending"}
					<span>· 发送中</span>
				{:else if msg.status === "failed"}
					<span class="text-destructive">· 失败</span>
				{:else}
					<CheckCircleIcon class="size-3" weight="bold" />
				{/if}
			{/if}
		</div>
	</div>
</div>
