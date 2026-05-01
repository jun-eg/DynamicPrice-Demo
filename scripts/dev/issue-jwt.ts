// 開発用 JWT 発行スクリプト (Issue #8 / 04-api-contract.md §認証)
// AUTH_SECRET で MEMBER / ADMIN の JWT を発行し標準出力に出す。
// 使い方: `npm run dev:issue-jwt -- --role ADMIN --email admin@example.com --sub 1`

import 'dotenv/config';
import jwt from 'jsonwebtoken';

type CliRole = 'ADMIN' | 'MEMBER';

interface CliArgs {
  role: CliRole;
  email: string;
  sub: number;
  // 有効期限を秒で持つ。デフォルトは ADR-0006 の規定通り 8 時間。
  expiresInSec: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key?.startsWith('--')) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key.slice(2)] = 'true';
    } else {
      args[key.slice(2)] = value;
      i += 1;
    }
  }

  const role = (args.role ?? 'MEMBER').toUpperCase();
  if (role !== 'ADMIN' && role !== 'MEMBER') {
    throw new Error(`--role must be ADMIN or MEMBER (got: ${role})`);
  }

  const subRaw = args.sub ?? '1';
  const sub = Number(subRaw);
  if (!Number.isInteger(sub) || sub <= 0) {
    throw new Error(`--sub must be a positive integer (got: ${subRaw})`);
  }

  const email = args.email ?? `${role.toLowerCase()}@example.com`;
  const expiresInSecRaw = args['expires-in-sec'] ?? String(8 * 60 * 60);
  const expiresInSec = Number(expiresInSecRaw);
  if (!Number.isInteger(expiresInSec) || expiresInSec <= 0) {
    throw new Error(`--expires-in-sec must be a positive integer seconds (got: ${expiresInSecRaw})`);
  }

  return { role: role as CliRole, email, sub, expiresInSec };
}

function main(): void {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error('AUTH_SECRET is not set. Configure .env before running this script.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const token = jwt.sign({ sub: args.sub, email: args.email, role: args.role }, secret, {
    expiresIn: args.expiresInSec,
  });

  process.stdout.write(`${token}\n`);
}

main();
