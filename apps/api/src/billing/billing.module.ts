import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeGateway } from './stripe.gateway';
import { UsageService } from './usage.service';
@Global() @Module({ controllers: [BillingController], providers: [BillingService, StripeGateway, UsageService], exports: [UsageService] })
export class BillingModule {}
