import { initializeApp, getApps } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const rtdb = getDatabase(app);

// The backend mirrors /public_state to every instance listed here (each RTDB
// instance tops out around 200k concurrent clients). A visitor sticks to one
// instance chosen at random. Unset → everything uses the primary instance.
const LIVE_DB_URLS = (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URLS || "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

let liveDb: Database | null = null;

/** Database to read live alert state from (active alerts, UAV tracks, heartbeat). */
export function getLiveDb(): Database {
  if (!liveDb) {
    liveDb = LIVE_DB_URLS.length
      ? getDatabase(app, LIVE_DB_URLS[Math.floor(Math.random() * LIVE_DB_URLS.length)])
      : rtdb;
  }
  return liveDb;
}
