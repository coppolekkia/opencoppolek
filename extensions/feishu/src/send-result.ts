export type FeishuMessageApiResponse = {
  code?: number;
  msg?: string;
  data?: {
    message_id?: string;
  };
};

function isFeishuCrossAppOpenIdMessage(raw: string): boolean {
  const normalized = raw.toLowerCase();
  return normalized.includes("cross app") && normalized.includes("open_id");
}

export function isFeishuCrossAppOpenIdError(err: unknown): boolean {
  if (typeof err === "string") {
    return isFeishuCrossAppOpenIdMessage(err);
  }
  if (typeof err !== "object" || err === null) {
    return false;
  }

  const errorLike = err as {
    message?: string;
    msg?: string;
    response?: {
      data?: {
        msg?: string;
        message?: string;
      };
    };
  };

  const candidates = [
    errorLike.message,
    errorLike.msg,
    errorLike.response?.data?.msg,
    errorLike.response?.data?.message,
  ];
  return candidates.some((candidate) =>
    typeof candidate === "string" ? isFeishuCrossAppOpenIdMessage(candidate) : false,
  );
}

function formatFeishuCrossAppOpenIdError(errorPrefix: string): string {
  return `${errorPrefix}: open_id belongs to a different Feishu app`;
}

export function assertFeishuMessageApiSuccess(
  response: FeishuMessageApiResponse,
  errorPrefix: string,
) {
  if (response.code !== 0) {
    if (isFeishuCrossAppOpenIdError(response.msg ?? "")) {
      throw new Error(formatFeishuCrossAppOpenIdError(errorPrefix));
    }
    throw new Error(`${errorPrefix}: ${response.msg || `code ${response.code}`}`);
  }
}

export function rethrowFeishuCrossAppOpenIdError(err: unknown, errorPrefix: string): never {
  if (isFeishuCrossAppOpenIdError(err)) {
    throw new Error(formatFeishuCrossAppOpenIdError(errorPrefix));
  }
  throw err;
}

export function toFeishuSendResult(
  response: FeishuMessageApiResponse,
  chatId: string,
): {
  messageId: string;
  chatId: string;
} {
  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId,
  };
}
