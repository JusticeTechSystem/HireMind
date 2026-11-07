import { Logger } from '@nestjs/common';
// Nest's logger writes warnings that tests provoke on purpose; silence it so failure output stays readable.
Logger.overrideLogger(false);
