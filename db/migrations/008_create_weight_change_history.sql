-- Migration: Create weight change history table
-- Description: Track scoring weight changes for audit and rollback capabilities
-- Created: 2026-02-06

-- Create the weight_change_history table
CREATE TABLE IF NOT EXISTS public.weight_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL,
  old_weight FLOAT NOT NULL,
  new_weight FLOAT NOT NULL,
  weight_diff FLOAT GENERATED ALWAYS AS (new_weight - old_weight) STORED,
  changed_by VARCHAR(100),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  change_reason TEXT,
  session_id UUID -- For grouping related changes
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_weight_history_action_type ON public.weight_change_history(action_type);
CREATE INDEX IF NOT EXISTS idx_weight_history_changed_at ON public.weight_change_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_history_changed_by ON public.weight_change_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_weight_history_session_id ON public.weight_change_history(session_id);

-- Add comments for documentation
COMMENT ON TABLE public.weight_change_history IS 'History of scoring weight changes for audit and rollback';
COMMENT ON COLUMN public.weight_change_history.action_type IS 'Type of action (like, reply, repost, etc.)';
COMMENT ON COLUMN public.weight_change_history.old_weight IS 'Previous weight value';
COMMENT ON COLUMN public.weight_change_history.new_weight IS 'New weight value';
COMMENT ON COLUMN public.weight_change_history.weight_diff IS 'Calculated difference (new - old)';
COMMENT ON COLUMN public.weight_change_history.changed_by IS 'User or system that made the change';
COMMENT ON COLUMN public.weight_change_history.change_reason IS 'Optional reason for the change';
COMMENT ON COLUMN public.weight_change_history.session_id IS 'Groups related changes made together';

-- Enable Row Level Security
ALTER TABLE public.weight_change_history ENABLE ROW LEVEL SECURITY;

-- Create policies (admin-only access)
-- Only authenticated users can view weight history (admin dashboard)
CREATE POLICY "Weight history viewable by authenticated users" 
  ON public.weight_change_history 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Only service role can insert weight history
CREATE POLICY "Service can insert weight history" 
  ON public.weight_change_history 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

-- Create a function to automatically log weight changes
CREATE OR REPLACE FUNCTION public.log_weight_change()
RETURNS TRIGGER AS $$
DECLARE
  session_uuid UUID;
BEGIN
  -- Generate a session ID for this change batch
  session_uuid := gen_random_uuid();
  
  IF (TG_OP = 'UPDATE') THEN
    -- Only log if weight actually changed
    IF OLD.weight != NEW.weight THEN
      INSERT INTO public.weight_change_history (
        action_type,
        old_weight,
        new_weight,
        changed_by,
        change_reason,
        session_id
      ) VALUES (
        NEW.action_type,
        OLD.weight,
        NEW.weight,
        'admin_dashboard', -- Default, can be overridden
        'Weight updated via admin interface',
        session_uuid
      );
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    -- Log initial weight setting
    INSERT INTO public.weight_change_history (
      action_type,
      old_weight,
      new_weight,
      changed_by,
      change_reason,
      session_id
    ) VALUES (
      NEW.action_type,
      0.0, -- Assume 0 as initial old weight
      NEW.weight,
      'system_initialization',
      'Initial weight setting',
      session_uuid
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic weight change logging
DROP TRIGGER IF EXISTS log_scoring_weight_changes ON public.scoring_weights;
CREATE TRIGGER log_scoring_weight_changes
  AFTER INSERT OR UPDATE ON public.scoring_weights
  FOR EACH ROW
  EXECUTE FUNCTION public.log_weight_change();