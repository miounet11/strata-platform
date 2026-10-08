#!/usr/bin/env node
/**
 * Probe the X data gateway (self-hosted; set X_GATEWAY_URL) with all four job types.
 * Env: X_GATEWAY_KEY (required)
 */
import {
  fetchGatewayProfile,
  fetchGatewaySearch,
  fetchGatewayUserTweets,
  gatewayEnabled,
  gatewayKey,
  gatewayQuota,
  gatewayUrl,
} from "./x-gateway-client.mjs";

if (!gatewayEnabled()) {
  console.error("Set X_GATEWAY_KEY=xk_...");
  process.exit(1);
}
console.log("gateway:", gatewayUrl(), "key:", `${gatewayKey().slice(0, 8)}...`);
console.log("quota:", await gatewayQuota().catch((e) => e.message));

const posts = await fetchGatewayUserTweets("laoshiline", 3);
console.log(`user_posts: ${posts.length} rows`);
for (const s of posts) console.log(` - ${s.publishedAt} @${s.author}: ${s.title.slice(0, 60)}`);

const search = await fetchGatewaySearch("Qwen local llm", 3);
console.log(`search: ${search.length} rows`);
