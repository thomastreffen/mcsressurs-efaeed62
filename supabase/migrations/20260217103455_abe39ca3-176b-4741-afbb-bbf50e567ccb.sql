
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'montør');

-- User roles table (security best practice - roles separate from profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper function to check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Shortcut: is current user admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Technicians table (synced from M365)
CREATE TABLE public.technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  microsoft_user_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

-- Event status enum
CREATE TYPE public.event_status AS ENUM ('pending', 'accepted', 'declined', 'change_request');

-- Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  microsoft_event_id TEXT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  customer TEXT,
  address TEXT,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status event_status NOT NULL DEFAULT 'pending',
  proposed_start TIMESTAMPTZ,
  proposed_end TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for user_roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

-- RLS Policies for technicians
CREATE POLICY "Authenticated users can view technicians"
  ON public.technicians FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert technicians"
  ON public.technicians FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update technicians"
  ON public.technicians FOR UPDATE
  TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete technicians"
  ON public.technicians FOR DELETE
  TO authenticated USING (public.is_admin());

-- RLS Policies for events
CREATE POLICY "Admins see all events, technicians see own"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR 
    technician_id IN (SELECT id FROM public.technicians WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can create events"
  ON public.events FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update all, technicians own"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() OR 
    technician_id IN (SELECT id FROM public.technicians WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can delete events"
  ON public.events FOR DELETE
  TO authenticated USING (public.is_admin());
