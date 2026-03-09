-- 001_init.sql: Initial schema for Shift Backend

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  password_hash text,
  name text,
  avatar_url text,
  auth_provider text,
  provider_id text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now() NOT NULL,
  last_login timestamp,
  is_onboarded boolean DEFAULT false
);

CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id),
  username text UNIQUE NOT NULL,
  display_name text,
  bio text,
  profile_visibility text,
  streak_sharing_opt_in boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE onboarding_responses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id),
  objective_type text,
  lockdown_intensity text,
  preferred_focus_time text,
  social_accountability text,
  current_objective_text text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id),
  lockdown_default_intensity text,
  adaptive_triggers_enabled boolean,
  behavior_detection_settings jsonb,
  ai_coaching_style text,
  schedule_awareness jsonb,
  integrations jsonb,
  privacy jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE streaks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id),
  current_streak_days integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  last_session_date date,
  total_focus_hours double precision,
  consecutive_days_completed integer DEFAULT 0,
  streak_heatmap_data jsonb,
  focus_score double precision,
  commitment_score double precision,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE focus_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  task_description text,
  ai_enhanced_task text,
  start_time timestamp,
  end_time timestamp,
  duration_minutes integer,
  interruptions_count integer,
  completed boolean,
  created_at timestamp DEFAULT now()
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id),
  tier text,
  start_date timestamp,
  end_date timestamp,
  payment_provider text,
  is_active boolean,
  created_at timestamp DEFAULT now()
);

CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  item_type text,
  purchase_date timestamp,
  expires_at timestamp,
  created_at timestamp DEFAULT now()
);
