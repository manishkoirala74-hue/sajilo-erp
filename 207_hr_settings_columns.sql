-- =============================================================================
-- Migration : 207_hr_settings_columns.sql
-- Project   : Sajilo ERP
-- Module    : Human Resources v6 - Settings Columns
-- Author    : Sajilo ERP Migration Engineer
-- Date      : 2026-09-27
-- Description:
--   Adds hr_departments and hr_designations to CompanySettings.
-- =============================================================================

ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS hr_departments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS hr_designations JSONB DEFAULT '[]'::jsonb;