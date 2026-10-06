create table public.amv_inventory (
 id text primary key,
 source_row integer not null check(source_row >= 3),
 source_workbook text not null default 'Gestão Geral de AMV''s (1).xlsx',
 status text,
 action text,
 subdivision text,
 km numeric,
 km_origin text,
 type text,
 leader text,
 derivation text,
 gauge text,
 actuation text,
 needle text,
 rail_profile text,
 opening text,
 description text,
 inspection_cycle text,
 notes text,
 lat double precision check(lat between -90 and 90),
 lng double precision check(lng between -180 and 180),
 position_quality text not null check(position_quality in ('estimated','unlocated','confirmed')),
 position_basis text not null,
 check((lat is null) = (lng is null)),
 check(position_quality = 'unlocated' or lat is not null)
);
create index amv_inventory_km_idx on public.amv_inventory(km);
alter table public.amv_inventory enable row level security;
grant select on public.amv_inventory to authenticated;
grant all on public.amv_inventory to service_role;
create policy amv_inventory_read on public.amv_inventory for select to authenticated using ((select private.member()));
