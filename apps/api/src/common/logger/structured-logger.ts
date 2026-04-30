// 構造化 JSON ログ出力 (04-api-contract.md §ロギング)
// Cloud Logging の jsonPayload と互換になるよう 1 行 1 JSON で出力する。

type LogLevel = 'info' | 'warn' | 'error';

export const structuredLog = (level: LogLevel, payload: Record<string, unknown>): void => {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...payload,
  });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
};
