// Usage: pnpm admin:grant user@example.com [ADMIN|SUPER_ADMIN]
// The user must have signed in at least once. This is the only way to create a SUPER_ADMIN (no API can).
import { PrismaClient, RoleName } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const [email, roleArg = 'ADMIN'] = process.argv.slice(2);
  if (!email || !['ADMIN', 'SUPER_ADMIN'].includes(roleArg)) throw new Error('Usage: admin:grant <email> [ADMIN|SUPER_ADMIN]');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('No such user: sign in once first so the account exists');
  const role = await prisma.role.upsert({ where: { name: roleArg as RoleName }, update: {}, create: { name: roleArg as RoleName } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  await prisma.auditLog.create({ data: { action: 'role.grant.cli', target: `user:${user.id}`, meta: { role: roleArg } } });
  console.log(`Granted ${roleArg} to ${email}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
