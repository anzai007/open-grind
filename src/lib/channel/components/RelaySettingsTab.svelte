<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import ShieldCheckIcon from "phosphor-svelte/lib/ShieldCheckIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import { toast } from "svelte-sonner";

	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import {
		DEFAULT_RELAY_BASE_URL,
		DEFAULT_RELAY_KEY,
		RelayClient,
	} from "../scruff-protocol/relay-client";

	let showKey = $state(false);
	let isTesting = $state(false);
	let testStatus = $state<"idle" | "success" | "error">("idle");
	let testMessage = $state<string>("");

	async function handleTestRelay() {
		isTesting = true;
		testStatus = "idle";
		testMessage = "";

		try {
			const result = await RelayClient.testConnection(
				DEFAULT_RELAY_BASE_URL,
				DEFAULT_RELAY_KEY,
			);

			if (result.ok) {
				testStatus = "success";
				testMessage = `中继网关通信正常 (HTTP ${result.status})`;
				toast.success("中继网关通信正常");
			} else {
				testStatus = "error";
				testMessage =
					result.message || `中继连接失败 (${result.status})`;
				toast.error(testMessage);
			}
		} catch (e) {
			testStatus = "error";
			testMessage = `网络连接失败: ${e instanceof Error ? e.message : String(e)}`;
			toast.error(testMessage);
		} finally {
			isTesting = false;
		}
	}
</script>

<div class="flex flex-col gap-4 py-1">
	<div
		class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5"
	>
		<ShieldCheckIcon
			class="mt-0.5 size-5 shrink-0 text-primary"
			weight="bold"
		/>
		<div class="flex flex-col gap-1 text-xs">
			<span class="font-medium text-foreground">
				Omni Relay 聚合传输网关
			</span>
			<span class="leading-relaxed text-muted-foreground">
				Scruff 与 Jack'd 渠道共用基于 Omni
				规范的安全中继网关。通过在请求头注入
				<code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
					>omni-key</code
				>、
				<code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
					>omni-platform</code
				>
				与可选独立代理
				<code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
					>omni-proxy</code
				>，实现多协议同构与流量隔离。
			</span>
		</div>
	</div>

	<div class="flex flex-col gap-3">
		<div class="flex flex-col gap-1">
			<label
				for="relay-base-url"
				class="text-xs font-medium text-muted-foreground"
			>
				默认中继接入点 (Relay Base URL)
			</label>
			<Input
				id="relay-base-url"
				type="text"
				readonly
				value={DEFAULT_RELAY_BASE_URL}
				class="h-8 cursor-default bg-muted/40 font-mono text-xs"
			/>
		</div>

		<div class="flex flex-col gap-1">
			<label
				for="relay-default-key"
				class="text-xs font-medium text-muted-foreground"
			>
				全局中继授权密钥 (Default Omni Key)
			</label>
			<div class="relative flex items-center">
				<Input
					id="relay-default-key"
					type={showKey ? "text" : "password"}
					readonly
					value={DEFAULT_RELAY_KEY}
					class="h-8 cursor-default bg-muted/40 pr-9 font-mono text-xs"
				/>
				<button
					type="button"
					onclick={() => (showKey = !showKey)}
					class="absolute right-2 text-muted-foreground hover:text-foreground"
				>
					{#if showKey}
						<EyeSlashIcon class="size-4" />
					{:else}
						<EyeIcon class="size-4" />
					{/if}
				</button>
			</div>
		</div>
	</div>

	{#if testStatus === "success"}
		<div
			class="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400"
		>
			<CheckCircleIcon class="size-4 shrink-0" weight="bold" />
			<span>{testMessage}</span>
		</div>
	{:else if testStatus === "error"}
		<div
			class="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
		>
			<WarningCircleIcon class="size-4 shrink-0" weight="bold" />
			<span>{testMessage}</span>
		</div>
	{/if}

	<div class="flex justify-end pt-2">
		<Button
			variant="outline"
			size="sm"
			disabled={isTesting}
			onclick={handleTestRelay}
			class="h-8 gap-1.5 text-xs"
		>
			{#if isTesting}
				<Spinner class="size-3.5" />
				<span>网关连通性测试中...</span>
			{:else}
				<ArrowsClockwiseIcon class="size-3.5" />
				<span>测试中继连通性</span>
			{/if}
		</Button>
	</div>
</div>
