## Implementation Plan: Update Telegram Sending to Broadcast Channel

### Task Type
- [ ] Frontend (→ Gemini)
- [x] Backend (→ Codex)
- [ ] Fullstack (→ Parallel)

### Technical Solution
The system's current architecture maintains individual user subscriptions and iterates through them to send Telegram alerts. We will replace this with a simplified broadcast model. All alert messages will be routed to a single, hardcoded Telegram channel ID (`-1003879479829`). The channel ID will be hardcoded in the Telegram sending module as explicitly requested, not utilizing environment variables. We will remove the database subscription iteration to significantly improve alerting performance and reduce API calls.

### Implementation Steps
1. **Locate Telegram Sender Module** - Identify the backend function/service responsible for dispatching Telegram messages. (Note: Initial context search indicates this logic may reside in a separate backend repository or Firebase Cloud Functions project, as it was not found in the Next.js `clear-map` frontend code).
2. **Hardcode Target Channel** - Define `const TARGET_CHANNEL_ID = -1003879479829;` within the sending module.
3. **Refactor Sending Logic** - Replace the subscriber iteration logic with a single `sendMessage` request to the Telegram API targeting `chat_id: TARGET_CHANNEL_ID`.
4. **Remove Subscription Queries** - Eliminate the database queries fetching subscriber lists (e.g., from Firebase RTDB/Firestore) prior to sending alerts.
5. **Cleanup Webhooks (Optional)** - Remove or deprecate Telegram bot command handlers for `/subscribe` and `/unsubscribe`.

### Key Files
| File | Operation | Description |
|------|-----------|-------------|
| `<telegram_sender_module>` | Modify | Replace individual user sending with single broadcast to `-1003879479829` |
| `<subscription_handler>` | Modify/Delete | Remove logic handling user opt-in/opt-out for notifications |

### Risks and Mitigation
| Risk | Mitigation |
|------|------------|
| Hardcoded Configuration | Ensure the hardcoded channel ID is clearly commented as a deliberate architectural decision to avoid confusion during future maintenance. |
| Channel Admin Rights | The Bot must be added as an administrator to the target channel (`@clearmapchannel`) to have permission to post messages. |

### SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: codex-7f89a1b2
- GEMINI_SESSION: gemini-4c5d6e7f
