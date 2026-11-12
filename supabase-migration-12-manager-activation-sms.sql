-- Maktaby manager activation: permit SMS challenges for MSG91 delivery.
-- This migration only widens the allowed channel values; it does not change existing rows,
-- activation logic or deployed functions. Review and run in the intended Supabase project.
alter table public.manager_activation_challenges
  drop constraint if exists manager_activation_challenges_channel_check;

alter table public.manager_activation_challenges
  add constraint manager_activation_challenges_channel_check
  check (channel in ('email', 'whatsapp', 'sms'));
