create table if not exists app_users (
 id bigserial primary key, email text not null unique, password_hash text not null, created_at timestamptz not null default now()
);
create table if not exists leads (
 id bigserial primary key, company text not null, segment text not null default '', city text not null default '', contact text not null default '', contact_channel text not null default '', source text not null default '', owner text not null default '', stage text not null default 'Prospect' check (stage in ('Prospect','Contatado','Conversa com decisor','Reunião marcada','Reunião realizada','Proposta/Teste','Ganho','Perdido')), first_prospect_at date not null default current_date, last_contact_at date, next_action text not null default '', next_action_at date, potential_mrr numeric(12,2) not null default 0 check (potential_mrr >= 0), closed_mrr numeric(12,2) check (closed_mrr >= 0), product text, notes text not null default '', loss_reason text, loss_detail text, closed_at date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists lead_stage_history (
 id bigserial primary key, lead_id bigint not null references leads(id) on delete cascade, from_stage text, to_stage text not null, changed_at timestamptz not null default now(), note text not null default ''
);
create table if not exists clients (
 id bigserial primary key, name text not null, product text not null, mrr numeric(12,2) not null check (mrr >= 0), started_at date not null default current_date, status text not null default 'ativo' check (status in ('ativo','inativo')), source text not null default '', notes text not null default '', lead_id bigint unique references leads(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(name, product)
);
create table if not exists financial_transactions (
 id bigserial primary key, occurred_at date not null default current_date, kind text not null check (kind in ('entrada','saida')), category text not null, description text not null, amount numeric(12,2) not null check (amount > 0), client_id bigint references clients(id) on delete set null, supplier text not null default '', recurring boolean not null default false, notes text not null default '', created_at timestamptz not null default now()
);
create table if not exists settings (
 key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now());
create index if not exists leads_created_at_idx on leads(created_at);
create index if not exists leads_stage_idx on leads(stage);
create index if not exists leads_next_action_at_idx on leads(next_action_at);
create index if not exists lead_stage_history_lead_idx on lead_stage_history(lead_id, changed_at);
create index if not exists clients_status_idx on clients(status);
create index if not exists financial_transactions_date_idx on financial_transactions(occurred_at);
insert into clients(name,product,mrr,status,source,notes) values ('Top Sul','Radar',2400,'ativo','Dado inicial autorizado','MRR ativo conhecido'),('Confraria do Doce','Visto',500,'ativo','Dado inicial autorizado','MRR ativo conhecido') on conflict (name,product) do nothing;
