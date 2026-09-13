# Fix Password Reset Flow using Kernel Trigger

The suggestion correctly identifies that allowing the frontend to self-clear a security lock defeats the purpose of the lock. The database kernel must maintain absolute authority over the `must_change_password` flag via the `SECURITY DEFINER` trigger we created in the 119 script.

## User Review Required

The previous debugging attempts cluttered the frontend with manual database update calls and RPCs. We will strip all of this out. We must trust the Postgres `AFTER UPDATE ON auth.users` trigger to do its job. If the page still loops after this clean-up, it means the SQL trigger from `119_offline_onboarding_kernel.sql` is either missing or failing on your Supabase instance.

## Proposed Changes

### [MODIFY] src/pages/ResetPassword.jsx
- Remove the manual `sajilo.auth.supabase.from('User').update(...)` call.
- Remove the fallback `sajilo.auth.supabase.rpc(...)` call.
- Remove the verification block that manually queried the database.
- Keep only the core `updateUser` call and the redirect to `/` (dashboard).

## Verification Plan

### Automated Tests
- `npm run build` to verify the frontend builds cleanly without the removed code.

### Manual Verification
1. User logs in with a temporary password and is redirected to `/reset-password`.
2. User enters a **brand new** password (must be different from the temporary one, otherwise the Postgres `IS DISTINCT FROM` condition in the trigger won't fire).
3. The frontend calls `updateUser()`.
4. Supabase updates `auth.users`, automatically firing the `clear_must_change_password_flag` trigger.
5. The trigger uses `SECURITY DEFINER` to bypass RLS and updates `public."User"`, setting `must_change_password = false`.
6. The frontend redirects to `/`.
7. `AuthContext` loads the user, sees `must_change_password` is false, and allows the user into the dashboard.
