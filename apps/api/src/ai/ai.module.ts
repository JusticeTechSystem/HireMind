import { Global, Module } from '@nestjs/common';
import { AiProvider, OpenAiProvider } from './ai-provider';
@Global() @Module({ providers: [{ provide: AiProvider, useClass: OpenAiProvider }], exports: [AiProvider] })
export class AiModule {}
