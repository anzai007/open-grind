<script lang="ts">
	import ChatCircleDotsIcon from "phosphor-svelte/lib/ChatCircleDotsIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import PencilSimpleIcon from "phosphor-svelte/lib/PencilSimpleIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import { toast } from "svelte-sonner";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { templateState } from "../template-state.svelte";
	import type {
		DmTemplate,
		DmTemplateGroup,
		SocialChannelType,
	} from "../types";

	interface Props {
		channel: SocialChannelType;
		group: DmTemplateGroup | null;
		groupsCount: number;
		onDeleteGroup: (code: string) => void;
	}

	let { channel, group, groupsCount, onDeleteGroup }: Props = $props();

	let isEditingTemplate = $state(false);
	let editingTemplateId = $state<string | null>(null);
	let formTitle = $state("");
	let formContent = $state("");

	const currentTemplates = $derived(
		group ? templateState.getTemplates(channel, group.groupCode) : [],
	);
	const activeGroup = $derived(templateState.getActiveGroup(channel));
	const isCurrentActive = $derived(
		group && activeGroup?.groupCode === group.groupCode,
	);

	function handleSetAsActiveGroup(code: string) {
		templateState.setActiveGroup(channel, code);
		toast.success(
			`已将「${group?.groupName || "该组"}」设为当前快捷发送模版组`,
			{ duration: 2000 },
		);
	}

	function handleOpenAddTemplate() {
		editingTemplateId = null;
		formTitle = `打招呼 ${currentTemplates.length + 1}`;
		formContent = "";
		isEditingTemplate = true;
	}

	function handleOpenEditTemplate(tpl: DmTemplate) {
		editingTemplateId = tpl.id;
		formTitle = tpl.title;
		formContent = tpl.content;
		isEditingTemplate = true;
	}

	function handleSaveTemplate() {
		const title = formTitle.trim();
		const content = formContent.trim();
		if (!title || !content) {
			toast.error("标题与内容不能为空", { duration: 2000 });
			return;
		}

		if (editingTemplateId) {
			templateState.updateTemplate(editingTemplateId, { title, content });
			toast.success("模版修改已保存", { duration: 2000 });
		} else {
			if (!group) return;
			templateState.addTemplate({
				channel,
				groupCode: group.groupCode,
				groupName: group.groupName,
				title,
				content,
				enabled: true,
			});
			toast.success("已添加新私信模版", { duration: 2000 });
		}

		isEditingTemplate = false;
		formTitle = "";
		formContent = "";
		editingTemplateId = null;
	}

	function handleDeleteTemplate(id: string) {
		templateState.deleteTemplate(id);
		toast.success("模版已删除", { duration: 2000 });
	}

	function handleToggleTemplate(tpl: DmTemplate) {
		templateState.updateTemplate(tpl.id, { enabled: !tpl.enabled });
	}

	async function handleCopy(content: string) {
		try {
			await navigator.clipboard.writeText(content);
			toast.success("模版内容已复制到剪贴板", { duration: 2000 });
		} catch {
			toast.error("复制失败", { duration: 2000 });
		}
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden bg-background">
	{#if group}
		<!-- 组操作栏 -->
		<div
			class="flex items-center justify-between border-b border-border/40 px-4 py-2.5"
		>
			<div class="flex items-center gap-2">
				<span class="text-sm font-semibold text-foreground">
					{group.groupName}
				</span>
				{#if isCurrentActive}
					<Badge
						variant="secondary"
						class="gap-1 text-[10px] text-primary"
					>
						<CheckIcon class="size-3" weight="bold" />
						<span>当前快捷发送组</span>
					</Badge>
				{:else}
					<Button
						variant="outline"
						size="sm"
						onclick={() => handleSetAsActiveGroup(group.groupCode)}
						class="h-6 gap-1 px-2 text-[11px]"
					>
						<span>设为快捷组</span>
					</Button>
				{/if}
			</div>

			<div class="flex items-center gap-1.5">
				<Button
					size="sm"
					onclick={handleOpenAddTemplate}
					class="h-7 gap-1 px-2.5 text-xs"
				>
					<PlusIcon class="size-3.5" weight="bold" />
					<span>新增模版</span>
				</Button>
				{#if groupsCount > 1}
					<Button
						variant="ghost"
						size="icon"
						onclick={() => onDeleteGroup(group.groupCode)}
						class="size-7 text-muted-foreground hover:text-destructive"
						title="删除此模版组"
					>
						<TrashIcon class="size-3.5" />
					</Button>
				{/if}
			</div>
		</div>

		<!-- 模版编辑抽屉/表单 -->
		{#if isEditingTemplate}
			<div class="space-y-3 border-b border-border/60 bg-muted/20 p-4">
				<div class="flex items-center justify-between">
					<span class="text-xs font-semibold text-foreground">
						{editingTemplateId ? "编辑模版" : "新增私信模版"}
					</span>
					<span class="text-[11px] text-muted-foreground">
						提示：输入 <code
							class="rounded bg-muted px-1 text-[10px]"
							>&#123;name&#125;</code
						> 可自动填充对方昵称
					</span>
				</div>

				<Input
					bind:value={formTitle}
					placeholder="模版标题 (如: 首次打招呼)"
					class="text-xs"
				/>
				<Textarea
					bind:value={formContent}
					placeholder="私信内容 (如: 哈喽 {name}，看到你在附近，打个招呼～)"
					rows={3}
					class="resize-none text-xs"
				/>

				<div class="flex justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (isEditingTemplate = false)}
						class="h-7 px-3 text-xs"
					>
						取消
					</Button>
					<Button
						size="sm"
						onclick={handleSaveTemplate}
						class="h-7 px-3 text-xs"
					>
						保存模版
					</Button>
				</div>
			</div>
		{/if}

		<!-- 模版列表滚动区 -->
		<div
			class="flex-1 space-y-3 divide-y divide-border/30 overflow-y-auto p-4"
		>
			{#if currentTemplates.length === 0}
				<div
					class="flex flex-col items-center justify-center p-12 text-center text-muted-foreground"
				>
					<ChatCircleDotsIcon class="size-10 opacity-30" />
					<p class="mt-2 text-xs">当前组暂无模版</p>
					<Button
						variant="outline"
						size="sm"
						onclick={handleOpenAddTemplate}
						class="mt-3 h-7 text-xs"
					>
						立即添加
					</Button>
				</div>
			{:else}
				{#each currentTemplates as tpl (tpl.id)}
					<div
						class="group flex flex-col gap-2 rounded-xl border border-border/40 bg-card/40 p-3.5 transition-colors hover:border-border/80"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span
									class="text-xs font-semibold text-foreground"
								>
									{tpl.title}
								</span>
								{#if !tpl.enabled}
									<Badge
										variant="outline"
										class="text-[10px] text-muted-foreground"
									>
										已停用
									</Badge>
								{/if}
							</div>

							<div class="flex items-center gap-1">
								<button
									type="button"
									onclick={() => handleToggleTemplate(tpl)}
									class="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
								>
									{tpl.enabled ? "停用" : "启用"}
								</button>
								<button
									type="button"
									onclick={() => handleCopy(tpl.content)}
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
									title="复制内容"
								>
									<CopyIcon class="size-3.5" />
								</button>
								<button
									type="button"
									onclick={() => handleOpenEditTemplate(tpl)}
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
									title="编辑模版"
								>
									<PencilSimpleIcon class="size-3.5" />
								</button>
								<button
									type="button"
									onclick={() => handleDeleteTemplate(tpl.id)}
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
									title="删除模版"
								>
									<TrashIcon class="size-3.5" />
								</button>
							</div>
						</div>

						<p
							class="rounded-lg bg-muted/40 p-2 text-xs leading-relaxed break-words text-foreground select-text"
						>
							{tpl.content}
						</p>
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<div
			class="flex flex-1 items-center justify-center p-8 text-xs text-muted-foreground"
		>
			请选择左侧模版组
		</div>
	{/if}
</div>
