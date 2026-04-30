// requestId をリクエストオブジェクトに付与するための型拡張。

import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}
