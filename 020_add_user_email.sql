-- 020_add_user_email.sql
-- Adds the missing email column to the public.User table to support Admin UI lists

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS email TEXT;
