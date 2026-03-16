
DROP POLICY "Service can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());
