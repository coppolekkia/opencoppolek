/**
 * In-memory cache of sent message IDs per chat.
 * Used to identify bot's own messages for reaction filtering ("own" mode).
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_TRIGGER = 100;
const MAX_MESSAGES_PER_CHAT = 1000;
const MAX_CHAT_ENTRIES = 1024;

type CacheEntry = {
  timestamps: Map<number, number>;
};

const sentMessages = new Map<string, CacheEntry>();

function getChatKey(chatId: number | string): string {
  return String(chatId);
}

function cleanupExpired(entry: CacheEntry, now = Date.now()): void {
  for (const [msgId, timestamp] of entry.timestamps) {
    if (now - timestamp > TTL_MS) {
      entry.timestamps.delete(msgId);
    }
  }
}

function trimOldestMessages(entry: CacheEntry): void {
  while (entry.timestamps.size > MAX_MESSAGES_PER_CHAT) {
    const oldestId = entry.timestamps.keys().next().value;
    if (typeof oldestId !== "number") {
      break;
    }
    entry.timestamps.delete(oldestId);
  }
}

function touchChatEntry(key: string, entry: CacheEntry): void {
  sentMessages.delete(key);
  sentMessages.set(key, entry);
}

function evictOldestChats(): void {
  while (sentMessages.size > MAX_CHAT_ENTRIES) {
    const oldestKey = sentMessages.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    sentMessages.delete(oldestKey);
  }
}

/**
 * Record a message ID as sent by the bot.
 */
export function recordSentMessage(chatId: number | string, messageId: number): void {
  const key = getChatKey(chatId);
  const entry = sentMessages.get(key) ?? { timestamps: new Map<number, number>() };

  entry.timestamps.set(messageId, Date.now());
  if (entry.timestamps.size > CLEANUP_TRIGGER) {
    cleanupExpired(entry);
  }
  trimOldestMessages(entry);

  if (entry.timestamps.size === 0) {
    sentMessages.delete(key);
    return;
  }

  touchChatEntry(key, entry);
  evictOldestChats();
}

/**
 * Check if a message was sent by the bot.
 */
export function wasSentByBot(chatId: number | string, messageId: number): boolean {
  const key = getChatKey(chatId);
  const entry = sentMessages.get(key);
  if (!entry) {
    return false;
  }

  // Clean up expired entries on read.
  cleanupExpired(entry);
  if (entry.timestamps.size === 0) {
    sentMessages.delete(key);
    return false;
  }

  // Keep frequently accessed chats hot in LRU order.
  touchChatEntry(key, entry);
  return entry.timestamps.has(messageId);
}

/**
 * Clear all cached entries (for testing).
 */
export function clearSentMessageCache(): void {
  sentMessages.clear();
}
