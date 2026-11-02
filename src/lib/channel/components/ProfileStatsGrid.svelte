<script lang="ts">
	import FacebookLogoIcon from "phosphor-svelte/lib/FacebookLogoIcon";
	import InstagramLogoIcon from "phosphor-svelte/lib/InstagramLogoIcon";
	import TwitterLogoIcon from "phosphor-svelte/lib/TwitterLogoIcon";

	import type { UniversalUserProfile } from "../types";

	let { user }: { user: UniversalUserProfile } = $props();

	function renderSocialIcon(service: string) {
		const s = service.toLowerCase();
		if (s.includes("instagram")) return InstagramLogoIcon;
		if (s.includes("twitter") || s.includes("x")) return TwitterLogoIcon;
		if (s.includes("facebook")) return FacebookLogoIcon;
		return null;
	}
</script>

<div class="flex flex-col gap-4">
	<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
		{#if user.heightCm}
			<div
				class="flex flex-col rounded-xl border border-border/60 bg-card p-2.5"
			>
				<span class="text-[10px] text-muted-foreground">身高</span>
				<span class="mt-0.5 text-xs font-semibold"
					>{user.heightCm} cm</span
				>
			</div>
		{/if}
		{#if user.weightKg}
			<div
				class="flex flex-col rounded-xl border border-border/60 bg-card p-2.5"
			>
				<span class="text-[10px] text-muted-foreground">体重</span>
				<span class="mt-0.5 text-xs font-semibold"
					>{user.weightKg} kg</span
				>
			</div>
		{/if}
		{#if user.rolePreference}
			<div
				class="flex flex-col rounded-xl border border-border/60 bg-card p-2.5"
			>
				<span class="text-[10px] text-muted-foreground">角色偏好</span>
				<span class="mt-0.5 text-xs font-semibold">
					{user.rolePreference}
				</span>
			</div>
		{/if}
		{#if user.bodyHair}
			<div
				class="flex flex-col rounded-xl border border-border/60 bg-card p-2.5"
			>
				<span class="text-[10px] text-muted-foreground">体毛</span>
				<span class="mt-0.5 text-xs font-semibold">{user.bodyHair}</span
				>
			</div>
		{/if}
		{#if user.relationshipStatus}
			<div
				class="flex flex-col rounded-xl border border-border/60 bg-card p-2.5"
			>
				<span class="text-[10px] text-muted-foreground">关系状态</span>
				<span class="mt-0.5 text-xs font-semibold">
					{user.relationshipStatus}
				</span>
			</div>
		{/if}
		{#if user.ethnicity}
			<div
				class="flex flex-col rounded-xl border border-border/60 bg-card p-2.5"
			>
				<span class="text-[10px] text-muted-foreground">族裔</span>
				<span class="mt-0.5 text-xs font-semibold"
					>{user.ethnicity}</span
				>
			</div>
		{/if}
	</div>

	{#if user.socialLinks && user.socialLinks.length > 0}
		<div class="flex flex-col gap-1.5 pt-1">
			<span class="text-xs font-medium text-muted-foreground"
				>社交媒体外链</span
			>
			<div class="flex flex-wrap gap-2">
				{#each user.socialLinks as link (link.url)}
					{@const IconComp = renderSocialIcon(link.service)}
					<a
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
					>
						{#if IconComp}
							<IconComp
								class="size-3.5 text-primary"
								weight="bold"
							/>
						{/if}
						<span>{link.label}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>
