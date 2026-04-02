-- Company-level coordination mode
ALTER TABLE companies
  ADD COLUMN coordination_mode text NOT NULL DEFAULT 'structured';

-- Issue processing queue for sequential mode
ALTER TABLE issues
  ADD COLUMN processing_order jsonb,
  ADD COLUMN processing_position integer,
  ADD COLUMN processing_started_at timestamptz;

-- Track sequential contributions per issue
ALTER TABLE issue_comments
  ADD COLUMN contribution_type text,
  ADD COLUMN claimed_role text;
