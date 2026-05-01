// admin モジュール (Issue #13 / 04-api-contract.md §admin)
// /admin/invitations, /admin/users を束ねる。PrismaModule はグローバルなので import 不要。

import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [InvitationsController, UsersController],
  providers: [InvitationsService, UsersService],
})
export class AdminModule {}
