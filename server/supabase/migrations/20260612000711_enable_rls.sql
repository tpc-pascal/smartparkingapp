-- Enable RLS & create policies for all app tables
-- Idempotent: drop before create

-- Ensure uid columns exist (uuid type matching auth.uid())
ALTER TABLE attendants ADD COLUMN IF NOT EXISTS uid uuid;
ALTER TABLE parking_logs ADD COLUMN IF NOT EXISTS uid uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS uid uuid;

-- 1. attendants
ALTER TABLE attendants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendants_insert_own" ON attendants;
CREATE POLICY "attendants_insert_own" ON attendants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "attendants_select_own" ON attendants;
CREATE POLICY "attendants_select_own" ON attendants
  FOR SELECT USING (uid = auth.uid());

DROP POLICY IF EXISTS "attendants_update_own" ON attendants;
CREATE POLICY "attendants_update_own" ON attendants
  FOR UPDATE USING (uid = auth.uid());

-- 2. parking_logs
ALTER TABLE parking_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parking_logs_insert_own" ON parking_logs;
CREATE POLICY "parking_logs_insert_own" ON parking_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "parking_logs_select_own" ON parking_logs;
CREATE POLICY "parking_logs_select_own" ON parking_logs
  FOR SELECT USING (uid = auth.uid());

DROP POLICY IF EXISTS "parking_logs_update_own" ON parking_logs;
CREATE POLICY "parking_logs_update_own" ON parking_logs
  FOR UPDATE USING (uid = auth.uid());

-- Auto-set uid on INSERT (vì app không gửi uid trong body)
CREATE OR REPLACE FUNCTION set_parking_logs_uid()
RETURNS TRIGGER AS $$
BEGIN
  NEW.uid := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_parking_logs_uid ON parking_logs;
CREATE TRIGGER trg_set_parking_logs_uid
  BEFORE INSERT ON parking_logs
  FOR EACH ROW
  EXECUTE FUNCTION set_parking_logs_uid();

-- 3. sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_insert_own" ON sessions;
CREATE POLICY "sessions_insert_own" ON sessions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sessions_select_own" ON sessions;
CREATE POLICY "sessions_select_own" ON sessions
  FOR SELECT USING (uid = auth.uid());

DROP POLICY IF EXISTS "sessions_update_own" ON sessions;
CREATE POLICY "sessions_update_own" ON sessions
  FOR UPDATE USING (uid = auth.uid());

-- Auto-set uid on INSERT
CREATE OR REPLACE FUNCTION set_sessions_uid()
RETURNS TRIGGER AS $$
BEGIN
  NEW.uid := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_sessions_uid ON sessions;
CREATE TRIGGER trg_set_sessions_uid
  BEFORE INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_sessions_uid();
