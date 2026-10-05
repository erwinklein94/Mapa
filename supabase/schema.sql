create schema if not exists private;
create type public.app_role as enum ('Editor','Analista','Fiscal','Especialista','Coordenador');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 120),
 email text not null,
 role public.app_role not null default 'Analista',
 created_at timestamptz not null default now()
);
create function private.member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid())
$$;
create function private.editor() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role='Editor')
$$;
revoke all on function private.member(),private.editor() from public;
grant usage on schema private to authenticated;
grant execute on function private.member(),private.editor() to authenticated;
create table public.locations (
 id text primary key default gen_random_uuid()::text,
 name text not null check(length(name) between 1 and 180),
 kind text not null default 'Ponto ferroviário' check(kind in ('Ponto ferroviário','AMV','Estação','Pátio','Sede')),
 yard text not null default '',
 source_km text not null default '',
 km_entry numeric check(km_entry>=0),
 km_exit numeric check(km_exit>=0),
 line_type text not null default 'Não classificada' check(line_type in ('Não classificada','Singela','Dupla','Desviada')),
 lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),
 notes text not null default '' check(length(notes)<=10000),
 updated_at timestamptz not null default now(),
 check(km_entry is null or km_exit is null or km_exit>=km_entry)
);
create table public.photos (
 id uuid primary key default gen_random_uuid(),
 location_id text not null references public.locations(id),
 path text not null unique,
 caption text not null default '',
 created_at timestamptz not null default now()
);
create index photos_location_idx on public.photos(location_id);
create table public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid,
 actor_name text not null,
 actor_role text not null,
 action text not null,
 entity text not null,
 entity_id text,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit_logs(created_at desc);
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.profiles; oldj jsonb; newj jsonb;
begin
 if auth.uid() is null then return coalesce(new,old); end if;
 select * into p from public.profiles where id=auth.uid();
 if p.id is null then raise exception 'Acesso não autorizado'; end if;
 if p.role <> 'Editor' then
   if TG_OP <> 'INSERT' then oldj=to_jsonb(old); end if;
   if TG_OP <> 'DELETE' then newj=to_jsonb(new); end if;
   insert into public.audit_logs(actor_id,actor_name,actor_role,action,entity,entity_id,before_data,after_data)
   values(p.id,p.name,p.role,TG_OP,TG_TABLE_NAME,coalesce(newj->>'id',oldj->>'id'),oldj,newj);
 end if;
 return coalesce(new,old);
end $$;
revoke all on function private.audit_change() from public;
create trigger audit_locations after insert or update or delete on public.locations for each row execute function private.audit_change();
create trigger audit_photos after insert or update or delete on public.photos for each row execute function private.audit_change();
create trigger audit_profiles after update on public.profiles for each row execute function private.audit_change();
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.photos enable row level security;
alter table public.audit_logs enable row level security;
grant select on public.profiles to authenticated;
grant update(name) on public.profiles to authenticated;
grant select,insert,update,delete on public.locations,public.photos to authenticated;
grant select on public.audit_logs to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id=(select auth.uid()) or (select private.editor()));
create policy profiles_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy locations_access on public.locations for all to authenticated using ((select private.member())) with check ((select private.member()));
create policy photos_access on public.photos for all to authenticated using ((select private.member())) with check ((select private.member()));
create policy audit_editor on public.audit_logs for select to authenticated using ((select private.editor()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('location-photos','location-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy photos_storage_read on storage.objects for select to authenticated using(bucket_id='location-photos' and (select private.member()));
create policy photos_storage_insert on storage.objects for insert to authenticated with check(bucket_id='location-photos' and (select private.member()));
create policy photos_storage_update on storage.objects for update to authenticated using(bucket_id='location-photos' and (select private.member())) with check(bucket_id='location-photos' and (select private.member()));
create policy photos_storage_delete on storage.objects for delete to authenticated using(bucket_id='location-photos' and (select private.member()));
create function public.record_activity(event text, detail text default '') returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 if auth.uid() is null then raise exception 'Não autorizado'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.id is null then raise exception 'Não autorizado'; end if;
 if event not in ('LOGIN','LOGOUT','VIEW_MAP','VIEW_RECORDS','VIEW_POINT','VIEW_PROFILE') then raise exception 'Evento inválido'; end if;
 if p.role<>'Editor' then insert into public.audit_logs(actor_id,actor_name,actor_role,action,entity,entity_id) values(p.id,p.name,p.role,event,'navigation',left(detail,180)); end if;
end $$;
revoke all on function public.record_activity(text,text) from public;
grant execute on function public.record_activity(text,text) to authenticated;

alter function public.record_activity(text,text) set schema private;
create function public.record_activity(event text,detail text default '') returns void language sql security invoker set search_path='' as 'select private.record_activity(event,detail)';
revoke all on function public.record_activity(text,text) from public;
grant execute on function public.record_activity(text,text) to authenticated;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;

grant all on public.profiles,public.locations,public.photos,public.audit_logs to service_role; grant usage,select on all sequences in schema public to service_role;
