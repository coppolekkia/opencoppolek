// Intent Detection 優化版本 - LRU 快取 + 性能指標 + 多語言 + 錯誤恢復

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { LRUCache } = require("lru-cache");

class IntentDetector {
  constructor(options = {}) {
    this.ollamaUrl = options.ollamaUrl || "http://localhost:11434";
    this.model = options.model || "qwen2.5-coder:7b";
    this.cacheKeyPrefix = "intent:";
    this.cacheTTL = options.cacheTTL || 3600; // 1 小時
    this.temperature = options.temperature || 0.1; // 低溫度 = 更確定的分類

    // LRU cache: 限 1000 條，TTL 1hr
    this.memoryCache = new LRUCache({
      max: 1000,
      ttl: (options.cacheTTL || 3600) * 1000,
    });
    this.metricsPath =
      options.metricsPath ||
      path.join(process.env.HOME || "/root", ".claude", "logs", "intent-metrics.jsonl");

    // Async log buffer (flush every 1s)
    this._logBuffer = [];
    this._flushInterval = setInterval(() => this._flushLogBuffer(), 1000);

    // 性能指標
    this.metrics = {
      cache_hits: 0,
      cache_misses: 0,
      ollama_calls: 0,
      fallback_calls: 0,
      total_latency_ms: 0,
      confidence_sum: 0,
      call_count: 0,
    };

    // Precompiled regex
    this._chineseRegex = /[\u4e00-\u9fa5]/g;
    this._jsonExtract = /\{.*\}/s;

    // 關鍵字匹配規則 (備用)
    this.keywordRules = {
      code: [
        "寫",
        "實作",
        "開發",
        "修",
        "fix",
        "code",
        "write",
        "implement",
        "重構",
        "refactor",
        "測試",
        "test",
      ],
      gmail_delete: [
        "刪除郵件",
        "刪郵件",
        "清理郵件",
        "delete email",
        "remove email",
        "clear inbox",
      ],
      gmail_read: ["讀信", "查看郵件", "看信", "read email", "view email", "inbox"],
      gmail_send: ["寫信", "發送郵件", "寄信", "send email", "compose"],
      calendar: ["會議", "日程", "日期", "meeting", "calendar", "schedule", "行程", "排程"],
      web_search: ["搜索", "搜尋", "搜", "search", "look up", "查一下", "幫我查"],
      stock: ["股票", "台股", "股價", "stock", "技術分析", "買賣"],
      system_status: [
        "系統狀態",
        "健康檢查",
        "system status",
        "/status",
        "/dashboard",
        "總覽",
        "proxy狀態",
      ],
      deploy: ["部署", "deploy", "push", "推送", "上線"],
      summarize: ["摘要", "總結", "summarize", "summary", "重點"],
      progress: ["進度", "工作進度", "progress", "做了什麼", "今天做了"],
      chat: ["你好", "怎樣", "什麼", "hi", "hello", "how", "嗨", "哈囉"],
    };
  }

  // 生成快取鍵 (基於 hash)
  getCacheKey(input, language) {
    const hash = crypto
      .createHash("sha256")
      .update(input.toLowerCase() + ":" + language)
      .digest("hex")
      .slice(0, 16);
    return this.cacheKeyPrefix + hash;
  }

  // 自動偵測語言
  detectLanguage(input) {
    this._chineseRegex.lastIndex = 0;
    const chineseChars = (input.match(this._chineseRegex) || []).length;
    return chineseChars > input.length * 0.3 ? "chinese" : "english";
  }

  // 關鍵字匹配 (備用)
  async classifyByKeywords(input) {
    const lowerInput = input.toLowerCase();

    for (const [intent, keywords] of Object.entries(this.keywordRules)) {
      if (keywords.some((kw) => lowerInput.includes(kw))) {
        return {
          intent,
          confidence: 0.3,
          method: "keyword",
        };
      }
    }

    return {
      intent: "chat",
      confidence: 0.1,
      method: "keyword",
    };
  }

  // Ollama 分類
  async classifyWithOllama(input, language) {
    const startTime = Date.now();

    const systemPrompt =
      language === "chinese"
        ? `你是一個 Intent 分類器。根據用戶訊息分類意圖。
         只能選擇以下之一：code, gmail_delete, gmail_read, gmail_send, calendar, web_search, stock, system_status, deploy, summarize, progress, chat
         回應格式: {"intent":"...", "confidence": 0.0-1.0}`
        : `You are an intent classifier. Classify the user's intent.
         Choose one of: code, gmail_delete, gmail_read, gmail_send, calendar, web_search, stock, system_status, deploy, summarize, progress, chat
         Response format: {"intent":"...", "confidence": 0.0-1.0}`;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\nUser: ${input}`,
          stream: false,
          temperature: this.temperature,
        }),
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error("Ollama request failed");
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      // 解析回應
      this._jsonExtract.lastIndex = 0;
      const jsonMatch = data.response.match(this._jsonExtract);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        this.metrics.ollama_calls++;
        this.metrics.total_latency_ms += latency;

        return {
          intent: result.intent || "chat",
          confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
          method: "ollama",
          latency_ms: latency,
        };
      }
    } catch (e) {
      console.warn("[intent] Ollama classification failed:", e.message);
    }

    return null;
  }

  async classify(input) {
    if (!input || typeof input !== "string") {
      return { intent: "chat", confidence: 0, method: "invalid" };
    }

    const language = this.detectLanguage(input);
    const cacheKey = this.getCacheKey(input, language);

    // 檢查快取
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      this.metrics.cache_hits++;
      return { ...cached, cached: true };
    }

    this.metrics.cache_misses++;

    // 嘗試 Ollama
    let result = await this.classifyWithOllama(input, language);

    // 若失敗，降級到關鍵字匹配
    if (!result) {
      result = await this.classifyByKeywords(input);
      this.metrics.fallback_calls++;
    }

    // 記錄指標
    this.metrics.call_count++;
    this.metrics.confidence_sum += result.confidence;

    // 寫入快取
    this.memoryCache.set(cacheKey, result);

    // 寫入日誌
    this.logMetrics(input, result, language);

    return result;
  }

  logMetrics(input, result, language) {
    const logEntry = JSON.stringify({
      ts: new Date().toISOString(),
      language,
      input_len: input.length,
      intent: result.intent,
      confidence: result.confidence,
      method: result.method,
      latency_ms: result.latency_ms || null,
    });
    this._logBuffer.push(logEntry);
  }

  _flushLogBuffer() {
    if (this._logBuffer.length === 0) {
      return;
    }
    const batch = this._logBuffer.splice(0, this._logBuffer.length);
    fs.mkdirSync(path.dirname(this.metricsPath), { recursive: true });
    fs.appendFile(this.metricsPath, batch.join("\n") + "\n", (err) => {
      if (err) {
        console.error("[intent] Log flush error:", err.message);
      }
    });
  }

  getStats() {
    const avgLatency =
      this.metrics.ollama_calls > 0
        ? Math.round(this.metrics.total_latency_ms / this.metrics.ollama_calls)
        : 0;

    const avgConfidence =
      this.metrics.call_count > 0
        ? (this.metrics.confidence_sum / this.metrics.call_count).toFixed(2)
        : 0;

    const total = this.metrics.cache_hits + this.metrics.cache_misses;
    const hitRate = total > 0 ? ((this.metrics.cache_hits / total) * 100).toFixed(1) : "N/A";

    return {
      cache: {
        hits: this.metrics.cache_hits,
        misses: this.metrics.cache_misses,
        hit_rate: hitRate + "%",
        in_memory: this.memoryCache.size,
      },
      classification: {
        total_calls: this.metrics.call_count,
        ollama_calls: this.metrics.ollama_calls,
        fallback_calls: this.metrics.fallback_calls,
        avg_confidence: parseFloat(avgConfidence),
        avg_latency_ms: avgLatency,
      },
    };
  }
}

module.exports = { IntentDetector };
