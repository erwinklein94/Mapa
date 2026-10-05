create table public.documents (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 255),
 path text not null unique,
 format text not null check(format in ('PDF','XLS','XLSX')),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=52428800),
 created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
grant select,insert,delete on public.documents to authenticated;
grant all on public.documents to service_role;
create policy documents_read on public.documents for select to authenticated using ((select private.member()));
create policy documents_insert on public.documents for insert to authenticated with check ((select private.editor()));
create policy documents_delete on public.documents for delete to authenticated using ((select private.editor()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,52428800,array['application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
create policy documents_storage_read on storage.objects for select to authenticated using(bucket_id='documents' and (select private.member()) and exists(select 1 from public.documents d where d.path=storage.objects.name));
create policy documents_storage_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and (select private.editor()));
create policy documents_storage_delete on storage.objects for delete to authenticated using(bucket_id='documents' and (select private.editor()));
create or replace function private.record_activity(event text, detail text default '') returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 if auth.uid() is null then raise exception 'Não autorizado'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.id is null then raise exception 'Não autorizado'; end if;
 if event not in ('LOGIN','LOGOUT','VIEW_MAP','VIEW_RECORDS','VIEW_POINT','VIEW_PROFILE','VIEW_DOCUMENTS','DOWNLOAD_DOCUMENT') then raise exception 'Evento inválido'; end if;
 if p.role<>'Editor' then insert into public.audit_logs(actor_id,actor_name,actor_role,action,entity,entity_id) values(p.id,p.name,p.role,event,case when event='DOWNLOAD_DOCUMENT' then 'documents' else 'navigation' end,left(detail,180)); end if;
end $$;
