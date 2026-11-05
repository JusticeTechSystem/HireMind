import { ConflictException } from '@nestjs/common';
export type Status = 'CREATED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type Action = 'start' | 'pause' | 'resume' | 'end';
const T: Record<Action, { from: Status[]; to: Status }> = {
  start: { from: ['CREATED'], to: 'ACTIVE' },
  pause: { from: ['ACTIVE'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'ACTIVE' },
  end: { from: ['ACTIVE', 'PAUSED'], to: 'COMPLETED' },
};
export function rule(action: Action) { return T[action]; }
export function assertTransition(current: Status, action: Action): Status {
  const t = T[action];
  if (!t.from.includes(current)) throw new ConflictException(`Cannot ${action} a ${current} session`);
  return t.to;
}
