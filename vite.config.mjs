import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { realpathSync } from "node:fs";
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
	plugins: [sveltekit(), tailwindcss()],
	resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,

	// OPEN_GRIND_STORE already selects the Android manifest overlay; exposing it
	// here lets the bundle drop what a store build may not carry.
	envPrefix: ["VITE_", "OPEN_GRIND_"],

	esbuild: { drop: command === "build" ? ["console", "debugger"] : [] },

	optimizeDeps: { include: ["leaflet", "sveaflet"] },

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
		proxy: {
			"/_omni_relay": {
				target: "https://omni-relay.toonhub.top",
				changeOrigin: true,
				secure: true,
				rewrite: (path) => path.replace(/^\/_omni_relay/, ""),
			},
			"/_omni_api": {
				target: "https://omni-api.toonhub.top",
				changeOrigin: true,
				secure: true,
				rewrite: (path) => path.replace(/^\/_omni_api/, ""),
			},
			"/_ai_growth_api": {
				target: "http://127.0.0.1:9501",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/_ai_growth_api/, ""),
			},
			"/_sub_images": {
				target: "https://images.sublifeapp.com",
				changeOrigin: true,
				secure: true,
				rewrite: (path) => path.replace(/^\/_sub_images/, ""),
				headers: {
					Referer: "https://images.sublifeapp.com/",
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			},
		},
		fs: {
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				realpathSync("node_modules"),
			],
		},
	},

	test: {
		environment: "jsdom",
		include: [
			"src/**/*.test.ts",
			"e2e-live/support/**/*.test.ts",
			"scripts/credits/**/*.test.ts",
		],
		setupFiles: ["src/test-setup.ts"],
		// tinykeys caches navigator.platform at load, so vi.resetModules() cannot
		// re-resolve `$mod` unless tinykeys goes through the module runner too.
		server: { deps: { inline: ["tinykeys"] } },
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.{ts,svelte}"],
		},
	},
}));
