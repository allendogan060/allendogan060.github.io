-- Servora web dashboard: role-aware workspace loading and atomic state patches.
-- Run after cloud_state_migration.sql.

begin;

create or replace function public.web_get_restaurant_workspace(
  p_restaurant_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = 'pg_catalog'
as $$
  select jsonb_build_object(
    'restaurantId', restaurant_row.id,
    'restaurantName', restaurant_row.name,
    'restaurantCode', restaurant_row.code::text,
    'restaurantType', restaurant_row.restaurant_type,
    'username', member_row.username::text,
    'displayName', member_row.display_name,
    'role', member_row.role,
    'state', coalesce(state_row.state, '{}'::jsonb),
    'updatedAt', state_row.updated_at
  )
  from public.restaurant_members as member_row
  join public.restaurants as restaurant_row
    on restaurant_row.id = member_row.restaurant_id
  left join public.restaurant_states as state_row
    on state_row.restaurant_id = member_row.restaurant_id
  where member_row.user_id = (select auth.uid())
    and member_row.is_active
    and (
      p_restaurant_id is null
      or member_row.restaurant_id = p_restaurant_id
    )
  order by member_row.updated_at desc
  limit 1;
$$;

create or replace function public.web_initialize_restaurant_state(
  p_restaurant_id uuid,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  member_role text;
  saved public.restaurant_states;
begin
  select member.role
  into member_role
  from public.restaurant_members as member
  where member.restaurant_id = p_restaurant_id
    and member.user_id = auth.uid()
    and member.is_active
  limit 1;

  if member_role <> 'restaurant_manager' then
    raise exception 'Access denied';
  end if;
  if jsonb_typeof(p_state) <> 'object'
     or pg_column_size(p_state) > 5242880 then
    raise exception 'Invalid restaurant state';
  end if;

  insert into public.restaurant_states (restaurant_id, state)
  values (p_restaurant_id, p_state)
  on conflict (restaurant_id)
  do nothing;

  select *
  into saved
  from public.restaurant_states
  where restaurant_id = p_restaurant_id;

  return jsonb_build_object(
    'state', saved.state,
    'updatedAt', saved.updated_at
  );
end;
$$;

create or replace function public.web_patch_restaurant_state(
  p_restaurant_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  member_role text;
  requested_keys text[];
  allowed_keys text[];
  existing public.restaurant_states;
  saved public.restaurant_states;
begin
  select member.role
  into member_role
  from public.restaurant_members as member
  where member.restaurant_id = p_restaurant_id
    and member.user_id = auth.uid()
    and member.is_active
  limit 1;

  if member_role is null then
    raise exception 'Access denied';
  end if;
  if jsonb_typeof(p_patch) <> 'object'
     or p_patch = '{}'::jsonb
     or pg_column_size(p_patch) > 2097152 then
    raise exception 'Invalid state patch';
  end if;

  requested_keys := array(
    select jsonb_object_keys(p_patch)
  );

  if member_role = 'restaurant_manager' then
    allowed_keys := array[
      'restaurantName', 'tables', 'areas', 'hiddenAreas', 'products',
      'categories', 'categoryColors', 'categoryParents',
      'stations', 'team', 'tickets', 'reservations',
      'guestReviews', 'tableOrders', 'tableSaleItems', 'tableRevenue',
      'activeShiftStart', 'activeBreakStart', 'accumulatedBreak',
      'shiftRecords', 'scheduledShifts', 'shiftRequests', 'absenceRequests', 'paymentMethods',
      'paymentRecords', 'counterSales', 'vouchers', 'voucherConfiguration',
      'printers', 'printJobs', 'onlineBookingConfiguration',
      'servoraPlusEntitlement', 'fiscalConfiguration', 'fiscalReceipts',
      'cashDaySessions', 'fiscalAuditEvents'
    ];
  elsif member_role in ('management', 'service') then
    allowed_keys := array[
      'tables', 'tickets', 'reservations', 'tableOrders', 'tableSaleItems',
      'tableRevenue', 'activeShiftStart', 'activeBreakStart',
      'accumulatedBreak', 'shiftRecords', 'shiftRequests',
      'absenceRequests', 'paymentRecords', 'counterSales', 'vouchers',
      'printJobs'
    ];
  elsif member_role in ('kitchen', 'bar') then
    allowed_keys := array[
      'tickets', 'activeShiftStart', 'activeBreakStart',
      'accumulatedBreak', 'shiftRecords', 'shiftRequests',
      'absenceRequests', 'printJobs'
    ];
  else
    raise exception 'Role is not supported in the web dashboard';
  end if;

  if exists (
    select 1
    from unnest(requested_keys) as requested(key)
    where not (requested.key = any(allowed_keys))
  ) then
    raise exception 'Patch contains fields not allowed for this role';
  end if;

  select *
  into existing
  from public.restaurant_states
  where restaurant_id = p_restaurant_id
  for update;

  if existing.restaurant_id is null then
    raise exception 'Restaurant state missing';
  end if;
  if p_expected_updated_at is not null
     and existing.updated_at <> p_expected_updated_at then
    raise exception 'STATE_CONFLICT';
  end if;

  update public.restaurant_states
  set state = existing.state || p_patch
  where restaurant_id = p_restaurant_id
  returning * into saved;

  return jsonb_build_object(
    'state', saved.state,
    'updatedAt', saved.updated_at
  );
end;
$$;

revoke all on function public.web_get_restaurant_workspace(uuid)
  from public, anon;
grant execute on function public.web_get_restaurant_workspace(uuid)
  to authenticated;

revoke all on function public.web_initialize_restaurant_state(uuid, jsonb)
  from public, anon;
grant execute on function public.web_initialize_restaurant_state(uuid, jsonb)
  to authenticated;

revoke all on function public.web_patch_restaurant_state(uuid, jsonb, timestamptz)
  from public, anon;
grant execute on function public.web_patch_restaurant_state(uuid, jsonb, timestamptz)
  to authenticated;

commit;
