BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub": "f91f19b3-0e4b-41e9-8422-80d8b47dc1ee"}';
SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub';
SELECT * FROM "FiscalYear" WHERE company_id = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d';
ROLLBACK;
