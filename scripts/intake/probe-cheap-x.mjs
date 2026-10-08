#!/usr/bin/env node
import { cheapXBaseUrl, probeCheapX, fetchCheapXUserTweets } from "./cheap-x-client.mjs";

const base = cheapXBaseUrl();
if (!base) {
  console.error("Set INTAKE_CHEAP_X_URL=http://127.0.0.1:8080");
  process.exit(1);
}
const health = await probeCheapX();
console.log("health:", health);
if (!health.ok) process.exit(2);
const sample = await fetchCheapXUserTweets("coldniko", 3);
console.log(`sample tweets: ${sample.length}`);
for (const s of sample) console.log(` - ${s.publishedAt} @${s.author}: ${s.title.slice(0, 80)}`);
