import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig(({ mode }) => ({
	plugins: [
		mode !== "production" && devtools(),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
		{
			// Cloudflare's Rocket Loader rewrites <script type="module"> tags to
			// defer/reorder their execution, which breaks the ESM module graph
			// (React ends up with a null hook dispatcher). data-cfasync="false"
			// is Rocket Loader's documented opt-out for specific scripts.
			name: "cfasync-false-on-module-scripts",
			transformIndexHtml(html: string) {
				return html.replace(
					/<script type="module"/g,
					'<script type="module" data-cfasync="false"',
				);
			},
		},
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["favicon.ico", "logo192.png", "logo512.png"],
			manifest: {
				name: "Tessera",
				short_name: "Tessera",
				description: "Tessera Application",
				theme_color: "#0f172a",
				background_color: "#0f172a",
				display: "standalone",
				start_url: "/",
				icons: [
					{
						src: "logo192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "logo512.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "logo512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any maskable",
					},
				],
			},
		}),
	].filter(Boolean),
}));

export default config;
