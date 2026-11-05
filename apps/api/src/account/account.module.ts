import { Module } from '@nestjs/common';
import { StripeGateway } from '../billing/stripe.gateway';
import { StorageService } from '../resumes/storage';
import { AccountDataController } from './account.controller';
import { AccountService } from './account.service';
import { RetentionService } from './retention.service';
@Module({ controllers: [AccountDataController], providers: [RetentionService, AccountService, StorageService, StripeGateway] })
export class AccountModule {}
