import { ForbiddenException } from '@nestjs/common';
export interface Actor { id: string; roles: string[] }
/** Who may moderate whom. Nobody moderates themselves; SUPER_ADMINs are untouchable via the API; only a SUPER_ADMIN may touch an ADMIN. */
export function assertCanModerate(actor: Actor, target: Actor) {
  if (actor.id === target.id) throw new ForbiddenException('You cannot change your own account');
  if (target.roles.includes('SUPER_ADMIN')) throw new ForbiddenException('Super Admin accounts cannot be modified here');
  if (target.roles.includes('ADMIN') && !actor.roles.includes('SUPER_ADMIN')) throw new ForbiddenException('Only a Super Admin can modify an Admin');
}
