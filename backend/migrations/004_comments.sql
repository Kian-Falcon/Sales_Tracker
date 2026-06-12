CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  department TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 1000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
