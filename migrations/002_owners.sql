alter table app_users add column if not exists display_name text not null default '';
alter table clients add column if not exists owner text not null default '';
create index if not exists clients_owner_idx on clients(owner);
insert into schema_migrations(version) values ('002_owners') on conflict do nothing;
