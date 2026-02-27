-- Enable RLS on v2_user_learnings (service role bypasses automatically)
ALTER TABLE v2_user_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON v2_user_learnings
  FOR ALL
  USING (true)
  WITH CHECK (true);
