<script lang="ts">
	import NetworkLoggerView from "$lib/network-logger/NetworkLoggerView.svelte";
</script>

<svelte:head>
	<title>请求与网络日志 - Open Grind</title>
</svelte:head>

<div
	class="flex h-screen w-screen flex-col overflow-hidden bg-card text-card-foreground"
>
	<NetworkLoggerView standalone={true} />
</div>
