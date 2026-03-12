import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
	dest: "public",
	disable: process.env.NODE_ENV === "development",
	register: true,
	skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
	// AUDIT: ignoreBuildErrors suppresses TypeScript errors during builds.
	// This can hide real bugs that ship to production. Remove once all TS errors are resolved.
	typescript: {
		ignoreBuildErrors: true,
	},
	// AUDIT: Disable source maps in production to prevent exposing game logic and server code.
	productionBrowserSourceMaps: false,
	images: {
		unoptimized: true,
	},
};

export default withPWA(nextConfig);
