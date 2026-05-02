// admin モジュール (Issue #13 / issue #59 / 04-api-contract.md §admin)
// /admin/invitations, /admin/users, /admin/room-types, /admin/base-prices を束ねる。PrismaModule はグローバルなので import 不要。

import { Module } from '@nestjs/common';
import { BasePricesController } from './base-prices.controller.js';
import { BasePricesService } from './base-prices.service.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { RoomTypesController } from './room-types.controller.js';
import { RoomTypesService } from './room-types.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [
    InvitationsController,
    UsersController,
    RoomTypesController,
    BasePricesController,
  ],
  providers: [InvitationsService, UsersService, RoomTypesService, BasePricesService],
})
export class AdminModule {}
