<script lang="ts">
	import ArrowCounterClockwiseIcon from "phosphor-svelte/lib/ArrowCounterClockwiseIcon";
	import ChatCircleDotsIcon from "phosphor-svelte/lib/ChatCircleDotsIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { channelState } from "../channel-state.svelte";
	import { templateState } from "../template-state.svelte";
	import {
		CHANNEL_METAS,
		type DmTemplateGroup,
		type SocialChannelType,
	} from "../types";
	import DmTemplateDetailPane from "./DmTemplateDetailPane.svelte";

	let selectedChannel = $state<SocialChannelType>("grindr");
	let selectedGroupCode = $state<string>("");

	// 新建组状态
	let isAddingGroup = $state(false);
	let newGroupName = $state("");

	// 同步当前全局渠道
	$effect(() => {
		if (templateState.isDialogOpen) {
			const activeCh = channelState.activeChannel;
			selectedChannel = activeCh;
			const activeGrp = templateState.getActiveGroup(activeCh);
			selectedGroupCode = activeGrp?.groupCode || "";
		}
	});

	// 当前渠道的模版组列表
	const currentGroups = $derived(templateState.getGroups(selectedChannel));
	const activeGroup = $derived(templateState.getActiveGroup(selectedChannel));

	// 自动选中第一个组或活跃组
	$effect(() => {
		const groups = templateState.getGroups(selectedChannel);
		const active = templateState.getActiveGroup(selectedChannel);
		if (groups.length > 0) {
			if (
				!selectedGroupCode ||
				!groups.some((g) => g.groupCode === selectedGroupCode)
			) {
				selectedGroupCode =
					active?.groupCode || groups[0]?.groupCode || "";
			}
		} else {
			selectedGroupCode = "";
		}
	});

	const currentGroup = $derived<DmTemplateGroup | null>(
		currentGroups.find((g) => g.groupCode === selectedGroupCode) || null,
	);

	function handleCreateGroup() {
		const name = newGroupName.trim();
		if (!name) return;
		const created = templateState.createGroup(selectedChannel, name);
		selectedGroupCode = created.groupCode;
		isAddingGroup = false;
		newGroupName = "";
		toast.success(`已创建模版组「${name}」并设为快捷组`, {
			duration: 2000,
		});
	}

	function handleDeleteGroup(code: string) {
		if (currentGroups.length <= 1) {
			toast.error("至少保留一个模版组", { duration: 2000 });
			return;
		}
		templateState.deleteGroup(selectedChannel, code);
		toast.success("模版组已删除", { duration: 2000 });
		const remaining = templateState.getGroups(selectedChannel);
		selectedGroupCode = remaining[0]?.groupCode || "";
	}

	function handleResetDefaults() {
		templateState.resetToDefaults();
		toast.success("已恢复为官方预置私信模版", { duration: 2000 });
		const active = templateState.getActiveGroup(selectedChannel);
		selectedGroupCode = active?.groupCode || "";
	}

	const CHANNELS: SocialChannelType[] = [
		"grindr",
		"scruff",
		"jackd",
		"heesay",
	];
</script>

<Dialog.Root
	open={templateState.isDialogOpen}
	onOpenChange={(v) => {
		if (!v) templateState.closeDialog();
		else templateState.openDialog();
	}}
>
	<Dialog.Content
		class="flex h-[85vh] max-h-[820px] w-[92vw] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-2xl"
	>
		<!-- 弹窗顶栏 -->
		<Dialog.Header
			class="flex flex-row items-center justify-between border-b border-border/60 px-5 py-3.5"
		>
			<div class="flex items-center gap-2.5">
				<ChatCircleDotsIcon class="size-5 text-primary" weight="bold" />
				<div>
					<Dialog.Title
						class="text-base font-semibold text-foreground"
					>
						私信模版管理 (DM Templates)
					</Dialog.Title>
					<p class="text-[11px] text-muted-foreground">
						按渠道维护招呼语、搭讪模版。支持在首页用户卡片一键随机发送。
					</p>
				</div>
			</div>

			<Dialog.Close>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="size-7 rounded-full text-muted-foreground hover:text-foreground"
						aria-label="关闭"
					>
						<XIcon class="size-4" />
					</Button>
				{/snippet}
			</Dialog.Close>
		</Dialog.Header>

		<!-- 渠道切换 Tab 栏 -->
		<div
			class="flex items-center justify-between border-b border-border/40 bg-muted/20 px-5 py-2"
		>
			<div class="flex items-center gap-1.5">
				{#each CHANNELS as ch (ch)}
					{@const meta = CHANNEL_METAS[ch]}
					{@const isSelected = selectedChannel === ch}
					<button
						type="button"
						onclick={() => (selectedChannel = ch)}
						class={[
							"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
							{
								"bg-background text-foreground shadow-xs ring-1 ring-border/80":
									isSelected,
								"text-muted-foreground hover:bg-muted/60 hover:text-foreground":
									!isSelected,
							},
						]}
					>
						<span
							class="size-2 rounded-full"
							style:background-color={meta.brandColor}
						></span>
						<span>{meta.name}</span>
					</button>
				{/each}
			</div>

			<Button
				variant="outline"
				size="sm"
				onclick={handleResetDefaults}
				class="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
				title="从 ai-growth 数据库同步/重置为默认官方模版"
			>
				<ArrowCounterClockwiseIcon class="size-3.5" />
				<span>读取 ai-growth 默认</span>
			</Button>
		</div>

		<!-- 主体内容：左右分栏 (左侧模版组列表，右侧模版列表) -->
		<div class="flex flex-1 overflow-hidden">
			<!-- 左侧：模版组列表 -->
			<div
				class="flex w-60 shrink-0 flex-col border-r border-border/60 bg-card/30"
			>
				<div
					class="flex items-center justify-between border-b border-border/40 px-3 py-2.5"
				>
					<span class="text-xs font-semibold text-muted-foreground">
						模版组列表
					</span>
					<button
						type="button"
						onclick={() => (isAddingGroup = true)}
						class="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
					>
						<PlusIcon class="size-3" weight="bold" />
						<span>新建组</span>
					</button>
				</div>

				{#if isAddingGroup}
					<div
						class="space-y-2 border-b border-border/40 bg-muted/40 p-2.5"
					>
						<Input
							bind:value={newGroupName}
							placeholder="组名称 (如: 晚间招呼)"
							class="h-7 text-xs"
						/>
						<div class="flex justify-end gap-1.5">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => (isAddingGroup = false)}
								class="h-6 px-2 text-[11px]"
							>
								取消
							</Button>
							<Button
								size="sm"
								onclick={handleCreateGroup}
								class="h-6 px-2 text-[11px]"
							>
								保存
							</Button>
						</div>
					</div>
				{/if}

				<div class="flex-1 space-y-1 overflow-y-auto p-2">
					{#each currentGroups as grp (grp.groupCode)}
						{@const isSelected =
							grp.groupCode === selectedGroupCode}
						{@const isActive =
							grp.groupCode === activeGroup?.groupCode}
						{@const count = templateState.getTemplates(
							selectedChannel,
							grp.groupCode,
						).length}
						<button
							type="button"
							onclick={() => (selectedGroupCode = grp.groupCode)}
							class={[
								"flex w-full flex-col gap-1 rounded-lg p-2.5 text-left text-xs transition-colors",
								{
									"bg-accent font-medium text-accent-foreground":
										isSelected,
									"text-muted-foreground hover:bg-muted/40 hover:text-foreground":
										!isSelected,
								},
							]}
						>
							<div class="flex items-center justify-between">
								<span class="truncate font-semibold"
									>{grp.groupName}</span
								>
								{#if isActive}
									<Badge
										variant="default"
										class="h-4 px-1 text-[9px] font-bold"
									>
										快捷组
									</Badge>
								{/if}
							</div>
							<div
								class="flex items-center justify-between text-[10px] text-muted-foreground"
							>
								<span>{count} 条模版</span>
								{#if grp.languageCode}
									<span class="font-mono uppercase"
										>{grp.languageCode}</span
									>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- 右侧：当前组的模版详情与列表 -->
			<DmTemplateDetailPane
				channel={selectedChannel}
				group={currentGroup}
				groupsCount={currentGroups.length}
				onDeleteGroup={handleDeleteGroup}
			/>
		</div>
	</Dialog.Content>
</Dialog.Root>
