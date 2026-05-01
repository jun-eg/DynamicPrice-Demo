// GET /healthz — 死活 + DB 接続確認 (04-api-contract.md)

export interface HealthzResponse {
  status: 'ok';
  db: 'ok';
}
