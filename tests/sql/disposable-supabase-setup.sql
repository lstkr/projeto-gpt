-- Exclusivo de PostgreSQL descartável em loopback. Nunca aplicar em Supabase remoto.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create schema if not exists storage;
create table if not exists storage.buckets(id text primary key);
create table if not exists storage.objects(id uuid primary key);
