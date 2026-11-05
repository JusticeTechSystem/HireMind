import { Global, Module } from '@nestjs/common';
import { AccountController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiMonitorService } from './ai-monitor';
import { AuditService } from './audit.service';
import { StripeGateway } from '../billing/stripe.gateway';
@Global() @Module({ controllers: [AdminController, AccountController], providers: [StripeGateway, AdminService, AiMonitorService, AuditService], exports: [AuditService] })
export class AdminModule {}
