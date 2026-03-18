/**
 * Generate VAPID keys for Web Push notifications.
 * Run once: node scripts/generate-vapid-keys.cjs
 *
 * Then add the output to your environment:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local (frontend)
 *   - VAPID_PRIVATE_KEY in backend config.env (Python backend)
 */
const webpush = require("web-push");

const vapidKeys = webpush.generateVAPIDKeys();

console.log("\n=== VAPID Keys Generated ===\n");
console.log("Add to .env.local (Next.js frontend):");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}\n`);
console.log("Add to config.env (Python backend):");
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:yoncohenyon@gmail.com`);
console.log("\n============================\n");
