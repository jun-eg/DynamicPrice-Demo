// e2e テスト用 vitest 設定。
// NestJS デコレータの emitDecoratorMetadata 動作のため SWC でトランスパイルする。

import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'es2022',
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.e2e.test.ts'],
    globals: false,
    environment: 'node',
    pool: 'forks',
  },
});
