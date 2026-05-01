// Next.js 設定 (Step 10 — 認証スケルトン)
// monorepo workspace の @app/db / @app/shared を transpile 対象に含める。

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@app/db', '@app/shared'],
};

export default nextConfig;
