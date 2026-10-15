-- Extend per-user, per-clinic visual preferences with accessible contrast and text size.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS high_contrast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS text_size text NOT NULL DEFAULT 'normal'
    CHECK (text_size IN ('normal', 'large'));
