// ─── P1.9: Provider Timeout Guard + AbortController ────────────────────

const crypto = require("crypto");

async function withTimeout(fn, ms = 30000, label = "tool") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timeout after ${ms}ms`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── P1.5: Structured Timing Middleware ──────────────────────────────

// Inject at the very start of http.createServer handler
function initRequestMetadata(req) {
  req.id = crypto.randomUUID();
  req._startTime = Date.now();
  // phase, intent_hint, tool_name 會由下游代碼設置
}

// Call inside res.on('finish') or at response end
function logStructuredTiming(req, res) {
  const latency = Date.now() - req._startTime;
  const logEntry = {
    req_id: req.id,
    path: req.url || "unknown",
    method: req.method,
    latency: latency,
    phase: req.phase || "unknown",
    intent: req.intent_hint?.intent || null,
    confidence: req.intent_hint?.confidence || null,
    tool: req.tool_name || null,
    status: res.statusCode || 0,
    ts: Date.now(),
  };
  console.log(JSON.stringify(logEntry));
}

// ─── P0.4: Error Message Formatter (標準化格式) ──────────────────

/**
 * 統一錯誤信息格式
 * 格式: [wrapper] #reqId component: message
 *
 * @param {string} component - 組件名稱 (e.g., 'intent-classifier', 'gmail', 'agentd')
 * @param {string} message - 錯誤信息
 * @param {string} reqId - 請求 ID (可選)
 * @returns {string} 格式化的錯誤信息
 */
function formatError(component, message, reqId = null) {
  const base = reqId ? `[wrapper] #${reqId}` : "[wrapper]";
  return `${base} ${component}: ${message}`;
}

/**
 * 建立標準化的 Error 對象
 * @param {string} component - 組件名稱
 * @param {string} message - 錯誤信息
 * @param {string} reqId - 請求 ID (可選)
 * @returns {Error} Error 對象，message 已格式化
 */
function createError(component, message, reqId = null) {
  return new Error(formatError(component, message, reqId));
}

/**
 * 標準化 console.error 輸出
 * @param {string} component - 組件名稱
 * @param {string} message - 錯誤信息
 * @param {string} reqId - 請求 ID (可選)
 */
function logError(component, message, reqId = null) {
  console.error(formatError(component, message, reqId));
}

// ─── P1.1: Keyword Routing 改進 (邊界檢測 + 置信度分級) ──────────────

/**
 * 改進的 keyword matcher，支持邊界檢測和置信度分級
 * - 詞邊界檢測：避免「郵件」被「包郵件」誤匹配
 * - 中文邊界檢測：適當分割中文文本
 * - 否定詞檢測：「不要、別、沒有」等
 * - 置信度分級：exact > fuzzy > partial
 */
class KeywordMatcher {
  constructor() {
    this.negationPatterns = [
      /^(不|沒|別|無|勿|莫)[\s]*(.*)$/,
      /^(don't|didn't|not|no|never|without)[\s]/i,
    ];
    this._boundaryCache = new Map();
  }

  /**
   * 檢查是否為否定句
   * @param {string} text - 文本
   * @returns {boolean}
   */
  isNegated(text) {
    const lower = text.toLowerCase().trim();
    return this.negationPatterns.some((p) => p.test(lower));
  }

  /**
   * 檢查詞邊界（英文）
   * @param {string} text - 文本
   * @param {string} keyword - 關鍵詞
   * @returns {number} 置信度 (0-1.0)
   */
  matchWithBoundary(text, keyword) {
    const lower = text.toLowerCase();
    const lowerKw = keyword.toLowerCase();

    // Exact match (整詞) — precompiled regex cache
    let wordBoundaryPattern = this._boundaryCache.get(lowerKw);
    if (!wordBoundaryPattern) {
      wordBoundaryPattern = new RegExp(`\\b${lowerKw}\\b`);
      this._boundaryCache.set(lowerKw, wordBoundaryPattern);
    }
    if (wordBoundaryPattern.test(lower)) {
      return 1.0; // 最高置信度
    }

    // Contains match (包含)
    if (lower.includes(lowerKw)) {
      return 0.7; // 中等置信度
    }

    // Fuzzy: 前綴匹配
    if (lower.startsWith(lowerKw)) {
      return 0.5;
    }

    return 0; // 無匹配
  }

  /**
   * 檢查中文邊界（簡化版）
   * @param {string} text - 文本
   * @param {string|string[]} keywords - 關鍵詞（字符串或數組）
   * @returns {number} 最高置信度
   */
  matchChinese(text, keywords) {
    const lower = text.toLowerCase();
    const kwArray = Array.isArray(keywords) ? keywords : [keywords];

    let maxConfidence = 0;
    for (const kw of kwArray) {
      const lowerKw = kw.toLowerCase();

      // Exact substring (中文無單詞邊界，接受連續匹配)
      if (lower.includes(lowerKw)) {
        maxConfidence = Math.max(maxConfidence, 0.9);
      }

      // Fuzzy: 詞首匹配 (e.g., 「查郵」匹配「查郵件」)
      if (lowerKw.length >= 2) {
        const prefix = lowerKw.substring(0, 2);
        if (lower.includes(prefix)) {
          maxConfidence = Math.max(maxConfidence, 0.7);
        }
      }
    }

    return maxConfidence;
  }

  /**
   * 統一的 keyword 匹配邏輯
   * @param {string} text - 文本
   * @param {string|string[]} keywords - 關鍵詞
   * @param {string} type - 類型：'en' | 'zh' | 'auto'
   * @returns {{matched: boolean, confidence: number}}
   */
  match(text, keywords, type = "auto") {
    if (!text || !keywords) {
      return { matched: false, confidence: 0 };
    }

    // 檢查否定
    if (this.isNegated(text)) {
      return { matched: false, confidence: 0, reason: "negated" };
    }

    let confidence = 0;

    if (type === "auto") {
      // 自動檢測語言類型
      const hasChinese = /[\u4e00-\u9fff]/.test(text);
      confidence = hasChinese
        ? this.matchChinese(text, keywords)
        : this.matchWithBoundary(text, Array.isArray(keywords) ? keywords[0] : keywords);
    } else if (type === "zh") {
      confidence = this.matchChinese(text, keywords);
    } else {
      confidence = this.matchWithBoundary(text, Array.isArray(keywords) ? keywords[0] : keywords);
    }

    return {
      matched: confidence > 0.5,
      confidence: confidence,
    };
  }
}

// ─── P1.3: Runtime Tool Injection ────────────────────────────────────

// AGENTD_TOOLS 應該從配置動態讀取，而不是 hardcode
// 示例格式:
// const AGENTD_TOOLS = {
//   'web_search': { description: '搜尋網路資訊' },
//   'system_status': { description: '查詢系統狀態' },
//   ...
// };

function buildToolListForPrompt(toolsConfig) {
  if (!toolsConfig || typeof toolsConfig !== "object") {
    return "（無可用工具）";
  }
  return Object.entries(toolsConfig)
    .map(([name, def]) => `- ${name}: ${def.description || name}`)
    .join("\n");
}

function injectToolsIntoSystemPrompt(basePrompt, toolsConfig) {
  const toolList = buildToolListForPrompt(toolsConfig);
  return `${basePrompt}\n\n可用工具：\n${toolList}`;
}

// ─── P1.10: Tool Concurrency Limit ──────────────────────────────────

// Install: npm install p-limit
// Note: p-limit uses ES6 modules, extract default export
const pLimitModule = require("p-limit");
const pLimit = pLimitModule.default || pLimitModule;

// Create separate limits for CPU-bound (docker, shell) vs IO-bound (web search, file)
const cpuLimit = pLimit(1); // docker build, shell commands
const ioLimit = pLimit(3); // web search, file operations

// Usage wrapper:
async function executeToolWithConcurrency(toolName, toolFn, isCpuBound = false) {
  const limiter = isCpuBound ? cpuLimit : ioLimit;
  return limiter(() => toolFn());
}

// ─── P1.11: Tool Circuit Breaker ────────────────────────────────────

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5;
    this.resetMs = options.resetMs || 60000;
    this.toolFailures = {};
  }

  isCircuitOpen(toolName) {
    const f = this.toolFailures[toolName];
    if (!f) {
      return false;
    }
    if (Date.now() - f.firstFailAt > this.resetMs) {
      delete this.toolFailures[toolName];
      return false;
    }
    return f.count >= this.threshold;
  }

  recordFailure(toolName) {
    if (!this.toolFailures[toolName]) {
      this.toolFailures[toolName] = { count: 0, firstFailAt: Date.now() };
    }
    this.toolFailures[toolName].count++;
    if (this.toolFailures[toolName].count >= this.threshold) {
      console.warn(`[CIRCUIT BREAKER] ${toolName} disabled for ${this.resetMs}ms`);
    }
  }

  recordSuccess(toolName) {
    if (this.toolFailures[toolName]) {
      // Adaptive recovery: reduce failure count on success
      this.toolFailures[toolName].count = Math.max(0, this.toolFailures[toolName].count - 1);
    }
  }

  reset(toolName) {
    delete this.toolFailures[toolName];
  }
}

// ─── P1.1: Hybrid Intent Classifier (Hint-only, confidence-gated) ────

class HybridIntentClassifier {
  constructor(options = {}) {
    this.ollamaUrl = options.ollamaUrl || "http://localhost:11434";
    this.model = options.model || "qwen2.5-coder:7b";
    this.confidenceThreshold = options.confidenceThreshold || 0.8;
  }

  async classify(message) {
    // Call Ollama for intent classification (non-blocking)
    // Returns: { intent: string, confidence: number }
    try {
      const http = require("http");
      const body = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              'Classify user intent. Reply ONLY with valid JSON: {"intent":"code|chat|email|web_search|stock|system_status|deploy|summarize|calendar|progress","confidence":0.0-1.0}',
          },
          { role: "user", content: message },
        ],
        stream: false,
        temperature: 0.3,
      });

      return new Promise((resolve) => {
        const req = http.request(
          {
            hostname: "localhost",
            port: 11434,
            path: "/api/chat",
            method: "POST",
            timeout: 2000,
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.message?.content || "{}";
                // Extract JSON from response (may have extra text)
                const jsonMatch = content.match(/\{[^}]*"intent"[^}]*"confidence"[^}]*\}/);
                const json = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
                const intent = json.intent || "unknown";
                const confidence = Math.min(1, Math.max(0, json.confidence || 0));
                resolve({
                  intent: confidence >= this.confidenceThreshold ? intent : "unknown",
                  confidence,
                });
              } catch (e) {
                resolve({ intent: "unknown", confidence: 0 });
              }
            });
          },
        );
        req.on("error", () => resolve({ intent: "unknown", confidence: 0 }));
        req.on("timeout", () => {
          req.destroy();
          resolve({ intent: "unknown", confidence: 0 });
        });
        req.write(body);
        req.end();
      });
    } catch (e) {
      console.error("Intent classifier error:", e.message);
      return { intent: "unknown", confidence: 0 };
    }
  }
}

// ─── Integration Pattern for handleChatCompletion ────────────────────

// 1. At start: initRequestMetadata(req);
// 2. Later in routing: req.phase = 'tool_execution'; req.tool_name = 'web_search';
// 3. For tool calls:
//    const circuitBreaker = new CircuitBreaker();
//    if (circuitBreaker.isCircuitOpen('tool_name')) throw new Error('circuit open');
//    const result = await executeToolWithConcurrency('tool_name', async () => {
//      return withTimeout(signal => toolFn(signal), 30000, 'web_search');
//    }, false);
//    circuitBreaker.recordSuccess('tool_name');
// 4. At finish: logStructuredTiming(req, res);

module.exports = {
  withTimeout,
  initRequestMetadata,
  logStructuredTiming,
  buildToolListForPrompt,
  injectToolsIntoSystemPrompt,
  executeToolWithConcurrency,
  CircuitBreaker,
  HybridIntentClassifier,
  formatError,
  createError,
  logError,
  KeywordMatcher,
};
