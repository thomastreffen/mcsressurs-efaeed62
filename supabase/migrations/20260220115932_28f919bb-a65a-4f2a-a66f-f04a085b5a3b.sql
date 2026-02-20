
-- Atomic claim function for job_calendar_links
-- Uses SELECT FOR UPDATE to prevent race conditions between concurrent syncs
CREATE OR REPLACE FUNCTION public.claim_calendar_sync(
  _job_id uuid,
  _user_id uuid,
  _technician_id uuid,
  _provider text,
  _operation_id uuid,
  _lock_window_seconds int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _link record;
  _now timestamptz := now();
BEGIN
  -- Ensure row exists (idempotent)
  INSERT INTO public.job_calendar_links (job_id, user_id, technician_id, provider)
  VALUES (_job_id, _user_id, _technician_id, _provider)
  ON CONFLICT (job_id, user_id, provider) DO NOTHING;

  -- Lock the row exclusively
  SELECT * INTO _link
  FROM public.job_calendar_links
  WHERE job_id = _job_id AND user_id = _user_id AND provider = _provider
  FOR UPDATE;

  -- Check if another operation is active within the lock window
  IF _link.last_operation_id IS DISTINCT FROM _operation_id
     AND _link.last_operation_at IS NOT NULL
     AND _link.last_operation_at > _now - make_interval(secs := _lock_window_seconds)
  THEN
    RETURN jsonb_build_object(
      'status', 'in_progress',
      'locked_by', _link.last_operation_id,
      'locked_at', _link.last_operation_at
    );
  END IF;

  -- Claim the operation
  UPDATE public.job_calendar_links
  SET last_operation_id = _operation_id,
      last_operation_at = _now
  WHERE id = _link.id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'link_id', _link.id,
    'sync_status', _link.sync_status,
    'last_sync_hash', _link.last_sync_hash,
    'calendar_event_id', _link.calendar_event_id,
    'calendar_event_url', _link.calendar_event_url
  );
END;
$$;
