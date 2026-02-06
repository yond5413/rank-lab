-- Migration: Create attention verification logs table
-- Description: Track attention masking verification tests for candidate isolation
-- Created: 2026-02-06

-- Create the attention_verification_logs table
CREATE TABLE IF NOT EXISTS public.attention_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  batch_1_score FLOAT,
  batch_2_score FLOAT,
  score_diff FLOAT,
  test_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_consistent BOOLEAN GENERATED ALWAYS AS (ABS(COALESCE(batch_1_score, 0) - COALESCE(batch_2_score, 0)) < 0.01) STORED
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_attention_logs_post_id ON public.attention_verification_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_attention_logs_timestamp ON public.attention_verification_logs(test_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attention_logs_consistency ON public.attention_verification_logs(is_consistent);
CREATE INDEX IF NOT EXISTS idx_attention_logs_score_diff ON public.attention_verification_logs(score_diff DESC);

-- Add comments for documentation
COMMENT ON TABLE public.attention_verification_logs IS 'Logs for attention masking verification tests';
COMMENT ON COLUMN public.attention_verification_logs.post_id IS 'Post used in the verification test';
COMMENT ON COLUMN public.attention_verification_logs.batch_1_score IS 'Score from first batch configuration';
COMMENT ON COLUMN public.attention_verification_logs.batch_2_score IS 'Score from second batch configuration';
COMMENT ON COLUMN public.attention_verification_logs.score_diff IS 'Absolute difference between batch scores';
COMMENT ON COLUMN public.attention_verification_logs.is_consistent IS 'Whether scores are consistent (diff < 0.01)';

-- Enable Row Level Security
ALTER TABLE public.attention_verification_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (admin-only access)
-- Only authenticated users can view logs (admin dashboard)
CREATE POLICY "Attention logs viewable by authenticated users" 
  ON public.attention_verification_logs 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Only service role can insert logs
CREATE POLICY "Service can insert attention logs" 
  ON public.attention_verification_logs 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');