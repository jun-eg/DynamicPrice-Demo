// `@Public()` をつけたエンドポイントは JwtAuthGuard の対象から外す。
// `/healthz` のように認証不要のエンドポイントで使う。

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
