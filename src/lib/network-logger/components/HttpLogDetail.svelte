<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import PulseIcon from "phosphor-svelte/lib/PulseIcon";
	import SpinnerGapIcon from "phosphor-svelte/lib/SpinnerGapIcon";
	import TerminalIcon from "phosphor-svelte/lib/TerminalIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import { toast } from "svelte-sonner";

	import { Button } from "$lib/components/ui/button";
	import JsonViewer from "../JsonViewer.svelte";
	import type { HttpLogEntry } from "../types";

	let { entry, onBack }: { entry?: HttpLogEntry; onBack: () => void } =
		$props();

	function copyAsCurl(req: HttpLogEntry) {
		let fullUrl = req.url;
		if (!fullUrl.startsWith("http")) {
			fullUrl = `https://grindrapp.com${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
		}
		let curl = `curl -X ${req.method} '${fullUrl}'`;
		if (req.requestHeaders) {
			for (const [k, v] of Object.entries(req.requestHeaders)) {
				curl += ` \\\n  -H '${k}: ${v}'`;
			}
		}
		if (req.requestBody !== undefined && req.requestBody !== null) {
			const bodyStr =
				typeof req.requestBody === "string"
					? req.requestBody
					: JSON.stringify(req.requestBody);
			curl += ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${bodyStr.replace(/'/g, "'\\''")}'`;
		}
		navigator.clipboard.writeText(curl).then(
			() => toast.success("已复制 cURL 命令"),
			() => toast.error("复制失败"),
		);
	}

	function copyFullLogJson(req: HttpLogEntry) {
		navigator.clipboard.writeText(JSON.stringify(req, null, 2)).then(
			() => toast.success("已复制完整日志 JSON"),
			() => toast.error("复制失败"),
		);
	}
</script>

{#if entry}
	<div class="flex flex-col gap-4">
		<!-- Mobile back button -->
		<div class="mb-1 flex items-center lg:hidden">
			<Button
				variant="ghost"
				size="xs"
				class="gap-1 text-xs"
				onclick={onBack}
			>
				<ArrowLeftIcon class="size-3.5" />
				<span>返回列表</span>
			</Button>
		</div>

		<!-- Overview Card -->
		<div
			class="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<span
						class={[
							"rounded px-2 py-0.5 font-mono text-xs font-bold",
							{
								"bg-sky-500/20 text-sky-500":
									entry.method === "GET",
								"bg-emerald-500/20 text-emerald-500":
									entry.method === "POST",
								"bg-amber-500/20 text-amber-500":
									entry.method === "PUT",
								"bg-rose-500/20 text-rose-500":
									entry.method === "DELETE",
							},
						]}
					>
						{entry.method}
					</span>

					<span
						class={[
							"rounded px-2 py-0.5 font-mono text-xs font-semibold",
							{
								"bg-emerald-500/15 text-emerald-500":
									typeof entry.status === "number" &&
									entry.status >= 200 &&
									entry.status < 300,
								"bg-rose-500/20 font-bold text-rose-500":
									(typeof entry.status === "number" &&
										entry.status >= 400) ||
									entry.status === "failed",
								"bg-amber-500/20 text-amber-500":
									entry.status === "pending",
							},
						]}
					>
						{entry.status}
					</span>

					{#if entry.durationMs !== undefined}
						<span class="font-mono text-xs text-muted-foreground"
							>{entry.durationMs} ms</span
						>
					{/if}
				</div>

				<!-- Quick copy actions -->
				<div class="flex items-center gap-1.5">
					<Button
						variant="secondary"
						size="xs"
						class="h-6 gap-1 text-2xs"
						onclick={() => copyAsCurl(entry)}
						title="复制为 cURL 命令"
					>
						<TerminalIcon class="size-3" />
						<span>复制 cURL</span>
					</Button>

					<Button
						variant="secondary"
						size="xs"
						class="h-6 gap-1 text-2xs"
						onclick={() => copyFullLogJson(entry)}
						title="复制包含请求和响应的完整记录"
					>
						<CopyIcon class="size-3" />
						<span>复制全部</span>
					</Button>
				</div>
			</div>

			<!-- URL -->
			<div
				class="rounded-lg border border-border/40 bg-neutral-950/70 p-2 font-mono text-xs break-all text-foreground/90 select-text"
			>
				{entry.url}
			</div>

			<!-- Query parameters table -->
			{#if entry.queryParams && Object.keys(entry.queryParams).length > 0}
				<div class="mt-1 flex flex-col gap-1">
					<span class="text-2xs font-semibold text-muted-foreground"
						>URL 查询参数 (Query Parameters):</span
					>
					<div
						class="divide-y divide-border/40 rounded-lg border border-border/60 bg-muted/10 font-mono text-xs"
					>
						{#each Object.entries(entry.queryParams) as [key, val] (key)}
							<div
								class="flex items-center justify-between px-2.5 py-1"
							>
								<span class="font-medium text-indigo-400"
									>{key}</span
								>
								<span
									class="max-w-sm truncate text-foreground/90"
									>{val}</span
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Error Alert if failed -->
		{#if entry.error}
			<div
				class="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
			>
				<WarningCircleIcon class="mt-0.5 size-4.5 shrink-0" />
				<div class="flex flex-col gap-0.5">
					<span class="font-semibold">请求发生错误</span>
					<span class="font-mono">{entry.error}</span>
				</div>
			</div>
		{/if}

		<!-- Request Body -->
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<span
					class="flex items-center gap-1.5 text-xs font-semibold text-foreground"
				>
					<span class="size-2 rounded-full bg-blue-500"></span>
					<span>请求数据 (Request Data / Payload)</span>
				</span>
			</div>

			{#if entry.requestBody !== undefined && entry.requestBody !== null}
				<JsonViewer
					title="请求体 (Request Body)"
					data={entry.requestBody}
				/>
			{:else}
				<div
					class="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground/70"
				>
					（该请求无请求体参数）
				</div>
			{/if}
		</div>

		<!-- Response Body -->
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<span
					class="flex items-center gap-1.5 text-xs font-semibold text-foreground"
				>
					<span class="size-2 rounded-full bg-emerald-500"></span>
					<span>返回数据 (Response Data)</span>
				</span>
			</div>

			{#if entry.status === "pending"}
				<div
					class="flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-neutral-950/60 p-6 font-mono text-xs text-amber-500"
				>
					<SpinnerGapIcon class="size-4 animate-spin" />
					<span>请求正在进行中，等待响应...</span>
				</div>
			{:else if entry.responseBody !== undefined && entry.responseBody !== null}
				<JsonViewer
					title="返回结果 (Response Body)"
					data={entry.responseBody}
					maxHeight="max-h-120"
				/>
			{:else}
				<div
					class="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground/70"
				>
					（无返回数据或返回为空）
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div
		class="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"
	>
		<PulseIcon class="mb-2 size-10 opacity-30" />
		<p class="text-sm font-medium">请选择左侧请求项</p>
		<p class="mt-1 text-xs text-muted-foreground/70">
			查看该请求的完整 URL、请求参数与返回数据
		</p>
	</div>
{/if}
