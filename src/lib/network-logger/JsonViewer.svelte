<script lang="ts">
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import { toast } from "svelte-sonner";

	import { Button } from "$lib/components/ui/button";

	let {
		data,
		title,
		maxHeight = "max-h-96",
	}: { data: unknown; title?: string; maxHeight?: string } = $props();

	let copied = $state(false);

	const formattedText = $derived.by(() => {
		if (data === undefined) return "undefined";
		if (data === null) return "null";
		if (typeof data === "string") {
			try {
				const parsed = JSON.parse(data);
				return JSON.stringify(parsed, null, 2);
			} catch {
				return data;
			}
		}
		try {
			return JSON.stringify(data, null, 2);
		} catch {
			return typeof data === "object" && data !== null
				? "[Unserializable Object]"
				: typeof data === "symbol" || typeof data === "bigint"
					? data.toString()
					: "";
		}
	});

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(formattedText);
			copied = true;
			toast.success("已复制到剪贴板");
			setTimeout(() => {
				copied = false;
			}, 1500);
		} catch (e) {
			console.error("Failed to copy", e);
			toast.error("复制失败");
		}
	}

	function syntaxHighlight(json: string): string {
		const escaped = json
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		return escaped.replace(
			/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
			(match) => {
				let cls = "text-amber-600 dark:text-amber-400"; // number
				if (/^"/.test(match)) {
					if (/:$/.test(match)) {
						cls =
							"text-indigo-600 dark:text-indigo-300 font-semibold"; // key
					} else {
						cls = "text-emerald-600 dark:text-emerald-400"; // string
					}
				} else if (/true|false/.test(match)) {
					cls = "text-blue-600 dark:text-blue-400 font-semibold"; // boolean
				} else if (/null/.test(match)) {
					cls = "text-neutral-500 italic"; // null
				}
				return `<span class="${cls}">${match}</span>`;
			},
		);
	}

	const highlightedHtml = $derived.by(() => {
		return syntaxHighlight(formattedText);
	});
</script>

<div
	class="relative flex flex-col overflow-hidden rounded-xl border border-border/80 bg-neutral-950/80 text-foreground"
>
	<div
		class="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
	>
		<span class="font-mono font-medium">{title ?? "JSON 数据"}</span>
		<Button
			variant="ghost"
			size="xs"
			class="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
			onclick={copyToClipboard}
		>
			{#if copied}
				<CheckIcon class="size-3 text-emerald-500" />
				<span>已复制</span>
			{:else}
				<CopyIcon class="size-3" />
				<span>复制</span>
			{/if}
		</Button>
	</div>
	<div
		class={[
			"scrollbar-thin overflow-auto p-3 font-mono text-xs leading-relaxed select-text",
			maxHeight,
		]}
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<pre class="m-0 font-mono whitespace-pre">{@html highlightedHtml}</pre>
	</div>
</div>
