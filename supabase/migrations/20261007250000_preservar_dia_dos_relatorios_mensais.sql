ALTER TABLE public.platform_report_schedules
  ADD COLUMN IF NOT EXISTS monthly_day_of_month smallint;

UPDATE public.platform_report_schedules
   SET monthly_day_of_month = extract(day FROM created_at)::smallint
 WHERE monthly_day_of_month IS NULL;

ALTER TABLE public.platform_report_schedules
  ALTER COLUMN monthly_day_of_month SET DEFAULT extract(day FROM now())::smallint,
  ALTER COLUMN monthly_day_of_month SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.platform_report_schedules
    ADD CONSTRAINT platform_report_schedules_monthly_day_check
    CHECK (monthly_day_of_month BETWEEN 1 AND 31);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
