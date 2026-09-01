-- Adds a third system role. `admin_secretary` works the approval queues but
-- cannot see the citizens list, review role applications, or manage categories;
-- what it may do is decided by the grant table in src/types/permissions.ts.
ALTER TYPE "SystemRole" ADD VALUE 'admin_secretary';
