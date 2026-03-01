/**
 * OpenClaw P0.2 - lastDevProject Redis 持久化 (改進版)
 *
 * 功能：
 * 1. 容器啟動時從 Redis 恢復 lastDevProject（含重試邏輯）
 * 2. 用戶切換專案時同時更新 Redis + session 檔案
 * 3. Redis 不可用時 fallback 到 session 檔案
 * 4. P0.2 改進：加入重試邏輯，解決初始化時序問題
 */

let redis = null; // Redis disabled - using session file only
console.log("[LastDevProject] Redis disabled, session file mode");

const fs = require("fs");
const path = require("path");

const SESSION_DIR = path.join(process.env.HOME || "/Users/rexmacmini", "openclaw", "session");
const SESSION_FILE = path.join(SESSION_DIR, "lastDevProject.json");
const REDIS_KEY = "openclaw:lastDevProject";

// 確保 session 目錄存在
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Redis 連接檢查
 */
async function isRedisConnected() {
  if (!redis) {
    return false;
  }
  return new Promise((resolve) => {
    redis.ping((err) => {
      resolve(!err);
    });
  });
}

/**
 * 從 session 檔案讀取
 */
function _readSessionFile() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[LastDevProject] Session file read error:", err.message);
  }
  return null;
}

/**
 * 寫入 session 檔案
 */
function _writeSessionFile(project) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(project, null, 2), "utf8");
    console.log(`[LastDevProject] Session file updated: ${project}`);
  } catch (err) {
    console.error("[LastDevProject] Session file write error:", err.message);
  }
}

/**
 * 從 Redis 讀取
 */
async function _readRedis() {
  if (!redis) {
    return null;
  }
  return new Promise((resolve) => {
    redis.get(REDIS_KEY, (err, result) => {
      if (err) {
        console.warn("[LastDevProject] Redis get error:", err.message);
        resolve(null);
      } else if (result) {
        try {
          resolve(JSON.parse(result));
        } catch (e) {
          console.warn("[LastDevProject] Redis value parse error:", e.message);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * 寫入 Redis（非同步，不阻塞）
 */
function _writeRedis(project) {
  if (!redis) {
    return;
  }
  redis.set(REDIS_KEY, JSON.stringify(project), (err) => {
    if (err) {
      console.warn("[LastDevProject] Redis set error:", err.message);
    } else {
      console.log(`[LastDevProject] Redis updated: ${project}`);
    }
  });
}

/**
 * 初始化：容器啟動時調用
 * P0.2 改進: 加入重試邏輯（最多 3 次，間隔 100-200ms）
 * 優先級：Redis → Session 檔案 → null
 */
async function initializeLastDevProject(retries = 3, delayMs = 100) {
  console.log("[LastDevProject] Initializing...");

  // 1. 嘗試從 Redis 讀取
  const fromRedis = await _readRedis();
  if (fromRedis) {
    console.log(`[LastDevProject] Restored from Redis: ${JSON.stringify(fromRedis)}`);
    return fromRedis;
  }

  // 2. 嘗試從 session 檔案讀取（含重試）
  for (let attempt = 1; attempt <= retries; attempt++) {
    const fromSession = _readSessionFile();
    if (fromSession) {
      console.log(
        `[LastDevProject] Restored from session file (attempt ${attempt}/${retries}): ${JSON.stringify(fromSession)}`,
      );
      // 同時寫入 Redis 作為備份
      _writeRedis(fromSession);
      return fromSession;
    }

    // 如果不是最後一次嘗試，延遲後重試
    if (attempt < retries) {
      const waitTime = delayMs * attempt; // 100ms, 200ms, ...
      console.log(`[LastDevProject] Session file not found, retrying in ${waitTime}ms...`);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  console.log(
    `[LastDevProject] No previous project found after ${retries} retries, initialized as null`,
  );
  return null;
}

/**
 * 取得 lastDevProject
 */
async function getLastDevProject() {
  const isConnected = await isRedisConnected();

  if (isConnected) {
    const project = await _readRedis();
    if (project) {
      return project;
    }
  }

  // Fallback 到 session 檔案
  return _readSessionFile();
}

/**
 * 設定 lastDevProject（用戶切換專案時調用）
 */
async function setLastDevProject(project) {
  console.log(`[LastDevProject] Setting to: ${project}`);

  // 同時更新 Redis 和 session 檔案
  _writeRedis(project);
  _writeSessionFile(project);

  return project;
}

/**
 * 清理（測試用）
 */
async function clearLastDevProject() {
  redis.del(REDIS_KEY, (err) => {
    if (!err) {
      console.log("[LastDevProject] Redis key deleted");
    }
  });

  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
      console.log("[LastDevProject] Session file deleted");
    }
  } catch (err) {
    console.error("[LastDevProject] Session file delete error:", err.message);
  }
}

/**
 * 獲取狀態（調試用）
 */
async function getStatus() {
  const fromRedis = await _readRedis();
  const fromSession = _readSessionFile();
  const isConnected = await isRedisConnected();

  return {
    current: fromRedis || fromSession,
    redis: fromRedis,
    session: fromSession,
    redisConnected: isConnected,
    timestamp: new Date().toISOString(),
  };
}

// Redis 連接事件處理 (disabled when redis=null)
if (redis) {
  redis.on("ready", () => {
    console.log("[LastDevProject] Redis connected");
  });
  redis.on("error", (err) => {
    console.warn("[LastDevProject] Redis error:", err.message);
  });
  redis.on("end", () => {
    console.warn("[LastDevProject] Redis disconnected");
  });
}

module.exports = {
  initializeLastDevProject,
  getLastDevProject,
  setLastDevProject,
  clearLastDevProject,
  getStatus,
};
