-- The very first migration seeded a Bangladesh-format placeholder number.
-- Only clear it if it's still untouched, so this never overwrites a real
-- number an admin has already configured via the Settings tab.
UPDATE public.app_settings
SET value = '', updated_at = now()
WHERE key = 'whatsapp_number' AND value = '8801700000000';
