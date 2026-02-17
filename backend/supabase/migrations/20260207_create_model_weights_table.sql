-- Migration: Create model_weights table for batch training
-- Date: 2026-02-07

CREATE TABLE IF NOT EXISTS model_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL,
    trained_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    candidate_mlp_state_dict TEXT,
    user_tower_state_dict TEXT,
    training_stats JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_model_weights_trained_at ON model_weights(trained_at DESC);

-- Enable RLS
ALTER TABLE model_weights ENABLE ROW LEVEL SECURITY;

-- Policy (adjust as needed for your auth setup)
-- CREATE POLICY "Allow read access" ON model_weights FOR SELECT USING (true);
-- CREATE POLICY "Allow write access" ON model_weights FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow write access" ON model_weights FOR UPDATE USING (true);
-- CREATE POLICY "Allow write access" ON model_weights FOR DELETE USING (true);
