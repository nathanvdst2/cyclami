-- =====================================================================
-- Cyclami : schéma de la base de données Supabase
-- À coller dans Supabase → SQL Editor → New query → Run.
-- Le script peut être relancé sans risque.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  city text not null default '' check (char_length(city) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  availability text[] not null default '{}',
  -- position arrondie (~1 km) : jamais l'adresse exacte
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  species text not null,
  breed text not null default '' check (char_length(breed) <= 60),
  size text not null check (size in ('petit', 'moyen', 'grand')),
  age int not null default 1 check (age between 0 and 40),
  energy int not null default 3 check (energy between 1 and 5),
  emoji text not null default '🐾',
  traits text[] not null default '{}',
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  place text not null check (char_length(place) between 1 and 150),
  starts_at timestamptz not null,
  duration int not null default 60 check (duration between 5 and 600),
  pace text not null default 'normal' check (pace in ('tranquille', 'normal', 'sportif')),
  max_participants int not null default 5 check (max_participants between 2 and 50),
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.ride_participants (
  ride_id uuid not null references public.rides (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  scene text not null default '',
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at);
create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- ---------- Fonctions et déclencheurs ---------------------------------

-- Crée le profil automatiquement à l'inscription (nom et ville passés en métadonnées).
-- Avec Google, on ne garde que le prénom (premier mot du nom complet).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  google boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google';
  full_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'name');
begin
  insert into public.profiles (id, name, city)
  values (
    new.id,
    coalesce(nullif(left(case when google then split_part(trim(full_name), ' ', 1)
                              else new.raw_user_meta_data ->> 'name' end, 50), ''), 'Anonyme'),
    coalesce(left(new.raw_user_meta_data ->> 'city', 80), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- L'organisateur participe automatiquement à sa sortie.
create or replace function public.add_host_to_ride()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ride_participants (ride_id, user_id) values (new.id, new.host_id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_ride_created on public.rides;
create trigger on_ride_created
  after insert on public.rides
  for each row execute function public.add_host_to_ride();

-- Refuse l'inscription à une sortie complète.
create or replace function public.check_ride_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  max_p int;
  current_p int;
begin
  select max_participants into max_p from public.rides where id = new.ride_id for update;
  select count(*) into current_p from public.ride_participants where ride_id = new.ride_id;
  if current_p >= max_p then
    raise exception 'Cette sortie est complète';
  end if;
  return new;
end $$;

drop trigger if exists before_ride_join on public.ride_participants;
create trigger before_ride_join
  before insert on public.ride_participants
  for each row execute function public.check_ride_capacity();

-- Vrai si l'un des deux utilisateurs a bloqué l'autre.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
-- Pour les politiques : seulement entre MOI et quelqu'un (ne révèle pas les blocages des autres).
create or replace function public.is_blocked_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select other is not null and exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other) or (blocker_id = other and blocked_id = auth.uid())
  );
$$;

-- Permet à un utilisateur de supprimer définitivement son compte (RGPD).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Sécurité : Row Level Security -----------------------------
-- Seuls les membres connectés voient les données ; chacun ne modifie que les siennes.

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.rides enable row level security;
alter table public.ride_participants enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- profiles
drop policy if exists "profiles lisibles par les membres" on public.profiles;
create policy "profiles lisibles par les membres" on public.profiles
  for select to authenticated using (true);
drop policy if exists "modifier son profil" on public.profiles;
create policy "modifier son profil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- pets
drop policy if exists "animaux lisibles par les membres" on public.pets;
create policy "animaux lisibles par les membres" on public.pets
  for select to authenticated using (true);
drop policy if exists "gérer ses animaux" on public.pets;
create policy "gérer ses animaux" on public.pets
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- rides
drop policy if exists "sorties lisibles par les membres" on public.rides;
create policy "sorties lisibles par les membres" on public.rides
  for select to authenticated using (true);
drop policy if exists "gérer ses sorties" on public.rides;
create policy "gérer ses sorties" on public.rides
  for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

-- ride_participants
drop policy if exists "participants lisibles par les membres" on public.ride_participants;
create policy "participants lisibles par les membres" on public.ride_participants
  for select to authenticated using (true);
drop policy if exists "rejoindre une sortie" on public.ride_participants;
create policy "rejoindre une sortie" on public.ride_participants
  for insert to authenticated with check (
    user_id = auth.uid()
    and not public.is_blocked_with((select host_id from public.rides w where w.id = ride_id))
    and (select starts_at from public.rides w where w.id = ride_id) > now() - interval '1 hour'
  );
drop policy if exists "quitter une sortie" on public.ride_participants;
create policy "quitter une sortie" on public.ride_participants
  for delete to authenticated using (user_id = auth.uid());

-- posts
drop policy if exists "posts lisibles par les membres" on public.posts;
create policy "posts lisibles par les membres" on public.posts
  for select to authenticated using (true);
drop policy if exists "gérer ses posts" on public.posts;
create policy "gérer ses posts" on public.posts
  for all to authenticated using (author_id = auth.uid()) with check (
    author_id = auth.uid()
    and (pet_id is null or exists (select 1 from public.pets where id = pet_id and owner_id = auth.uid())));

-- post_likes
drop policy if exists "likes lisibles par les membres" on public.post_likes;
create policy "likes lisibles par les membres" on public.post_likes
  for select to authenticated using (true);
drop policy if exists "aimer" on public.post_likes;
create policy "aimer" on public.post_likes
  for insert to authenticated with check (
    user_id = auth.uid() and not public.is_blocked_with((select author_id from public.posts where id = post_id)));
drop policy if exists "ne plus aimer" on public.post_likes;
create policy "ne plus aimer" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

-- messages : visibles uniquement par l'expéditeur et le destinataire
drop policy if exists "lire ses messages" on public.messages;
create policy "lire ses messages" on public.messages
  for select to authenticated using (auth.uid() in (sender_id, recipient_id));
drop policy if exists "envoyer un message" on public.messages;
create policy "envoyer un message" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and not public.is_blocked_with(recipient_id)
  );
drop policy if exists "marquer comme lu" on public.messages;
create policy "marquer comme lu" on public.messages
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- blocks : chacun ne voit que ses propres blocages
drop policy if exists "voir ses blocages" on public.blocks;
create policy "voir ses blocages" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "bloquer" on public.blocks;
create policy "bloquer" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists "débloquer" on public.blocks;
create policy "débloquer" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- reports : on peut signaler, seuls les administrateurs (tableau de bord) les lisent
drop policy if exists "signaler" on public.reports;
create policy "signaler" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ---------- Photos (Storage) ------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Chaque membre dépose ses photos dans un dossier à son identifiant.
drop policy if exists "déposer ses photos" on storage.objects;
create policy "déposer ses photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "supprimer ses photos" on storage.objects;
create policy "supprimer ses photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and owner_id = auth.uid()::text);

-- ---------- Temps réel (messagerie) -----------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- =====================================================================
-- Version 2 : carte, commentaires, photos dans les messages, notifications
-- =====================================================================

-- ---------- Lieu de rendez-vous des sorties sur la carte --------------
alter table public.rides add column if not exists lat double precision;
alter table public.rides add column if not exists lng double precision;

-- ---------- Photos dans les messages ----------------------------------
alter table public.messages add column if not exists photo_url text;
-- messages vocaux (version 88) : colonne créée dès ici pour que la règle ci-dessous reste valable quand le script est relancé
alter table public.messages add column if not exists audio_path text;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 2000 and (char_length(body) > 0 or photo_url is not null or audio_path is not null)
);

-- ---------- Commentaires (sur une publication ou une sortie) ----------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  ride_id uuid references public.rides (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (ride_id is null))
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_ride_idx on public.comments (ride_id, created_at);

alter table public.comments enable row level security;
drop policy if exists "commentaires lisibles par les membres" on public.comments;
create policy "commentaires lisibles par les membres" on public.comments
  for select to authenticated using (true);
drop policy if exists "commenter" on public.comments;
create policy "commenter" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and not public.is_blocked_with(coalesce((select author_id from public.posts where id = post_id),
                                            (select host_id from public.rides where id = ride_id))));
drop policy if exists "supprimer son commentaire" on public.comments;
create policy "supprimer son commentaire" on public.comments
  for delete to authenticated using (author_id = auth.uid());

-- ---------- Notifications ---------------------------------------------
-- Créées uniquement par les déclencheurs ci-dessous ; chacun ne voit que les siennes.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in ('ride_join', 'ride_cancelled', 'comment', 'like')),
  post_id uuid,
  ride_id uuid,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "voir ses notifications" on public.notifications;
create policy "voir ses notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "marquer ses notifications" on public.notifications;
create policy "marquer ses notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "effacer ses notifications" on public.notifications;
create policy "effacer ses notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Quelqu'un rejoint ma sortie
create or replace function public.notify_ride_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  w record;
begin
  select id, host_id, title into w from public.rides where id = new.ride_id;
  if w.host_id is not null and w.host_id <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, ride_id, data)
    values (w.host_id, new.user_id, 'ride_join', w.id, jsonb_build_object('title', w.title));
  end if;
  return new;
end $$;

drop trigger if exists on_ride_join_notify on public.ride_participants;
create trigger on_ride_join_notify
  after insert on public.ride_participants
  for each row execute function public.notify_ride_join();

-- Une sortie à laquelle je participe est annulée
create or replace function public.notify_ride_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- pas d'actor_id : l'organisateur peut être en train de supprimer son compte
  insert into public.notifications (user_id, type, ride_id, data)
  select p.user_id, 'ride_cancelled', old.id,
         jsonb_build_object('title', old.title, 'starts_at', old.starts_at)
  from public.ride_participants p
  where p.ride_id = old.id and p.user_id <> old.host_id;
  return old;
end $$;

drop trigger if exists on_ride_cancel_notify on public.rides;
create trigger on_ride_cancel_notify
  before delete on public.rides
  for each row execute function public.notify_ride_cancelled();

-- Nouveau commentaire sur ma publication ou ma sortie
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  label text;
begin
  if new.post_id is not null then
    select author_id, left(body, 60) into owner, label from public.posts where id = new.post_id;
  else
    select host_id, title into owner, label from public.rides where id = new.ride_id;
  end if;
  if owner is not null and owner <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, post_id, ride_id, data)
    values (owner, new.author_id, 'comment', new.post_id, new.ride_id,
            jsonb_build_object('title', label, 'excerpt', left(new.body, 80)));
  end if;
  return new;
end $$;

drop trigger if exists on_comment_notify on public.comments;
create trigger on_comment_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- Quelqu'un aime ma publication
create or replace function public.notify_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select author_id into owner from public.posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end $$;

drop trigger if exists on_like_notify on public.post_likes;
create trigger on_like_notify
  after insert on public.post_likes
  for each row execute function public.notify_like();

-- ---------- Temps réel pour les notifications -------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------- Garde-fous : emoji et décor limités à un vrai emoji -------
alter table public.pets drop constraint if exists pets_emoji_length;
alter table public.pets add constraint pets_emoji_length check (char_length(emoji) <= 8) not valid;
alter table public.posts drop constraint if exists posts_scene_length;
alter table public.posts add constraint posts_scene_length check (char_length(scene) <= 8) not valid;

-- =====================================================================
-- Version 3 : photos de messages privées, sorties modifiables, recherche
-- =====================================================================

-- ---------- Photos des messages privés : stockage non public ----------
-- Seuls l'expéditeur (dossier à son nom) et le destinataire du message peuvent les lire,
-- via des liens temporaires.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-photos', 'message-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "déposer une photo de message" on storage.objects;
create policy "déposer une photo de message" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'message-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "lire les photos de ses conversations" on storage.objects;
create policy "lire les photos de ses conversations" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages m
        where m.photo_url = name and m.recipient_id = auth.uid()
      )
    )
  );

drop policy if exists "supprimer ses photos de message" on storage.objects;
create policy "supprimer ses photos de message" on storage.objects
  for delete to authenticated
  using (bucket_id = 'message-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Sortie modifiée : prévenir les participants ---------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('ride_join', 'ride_cancelled', 'ride_updated', 'comment', 'like',
                  'warning', 'suspended', 'report_resolved', 'content_removed',
                  'review', 'lost_pet', 'pet_found', 'sitting_request', 'sitting_answer', 'health_reminder',
                  'forum_reply', 'pet_birthday', 'ride_message', 'group_ride', 'group_message', 'shelter_reply', 'shelter_need', 'sitting_review', 'follow', 'shelter_event', 'shelter_status', 'sitting_rate', 'trusted_sitter', 'feedback', 'chat_mention', 'ride_reminder', 'member_nearby', 'hazard', 'referral', 'verification'));

create or replace function public.notify_ride_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.starts_at is distinct from old.starts_at
     or new.place is distinct from old.place
     or new.lat is distinct from old.lat
     or new.lng is distinct from old.lng then
    insert into public.notifications (user_id, actor_id, type, ride_id, data)
    select p.user_id, new.host_id, 'ride_updated', new.id,
           jsonb_build_object('title', new.title, 'starts_at', new.starts_at, 'place', new.place)
    from public.ride_participants p
    where p.ride_id = new.id and p.user_id <> new.host_id
      -- au plus une notification toutes les 10 minutes par sortie (pas de rafale en modifiant en boucle)
      and not exists (select 1 from public.notifications n
                      where n.type = 'ride_updated' and n.ride_id = new.id and n.user_id = p.user_id
                        and n.created_at > now() - interval '10 minutes');
  end if;
  return new;
end $$;

drop trigger if exists on_ride_update_notify on public.rides;
create trigger on_ride_update_notify
  after update on public.rides
  for each row execute function public.notify_ride_updated();

-- ---------- Index pour charger seulement les membres proches ----------
create index if not exists profiles_location_idx on public.profiles (lat, lng);
create index if not exists rides_starts_at_idx on public.rides (starts_at);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists ride_participants_user_idx on public.ride_participants (user_id);
create index if not exists post_likes_post_idx on public.post_likes (post_id);
create index if not exists pets_owner_idx on public.pets (owner_id);

-- =====================================================================
-- Version 4 : administration (super-utilisateur, modération, bannissement)
-- =====================================================================

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "savoir si je suis admin" on public.admins;
create policy "savoir si je suis admin" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Super-utilisateur du site. Par sécurité, seul un compte avec cette adresse créé
-- AVANT la mise en place de l'administration est promu : personne ne peut s'inscrire
-- plus tard avec cette adresse pour devenir admin. Pour ajouter un admin ensuite :
-- insert into public.admins (user_id) values ('<id du compte>');
insert into public.admins (user_id)
select id from auth.users
where lower(email) = 'nathanbarbaraytb@gmail.com' and created_at < '2026-10-12 11:43:00+00'
on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Signalements : suivi par les admins -----------------------
alter table public.reports add column if not exists resolved_at timestamptz;
drop policy if exists "admins lisent les signalements" on public.reports;
create policy "admins lisent les signalements" on public.reports
  for select to authenticated using (public.is_admin());
drop policy if exists "admins traitent les signalements" on public.reports;
create policy "admins traitent les signalements" on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Modération : les admins peuvent retirer n'importe quel contenu
drop policy if exists "admins suppriment les publications" on public.posts;
create policy "admins suppriment les publications" on public.posts
  for delete to authenticated using (public.is_admin());
drop policy if exists "admins suppriment les commentaires" on public.comments;
create policy "admins suppriment les commentaires" on public.comments
  for delete to authenticated using (public.is_admin());
drop policy if exists "admins suppriment les sorties" on public.rides;
create policy "admins suppriment les sorties" on public.rides
  for delete to authenticated using (public.is_admin());

-- ---------- Bannissement ----------------------------------------------
create table if not exists public.banned_emails (
  email text primary key,
  reason text not null default '',
  banned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.banned_emails enable row level security;
drop policy if exists "admins voient les bannis" on public.banned_emails;
create policy "admins voient les bannis" on public.banned_emails
  for select to authenticated using (public.is_admin());
drop policy if exists "admins débannissent" on public.banned_emails;
create policy "admins débannissent" on public.banned_emails
  for delete to authenticated using (public.is_admin());

-- Une adresse bannie ne peut plus créer de compte.
create or replace function public.reject_banned_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.banned_emails where email = lower(new.email)) then
    raise exception 'Cette adresse e-mail a été bannie du site';
  end if;
  return new;
end $$;

drop trigger if exists before_signup_check_ban on auth.users;
create trigger before_signup_check_ban
  before insert on auth.users
  for each row execute function public.reject_banned_signup();

-- Bannir un membre : son compte et tous ses contenus sont supprimés, son adresse bloquée.
create or replace function public.admin_ban_user(target uuid, reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if target = auth.uid() or exists (select 1 from public.admins where user_id = target) then
    raise exception 'Impossible de bannir un administrateur';
  end if;
  insert into public.banned_emails (email, reason, banned_by)
  select lower(email), coalesce(reason, ''), auth.uid() from auth.users where id = target and email is not null
  on conflict (email) do nothing;
  delete from auth.users where id = target;
end $$;

-- Liste des membres avec leur e-mail (visible des admins uniquement).
drop function if exists public.admin_members(); -- redéfinie plus complète en version 7
create or replace function public.admin_members()
returns table (id uuid, name text, city text, email text, created_at timestamptz,
               last_sign_in_at timestamptz, pets bigint, posts bigint, reports_against bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query
    select p.id, p.name, p.city, u.email::text, p.created_at, u.last_sign_in_at,
           (select count(*) from public.pets x where x.owner_id = p.id),
           (select count(*) from public.posts x where x.author_id = p.id),
           (select count(*) from public.reports x where x.reported_id = p.id and x.resolved_at is null)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 500;
end $$;

-- Chiffres clés du site (aucun contenu privé : seulement des totaux).
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return json_build_object(
    'members', (select count(*) from public.profiles),
    'members_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'pets', (select count(*) from public.pets),
    'rides_upcoming', (select count(*) from public.rides where starts_at > now()),
    'posts', (select count(*) from public.posts),
    'messages', (select count(*) from public.messages),
    'reports_open', (select count(*) from public.reports where resolved_at is null)
  );
end $$;

revoke execute on function public.admin_ban_user(uuid, text) from public, anon;
revoke execute on function public.admin_members() from public, anon;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_ban_user(uuid, text) to authenticated;
grant execute on function public.admin_members() to authenticated;
grant execute on function public.admin_stats() to authenticated;

-- =====================================================================
-- Version 5 : équipe (admin + modérateurs) et badge « Staff »
-- =====================================================================

alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('admin', 'moderator'));

-- Le badge « Staff » est public : tout membre connecté peut savoir qui fait partie de l'équipe.
drop policy if exists "savoir si je suis admin" on public.admins;
drop policy if exists "équipe visible des membres" on public.admins;
create policy "équipe visible des membres" on public.admins
  for select to authenticated using (true);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'admin');
$$;

-- Admin ou modérateur
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Les modérateurs traitent les signalements et retirent les contenus.
drop policy if exists "admins lisent les signalements" on public.reports;
create policy "admins lisent les signalements" on public.reports
  for select to authenticated using (public.is_staff());
drop policy if exists "admins traitent les signalements" on public.reports;
create policy "admins traitent les signalements" on public.reports
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "admins suppriment les publications" on public.posts;
create policy "admins suppriment les publications" on public.posts
  for delete to authenticated using (public.is_staff());
drop policy if exists "admins suppriment les commentaires" on public.comments;
create policy "admins suppriment les commentaires" on public.comments
  for delete to authenticated using (public.is_staff());
drop policy if exists "admins suppriment les sorties" on public.rides;
create policy "admins suppriment les sorties" on public.rides
  for delete to authenticated using (public.is_staff());

create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  return json_build_object(
    'members', (select count(*) from public.profiles),
    'members_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'pets', (select count(*) from public.pets),
    'rides_upcoming', (select count(*) from public.rides where starts_at > now()),
    'posts', (select count(*) from public.posts),
    'messages', (select count(*) from public.messages),
    'reports_open', (select count(*) from public.reports where resolved_at is null)
  );
end $$;

-- Nommer (role = 'moderator') ou retirer (role = null) un modérateur : admin uniquement.
create or replace function public.admin_set_moderator(target uuid, make_moderator boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if exists (select 1 from public.admins where user_id = target and role = 'admin') then
    raise exception 'Impossible de modifier le rôle d''un administrateur';
  end if;
  if make_moderator then
    insert into public.admins (user_id, role) values (target, 'moderator')
    on conflict (user_id) do update set role = 'moderator';
  else
    delete from public.admins where user_id = target and role = 'moderator';
  end if;
end $$;

revoke execute on function public.admin_set_moderator(uuid, boolean) from public, anon;
grant execute on function public.admin_set_moderator(uuid, boolean) to authenticated;

-- =====================================================================
-- Version 6 : le compte administrateur ne peut pas être supprimé
-- =====================================================================

-- Verrou au niveau de la base : toute suppression d'un compte admin est refusée,
-- quelle que soit la voie (bouton du site, bannissement, API, tableau de bord Supabase).
-- Pour vraiment supprimer un admin un jour, il faut d'abord retirer sa ligne dans
-- public.admins (SQL Editor), ce qu'aucun membre ne peut faire depuis le site.
create or replace function public.protect_admin_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admins where user_id = old.id and role = 'admin') then
    raise exception 'Le compte administrateur du site ne peut pas être supprimé';
  end if;
  return old;
end $$;

drop trigger if exists before_delete_protect_admin on auth.users;
create trigger before_delete_protect_admin
  before delete on auth.users
  for each row execute function public.protect_admin_account();

-- Même protection pour son profil (et donc ses animaux, publications…).
drop trigger if exists before_delete_protect_admin_profile on public.profiles;
create trigger before_delete_protect_admin_profile
  before delete on public.profiles
  for each row execute function public.protect_admin_account();

-- Le bouton « Supprimer mon compte » refuse aussi, avec un message clair.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  if exists (select 1 from public.admins where user_id = auth.uid() and role = 'admin') then
    raise exception 'Le compte administrateur du site ne peut pas être supprimé';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- =====================================================================
-- Version 7 : modération avancée
--   signalement de contenus (publication, commentaire, sortie, conversation),
--   masquage automatique, avertissement, suspension, journal, anti-spam
-- =====================================================================

-- ---------- Signalements détaillés -------------------------------------
alter table public.reports add column if not exists target_type text not null default 'user';
alter table public.reports add column if not exists target_id uuid;
alter table public.reports add column if not exists category text not null default 'autre';
alter table public.reports add column if not exists snapshot text not null default '';
alter table public.reports add column if not exists resolution text;
alter table public.reports add column if not exists resolved_by uuid references auth.users (id) on delete set null;
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('user', 'post', 'comment', 'ride', 'conversation', 'listing', 'forum_topic', 'forum_reply',
                         'group', 'group_message', 'avatar', 'gear', 'chat_message'));
alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('spam', 'harcelement', 'inapproprie', 'faux_profil', 'maltraitance', 'vente_animal', 'danger', 'autre'));
-- un seul signalement en cours par personne et par contenu
create unique index if not exists reports_one_open_per_target
  on public.reports (reporter_id, target_type, coalesce(target_id, reported_id)) where resolved_at is null;

-- Contenus masqués en attente de vérification
alter table public.posts add column if not exists hidden_at timestamptz;
alter table public.comments add column if not exists hidden_at timestamptz;
alter table public.rides add column if not exists hidden_at timestamptz;

-- Au moment du signalement, la base retrouve elle-même l'auteur et copie le contenu
-- (impossible de signaler un contenu inventé ; les modérateurs le voient même s'il est supprimé).
create or replace function public.prepare_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  content text;
begin
  new.reporter_id := auth.uid();
  if new.target_type = 'post' then
    select author_id, body into author, content from public.posts where id = new.target_id;
  elsif new.target_type = 'comment' then
    select author_id, body into author, content from public.comments where id = new.target_id;
  elsif new.target_type = 'ride' then
    select host_id, title || ' — ' || place || coalesce(E'\n' || nullif(description, ''), '')
      into author, content from public.rides where id = new.target_id;
  elsif new.target_type = 'conversation' then
    -- uniquement SA propre conversation : les 15 derniers messages échangés
    author := new.reported_id;
    select string_agg(
             to_char(m.created_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' '
             || case when m.sender_id = auth.uid() then 'Moi' else 'Lui/elle' end || ' : '
             || coalesce(nullif(m.body, ''), '[photo]'), E'\n' order by m.created_at)
      into content
      from (select * from public.messages
            where (sender_id = auth.uid() and recipient_id = new.reported_id)
               or (sender_id = new.reported_id and recipient_id = auth.uid())
            order by created_at desc limit 15) m;
    if content is null then raise exception 'Aucune conversation avec ce membre'; end if;
  else
    new.target_type := 'user';
    new.target_id := null;
    author := new.reported_id;
    select name || ' — ' || city || coalesce(E'\n' || nullif(bio, ''), '') into content
      from public.profiles where id = new.reported_id;
  end if;
  if author is null then raise exception 'Contenu introuvable'; end if;
  if author = auth.uid() then raise exception 'Tu ne peux pas te signaler toi-même'; end if;
  new.reported_id := author;
  new.snapshot := left(coalesce(content, ''), 4000);
  return new;
end $$;

drop trigger if exists before_report_insert on public.reports;
create trigger before_report_insert
  before insert on public.reports
  for each row execute function public.prepare_report();

-- 3 personnes différentes signalent le même contenu → masqué en attendant l'équipe.
create or replace function public.auto_hide_reported()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reporters int;
begin
  if new.target_type not in ('post', 'comment', 'ride') then return new; end if;
  select count(distinct reporter_id) into reporters from public.reports
  where target_type = new.target_type and target_id = new.target_id and resolved_at is null;
  if reporters >= 3 then
    if new.target_type = 'post' then
      update public.posts set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
    elsif new.target_type = 'comment' then
      update public.comments set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
    else
      update public.rides set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists after_report_auto_hide on public.reports;
create trigger after_report_auto_hide
  after insert on public.reports
  for each row execute function public.auto_hide_reported();

-- Les contenus masqués ne sont visibles que de leur auteur et de l'équipe.
drop policy if exists "posts lisibles par les membres" on public.posts;
create policy "posts lisibles par les membres" on public.posts
  for select to authenticated using (hidden_at is null or author_id = auth.uid() or public.is_staff());
drop policy if exists "commentaires lisibles par les membres" on public.comments;
create policy "commentaires lisibles par les membres" on public.comments
  for select to authenticated using (hidden_at is null or author_id = auth.uid() or public.is_staff());
drop policy if exists "sorties lisibles par les membres" on public.rides;
create policy "sorties lisibles par les membres" on public.rides
  for select to authenticated using (hidden_at is null or host_id = auth.uid() or public.is_staff());

-- ---------- Journal de modération --------------------------------------
create table if not exists public.moderation_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  target_user uuid,
  target_name text,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists moderation_log_created_idx on public.moderation_log (created_at desc);
alter table public.moderation_log enable row level security;
drop policy if exists "équipe lit le journal" on public.moderation_log;
create policy "équipe lit le journal" on public.moderation_log
  for select to authenticated using (public.is_staff());

create or replace function public.log_moderation(
  p_action text, p_target_type text, p_target_id uuid, p_target_user uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  insert into public.moderation_log (actor_id, action, target_type, target_id, target_user, target_name, reason)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_target_user,
          (select name from public.profiles where id = p_target_user), coalesce(p_reason, ''));
$$;
revoke execute on function public.log_moderation(text, text, uuid, uuid, text) from public, anon, authenticated;

-- ---------- Suspensions -------------------------------------------------
create table if not exists public.suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  reason text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.suspensions enable row level security;
drop policy if exists "voir sa suspension" on public.suspensions;
create policy "voir sa suspension" on public.suspensions
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create or replace function public.is_suspended(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suspensions where user_id = uid and until > now());
$$;

-- Un membre suspendu ne peut plus publier, commenter, écrire, organiser ni rejoindre de sortie.
-- Anti-spam : nombre d'envois limité par minute / heure.
create or replace function public.guard_member_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  recent int;
  until_at timestamptz;
begin
  if me is null then return new; end if; -- actions internes (déclencheurs, administration)
  select s.until into until_at from public.suspensions s where s.user_id = me and s.until > now();
  if until_at is not null and tg_table_name <> 'reports' then
    raise exception 'Ton compte est suspendu jusqu''au %', to_char(until_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI');
  end if;
  if tg_table_name = 'messages' then
    select count(*) into recent from public.messages where sender_id = me and created_at > now() - interval '1 minute';
    if recent >= 15 then raise exception 'Trop de messages d''un coup : patiente une minute'; end if;
  elsif tg_table_name = 'posts' then
    select count(*) into recent from public.posts where author_id = me and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Trop de publications : réessaie dans une heure'; end if;
  elsif tg_table_name = 'comments' then
    select count(*) into recent from public.comments where author_id = me and created_at > now() - interval '10 minutes';
    if recent >= 20 then raise exception 'Trop de commentaires d''un coup : patiente quelques minutes'; end if;
  elsif tg_table_name = 'rides' then
    select count(*) into recent from public.rides where host_id = me and created_at > now() - interval '1 day';
    if recent >= 10 then raise exception 'Trop de sorties créées aujourd''hui'; end if;
  elsif tg_table_name = 'reports' then
    select count(*) into recent from public.reports where reporter_id = me and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Trop de signalements : réessaie plus tard'; end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['messages', 'posts', 'comments', 'rides', 'ride_participants', 'reports'] loop
    execute format('drop trigger if exists before_insert_guard on public.%I', t);
    execute format('create trigger before_insert_guard before insert on public.%I
                    for each row execute function public.guard_member_activity()', t);
  end loop;
end $$;

-- ---------- Actions de l'équipe -----------------------------------------
create or replace function public.mod_assert_staff_target(target uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  if target = auth.uid() then raise exception 'Action impossible sur ton propre compte'; end if;
  if exists (select 1 from public.admins where user_id = target) then
    raise exception 'Action impossible sur un membre de l''équipe';
  end if;
end $$;

-- Avertir un membre (il reçoit une notification).
create or replace function public.mod_warn_user(target uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.mod_assert_staff_target(target);
  insert into public.notifications (user_id, type, data)
  values (target, 'warning', jsonb_build_object('reason', left(coalesce(reason, ''), 300)));
  perform public.log_moderation('avertissement', 'user', null, target, reason);
end $$;

-- Suspendre un membre pour quelques jours.
create or replace function public.mod_suspend_user(target uuid, days int, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  until_at timestamptz := now() + make_interval(days => greatest(1, least(days, 365)));
begin
  perform public.mod_assert_staff_target(target);
  insert into public.suspensions (user_id, until, reason, created_by)
  values (target, until_at, coalesce(reason, ''), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason,
    created_by = excluded.created_by, created_at = now();
  insert into public.notifications (user_id, type, data)
  values (target, 'suspended', jsonb_build_object('until', until_at, 'reason', left(coalesce(reason, ''), 300)));
  perform public.log_moderation('suspension ' || days || ' j', 'user', null, target, reason);
end $$;

create or replace function public.mod_unsuspend_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  delete from public.suspensions where user_id = target;
  perform public.log_moderation('fin de suspension', 'user', null, target, '');
end $$;

-- Masquer / réafficher un contenu.
create or replace function public.mod_set_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  if p_type = 'post' then
    update public.posts set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
  elsif p_type = 'comment' then
    update public.comments set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
  elsif p_type = 'ride' then
    update public.rides set hidden_at = case when p_hidden then now() end where id = p_id returning host_id into author;
  else
    raise exception 'Type de contenu inconnu';
  end if;
  perform public.log_moderation(case when p_hidden then 'masquage' else 'réaffichage' end, p_type, p_id, author, '');
end $$;

-- Retirer définitivement un contenu (l'auteur est prévenu).
create or replace function public.mod_remove_content(p_type text, p_id uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  excerpt text;
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  if p_type = 'post' then
    delete from public.posts where id = p_id returning author_id, left(body, 80) into author, excerpt;
  elsif p_type = 'comment' then
    delete from public.comments where id = p_id returning author_id, left(body, 80) into author, excerpt;
  elsif p_type = 'ride' then
    delete from public.rides where id = p_id returning host_id, title into author, excerpt;
  else
    raise exception 'Type de contenu inconnu';
  end if;
  if author is null then return; end if; -- déjà supprimé
  insert into public.notifications (user_id, type, data)
  values (author, 'content_removed',
          jsonb_build_object('kind', p_type, 'excerpt', excerpt, 'reason', left(coalesce(reason, ''), 300)));
  perform public.log_moderation('retrait', p_type, p_id, author, coalesce(reason, '') || ' — « ' || coalesce(excerpt, '') || ' »');
end $$;

-- Clore un signalement (et tous ceux qui visent le même contenu) ; les auteurs des
-- signalements sont prévenus.
create or replace function public.mod_resolve_report(p_report uuid, p_resolution text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Signalement introuvable'; end if;
  with closed as (
    update public.reports
    set resolved_at = now(), resolved_by = auth.uid(), resolution = coalesce(p_resolution, '')
    where resolved_at is null and target_type = r.target_type
      and coalesce(target_id, reported_id) = coalesce(r.target_id, r.reported_id)
    returning reporter_id
  )
  insert into public.notifications (user_id, type, data)
  select distinct reporter_id, 'report_resolved', jsonb_build_object('resolution', left(coalesce(p_resolution, ''), 200))
  from closed where reporter_id is not null;
  perform public.log_moderation('signalement traité', r.target_type, r.target_id, r.reported_id, p_resolution);
end $$;

-- Le bannissement est aussi journalisé.
create or replace function public.admin_ban_user(target uuid, reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if target = auth.uid() or exists (select 1 from public.admins where user_id = target) then
    raise exception 'Impossible de bannir un administrateur';
  end if;
  perform public.log_moderation('bannissement', 'user', null, target, reason);
  insert into public.banned_emails (email, reason, banned_by)
  select lower(email), coalesce(reason, ''), auth.uid() from auth.users where id = target and email is not null
  on conflict (email) do nothing;
  delete from auth.users where id = target;
end $$;

revoke execute on function public.mod_warn_user(uuid, text) from public, anon;
revoke execute on function public.mod_suspend_user(uuid, int, text) from public, anon;
revoke execute on function public.mod_unsuspend_user(uuid) from public, anon;
revoke execute on function public.mod_set_hidden(text, uuid, boolean) from public, anon;
revoke execute on function public.mod_remove_content(text, uuid, text) from public, anon;
revoke execute on function public.mod_resolve_report(uuid, text) from public, anon;
grant execute on function public.mod_warn_user(uuid, text) to authenticated;
grant execute on function public.mod_suspend_user(uuid, int, text) to authenticated;
grant execute on function public.mod_unsuspend_user(uuid) to authenticated;
grant execute on function public.mod_set_hidden(text, uuid, boolean) to authenticated;
grant execute on function public.mod_remove_content(text, uuid, text) to authenticated;
grant execute on function public.mod_resolve_report(uuid, text) to authenticated;

-- Membres (admin) : nombre de signalements, d'avertissements et suspension en cours.
drop function if exists public.admin_members();
create or replace function public.admin_members()
returns table (id uuid, name text, city text, email text, created_at timestamptz,
               last_sign_in_at timestamptz, pets bigint, posts bigint, reports_against bigint,
               warnings bigint, suspended_until timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query
    select p.id, p.name, p.city, u.email::text, p.created_at, u.last_sign_in_at,
           (select count(*) from public.pets x where x.owner_id = p.id),
           (select count(*) from public.posts x where x.author_id = p.id),
           (select count(*) from public.reports x where x.reported_id = p.id and x.resolved_at is null),
           (select count(*) from public.moderation_log l where l.target_user = p.id and l.action = 'avertissement'),
           (select s.until from public.suspensions s where s.user_id = p.id and s.until > now())
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 500;
end $$;
revoke execute on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;

-- =====================================================================
-- Version 8 : un modérateur ne peut pas supprimer son compte tant qu'il a son rôle
-- =====================================================================

-- Tout membre de l'équipe (admin ou modérateur) est protégé contre la suppression.
-- Un modérateur doit d'abord demander à l'administrateur de lui retirer son rôle
-- (Administration → Équipe → Retirer) ; ensuite il peut supprimer son compte normalement.
create or replace function public.protect_admin_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  staff_role text;
begin
  select role into staff_role from public.admins where user_id = old.id;
  if staff_role = 'admin' then
    raise exception 'Le compte administrateur du site ne peut pas être supprimé';
  elsif staff_role = 'moderator' then
    raise exception 'Ce compte est modérateur : l''administrateur doit d''abord lui retirer son rôle';
  end if;
  return old;
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  staff_role text;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  select role into staff_role from public.admins where user_id = auth.uid();
  if staff_role = 'admin' then
    raise exception 'Le compte administrateur du site ne peut pas être supprimé';
  elsif staff_role = 'moderator' then
    raise exception 'Tu es modérateur : contacte l''administrateur pour qu''il retire ton rôle avant de supprimer ton compte';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- =====================================================================
-- Version 9 : niveaux et points d'expérience (XP)
--   Les points sont calculés uniquement par la base (déclencheurs) :
--   personne ne peut modifier son score depuis le site.
-- =====================================================================

alter table public.profiles add column if not exists xp int not null default 0;

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref_key text not null,
  points int not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_key)
);
create index if not exists xp_events_user_idx on public.xp_events (user_id, created_at desc);
create index if not exists xp_events_created_idx on public.xp_events (created_at);
alter table public.xp_events enable row level security;
drop policy if exists "voir ses points" on public.xp_events;
create policy "voir ses points" on public.xp_events
  for select to authenticated using (user_id = auth.uid());

-- Total des points tenu à jour automatiquement.
create or replace function public.xp_apply_total()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cyclami.xp_update', '1', true);
  if tg_op = 'INSERT' then
    update public.profiles set xp = xp + new.points where id = new.user_id;
  else
    update public.profiles set xp = greatest(0, xp - old.points) where id = old.user_id;
  end if;
  perform set_config('cyclami.xp_update', '0', true);
  return null;
end $$;

drop trigger if exists after_xp_event on public.xp_events;
create trigger after_xp_event
  after insert or delete on public.xp_events
  for each row execute function public.xp_apply_total();

-- Un membre ne peut pas modifier lui-même son nombre de points.
create or replace function public.protect_xp_column()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.xp is distinct from old.xp and coalesce(current_setting('cyclami.xp_update', true), '0') <> '1' then
    new.xp := old.xp;
  end if;
  return new;
end $$;

drop trigger if exists before_profile_update_protect_xp on public.profiles;
create trigger before_profile_update_protect_xp
  before update on public.profiles
  for each row execute function public.protect_xp_column();

-- Attribuer des points (une seule fois par action, avec un plafond quotidien facultatif).
create or replace function public.xp_award(p_user uuid, p_kind text, p_ref text, p_points int, p_daily_cap int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if p_daily_cap is not null and (
    select count(*) from public.xp_events
    where user_id = p_user and kind = p_kind and created_at >= date_trunc('day', now())
  ) >= p_daily_cap then
    return;
  end if;
  insert into public.xp_events (user_id, kind, ref_key, points)
  values (p_user, p_kind, p_ref, p_points)
  on conflict (user_id, kind, ref_key) do nothing;
end $$;

create or replace function public.xp_revoke(p_user uuid, p_kind text, p_ref text)
returns void language sql security definer set search_path = public as $$
  delete from public.xp_events where user_id = p_user and kind = p_kind and ref_key = p_ref;
$$;
revoke execute on function public.xp_award(uuid, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.xp_revoke(uuid, text, text) from public, anon, authenticated;

-- ---------- Règles d'attribution ---------------------------------------
create or replace function public.xp_on_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if tg_table_name = 'posts' then
    if tg_op = 'INSERT' then perform public.xp_award(new.author_id, 'post', new.id::text, 10, 3);
    else perform public.xp_revoke(old.author_id, 'post', old.id::text); end if;

  elsif tg_table_name = 'comments' then
    if tg_op = 'INSERT' then
      if new.post_id is not null then select author_id into owner from public.posts where id = new.post_id;
      else select host_id into owner from public.rides where id = new.ride_id; end if;
      if owner is distinct from new.author_id then
        perform public.xp_award(new.author_id, 'comment', new.id::text, 3, 10);
      end if;
    else perform public.xp_revoke(old.author_id, 'comment', old.id::text); end if;

  elsif tg_table_name = 'post_likes' then
    if tg_op = 'INSERT' then
      select author_id into owner from public.posts where id = new.post_id;
      if owner is distinct from new.user_id then
        perform public.xp_award(owner, 'like_received', new.post_id || ':' || new.user_id, 2);
      end if;
    else
      select author_id into owner from public.posts where id = old.post_id;
      perform public.xp_revoke(owner, 'like_received', old.post_id || ':' || old.user_id);
    end if;

  elsif tg_table_name = 'rides' then
    if tg_op = 'INSERT' then perform public.xp_award(new.host_id, 'ride_host', new.id::text, 30, 2);
    else perform public.xp_revoke(old.host_id, 'ride_host', old.id::text); end if;

  elsif tg_table_name = 'ride_participants' then
    if tg_op = 'INSERT' then
      select host_id into owner from public.rides where id = new.ride_id;
      if owner is distinct from new.user_id then
        perform public.xp_award(new.user_id, 'ride_join', new.ride_id::text, 20);
        perform public.xp_award(owner, 'ride_guest', new.ride_id || ':' || new.user_id, 5);
      end if;
    else
      select host_id into owner from public.rides where id = old.ride_id;
      perform public.xp_revoke(old.user_id, 'ride_join', old.ride_id::text);
      perform public.xp_revoke(owner, 'ride_guest', old.ride_id || ':' || old.user_id);
    end if;

  elsif tg_table_name = 'pets' then
    -- 2 photos d'animal récompensées par jour ; points retirés si l'animal est supprimé
    if tg_op = 'DELETE' then
      perform public.xp_revoke(old.owner_id, 'pet_photo', old.id::text);
    elsif new.photo_url is not null then
      perform public.xp_award(new.owner_id, 'pet_photo', new.id::text, 15, 2);
    end if;

  elsif tg_table_name = 'profiles' then
    if coalesce(new.bio, '') <> '' and cardinality(new.availability) > 0 and new.lat is not null then
      perform public.xp_award(new.id, 'profile_complete', 'profil', 20);
    end if;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['posts', 'comments', 'post_likes', 'rides', 'ride_participants'] loop
    execute format('drop trigger if exists after_activity_xp on public.%I', t);
    execute format('create trigger after_activity_xp after insert or delete on public.%I
                    for each row execute function public.xp_on_activity()', t);
  end loop;
  execute 'drop trigger if exists after_activity_xp on public.pets';
  execute 'create trigger after_activity_xp after insert or delete or update of photo_url on public.pets
           for each row execute function public.xp_on_activity()';
  execute 'drop trigger if exists after_activity_xp on public.profiles';
  execute 'create trigger after_activity_xp after update of bio, availability, lat on public.profiles
           for each row execute function public.xp_on_activity()';
end $$;

-- Visite du jour : +5 XP, et +25 XP de bonus tous les 7 jours d'affilée.
create or replace function public.claim_daily_xp()
returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Europe/Paris')::date;
  streak int := 0;
  d date := today;
  gained int := 0;
begin
  if me is null then raise exception 'Non connecté'; end if;
  if not exists (select 1 from public.xp_events where user_id = me and kind = 'daily' and ref_key = today::text) then
    perform public.xp_award(me, 'daily', today::text, 5);
    gained := 5;
  end if;
  while exists (select 1 from public.xp_events where user_id = me and kind = 'daily' and ref_key = d::text) loop
    streak := streak + 1;
    d := d - 1;
  end loop;
  if gained > 0 and streak > 0 and streak % 7 = 0 then
    perform public.xp_award(me, 'streak', today::text, 25);
    gained := gained + 25;
  end if;
  return json_build_object('gained', gained, 'streak', streak);
end $$;
revoke execute on function public.claim_daily_xp() from public, anon;
grant execute on function public.claim_daily_xp() to authenticated;

-- Chiffres d'un membre pour ses badges (seulement des totaux, rien de privé).
create or replace function public.member_achievements(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'xp', (select xp from public.profiles where id = p_user),
    'posts', (select count(*) from public.posts where author_id = p_user),
    'rides_hosted', (select count(*) from public.rides where host_id = p_user),
    'rides_joined', (select count(*) from public.ride_participants wp join public.rides w on w.id = wp.ride_id
                     where wp.user_id = p_user and w.host_id <> p_user),
    'guests', (select count(*) from public.xp_events where user_id = p_user and kind = 'ride_guest'),
    'likes_received', (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id
                       where p.author_id = p_user and l.user_id <> p_user),
    'comments', (select count(*) from public.comments where author_id = p_user),
    'pets', (select count(*) from public.pets where owner_id = p_user),
    'best_streak', (
      select coalesce(max(len), 0) from (
        select count(*) as len from (
          select ref_key::date as d, ref_key::date - (row_number() over (order by ref_key::date))::int as grp
          from public.xp_events where user_id = p_user and kind = 'daily'
        ) x group by grp
      ) y
    )
  );
$$;
revoke execute on function public.member_achievements(uuid) from public, anon;
grant execute on function public.member_achievements(uuid) to authenticated;

-- Classement : points gagnés sur les 7 derniers jours (ou depuis toujours).
create or replace function public.xp_leaderboard(p_days int default 7)
returns table (user_id uuid, name text, city text, points bigint, xp int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.city,
         coalesce(sum(e.points) filter (where p_days is null or e.created_at > now() - make_interval(days => p_days)), 0) as points,
         p.xp
  from public.profiles p
  left join public.xp_events e on e.user_id = p.id
  where not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
  group by p.id
  having coalesce(sum(e.points) filter (where p_days is null or e.created_at > now() - make_interval(days => p_days)), 0) > 0
  order by points desc, p.xp desc
  limit 50;
$$;
revoke execute on function public.xp_leaderboard(int) from public, anon;
grant execute on function public.xp_leaderboard(int) to authenticated;

-- ---------- Points pour l'activité passée (une seule fois, sans plafond) ----
do $$
begin
  if not exists (select 1 from public.xp_events) then
    insert into public.xp_events (user_id, kind, ref_key, points, created_at)
    select author_id, 'post', id::text, 10, created_at from public.posts
    union all
    select c.author_id, 'comment', c.id::text, 3, c.created_at from public.comments c
      left join public.posts p on p.id = c.post_id left join public.rides w on w.id = c.ride_id
      where coalesce(p.author_id, w.host_id) is distinct from c.author_id
    union all
    select p.author_id, 'like_received', l.post_id || ':' || l.user_id, 2, p.created_at
      from public.post_likes l join public.posts p on p.id = l.post_id where p.author_id <> l.user_id
    union all
    select host_id, 'ride_host', id::text, 30, created_at from public.rides
    union all
    select wp.user_id, 'ride_join', wp.ride_id::text, 20, wp.joined_at
      from public.ride_participants wp join public.rides w on w.id = wp.ride_id where wp.user_id <> w.host_id
    union all
    select w.host_id, 'ride_guest', wp.ride_id || ':' || wp.user_id, 5, wp.joined_at
      from public.ride_participants wp join public.rides w on w.id = wp.ride_id where wp.user_id <> w.host_id
    union all
    select owner_id, 'pet_photo', id::text, 15, created_at from public.pets where photo_url is not null
    union all
    select id, 'profile_complete', 'profil', 20, created_at from public.profiles
      where coalesce(bio, '') <> '' and cardinality(availability) > 0 and lat is not null
    on conflict (user_id, kind, ref_key) do nothing;
  end if;
  -- recalcul des totaux (sans passer par le verrou anti-triche)
  perform set_config('cyclami.xp_update', '1', true);
  update public.profiles p set xp = coalesce((select sum(points) from public.xp_events e where e.user_id = p.id), 0);
  perform set_config('cyclami.xp_update', '0', true);
end $$;

-- =====================================================================
-- Version 10 : annonces d'animaux (cession payante, don, adoption)
--   Pas de paiement sur le site : acheteur et vendeur passent par la messagerie.
--   Garde-fous légaux de base vérifiés par la base (à faire valider juridiquement).
-- =====================================================================

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('vente', 'don')),
  title text not null check (char_length(title) between 3 and 100),
  species text not null check (char_length(species) between 1 and 30),
  breed text not null default '' check (char_length(breed) <= 60),
  sex text not null default 'inconnu' check (sex in ('male', 'femelle', 'inconnu')),
  birth_date date,
  price_cents int check (price_cents is null or price_cents between 0 and 10000000),
  description text not null default '' check (char_length(description) <= 4000),
  photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 6),
  identification text not null default '' check (char_length(identification) <= 40),
  siren text not null default '' check (siren = '' or siren ~ '^[0-9]{9}$'),
  lof_registered boolean not null default false,
  vaccinated boolean not null default false,
  sterilized boolean not null default false,
  documents text not null default '' check (char_length(documents) <= 500),
  city text not null default '' check (char_length(city) <= 80),
  lat double precision,
  lng double precision,
  status text not null default 'active' check (status in ('active', 'reserve', 'cede', 'retire')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- un don est gratuit, une vente a un prix
  constraint listings_price_kind check ((kind = 'don' and price_cents is null) or (kind = 'vente' and price_cents is not null)),
  -- chiens, chats, furets et équidés doivent être identifiés (puce, tatouage, n° SIRE/UELN)
  constraint listings_identification check (
    species not in ('chien', 'chat', 'furet', 'cheval', 'poney', 'ane') or char_length(trim(identification)) >= 6),
  -- chiens et chats : au moins 8 semaines
  constraint listings_min_age check (
    species not in ('chien', 'chat') or (birth_date is not null and birth_date <= current_date - 56)),
  -- vente de chiens et chats : éleveur (SIREN) ou portée inscrite au LOF / LOOF
  constraint listings_dog_cat_seller check (
    kind <> 'vente' or species not in ('chien', 'chat') or siren <> '' or lof_registered)
);
create index if not exists listings_status_idx on public.listings (status, created_at desc);
create index if not exists listings_location_idx on public.listings (lat, lng);
create index if not exists listings_seller_idx on public.listings (seller_id);

alter table public.listings enable row level security;
drop policy if exists "annonces lisibles par les membres" on public.listings;
create policy "annonces lisibles par les membres" on public.listings
  for select to authenticated using (
    (status <> 'retire' and hidden_at is null) or seller_id = auth.uid() or public.is_staff());
drop policy if exists "publier une annonce" on public.listings;
create policy "publier une annonce" on public.listings
  for insert to authenticated with check (seller_id = auth.uid());
drop policy if exists "modifier son annonce" on public.listings;
create policy "modifier son annonce" on public.listings
  for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "supprimer son annonce" on public.listings;
create policy "supprimer son annonce" on public.listings
  for delete to authenticated using (seller_id = auth.uid() or public.is_staff());

-- Position de l'annonce = position (arrondie) du vendeur ; masquage conservé à la modification.
create or replace function public.prepare_listing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select lat, lng, coalesce(nullif(new.city, ''), city) into new.lat, new.lng, new.city
      from public.profiles where id = new.seller_id;
  else
    new.hidden_at := old.hidden_at;
    new.seller_id := old.seller_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists before_listing_write on public.listings;
create trigger before_listing_write
  before insert or update on public.listings
  for each row execute function public.prepare_listing();

-- Suspension et anti-spam : 5 annonces par jour maximum.
create or replace function public.guard_member_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  recent int;
  until_at timestamptz;
begin
  if me is null then return new; end if;
  -- date du serveur : impossible d'antidater pour échapper aux limites
  if tg_table_name in ('messages', 'posts', 'comments', 'rides', 'reports', 'listings', 'ride_reviews', 'sitting_offers', 'pets') then
    new.created_at := now();
  end if;
  select s.until into until_at from public.suspensions s where s.user_id = me and s.until > now();
  if until_at is not null and tg_table_name <> 'reports' then
    raise exception 'Ton compte est suspendu jusqu''au %', to_char(until_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI');
  end if;
  -- l'équipe de modération n'est pas soumise aux limites anti-spam
  if public.is_staff() then return new; end if;
  if tg_table_name = 'messages' then
    select count(*) into recent from public.messages where sender_id = me and created_at > now() - interval '1 minute';
    if recent >= 15 then raise exception 'Trop de messages d''un coup : patiente une minute'; end if;
  elsif tg_table_name = 'posts' then
    select count(*) into recent from public.posts where author_id = me and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Trop de publications : réessaie dans une heure'; end if;
  elsif tg_table_name = 'comments' then
    select count(*) into recent from public.comments where author_id = me and created_at > now() - interval '10 minutes';
    if recent >= 20 then raise exception 'Trop de commentaires d''un coup : patiente quelques minutes'; end if;
  elsif tg_table_name = 'rides' then
    -- une série de sorties hebdomadaires compte pour une seule sortie
    select count(distinct coalesce(series_id, id)) into recent from public.rides
     where host_id = me and created_at > now() - interval '1 day';
    if recent >= 10 then raise exception 'Trop de sorties créées aujourd''hui'; end if;
    if (select count(*) from public.rides where host_id = me and created_at > now() - interval '1 day') >= 30 then
      raise exception 'Trop de sorties créées aujourd''hui';
    end if;
    if new.series_id is not null and (select count(*) from public.rides where series_id = new.series_id) >= 12 then
      raise exception 'Une série compte au plus 12 sorties';
    end if;
  elsif tg_table_name = 'reports' then
    select count(*) into recent from public.reports where reporter_id = me and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Trop de signalements : réessaie plus tard'; end if;
  elsif tg_table_name = 'listings' then
    select count(*) into recent from public.listings where seller_id = me and created_at > now() - interval '1 day';
    -- un refuge vérifié peut importer tous ses animaux d'un coup (tableur)
    if recent >= (case when public.is_verified_shelter(me) then 80 else 5 end) then
      raise exception 'Trop d''annonces publiées aujourd''hui : réessaie demain';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists before_insert_guard on public.listings;
create trigger before_insert_guard before insert on public.listings
  for each row execute function public.guard_member_activity();

-- ---------- Signalement et modération des annonces --------------------
create or replace function public.prepare_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  content text;
begin
  new.reporter_id := auth.uid();
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution := null;
  new.created_at := now();
  if new.target_type = 'post' then
    select author_id, body into author, content from public.posts where id = new.target_id;
  elsif new.target_type = 'comment' then
    select author_id, body into author, content from public.comments where id = new.target_id;
  elsif new.target_type = 'ride' then
    select host_id, title || ' — ' || place || coalesce(E'\n' || nullif(description, ''), '')
      into author, content from public.rides where id = new.target_id;
  elsif new.target_type = 'listing' then
    select seller_id,
           '[' || kind || coalesce(' ' || to_char(price_cents / 100.0, 'FM9999990D00') || ' €', '') || '] ' || title
           || E'\n' || species || coalesce(' · ' || nullif(breed, ''), '')
           || coalesce(E'\nIdentification : ' || nullif(identification, ''), '')
           || coalesce(E'\nAgrément éleveur : ' || nullif(approval_number, ''), '')
           || coalesce(E'\n' || nullif(description, ''), '')
      into author, content from public.listings where id = new.target_id;
  elsif new.target_type = 'forum_topic' then
    select author_id, title || coalesce(E'\n' || nullif(body, ''), '') into author, content
      from public.forum_topics where id = new.target_id;
  elsif new.target_type = 'forum_reply' then
    select author_id, body into author, content from public.forum_replies where id = new.target_id;
  elsif new.target_type = 'group' then
    select owner_id, emoji || ' ' || name || coalesce(E'\n' || nullif(description, ''), '') into author, content
      from public.groups where id = new.target_id;
  elsif new.target_type = 'group_message' then
    select m.author_id, '[' || g.name || '] ' || coalesce(nullif(m.body, ''), '[photo]')
             || coalesce(E'\n' || m.photo_url, '') into author, content
      from public.group_messages m join public.groups g on g.id = m.group_id where m.id = new.target_id;
  elsif new.target_type = 'conversation' then
    author := new.reported_id;
    select string_agg(
             to_char(m.created_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' '
             || case when m.sender_id = auth.uid() then 'Moi' else 'Lui/elle' end || ' : '
             || coalesce(nullif(m.body, ''), '[photo]'), E'\n' order by m.created_at)
      into content
      from (select * from public.messages
            where (sender_id = auth.uid() and recipient_id = new.reported_id)
               or (sender_id = new.reported_id and recipient_id = auth.uid())
            order by created_at desc limit 15) m;
    if content is null then raise exception 'Aucune conversation avec ce membre'; end if;
  elsif new.target_type = 'chat_message' then
    select author_id, '[Tchat général] ' || coalesce(nullif(body, ''), '[photo]') || coalesce(E'\n' || photo_url, '')
      into author, content from public.chat_messages where id = new.target_id;
  elsif new.target_type = 'gear' then
    select owner_id, title || coalesce(E'\n' || nullif(body, ''), '') || coalesce(E'\n' || photo_url, '')
      into author, content from public.gear_items where id = new.target_id;
  elsif new.target_type = 'avatar' then
    -- photo de profil : l'adresse de l'image est gardée pour que l'équipe la voie
    new.target_id := null;
    select id, avatar_url into author, content from public.profiles where id = new.reported_id;
    if content is null then raise exception 'Ce membre n’a pas de photo de profil'; end if;
  else
    new.target_type := 'user';
    new.target_id := null;
    author := new.reported_id;
    select name || ' — ' || city || coalesce(E'\n' || nullif(bio, ''), '') into content
      from public.profiles where id = new.reported_id;
  end if;
  if author is null then raise exception 'Contenu introuvable'; end if;
  if author = auth.uid() then raise exception 'Tu ne peux pas te signaler toi-même'; end if;
  -- le fondateur (super-administrateur) ne peut pas être signalé, ni lui ni ses contenus
  if author = public.owner_id() then raise exception 'Le fondateur d''Cyclami ne peut pas être signalé'; end if;
  new.reported_id := author;
  new.snapshot := left(coalesce(content, ''), 4000);
  return new;
end $$;

create or replace function public.auto_hide_reported()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reporters int;
begin
  if new.target_type not in ('post', 'comment', 'ride', 'listing', 'forum_topic', 'forum_reply', 'group', 'group_message', 'chat_message') then return new; end if;
  -- seuls comptent les comptes de plus de 3 jours (pas de faux comptes créés pour masquer)
  select count(distinct r.reporter_id) into reporters
  from public.reports r join public.profiles p on p.id = r.reporter_id
  where r.target_type = new.target_type and r.target_id = new.target_id and r.resolved_at is null
    and p.created_at < now() - interval '3 days';
  if reporters >= 3 then
    perform set_config('cyclami.mod_update', '1', true);
    if new.target_type = 'post' then
      update public.posts set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
    elsif new.target_type = 'comment' then
      update public.comments set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
    elsif new.target_type = 'ride' then
      update public.rides set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
    else
      perform set_config('cyclami.mod_update', '1', true);
      if new.target_type = 'listing' then
        update public.listings set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
      elsif new.target_type = 'forum_topic' then
        update public.forum_topics set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
      elsif new.target_type = 'group' then
        update public.groups set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
      elsif new.target_type = 'group_message' then
        update public.group_messages set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
      elsif new.target_type = 'chat_message' then
        update public.chat_messages set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
      else
        update public.forum_replies set hidden_at = coalesce(hidden_at, now()) where id = new.target_id;
      end if;
    end if;
    perform set_config('cyclami.mod_update', '0', true);
  end if;
  return new;
end $$;

-- Le masquage d'une annonce ne peut venir que de la modération (pas du vendeur).
create or replace function public.prepare_listing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.hidden_at := null;
    select lat, lng, coalesce(nullif(new.city, ''), city) into new.lat, new.lng, new.city
      from public.profiles where id = new.seller_id;
  else
    if coalesce(current_setting('cyclami.mod_update', true), '0') <> '1' then
      new.hidden_at := old.hidden_at;
    end if;
    new.seller_id := old.seller_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.mod_set_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  perform set_config('cyclami.mod_update', '1', true);
  if p_type = 'post' then
    update public.posts set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
  elsif p_type = 'comment' then
    update public.comments set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
  elsif p_type = 'ride' then
    update public.rides set hidden_at = case when p_hidden then now() end where id = p_id returning host_id into author;
  elsif p_type = 'listing' then
    perform set_config('cyclami.mod_update', '1', true);
    update public.listings set hidden_at = case when p_hidden then now() end where id = p_id returning seller_id into author;
    perform set_config('cyclami.mod_update', '0', true);
  elsif p_type = 'group' then
    update public.groups set hidden_at = case when p_hidden then now() end where id = p_id returning owner_id into author;
  elsif p_type = 'group_message' then
    update public.group_messages set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
  elsif p_type = 'chat_message' then
    update public.chat_messages set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
  elsif p_type in ('forum_topic', 'forum_reply') then
    perform set_config('cyclami.mod_update', '1', true);
    if p_type = 'forum_topic' then
      update public.forum_topics set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
    else
      update public.forum_replies set hidden_at = case when p_hidden then now() end where id = p_id returning author_id into author;
    end if;
  else
    raise exception 'Type de contenu inconnu';
  end if;
  perform set_config('cyclami.mod_update', '0', true);
  perform public.log_moderation(case when p_hidden then 'masquage' else 'réaffichage' end, p_type, p_id, author, '');
end $$;

create or replace function public.mod_remove_content(p_type text, p_id uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  excerpt text;
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  if p_type = 'post' then
    delete from public.posts where id = p_id returning author_id, left(body, 80) into author, excerpt;
  elsif p_type = 'comment' then
    delete from public.comments where id = p_id returning author_id, left(body, 80) into author, excerpt;
  elsif p_type = 'ride' then
    delete from public.rides where id = p_id returning host_id, title into author, excerpt;
  elsif p_type = 'listing' then
    delete from public.listings where id = p_id returning seller_id, title into author, excerpt;
  elsif p_type = 'forum_topic' then
    delete from public.forum_topics where id = p_id returning author_id, title into author, excerpt;
  elsif p_type = 'forum_reply' then
    delete from public.forum_replies where id = p_id returning author_id, left(body, 80) into author, excerpt;
  elsif p_type = 'group' then
    delete from public.groups where id = p_id returning owner_id, name into author, excerpt;
  elsif p_type = 'group_message' then
    delete from public.group_messages where id = p_id returning author_id, coalesce(nullif(left(body, 80), ''), '📷') into author, excerpt;
  elsif p_type = 'chat_message' then
    delete from public.chat_messages where id = p_id returning author_id, left(body, 80) into author, excerpt;
  else
    raise exception 'Type de contenu inconnu';
  end if;
  if author is null then return; end if;
  insert into public.notifications (user_id, type, data)
  values (author, 'content_removed',
          jsonb_build_object('kind', p_type, 'excerpt', excerpt, 'reason', left(coalesce(reason, ''), 300)));
  perform public.log_moderation('retrait', p_type, p_id, author, coalesce(reason, '') || ' — « ' || coalesce(excerpt, '') || ' »');
end $$;

-- =====================================================================
-- Version 11 : notifications par e-mail
--   La base décide qui reçoit un e-mail (préférences, anti-avalanche) et le
--   transmet au service Cloudflare (/notify), qui l'envoie via Brevo.
-- =====================================================================

-- Réglages internes (schéma non exposé par l'API).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings (key, value)
values ('notify_url', 'https://cyclami-photos.nathanbarbaraytb.workers.dev/notify')
on conflict (key) do nothing;
-- La clé partagée 'notify_secret' est ajoutée par la GitHub Action (jamais dans le code).

-- Envoi HTTP depuis la base (extension pg_net de Supabase), si disponible.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

-- Préférences e-mail de chaque membre (tout activé par défaut).
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_messages boolean not null default true,
  email_activity boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
drop policy if exists "voir ses préférences" on public.notification_settings;
create policy "voir ses préférences" on public.notification_settings
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "créer ses préférences" on public.notification_settings;
create policy "créer ses préférences" on public.notification_settings
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "modifier ses préférences" on public.notification_settings;
create policy "modifier ses préférences" on public.notification_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- File des e-mails (sert aussi de journal et d'anti-avalanche).
create table if not exists private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref text not null default '',
  email text not null,
  name text not null default '',
  subject text not null,
  body text not null,
  link text not null default '/',
  created_at timestamptz not null default now()
);
create index if not exists email_outbox_throttle_idx on private.email_outbox (user_id, kind, ref, created_at desc);

-- Met un e-mail en file si le membre l'accepte et s'il n'en a pas reçu un semblable récemment.
create or replace function private.queue_email(
  p_user uuid, p_kind text, p_ref text, p_subject text, p_body text, p_link text,
  p_category text, p_throttle interval default interval '0')
returns void language plpgsql security definer set search_path = public, private as $$
declare
  prefs record;
  addr text;
  member_name text;
begin
  if p_user is null then return; end if;
  select * into prefs from public.notification_settings where user_id = p_user;
  if p_category = 'messages' and prefs.user_id is not null and not prefs.email_messages then return; end if;
  if p_category = 'activity' and prefs.user_id is not null and not prefs.email_activity then return; end if;
  if p_throttle > interval '0' and exists (
    select 1 from private.email_outbox
    where user_id = p_user and kind = p_kind and ref = p_ref and created_at > now() - p_throttle
  ) then return; end if;
  select email into addr from auth.users where id = p_user;
  if addr is null or addr = '' then return; end if;
  select name into member_name from public.profiles where id = p_user;
  insert into private.email_outbox (user_id, kind, ref, email, name, subject, body, link)
  values (p_user, p_kind, coalesce(p_ref, ''), addr, coalesce(member_name, ''), p_subject, p_body, coalesce(p_link, '/'));
end $$;

-- Nouveau message privé : au plus un e-mail toutes les 30 minutes par conversation.
create or replace function private.email_on_message()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  sender_name text;
begin
  select name into sender_name from public.profiles where id = new.sender_id;
  perform private.queue_email(
    new.recipient_id, 'message', new.sender_id::text,
    coalesce(sender_name, 'Un membre') || ' t''a envoyé un message sur Cyclami',
    coalesce(sender_name, 'Un membre') || ' t''a écrit. Ouvre Cyclami pour lire son message et lui répondre.',
    '/', 'messages', interval '30 minutes');
  perform private.send_push(new.recipient_id, coalesce(sender_name, 'Un membre') || ' t''a écrit 💬',
    case when coalesce(new.body, '') = '' then '📷 Photo' else 'Nouveau message' end, '/', 'm:' || new.sender_id);
  return null;
end $$;

drop trigger if exists after_message_email on public.messages;
create trigger after_message_email
  after insert on public.messages
  for each row execute function private.email_on_message();

-- Notifications du site → e-mail (sauf les « j'aime », trop fréquents).
create or replace function private.email_on_notification()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  actor text := coalesce((select name from public.profiles where id = new.actor_id), 'Un membre');
  title text := coalesce(new.data ->> 'title', '');
  subj text;
  txt text;
  cat text := 'activity';
  throttle interval := interval '0';
begin
  case new.type
    when 'ride_join' then
      subj := actor || ' rejoint ta sortie « ' || title || ' »';
      txt := actor || ' a rejoint ta sortie « ' || title || ' ». Bonne promenade !';
    when 'ride_cancelled' then
      subj := 'Sortie annulée : « ' || title || ' »';
      txt := 'La sortie « ' || title || ' » à laquelle tu participais a été annulée.';
    when 'ride_updated' then
      subj := 'Sortie modifiée : « ' || title || ' »';
      txt := actor || ' a modifié le lieu ou l''horaire de la sortie « ' || title || ' ». Vérifie les nouvelles informations.';
    when 'comment' then
      subj := actor || ' a commenté « ' || left(title, 40) || ' »';
      txt := actor || ' a laissé un commentaire : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
      throttle := interval '30 minutes';
    when 'warning' then
      subj := 'Avertissement de l''équipe Cyclami';
      txt := 'L''équipe de modération t''adresse un avertissement : ' || coalesce(new.data ->> 'reason', '');
      cat := 'moderation';
    when 'suspended' then
      subj := 'Ton compte Cyclami est suspendu';
      txt := 'Ton compte est suspendu jusqu''au '
        || to_char((new.data ->> 'until')::timestamptz at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
        || coalesce('. Motif : ' || nullif(new.data ->> 'reason', ''), '') || '.';
      cat := 'moderation';
    when 'content_removed' then
      subj := 'Un de tes contenus a été retiré';
      txt := 'L''équipe de modération a retiré « ' || coalesce(new.data ->> 'excerpt', '') || ' »'
        || coalesce(' (' || nullif(new.data ->> 'reason', '') || ')', '') || '.';
      cat := 'moderation';
    when 'review' then
      subj := actor || ' te recommande sur Cyclami 👍';
      txt := actor || ' a apprécié la sortie « ' || title || ' » avec toi'
        || coalesce(' : « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
    when 'lost_pet' then
      if new.data ->> 'kind' = 'trouve' then
        subj := '🐾 Animal trouvé près de chez toi';
        txt := actor || ' a trouvé un animal près de chez toi' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
          || '. Est-ce le tien ou celui d''un voisin ? Ouvre Cyclami pour voir sa photo.';
      else
        subj := '🚨 Animal perdu près de chez toi : ' || title;
        txt := title || ' a disparu près de chez toi' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
          || '. Ouvre Cyclami pour voir sa photo et prévenir son propriétaire si tu le vois.';
      end if;
      throttle := interval '10 minutes';
    when 'pet_found' then
      subj := 'Bonne nouvelle : ' || title || ' a été retrouvé 🎉';
      txt := title || ', que tu avais vu passer dans les alertes, a été retrouvé. Merci pour ta vigilance !';
    when 'sitting_request' then
      subj := actor || ' propose de garder ' || title;
      txt := actor || ' répond à ta demande de garde pour ' || title
        || coalesce(' : « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
    when 'sitting_answer' then
      subj := 'Garde de ' || title || ' : ' || coalesce(new.data ->> 'answer', 'réponse');
      txt := actor || ' a ' || coalesce(new.data ->> 'answer', 'répondu') || ' ta proposition de garder ' || title || '.';
    when 'health_reminder' then
      subj := 'Rappel santé pour ' || title || ' : ' || coalesce(new.data ->> 'excerpt', '');
      txt := 'Petit rappel : « ' || coalesce(new.data ->> 'excerpt', '') || ' » pour ' || title
        || ' est prévu le ' || coalesce(new.data ->> 'due', '?') || '. Pense à prendre rendez-vous chez le vétérinaire.';
    when 'report_resolved' then
      subj := 'Ton signalement a été traité';
      txt := 'Merci ! L''équipe a traité ton signalement' || coalesce(' : ' || nullif(new.data ->> 'resolution', ''), '') || '.';
    else
      return null; -- « j'aime » et autres : pas d'e-mail
  end case;
  perform private.queue_email(new.user_id, new.type, coalesce(new.ride_id, new.post_id)::text,
                              subj, txt, '/', cat, throttle);
  perform private.send_push(new.user_id, 'Cyclami 🐾', subj, '/', 'n:' || new.id);
  return null;
end $$;

drop trigger if exists after_notification_email on public.notifications;
create trigger after_notification_email
  after insert on public.notifications
  for each row execute function private.email_on_notification();

-- Envoi : la file transmet l'e-mail au service Cloudflare (si la clé partagée est configurée).
create or replace function private.deliver_email()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'notify_url');
  secret text := (select value from private.settings where key = 'notify_secret');
begin
  if url is null or secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null; -- pas encore configuré : l'e-mail reste dans la file
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('to', new.email, 'name', new.name, 'subject', new.subject,
                               'text', new.body, 'link', new.link, 'kind', new.kind),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret)
  );
  return null;
end $$;

drop trigger if exists after_outbox_deliver on private.email_outbox;
create trigger after_outbox_deliver
  after insert on private.email_outbox
  for each row execute function private.deliver_email();

-- Nettoyage : on ne garde que 30 jours de journal.
delete from private.email_outbox where created_at < now() - interval '30 days';

-- =====================================================================
-- Version 12 : date de naissance des animaux (l'âge se met à jour tout seul)
-- =====================================================================
alter table public.pets add column if not exists birth_date date;
alter table public.pets drop constraint if exists pets_birth_date_check;
alter table public.pets add constraint pets_birth_date_check check (birth_date is null or birth_date >= date '1980-01-01');

-- =====================================================================
-- Version 13 : règles belges pour les annonces
--   Vente de chiens et chats : numéro d'agrément d'éleveur (mentionné dans l'annonce).
--   Chats : stérilisés avant d'être cédés (sauf éleveur agréé).
--   Identification obligatoire : chiens, chats (DogID / CatID) et équidés.
--   NOT VALID : les anciennes annonces ne sont pas bloquées, les nouvelles sont vérifiées.
-- =====================================================================
alter table public.listings add column if not exists approval_number text not null default ''
  check (char_length(approval_number) <= 30);
alter table public.listings drop constraint if exists listings_dog_cat_seller;
alter table public.listings drop constraint if exists listings_dog_cat_breeder;
alter table public.listings add constraint listings_dog_cat_breeder check (
  kind <> 'vente' or species not in ('chien', 'chat') or char_length(trim(approval_number)) >= 3) not valid;
alter table public.listings drop constraint if exists listings_cat_sterilized;
alter table public.listings add constraint listings_cat_sterilized check (
  species <> 'chat' or sterilized or char_length(trim(approval_number)) >= 3) not valid;
alter table public.listings drop constraint if exists listings_identification;
alter table public.listings add constraint listings_identification check (
  species not in ('chien', 'chat', 'cheval', 'poney', 'ane') or char_length(trim(identification)) >= 6) not valid;

-- =====================================================================
-- Version 14 : sorties récurrentes (une ligne par date, reliées par series_id)
-- =====================================================================
alter table public.rides add column if not exists series_id uuid;
create index if not exists rides_series_idx on public.rides (series_id) where series_id is not null;

-- =====================================================================
-- Version 15 : recommandations après une sortie
--   Un participant recommande un autre participant d'une sortie passée (30 jours max).
--   Pas de note négative : un problème se signale à la modération.
-- =====================================================================
create table if not exists public.ride_reviews (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  comment text not null default '' check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (ride_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);
create index if not exists ride_reviews_reviewee_idx on public.ride_reviews (reviewee_id, created_at desc);
alter table public.ride_reviews enable row level security;

create or replace function public.can_review(p_ride uuid, p_reviewee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rides w
    where w.id = p_ride and w.starts_at < now() and w.starts_at > now() - interval '30 days'
      and exists (select 1 from public.ride_participants where ride_id = w.id and user_id = auth.uid())
      and exists (select 1 from public.ride_participants where ride_id = w.id and user_id = p_reviewee)
  );
$$;

drop policy if exists "recommandations visibles" on public.ride_reviews;
create policy "recommandations visibles" on public.ride_reviews
  for select to authenticated using (true);
drop policy if exists "recommander un participant" on public.ride_reviews;
create policy "recommander un participant" on public.ride_reviews
  for insert to authenticated
  with check (reviewer_id = auth.uid() and public.can_review(ride_id, reviewee_id) and not public.is_blocked_with(reviewee_id));
drop policy if exists "retirer sa recommandation" on public.ride_reviews;
create policy "retirer sa recommandation" on public.ride_reviews
  for delete to authenticated using (reviewer_id = auth.uid() or public.is_staff());

create or replace function public.notify_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, ride_id, data)
  select new.reviewee_id, new.reviewer_id, 'review', new.ride_id,
         jsonb_build_object('title', w.title, 'excerpt', left(new.comment, 120))
  from public.rides w where w.id = new.ride_id;
  return null;
end $$;
drop trigger if exists after_review_notify on public.ride_reviews;
create trigger after_review_notify after insert on public.ride_reviews
  for each row execute function public.notify_review();

-- =====================================================================
-- Version 16 : alertes « animal perdu » / « animal trouvé »
--   Les membres à moins de ~10 km sont prévenus (notification, e-mail).
-- =====================================================================
create table if not exists public.lost_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'perdu' check (kind in ('perdu', 'trouve')),
  pet_id uuid references public.pets (id) on delete set null,
  name text not null default '' check (char_length(name) <= 40),
  species text not null check (char_length(species) between 1 and 30),
  description text not null default '' check (char_length(description) <= 1000),
  photo_url text check (photo_url is null or char_length(photo_url) <= 500),
  place text not null check (char_length(place) between 1 and 150),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'resolu')),
  resolved_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lost_alerts_active_idx on public.lost_alerts (status, lat, lng);
alter table public.lost_alerts enable row level security;

drop policy if exists "alertes visibles" on public.lost_alerts;
create policy "alertes visibles" on public.lost_alerts
  for select to authenticated using (hidden_at is null or owner_id = auth.uid() or public.is_staff());
drop policy if exists "publier une alerte" on public.lost_alerts;
create policy "publier une alerte" on public.lost_alerts
  for insert to authenticated with check (
    owner_id = auth.uid() and (pet_id is null or exists (select 1 from public.pets where id = pet_id and owner_id = auth.uid())));
drop policy if exists "modifier son alerte" on public.lost_alerts;
create policy "modifier son alerte" on public.lost_alerts
  for update to authenticated using (owner_id = auth.uid() or public.is_staff())
  with check (owner_id = auth.uid() or public.is_staff());
drop policy if exists "supprimer son alerte" on public.lost_alerts;
create policy "supprimer son alerte" on public.lost_alerts
  for delete to authenticated using (owner_id = auth.uid() or public.is_staff());

-- Avant publication : suspension et limite (3 alertes par jour).
create or replace function public.prepare_lost_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.owner_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.lost_alerts where owner_id = new.owner_id and created_at > now() - interval '1 day') >= 3 then
      raise exception 'Trop d''alertes publiées aujourd''hui';
    end if;
    new.status := 'active';
    new.hidden_at := null;
    new.created_at := now();
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.kind := old.kind;
    if not public.is_staff() then new.hidden_at := old.hidden_at; end if;
    -- une alerte close ne se rouvre pas (sinon chaque réouverture relancerait les voisins)
    if old.status = 'resolu' then
      new.status := 'resolu';
      new.name := old.name; new.lat := old.lat; new.lng := old.lng;
    end if;
    if new.status = 'resolu' and old.status <> 'resolu' then new.resolved_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists before_lost_alert on public.lost_alerts;
create trigger before_lost_alert before insert or update on public.lost_alerts
  for each row execute function public.prepare_lost_alert();

-- Prévenir les voisins (≈ 10 km) à la publication, puis quand l'animal est retrouvé.
create or replace function public.notify_lost_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  label text := coalesce(nullif(new.name, ''), case when new.kind = 'trouve' then 'Un animal trouvé' else 'Un animal' end);
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, type, data)
    select p.id, new.owner_id, 'lost_pet',
           jsonb_build_object('title', label, 'place', new.place, 'alert_id', new.id, 'kind', new.kind)
    from public.profiles p
    where p.id <> new.owner_id and p.lat is not null
      and abs(p.lat - new.lat) < 0.09 and abs(p.lng - new.lng) < 0.14
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = p.id and b.blocked_id = new.owner_id)
                         or (b.blocker_id = new.owner_id and b.blocked_id = p.id))
    limit 500;
  elsif new.status = 'resolu' and old.status <> 'resolu' and new.kind = 'perdu'
    and not exists (select 1 from public.notifications where type = 'pet_found' and data ->> 'alert_id' = new.id::text) then
    insert into public.notifications (user_id, actor_id, type, data)
    select distinct n.user_id, new.owner_id, 'pet_found', jsonb_build_object('title', label, 'alert_id', new.id)
    from public.notifications n
    where n.type = 'lost_pet' and n.data ->> 'alert_id' = new.id::text;
  end if;
  return null;
end $$;
drop trigger if exists after_lost_alert on public.lost_alerts;
create trigger after_lost_alert after insert or update of status on public.lost_alerts
  for each row execute function public.notify_lost_alert();

-- =====================================================================
-- Version 17 : carnet de santé (privé) et rappels
--   Rappel (notification + e-mail) 7 jours avant l'échéance, envoyé une seule fois.
--   Tâche quotidienne pg_cron si disponible ; sinon déclenché à l'ouverture du site.
-- =====================================================================
create table if not exists public.pet_health (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'vaccin' check (kind in ('vaccin', 'vermifuge', 'antiparasitaire', 'visite', 'soin', 'autre')),
  label text not null check (char_length(label) between 1 and 80),
  done_on date,
  next_due date,
  notes text not null default '' check (char_length(notes) <= 500),
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pet_health_pet_idx on public.pet_health (pet_id, done_on desc);
create index if not exists pet_health_due_idx on public.pet_health (next_due) where reminded_at is null;
alter table public.pet_health enable row level security;

drop policy if exists "son carnet de santé" on public.pet_health;
create policy "son carnet de santé" on public.pet_health
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.pets where id = pet_id and owner_id = auth.uid()));

-- une échéance modifiée repart pour un nouveau rappel
create or replace function public.prepare_pet_health()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.next_due is distinct from old.next_due then new.reminded_at := null; end if;
  return new;
end $$;
drop trigger if exists before_pet_health on public.pet_health;
create trigger before_pet_health before update on public.pet_health
  for each row execute function public.prepare_pet_health();

-- Envoie les rappels dus (p_user : un seul membre, sinon tout le monde).
create or replace function private.send_health_reminders(p_user uuid default null)
returns int language plpgsql security definer set search_path = public, private as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select h.id, h.owner_id, h.label, h.next_due, p.name as pet_name
    from public.pet_health h join public.pets p on p.id = h.pet_id
    where h.reminded_at is null and h.next_due is not null
      and h.next_due <= current_date + 7 and h.next_due >= current_date - 1
      and (p_user is null or h.owner_id = p_user)
    for update of h skip locked
  loop
    update public.pet_health set reminded_at = now() where id = r.id;
    insert into public.notifications (user_id, type, data)
    values (r.owner_id, 'health_reminder', jsonb_build_object(
      'title', r.pet_name, 'excerpt', r.label, 'due', to_char(r.next_due, 'DD/MM/YYYY'), 'health_id', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.check_my_health_reminders()
returns int language sql security definer set search_path = public, private as $$
  select private.send_health_reminders(auth.uid());
$$;
revoke all on function public.check_my_health_reminders() from public, anon;
grant execute on function public.check_my_health_reminders() to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'cyclami-rappels-sante';
    perform cron.schedule('cyclami-rappels-sante', '0 7 * * *', 'select private.send_health_reminders()');
  end if;
exception when others then
  raise notice 'pg_cron indisponible : rappels envoyés à l''ouverture du site (%)', sqlerrm;
end $$;

-- =====================================================================
-- Version 18 : garde entre voisins (sans paiement sur le site)
--   Un membre publie une demande ; les voisins proposent leur aide ; il accepte ou refuse.
-- =====================================================================
create table if not exists public.sitting_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  kind text not null default 'garde' check (kind in ('garde', 'promenade', 'visite')),
  starts_on date not null,
  ends_on date not null,
  description text not null default '' check (char_length(description) <= 1000),
  city text not null default '',
  lat double precision,
  lng double precision,
  status text not null default 'ouverte' check (status in ('ouverte', 'pourvue', 'annulee')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 60)
);
create index if not exists sitting_requests_open_idx on public.sitting_requests (status, starts_on);
alter table public.sitting_requests enable row level security;

create table if not exists public.sitting_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sitting_requests (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  status text not null default 'proposee' check (status in ('proposee', 'acceptee', 'refusee')),
  created_at timestamptz not null default now(),
  unique (request_id, sitter_id)
);
alter table public.sitting_offers enable row level security;

drop policy if exists "demandes de garde visibles" on public.sitting_requests;
create policy "demandes de garde visibles" on public.sitting_requests
  for select to authenticated using (hidden_at is null or owner_id = auth.uid() or public.is_staff());
drop policy if exists "publier une demande de garde" on public.sitting_requests;
create policy "publier une demande de garde" on public.sitting_requests
  for insert to authenticated with check (
    owner_id = auth.uid() and (pet_id is null or exists (select 1 from public.pets where id = pet_id and owner_id = auth.uid())));
drop policy if exists "modifier sa demande de garde" on public.sitting_requests;
create policy "modifier sa demande de garde" on public.sitting_requests
  for update to authenticated using (owner_id = auth.uid() or public.is_staff()) with check (owner_id = auth.uid() or public.is_staff());
drop policy if exists "supprimer sa demande de garde" on public.sitting_requests;
create policy "supprimer sa demande de garde" on public.sitting_requests
  for delete to authenticated using (owner_id = auth.uid() or public.is_staff());

drop policy if exists "voir les propositions" on public.sitting_offers;
create policy "voir les propositions" on public.sitting_offers
  for select to authenticated using (
    sitter_id = auth.uid() or exists (select 1 from public.sitting_requests r where r.id = request_id and r.owner_id = auth.uid()));
drop policy if exists "proposer son aide" on public.sitting_offers;
create policy "proposer son aide" on public.sitting_offers
  for insert to authenticated with check (
    sitter_id = auth.uid() and status = 'proposee' and exists (
      select 1 from public.sitting_requests r
      where r.id = request_id and r.status = 'ouverte' and r.owner_id <> auth.uid() and r.hidden_at is null
        and not exists (select 1 from public.blocks b where (b.blocker_id = r.owner_id and b.blocked_id = auth.uid())
                                                     or (b.blocker_id = auth.uid() and b.blocked_id = r.owner_id))));
drop policy if exists "répondre à une proposition" on public.sitting_offers;
create policy "répondre à une proposition" on public.sitting_offers
  for update to authenticated
  using (exists (select 1 from public.sitting_requests r where r.id = request_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.sitting_requests r where r.id = request_id and r.owner_id = auth.uid()));
drop policy if exists "retirer sa proposition" on public.sitting_offers;
create policy "retirer sa proposition" on public.sitting_offers
  for delete to authenticated using (sitter_id = auth.uid());

-- Demande : position et ville du membre ; limite de 5 demandes par jour ; suspension.
create or replace function public.prepare_sitting_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.owner_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.sitting_requests where owner_id = new.owner_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Trop de demandes de garde aujourd''hui';
    end if;
    if new.starts_on < current_date then raise exception 'La garde doit commencer aujourd''hui ou plus tard'; end if;
    select lat, lng, city into new.lat, new.lng, new.city from public.profiles where id = new.owner_id;
    new.created_at := now();
    new.status := 'ouverte';
    new.hidden_at := null;
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    if not public.is_staff() then new.hidden_at := old.hidden_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists before_sitting_request on public.sitting_requests;
create trigger before_sitting_request before insert or update on public.sitting_requests
  for each row execute function public.prepare_sitting_request();

-- Proposition : seul le statut change ; acceptée → la demande est pourvue ; notifications.
create or replace function public.on_sitting_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  req record;
  pet_name text;
begin
  select r.*, coalesce(p.name, 'ton animal') as pname into req
  from public.sitting_requests r left join public.pets p on p.id = r.pet_id where r.id = new.request_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, type, data)
    values (req.owner_id, new.sitter_id, 'sitting_request',
            jsonb_build_object('title', req.pname, 'excerpt', left(new.message, 120), 'request_id', req.id));
  elsif new.status <> old.status and new.status in ('acceptee', 'refusee') then
    insert into public.notifications (user_id, actor_id, type, data)
    values (new.sitter_id, req.owner_id, 'sitting_answer',
            jsonb_build_object('title', req.pname, 'answer', case new.status when 'acceptee' then 'accepté' else 'refusé' end,
                               'request_id', req.id));
    if new.status = 'acceptee' then
      update public.sitting_requests set status = 'pourvue' where id = req.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists after_sitting_offer on public.sitting_offers;
create trigger after_sitting_offer after insert or update of status on public.sitting_offers
  for each row execute function public.on_sitting_offer();

create or replace function public.guard_sitting_offer()
returns trigger language plpgsql as $$
begin
  -- le propriétaire ne change que le statut
  new.request_id := old.request_id;
  new.sitter_id := old.sitter_id;
  new.message := old.message;
  new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists before_sitting_offer_update on public.sitting_offers;
create trigger before_sitting_offer_update before update on public.sitting_offers
  for each row execute function public.guard_sitting_offer();

-- =====================================================================
-- Version 19 : statistiques de fréquentation, sans traceur
--   Seuls des compteurs par jour et par page sont enregistrés (aucune IP, aucun identifiant).
-- =====================================================================
create table if not exists private.page_views (
  day date not null default current_date,
  page text not null,
  views int not null default 0,
  visits int not null default 0,
  primary key (day, page)
);

-- p_visit : première page d'une nouvelle visite (une par onglet et par jour)
create or replace function public.track_view(p_page text, p_visit boolean default false)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if p_page is null or p_page !~ '^[a-z][a-z-]{0,23}$' then return; end if;
  insert into private.page_views (day, page, views, visits)
  values (current_date, p_page, 1, case when p_visit then 1 else 0 end)
  on conflict (day, page) do update
    set views = private.page_views.views + 1,
        visits = private.page_views.visits + excluded.visits;
end $$;
revoke all on function public.track_view(text, boolean) from public;
grant execute on function public.track_view(text, boolean) to anon, authenticated;

create or replace function public.admin_traffic(p_days int default 30)
returns json language plpgsql stable security definer set search_path = public, private as $$
declare
  since date := current_date - greatest(1, least(p_days, 365)) + 1;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return json_build_object(
    'days', (
      select coalesce(json_agg(json_build_object('day', d.day, 'visits', coalesce(v.visits, 0), 'views', coalesce(v.views, 0),
                                                 'signups', coalesce(u.signups, 0)) order by d.day), '[]'::json)
      from generate_series(since, current_date, interval '1 day') as d(day)
      left join (select day, sum(visits) as visits, sum(views) as views from private.page_views where day >= since group by day) as v on v.day = d.day
      left join (select created_at::date as day, count(*) as signups from auth.users where created_at::date >= since group by 1) as u on u.day = d.day
    ),
    'pages', (
      select coalesce(json_agg(json_build_object('page', page, 'views', views) order by views desc), '[]'::json)
      from (select page, sum(views) as views from private.page_views where day >= since group by page order by 2 desc limit 12) as t
    ),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')
  );
end $$;
revoke all on function public.admin_traffic(int) from public, anon;
grant execute on function public.admin_traffic(int) to authenticated;

delete from private.page_views where day < current_date - 400;

-- =====================================================================
-- Version 20 : notifications push sur le téléphone (Web Push)
--   Chaque appareil abonné reçoit messages et notifications, même site fermé.
-- =====================================================================
create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "ses abonnements push" on public.push_subscriptions;
create policy "ses abonnements push" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- un appareil change de compte : son abonnement passe au nouveau compte
-- (seulement les services de notification connus ; l'appareil d'un autre ne peut pas être détourné sans ses clés)
drop function if exists public.register_push(text, text, text);
create function public.register_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_endpoint !~ '^https://([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|windows\.com)/' then
    raise exception 'Service de notification inconnu';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth
    where public.push_subscriptions.user_id = auth.uid()
       or (public.push_subscriptions.p256dh = excluded.p256dh and public.push_subscriptions.auth = excluded.auth);
end $$;
revoke all on function public.register_push(text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text) to authenticated;

create or replace function private.send_push(p_user uuid, p_title text, p_body text, p_url text default '/', p_tag text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  url text := replace((select value from private.settings where key = 'notify_url'), '/notify', '/push');
  secret text := (select value from private.settings where key = 'notify_secret');
  subs jsonb;
begin
  if url is null or secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into subs
  from (select * from public.push_subscriptions where user_id = p_user order by created_at desc limit 10) s;
  if subs is null then return; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('subscriptions', subs, 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret)
  );
end $$;

-- =====================================================================
-- Version 21 : langue des membres (français / néerlandais) pour les e-mails et notifications push
-- =====================================================================
alter table public.profiles add column if not exists lang text not null default 'fr';
alter table public.profiles drop constraint if exists profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang in ('fr', 'nl'));
alter table private.email_outbox add column if not exists lang text not null default 'fr';

create or replace function private.queue_email(
  p_user uuid, p_kind text, p_ref text, p_subject text, p_body text, p_link text,
  p_category text, p_throttle interval default interval '0')
returns void language plpgsql security definer set search_path = public, private as $$
declare
  prefs record;
  addr text;
  member record;
begin
  if p_user is null then return; end if;
  select * into prefs from public.notification_settings where user_id = p_user;
  if p_category = 'messages' and prefs.user_id is not null and not prefs.email_messages then return; end if;
  if p_category = 'activity' and prefs.user_id is not null and not prefs.email_activity then return; end if;
  if p_throttle > interval '0' and exists (
    select 1 from private.email_outbox
    where user_id = p_user and kind = p_kind and ref = p_ref and created_at > now() - p_throttle
  ) then return; end if;
  select email into addr from auth.users where id = p_user;
  if addr is null or addr = '' then return; end if;
  select name, lang into member from public.profiles where id = p_user;
  insert into private.email_outbox (user_id, kind, ref, email, name, subject, body, link, lang)
  values (p_user, p_kind, coalesce(p_ref, ''), addr, coalesce(member.name, ''), p_subject, p_body, coalesce(p_link, '/'),
          coalesce(member.lang, 'fr'));
end $$;

create or replace function private.deliver_email()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'notify_url');
  secret text := (select value from private.settings where key = 'notify_secret');
begin
  if url is null or secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('to', new.email, 'name', new.name, 'subject', new.subject,
                               'text', new.body, 'link', new.link, 'kind', new.kind, 'lang', new.lang),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret)
  );
  return null;
end $$;

create or replace function private.email_on_message()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  sender_name text := coalesce((select name from public.profiles where id = new.sender_id), 'Un membre');
  nl boolean := (select lang from public.profiles where id = new.recipient_id) = 'nl';
begin
  if nl then
    perform private.queue_email(new.recipient_id, 'message', new.sender_id::text,
      sender_name || ' stuurde je een bericht op Cyclami',
      sender_name || ' schreef je. Open Cyclami om het bericht te lezen en te antwoorden.',
      '/', 'messages', interval '30 minutes');
    perform private.send_push(new.recipient_id, sender_name || ' schreef je 💬',
      case when coalesce(new.body, '') = '' then '📷 Foto' else 'Nieuw bericht' end, '/', 'm:' || new.sender_id);
  else
    perform private.queue_email(new.recipient_id, 'message', new.sender_id::text,
      sender_name || ' t''a envoyé un message sur Cyclami',
      sender_name || ' t''a écrit. Ouvre Cyclami pour lire son message et lui répondre.',
      '/', 'messages', interval '30 minutes');
    perform private.send_push(new.recipient_id, sender_name || ' t''a écrit 💬',
      case when coalesce(new.body, '') = '' then '📷 Photo' else 'Nouveau message' end, '/', 'm:' || new.sender_id);
  end if;
  return null;
end $$;

create or replace function private.email_on_notification()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  nl boolean := (select lang from public.profiles where id = new.user_id) = 'nl';
  actor text := coalesce((select name from public.profiles where id = new.actor_id),
                         case when (select lang from public.profiles where id = new.user_id) = 'nl' then 'Een lid' else 'Un membre' end);
  title text := coalesce(new.data ->> 'title', '');
  subj text;
  txt text;
  cat text := 'activity';
  throttle interval := interval '0';
begin
  if nl then
    case new.type
      when 'ride_join' then
        subj := actor || ' neemt deel aan je fietstocht « ' || title || ' »';
        txt := actor || ' neemt deel aan je fietstocht « ' || title || ' ». Fijne fietstocht!';
      when 'ride_cancelled' then
        subj := 'Fietstocht geannuleerd: « ' || title || ' »';
        txt := 'De fietstocht « ' || title || ' » waaraan je deelnam, is geannuleerd.';
      when 'ride_updated' then
        subj := 'Fietstocht gewijzigd: « ' || title || ' »';
        txt := actor || ' heeft de plaats of het uur van de fietstocht « ' || title || ' » gewijzigd. Bekijk de nieuwe gegevens.';
      when 'comment' then
        subj := actor || ' reageerde op « ' || left(title, 40) || ' »';
        txt := actor || ' liet een reactie achter: « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'warning' then
        subj := 'Waarschuwing van het Cyclami-team';
        txt := 'Het moderatieteam geeft je een waarschuwing: ' || coalesce(new.data ->> 'reason', '');
        cat := 'moderation';
      when 'suspended' then
        subj := 'Je Cyclami-account is geschorst';
        txt := 'Je account is geschorst tot '
          || to_char((new.data ->> 'until')::timestamptz at time zone 'Europe/Brussels', 'DD/MM/YYYY "om" HH24:MI')
          || coalesce('. Reden: ' || nullif(new.data ->> 'reason', ''), '') || '.';
        cat := 'moderation';
      when 'content_removed' then
        subj := 'Een van je berichten werd verwijderd';
        txt := 'Het moderatieteam heeft « ' || coalesce(new.data ->> 'excerpt', '') || ' » verwijderd'
          || coalesce(' (' || nullif(new.data ->> 'reason', '') || ')', '') || '.';
        cat := 'moderation';
      when 'review' then
        subj := actor || ' beveelt je aan op Cyclami 👍';
        txt := actor || ' vond de fietstocht « ' || title || ' » met jou fijn'
          || coalesce(': « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'lost_pet' then
        if new.data ->> 'kind' = 'trouve' then
          subj := '🐾 Dier gevonden bij jou in de buurt';
          txt := actor || ' heeft een dier gevonden bij jou in de buurt' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Is het van jou of van een buur? Open Cyclami om de foto te bekijken.';
        else
          subj := '🚨 Dier verloren bij jou in de buurt: ' || title;
          txt := title || ' is verdwenen bij jou in de buurt' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Open Cyclami om de foto te bekijken en verwittig de eigenaar als je het ziet.';
        end if;
        throttle := interval '10 minutes';
      when 'pet_found' then
        subj := 'Goed nieuws: ' || title || ' is teruggevonden 🎉';
        txt := title || ', dat je in de meldingen zag, is teruggevonden. Bedankt voor je waakzaamheid!';
      when 'sitting_request' then
        subj := actor || ' wil oppassen op ' || title;
        txt := actor || ' reageert op je oppasvraag voor ' || title
          || coalesce(': « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'sitting_answer' then
        subj := 'Oppas voor ' || title || ': ' || case new.data ->> 'answer' when 'accepté' then 'aanvaard' when 'refusé' then 'geweigerd' else 'antwoord' end;
        txt := actor || ' heeft je voorstel om op ' || title || ' te passen '
          || case new.data ->> 'answer' when 'accepté' then 'aanvaard' when 'refusé' then 'geweigerd' else 'beantwoord' end || '.';
      when 'health_reminder' then
        subj := 'Gezondheidsherinnering voor ' || title || ': ' || coalesce(new.data ->> 'excerpt', '');
        txt := 'Kleine herinnering: « ' || coalesce(new.data ->> 'excerpt', '') || ' » voor ' || title
          || ' staat gepland op ' || coalesce(new.data ->> 'due', '?') || '. Denk eraan een afspraak te maken bij de dierenarts.';
      when 'forum_reply' then
        subj := actor || ' antwoordde op « ' || left(title, 60) || ' »';
        txt := actor || ' antwoordde in het forum op « ' || title || ' »: « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'pet_birthday' then
        subj := '🎂 Gelukkige verjaardag, ' || title || '!';
        txt := title || ' wordt vandaag ' || coalesce(new.data ->> 'years', '?') || ' jaar. Deel een foto met de buurt op Cyclami!';
      when 'ride_message' then
        subj := actor || ' schreef in de groepschat van « ' || left(title, 50) || ' »';
        txt := actor || ': « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'report_resolved' then
        subj := 'Je melding werd behandeld';
        txt := 'Bedankt! Het team heeft je melding behandeld' || coalesce(': ' || nullif(new.data ->> 'resolution', ''), '') || '.';
      else
        return null;
    end case;
  else
    case new.type
      when 'ride_join' then
        subj := actor || ' rejoint ta sortie « ' || title || ' »';
        txt := actor || ' a rejoint ta sortie « ' || title || ' ». Bonne promenade !';
      when 'ride_cancelled' then
        subj := 'Sortie annulée : « ' || title || ' »';
        txt := 'La sortie « ' || title || ' » à laquelle tu participais a été annulée.';
      when 'ride_updated' then
        subj := 'Sortie modifiée : « ' || title || ' »';
        txt := actor || ' a modifié le lieu ou l''horaire de la sortie « ' || title || ' ». Vérifie les nouvelles informations.';
      when 'comment' then
        subj := actor || ' a commenté « ' || left(title, 40) || ' »';
        txt := actor || ' a laissé un commentaire : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'warning' then
        subj := 'Avertissement de l''équipe Cyclami';
        txt := 'L''équipe de modération t''adresse un avertissement : ' || coalesce(new.data ->> 'reason', '');
        cat := 'moderation';
      when 'suspended' then
        subj := 'Ton compte Cyclami est suspendu';
        txt := 'Ton compte est suspendu jusqu''au '
          || to_char((new.data ->> 'until')::timestamptz at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
          || coalesce('. Motif : ' || nullif(new.data ->> 'reason', ''), '') || '.';
        cat := 'moderation';
      when 'content_removed' then
        subj := 'Un de tes contenus a été retiré';
        txt := 'L''équipe de modération a retiré « ' || coalesce(new.data ->> 'excerpt', '') || ' »'
          || coalesce(' (' || nullif(new.data ->> 'reason', '') || ')', '') || '.';
        cat := 'moderation';
      when 'review' then
        subj := actor || ' te recommande sur Cyclami 👍';
        txt := actor || ' a apprécié la sortie « ' || title || ' » avec toi'
          || coalesce(' : « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'lost_pet' then
        if new.data ->> 'kind' = 'trouve' then
          subj := '🐾 Animal trouvé près de chez toi';
          txt := actor || ' a trouvé un animal près de chez toi' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Est-ce le tien ou celui d''un voisin ? Ouvre Cyclami pour voir sa photo.';
        else
          subj := '🚨 Animal perdu près de chez toi : ' || title;
          txt := title || ' a disparu près de chez toi' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Ouvre Cyclami pour voir sa photo et prévenir son propriétaire si tu le vois.';
        end if;
        throttle := interval '10 minutes';
      when 'pet_found' then
        subj := 'Bonne nouvelle : ' || title || ' a été retrouvé 🎉';
        txt := title || ', que tu avais vu passer dans les alertes, a été retrouvé. Merci pour ta vigilance !';
      when 'sitting_request' then
        subj := actor || ' propose de garder ' || title;
        txt := actor || ' répond à ta demande de garde pour ' || title
          || coalesce(' : « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'sitting_answer' then
        subj := 'Garde de ' || title || ' : ' || coalesce(new.data ->> 'answer', 'réponse');
        txt := actor || ' a ' || coalesce(new.data ->> 'answer', 'répondu') || ' ta proposition de garder ' || title || '.';
      when 'health_reminder' then
        subj := 'Rappel santé pour ' || title || ' : ' || coalesce(new.data ->> 'excerpt', '');
        txt := 'Petit rappel : « ' || coalesce(new.data ->> 'excerpt', '') || ' » pour ' || title
          || ' est prévu le ' || coalesce(new.data ->> 'due', '?') || '. Pense à prendre rendez-vous chez le vétérinaire.';
      when 'forum_reply' then
        subj := actor || ' a répondu à « ' || left(title, 60) || ' »';
        txt := actor || ' a répondu sur le forum à « ' || title || ' » : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'pet_birthday' then
        subj := '🎂 Joyeux anniversaire, ' || title || ' !';
        txt := title || ' fête aujourd''hui ses ' || coalesce(new.data ->> 'years', '?') || ' ans. Partage une photo avec le quartier sur Cyclami !';
      when 'ride_message' then
        subj := actor || ' a écrit dans la discussion de « ' || left(title, 50) || ' »';
        txt := actor || ' : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'report_resolved' then
        subj := 'Ton signalement a été traité';
        txt := 'Merci ! L''équipe a traité ton signalement' || coalesce(' : ' || nullif(new.data ->> 'resolution', ''), '') || '.';
      else
        return null; -- « j'aime » et autres : pas d'e-mail
    end case;
  end if;
  if new.type = 'ride_updated' then throttle := greatest(throttle, interval '30 minutes');
  elsif new.type = 'pet_found' then throttle := greatest(throttle, interval '1 day');
  end if;
  perform private.queue_email(new.user_id, new.type,
                              coalesce(new.ride_id::text, new.post_id::text, new.data ->> 'topic_id', new.data ->> 'alert_id'),
                              subj, txt, '/', cat, throttle);
  perform private.send_push(new.user_id, 'Cyclami 🐾', subj, '/', 'n:' || new.id);
  return null;
end $$;

-- =====================================================================
-- Version 22 : forum (sujets par catégorie et réponses)
-- =====================================================================
create table if not exists public.forum_topics (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('general', 'sante', 'education', 'sorties', 'nac', 'adoption', 'entraide')),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  pinned boolean not null default false,
  locked boolean not null default false,
  reply_count int not null default 0,
  last_reply_at timestamptz not null default now(),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists forum_topics_list_idx on public.forum_topics (category, pinned desc, last_reply_at desc);
create index if not exists forum_topics_recent_idx on public.forum_topics (last_reply_at desc);

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.forum_topics (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists forum_replies_topic_idx on public.forum_replies (topic_id, created_at);

alter table public.forum_topics enable row level security;
alter table public.forum_replies enable row level security;

drop policy if exists "sujets visibles" on public.forum_topics;
create policy "sujets visibles" on public.forum_topics
  for select to authenticated using (hidden_at is null or author_id = auth.uid() or public.is_staff());
drop policy if exists "ouvrir un sujet" on public.forum_topics;
create policy "ouvrir un sujet" on public.forum_topics
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "modifier son sujet" on public.forum_topics;
create policy "modifier son sujet" on public.forum_topics
  for update to authenticated using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());
drop policy if exists "supprimer son sujet" on public.forum_topics;
create policy "supprimer son sujet" on public.forum_topics
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

drop policy if exists "réponses visibles" on public.forum_replies;
create policy "réponses visibles" on public.forum_replies
  for select to authenticated using (
    (hidden_at is null or author_id = auth.uid() or public.is_staff())
    and exists (select 1 from public.forum_topics t where t.id = topic_id
                and (t.hidden_at is null or t.author_id = auth.uid() or public.is_staff())));
drop policy if exists "répondre à un sujet" on public.forum_replies;
create policy "répondre à un sujet" on public.forum_replies
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.forum_topics t where t.id = topic_id and t.hidden_at is null
                and (not t.locked or public.is_staff())));
drop policy if exists "modifier sa réponse" on public.forum_replies;
create policy "modifier sa réponse" on public.forum_replies
  for update to authenticated using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());
drop policy if exists "supprimer sa réponse" on public.forum_replies;
create policy "supprimer sa réponse" on public.forum_replies
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

-- Sujet : seule l'équipe épingle, verrouille ou masque ; compteurs gérés par la base.
create or replace function public.prepare_forum_topic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.forum_topics where author_id = new.author_id and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Trop de sujets d''un coup : réessaie dans une heure';
    end if;
    if not public.is_staff() then new.pinned := false; new.locked := false; end if;
    new.hidden_at := null;
    new.reply_count := 0;
    new.last_reply_at := now();
    new.created_at := now();
  else
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    if coalesce(current_setting('cyclami.counter_update', true), '0') <> '1' then
      new.reply_count := old.reply_count;
      new.last_reply_at := old.last_reply_at;
    end if;
    if not public.is_staff() then new.pinned := old.pinned; new.locked := old.locked; end if;
    if coalesce(current_setting('cyclami.mod_update', true), '0') <> '1' then new.hidden_at := old.hidden_at; end if;
    if new.title is distinct from old.title or new.body is distinct from old.body then new.updated_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists before_forum_topic on public.forum_topics;
create trigger before_forum_topic before insert or update on public.forum_topics
  for each row execute function public.prepare_forum_topic();

create or replace function public.prepare_forum_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.forum_replies where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 20 then
      raise exception 'Trop de réponses d''un coup : patiente quelques minutes';
    end if;
    new.hidden_at := null;
    new.created_at := now();
  else
    new.author_id := old.author_id;
    new.topic_id := old.topic_id;
    new.created_at := old.created_at;
    if coalesce(current_setting('cyclami.mod_update', true), '0') <> '1' then new.hidden_at := old.hidden_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists before_forum_reply on public.forum_replies;
create trigger before_forum_reply before insert or update on public.forum_replies
  for each row execute function public.prepare_forum_reply();

-- Nouvelle réponse : compteur, date d'activité et notification de l'auteur du sujet
-- et des membres qui ont déjà répondu (50 au plus).
create or replace function public.on_forum_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  topic record;
begin
  perform set_config('cyclami.counter_update', '1', true);
  if tg_op = 'INSERT' then
    update public.forum_topics set reply_count = reply_count + 1, last_reply_at = now()
    where id = new.topic_id returning * into topic;
    insert into public.notifications (user_id, actor_id, type, data)
    select distinct u, new.author_id, 'forum_reply',
           jsonb_build_object('title', topic.title, 'excerpt', left(new.body, 120), 'topic_id', topic.id)
    from (select topic.author_id as u
          union select author_id from (select author_id from public.forum_replies
                                       where topic_id = new.topic_id and id <> new.id
                                       order by created_at desc limit 50) r) x
    where u <> new.author_id
      and not exists (select 1 from public.blocks b where b.blocker_id = u and b.blocked_id = new.author_id);
  else
    update public.forum_topics set reply_count = greatest(reply_count - 1, 0) where id = old.topic_id;
  end if;
  perform set_config('cyclami.counter_update', '0', true);
  return null;
end $$;
drop trigger if exists after_forum_reply on public.forum_replies;
create trigger after_forum_reply after insert or delete on public.forum_replies
  for each row execute function public.on_forum_reply();

-- =====================================================================
-- Version 23 : journal des erreurs du site (pour l'équipe)
--   Erreurs identiques regroupées (compteur) ; 30 jours de journal ; lecture réservée aux admins.
-- =====================================================================
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text not null default '',
  page text not null default '',
  user_agent text not null default '',
  last_user uuid references public.profiles (id) on delete set null,
  count int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists client_errors_key_idx on public.client_errors (md5(message || '|' || page));
alter table public.client_errors enable row level security;
drop policy if exists "erreurs lues par les admins" on public.client_errors;
create policy "erreurs lues par les admins" on public.client_errors
  for select to authenticated using (public.is_admin());
drop policy if exists "erreurs effacées par les admins" on public.client_errors;
create policy "erreurs effacées par les admins" on public.client_errors
  for delete to authenticated using (public.is_admin());

create or replace function public.log_client_error(p_message text, p_stack text, p_page text, p_agent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_message), '') = '' then return; end if;
  -- garde-fou : au plus 500 nouvelles erreurs distinctes par heure
  if (select count(*) from public.client_errors where first_at > now() - interval '1 hour') >= 500 then return; end if;
  insert into public.client_errors (message, stack, page, user_agent, last_user)
  values (left(p_message, 500), left(coalesce(p_stack, ''), 3000), left(coalesce(p_page, ''), 40), left(coalesce(p_agent, ''), 300),
          (select id from public.profiles where id = auth.uid()))
  on conflict (md5(message || '|' || page)) do update
    set count = public.client_errors.count + 1, last_at = now(), stack = excluded.stack,
        user_agent = excluded.user_agent, last_user = coalesce(excluded.last_user, public.client_errors.last_user);
end $$;
revoke all on function public.log_client_error(text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text) to anon, authenticated;

delete from public.client_errors where last_at < now() - interval '30 days';

-- =====================================================================
-- Version 24 : corrections de sécurité (audit d'octobre 2026)
-- =====================================================================
-- Message reçu : seule la date de lecture peut être enregistrée.
create or replace function public.guard_message_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sender_id <> old.sender_id or new.recipient_id <> old.recipient_id
     or new.body is distinct from old.body or new.photo_url is distinct from old.photo_url
     or new.created_at <> old.created_at then
    raise exception 'Seule la lecture d''un message peut être enregistrée';
  end if;
  return new;
end $$;
drop trigger if exists before_message_update on public.messages;
create trigger before_message_update before update on public.messages
  for each row execute function public.guard_message_update();
revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;
-- une photo de message vient forcément de son propre dossier
drop policy if exists "envoyer un message" on public.messages;
create policy "envoyer un message" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and not public.is_blocked_with(recipient_id)
    and (photo_url is null or split_part(photo_url, '/', 1) = auth.uid()::text)
  );

-- Publications, commentaires, sorties : l'auteur ne peut ni démasquer son contenu ni l'antidater.
create or replace function public.protect_moderated_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.hidden_at := null;
    new.created_at := now();
  else
    if coalesce(current_setting('cyclami.mod_update', true), '0') <> '1' then new.hidden_at := old.hidden_at; end if;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['posts', 'comments', 'rides'] loop
    execute format('drop trigger if exists before_protect_moderation on public.%I', t);
    execute format('create trigger before_protect_moderation before insert or update on public.%I
                    for each row execute function public.protect_moderated_row()', t);
  end loop;
end $$;

-- Un membre suspendu ne peut pas non plus aimer, recommander, proposer une garde ni ajouter d'animal.
do $$
declare t text;
begin
  foreach t in array array['post_likes', 'ride_reviews', 'sitting_offers', 'pets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists before_insert_guard on public.%I', t);
      execute format('create trigger before_insert_guard before insert on public.%I
                      for each row execute function public.guard_member_activity()', t);
    end if;
  end loop;
end $$;

-- Ces fonctions révélaient les blocages et suspensions des autres membres.
revoke execute on function public.is_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_suspended(uuid) from public, anon, authenticated;
revoke execute on function public.is_blocked_with(uuid) from public, anon;
grant execute on function public.is_blocked_with(uuid) to authenticated;

-- Photos hébergées uniquement par Cyclami (pas d'image espion ni de lien piégé).
create or replace function public.is_own_photo_url(u text)
returns boolean language sql immutable as $$
  select u is null or u ~ '^https://(cyclami-photos\.[a-z0-9-]+\.workers\.dev|qwhssunuewkzdppzvjdv\.supabase\.co/storage/v1/object/public)/';
$$;
create or replace function public.are_own_photo_urls(us text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(public.is_own_photo_url(u)), true) from unnest(us) as u;
$$;
alter table public.posts drop constraint if exists posts_photo_url_own;
alter table public.posts add constraint posts_photo_url_own check (public.is_own_photo_url(photo_url)) not valid;
alter table public.pets drop constraint if exists pets_photo_url_own;
alter table public.pets add constraint pets_photo_url_own check (public.is_own_photo_url(photo_url)) not valid;
alter table public.lost_alerts drop constraint if exists lost_alerts_photo_url_own;
alter table public.lost_alerts add constraint lost_alerts_photo_url_own check (public.is_own_photo_url(photo_url)) not valid;
alter table public.listings drop constraint if exists listings_photo_urls_own;
alter table public.listings add constraint listings_photo_urls_own check (public.are_own_photo_urls(photo_urls)) not valid;
alter table public.messages drop constraint if exists messages_photo_path;
alter table public.messages add constraint messages_photo_path check (photo_url is null or photo_url !~ '^[a-z]+:') not valid;

-- =====================================================================
-- Version 25 : anniversaire des animaux, discussion de sortie, avis sur les lieux
-- =====================================================================
-- (nouveaux types de notification ajoutés directement dans notifications_type_check, plus haut)

-- ---------- Anniversaire : une notification le jour J (29 février fêté le 28 les autres années) ----------
create or replace function private.send_birthdays(p_user uuid default null)
returns int language plpgsql security definer set search_path = public, private as $$
declare
  r record;
  n int := 0;
  today date := (now() at time zone 'Europe/Brussels')::date;
begin
  for r in
    select p.id, p.owner_id, p.name, extract(year from age(today, p.birth_date))::int as years
    from public.pets p
    where p.birth_date is not null and p.birth_date < today
      and (p_user is null or p.owner_id = p_user)
      and (to_char(p.birth_date, 'MM-DD') = to_char(today, 'MM-DD')
           or (to_char(p.birth_date, 'MM-DD') = '02-29' and to_char(today, 'MM-DD') = '02-28'
               and extract(day from (date_trunc('year', today) + interval '2 months' - interval '1 day')) = 28))
      and not exists (select 1 from public.notifications x
                      where x.user_id = p.owner_id and x.type = 'pet_birthday'
                        and x.data ->> 'pet_id' = p.id::text and x.created_at > now() - interval '300 days')
  loop
    insert into public.notifications (user_id, type, data)
    values (r.owner_id, 'pet_birthday', jsonb_build_object('title', r.name, 'pet_id', r.id, 'years', r.years));
    n := n + 1;
  end loop;
  return n;
end $$;

-- appelée à l'ouverture du site (rappels santé + anniversaire), en plus de la tâche de 7 h
create or replace function public.check_my_health_reminders()
returns int language sql security definer set search_path = public, private as $$
  select private.send_health_reminders(auth.uid()) + private.send_birthdays(auth.uid());
$$;
revoke all on function public.check_my_health_reminders() from public, anon;
grant execute on function public.check_my_health_reminders() to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'cyclami-anniversaires';
    perform cron.schedule('cyclami-anniversaires', '5 6 * * *', 'select private.send_birthdays()');
  end if;
exception when others then
  raise notice 'pg_cron indisponible : anniversaires envoyés à l''ouverture du site (%)', sqlerrm;
end $$;

-- ---------- Discussion de groupe d'une sortie (organisateur + participants) ----------
create table if not exists public.ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists ride_messages_ride_idx on public.ride_messages (ride_id, created_at);
alter table public.ride_messages enable row level security;

create or replace function public.in_ride(p_ride uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rides where id = p_ride and host_id = auth.uid())
      or exists (select 1 from public.ride_participants where ride_id = p_ride and user_id = auth.uid());
$$;
revoke execute on function public.in_ride(uuid) from public, anon;
grant execute on function public.in_ride(uuid) to authenticated;

drop policy if exists "lire la discussion de sa sortie" on public.ride_messages;
create policy "lire la discussion de sa sortie" on public.ride_messages
  for select to authenticated using (public.in_ride(ride_id) or public.is_staff());
drop policy if exists "écrire dans la discussion de sa sortie" on public.ride_messages;
create policy "écrire dans la discussion de sa sortie" on public.ride_messages
  for insert to authenticated with check (author_id = auth.uid() and public.in_ride(ride_id));
drop policy if exists "supprimer son message de sortie" on public.ride_messages;
create policy "supprimer son message de sortie" on public.ride_messages
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

create or replace function public.prepare_ride_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
    raise exception 'Ton compte est suspendu';
  end if;
  if not public.is_staff() and (select count(*) from public.ride_messages where author_id = new.author_id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Trop de messages d''un coup : patiente une minute';
  end if;
  if (select starts_at from public.rides where id = new.ride_id) < now() - interval '2 days' then
    raise exception 'Cette sortie est terminée';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists before_ride_message on public.ride_messages;
create trigger before_ride_message before insert on public.ride_messages
  for each row execute function public.prepare_ride_message();

-- prévient les autres (au plus une notification non lue par sortie et par demi-heure)
create or replace function public.notify_ride_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  w record;
begin
  select id, host_id, title into w from public.rides where id = new.ride_id;
  insert into public.notifications (user_id, actor_id, type, ride_id, data)
  select u.uid, new.author_id, 'ride_message', w.id,
         jsonb_build_object('title', w.title, 'excerpt', left(new.body, 120))
  from (select w.host_id as uid union select user_id from public.ride_participants where ride_id = w.id) u
  where u.uid <> new.author_id
    and not exists (select 1 from public.notifications n
                    where n.user_id = u.uid and n.type = 'ride_message' and n.ride_id = w.id
                      and n.read_at is null and n.created_at > now() - interval '30 minutes');
  return null;
end $$;
drop trigger if exists after_ride_message on public.ride_messages;
create trigger after_ride_message after insert on public.ride_messages
  for each row execute function public.notify_ride_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_messages'
  ) then
    alter publication supabase_realtime add table public.ride_messages;
  end if;
end $$;

-- ---------- Avis sur les lieux (parcs, vétérinaires, animaleries… d'OpenStreetMap) ----------
create table if not exists public.place_reviews (
  place_id text not null check (place_id ~ '^[nwr][0-9]{1,15}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
alter table public.place_reviews enable row level security;
drop policy if exists "avis sur les lieux lisibles" on public.place_reviews;
create policy "avis sur les lieux lisibles" on public.place_reviews
  for select to authenticated using (not public.is_blocked_with(user_id));
drop policy if exists "donner son avis sur un lieu" on public.place_reviews;
create policy "donner son avis sur un lieu" on public.place_reviews
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "modifier son avis sur un lieu" on public.place_reviews;
create policy "modifier son avis sur un lieu" on public.place_reviews
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "retirer son avis sur un lieu" on public.place_reviews;
create policy "retirer son avis sur un lieu" on public.place_reviews
  for delete to authenticated using (user_id = auth.uid() or public.is_staff());

create or replace function public.prepare_place_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.user_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.place_reviews where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
      raise exception 'Trop d''avis aujourd''hui : réessaie demain';
    end if;
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.place_id := old.place_id;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists before_place_review on public.place_reviews;
create trigger before_place_review before insert or update on public.place_reviews
  for each row execute function public.prepare_place_review();

-- moyenne et nombre d'avis des lieux affichés sur la carte
create or replace function public.place_ratings(p_ids text[])
returns table (place_id text, average numeric, total int)
language sql stable security definer set search_path = public as $$
  select r.place_id, round(avg(r.rating), 1), count(*)::int
  from public.place_reviews r
  where r.place_id = any (p_ids[1:600])
  group by r.place_id;
$$;
revoke execute on function public.place_ratings(text[]) from public, anon;
grant execute on function public.place_ratings(text[]) to authenticated;

-- Photos : 10 Mo maximum (au lieu de 5)
update storage.buckets set file_size_limit = 10485760 where id in ('photos', 'message-photos');

-- =====================================================================
-- Version 26 : groupes / clubs
--   Groupes locaux de propriétaires (ex. « Bergers australiens de Namur »),
--   mur de messages réservé aux membres, sorties rattachées à un groupe.
-- =====================================================================
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  emoji text not null default '🐾' check (char_length(emoji) <= 16),
  city text not null default '' check (char_length(city) <= 80),
  -- position du créateur (déjà arrondie à ~1 km), pour trier les groupes par distance
  lat double precision,
  lng double precision,
  member_count int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists groups_owner_idx on public.groups (owner_id, created_at desc);
create index if not exists groups_position_idx on public.groups (lat, lng);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at desc);
create index if not exists group_messages_author_idx on public.group_messages (author_id, created_at desc);

alter table public.rides add column if not exists group_id uuid references public.groups (id) on delete set null;
create index if not exists rides_group_idx on public.rides (group_id, starts_at) where group_id is not null;

-- Suis-je membre de ce groupe ? (security definer : utilisable dans les politiques sans récursion)
create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid());
$$;
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

drop policy if exists "groupes visibles" on public.groups;
create policy "groupes visibles" on public.groups
  for select to authenticated using (hidden_at is null or owner_id = auth.uid() or public.is_staff());
drop policy if exists "créer un groupe" on public.groups;
create policy "créer un groupe" on public.groups
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "modifier son groupe" on public.groups;
create policy "modifier son groupe" on public.groups
  for update to authenticated using (owner_id = auth.uid() or public.is_staff())
  with check (owner_id = auth.uid() or public.is_staff());
drop policy if exists "supprimer son groupe" on public.groups;
create policy "supprimer son groupe" on public.groups
  for delete to authenticated using (owner_id = auth.uid() or public.is_staff());

-- Membres : visibles de tous (comme les participants d'une sortie) tant que le groupe l'est.
drop policy if exists "membres visibles" on public.group_members;
create policy "membres visibles" on public.group_members
  for select to authenticated using (exists (select 1 from public.groups g where g.id = group_id));
-- Rejoindre : soi-même, comme simple membre, groupe visible, pas de blocage avec le créateur.
drop policy if exists "rejoindre un groupe" on public.group_members;
create policy "rejoindre un groupe" on public.group_members
  for insert to authenticated with check (
    user_id = auth.uid() and role = 'member'
    and exists (select 1 from public.groups g where g.id = group_id and g.hidden_at is null
                and not public.is_blocked_with(g.owner_id)));
-- Quitter (ou être retiré par le créateur / l'équipe) ; le créateur, lui, supprime le groupe.
drop policy if exists "quitter un groupe" on public.group_members;
create policy "quitter un groupe" on public.group_members
  for delete to authenticated using (
    role <> 'owner'
    and (user_id = auth.uid() or public.is_staff()
         or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())));

drop policy if exists "messages du groupe lus par les membres" on public.group_messages;
create policy "messages du groupe lus par les membres" on public.group_messages
  for select to authenticated using (
    (public.is_group_member(group_id) or public.is_staff())
    and (hidden_at is null or author_id = auth.uid() or public.is_staff()));
drop policy if exists "écrire sur le mur du groupe" on public.group_messages;
create policy "écrire sur le mur du groupe" on public.group_messages
  for insert to authenticated with check (
    author_id = auth.uid() and public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = group_id and g.hidden_at is null));
drop policy if exists "supprimer un message du groupe" on public.group_messages;
create policy "supprimer un message du groupe" on public.group_messages
  for delete to authenticated using (
    author_id = auth.uid() or public.is_staff()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

-- Groupe : position copiée du profil, compteur et masquage gérés par la base, 3 créations par jour.
create or replace function public.prepare_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.owner_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.groups where owner_id = new.owner_id and created_at > now() - interval '1 day') >= 3 then
      raise exception 'Trop de groupes créés aujourd''hui : réessaie demain';
    end if;
    select p.lat, p.lng into new.lat, new.lng from public.profiles p where p.id = new.owner_id;
    new.member_count := 0;
    new.hidden_at := null;
    new.created_at := now();
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.lat := old.lat;
    new.lng := old.lng;
    if coalesce(current_setting('cyclami.counter_update', true), '0') <> '1' then new.member_count := old.member_count; end if;
    -- seule l'équipe masque ou démasque un groupe
    if coalesce(current_setting('cyclami.mod_update', true), '0') <> '1' and not public.is_staff() then
      new.hidden_at := old.hidden_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists before_group on public.groups;
create trigger before_group before insert or update on public.groups
  for each row execute function public.prepare_group();

-- Le créateur devient automatiquement membre (rôle « owner »).
create or replace function public.add_group_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do nothing;
  return null;
end $$;
drop trigger if exists after_group_insert on public.groups;
create trigger after_group_insert after insert on public.groups
  for each row execute function public.add_group_owner();

-- Adhésion : date du serveur, ligne non modifiable.
create or replace function public.prepare_group_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.joined_at := now();
  else
    new.group_id := old.group_id;
    new.user_id := old.user_id;
    new.role := old.role;
    new.joined_at := old.joined_at;
  end if;
  return new;
end $$;
drop trigger if exists before_group_member on public.group_members;
create trigger before_group_member before insert or update on public.group_members
  for each row execute function public.prepare_group_member();

create or replace function public.on_group_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cyclami.counter_update', '1', true);
  if tg_op = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
  else
    update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  end if;
  perform set_config('cyclami.counter_update', '0', true);
  return null;
end $$;
drop trigger if exists after_group_member on public.group_members;
create trigger after_group_member after insert or delete on public.group_members
  for each row execute function public.on_group_member();

-- Message du mur : membre non suspendu, 20 messages par 10 minutes, date du serveur.
create or replace function public.prepare_group_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
      raise exception 'Ton compte est suspendu';
    end if;
    if not public.is_staff() and (select count(*) from public.group_messages where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 20 then
      raise exception 'Trop de messages d''un coup : patiente quelques minutes';
    end if;
    new.hidden_at := null;
    new.created_at := now();
  else
    new.author_id := old.author_id;
    new.group_id := old.group_id;
    new.created_at := old.created_at;
    if coalesce(current_setting('cyclami.mod_update', true), '0') <> '1' then new.hidden_at := old.hidden_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists before_group_message on public.group_messages;
create trigger before_group_message before insert or update on public.group_messages
  for each row execute function public.prepare_group_message();

-- (types 'group_ride' et 'group_message' : ajoutés à notifications_type_check, section v2)

-- Nouveau message sur le mur : les membres sont prévenus au plus une fois par demi-heure et par groupe
-- (rien de plus tant qu'une notification récente n'est pas lue) ; 500 membres au plus.
create or replace function public.on_group_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  grp record;
begin
  select id, name, emoji into grp from public.groups where id = new.group_id;
  insert into public.notifications (user_id, actor_id, type, data)
  select m.user_id, new.author_id, 'group_message',
         jsonb_build_object('group_id', grp.id, 'title', grp.name, 'emoji', grp.emoji, 'excerpt', coalesce(nullif(left(new.body, 120), ''), '📷 Photo'))
  from (select user_id from public.group_members where group_id = new.group_id and user_id <> new.author_id
        order by joined_at limit 500) m
  where not exists (select 1 from public.blocks b
                    where (b.blocker_id = m.user_id and b.blocked_id = new.author_id)
                       or (b.blocker_id = new.author_id and b.blocked_id = m.user_id))
    and not exists (select 1 from public.notifications n
                    where n.user_id = m.user_id and n.type = 'group_message' and n.read_at is null
                      and n.created_at > now() - interval '30 minutes'
                      and n.data->>'group_id' = new.group_id::text);
  return null;
end $$;
drop trigger if exists after_group_message on public.group_messages;
create trigger after_group_message after insert on public.group_messages
  for each row execute function public.on_group_message();

-- Sortie rattachée à un groupe : seulement par un membre du groupe.
create or replace function public.check_ride_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
     and not exists (select 1 from public.group_members where group_id = new.group_id and user_id = new.host_id) then
    raise exception 'Il faut être membre du groupe pour y rattacher une sortie';
  end if;
  return new;
end $$;
drop trigger if exists before_ride_group on public.rides;
create trigger before_ride_group before insert or update of group_id on public.rides
  for each row execute function public.check_ride_group();

-- Nouvelle sortie du groupe : les membres sont prévenus (une seule fois pour une série hebdomadaire).
create or replace function public.notify_group_ride()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  grp record;
begin
  if new.group_id is null then return null; end if;
  if new.series_id is not null
     and exists (select 1 from public.rides where series_id = new.series_id and id <> new.id) then
    return null;
  end if;
  select id, name, emoji into grp from public.groups where id = new.group_id;
  insert into public.notifications (user_id, actor_id, type, ride_id, data)
  select m.user_id, new.host_id, 'group_ride', new.id,
         jsonb_build_object('group_id', grp.id, 'group', grp.name, 'emoji', grp.emoji, 'title', new.title,
                            'starts_at', new.starts_at, 'place', new.place)
  from (select user_id from public.group_members where group_id = new.group_id and user_id <> new.host_id
        order by joined_at limit 500) m
  where not exists (select 1 from public.blocks b
                    where (b.blocker_id = m.user_id and b.blocked_id = new.host_id)
                       or (b.blocker_id = new.host_id and b.blocked_id = m.user_id));
  return null;
end $$;
drop trigger if exists after_ride_group on public.rides;
create trigger after_ride_group after insert on public.rides
  for each row execute function public.notify_group_ride();

-- Mur du groupe en temps réel (les règles RLS filtrent : seuls les membres reçoivent les messages).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;

-- =====================================================================
-- Version 27 : liens partageables (aperçu WhatsApp, Messenger…)
--   Lu par le serveur du site (netlify/edge-functions/share.js) sans connexion :
--   seulement le titre, une courte description et la photo, jamais l'auteur.
-- =====================================================================
create or replace function public.share_preview(p_kind text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'b' then (select jsonb_build_object(
        'title', '🐾 ' || title,
        'description', '📅 ' || to_char(starts_at at time zone 'Europe/Brussels', 'DD/MM à HH24"h"MI') || ' · 📍 ' || left(place, 80)
                       || ' — Sortie entre propriétaires d''animaux sur Cyclami.')
      from public.rides where id = p_id and hidden_at is null and starts_at > now() - interval '1 day')
    when 'a' then (select jsonb_build_object(
        'title', title || case when kind = 'don' then ' — à donner' else ' — ' || to_char(price_cents / 100.0, 'FM9999990D00') || ' €' end,
        'description', species || coalesce(' · ' || nullif(city, ''), '') || ' — Annonce sur Cyclami.',
        'image', photo_urls[1])
      from public.listings where id = p_id and hidden_at is null and status in ('active', 'reserve'))
    when 'f' then (select jsonb_build_object(
        'title', '💬 ' || title,
        'description', left(regexp_replace(body, '\s+', ' ', 'g'), 180))
      from public.forum_topics where id = p_id and hidden_at is null)
    when 'p' then (select jsonb_build_object(
        'title', case when kind = 'perdu' then '🚨 Perdu : ' || coalesce(nullif(name, ''), species) else '🐾 Animal trouvé : ' || species end,
        'description', '📍 ' || left(place, 80) || ' — Partage pour aider à le retrouver.',
        'image', photo_url)
      from public.lost_alerts where id = p_id and hidden_at is null and status = 'active')
    when 'g' then (select jsonb_build_object(
        'title', emoji || ' ' || name,
        'description', coalesce(nullif(left(regexp_replace(description, '\s+', ' ', 'g'), 160), '') || ' · ', '')
                       || member_count || ' membre' || case when member_count > 1 then 's' else '' end
                       || coalesce(' · ' || nullif(city, ''), '') || ' — Groupe Cyclami.')
      from public.groups where id = p_id and hidden_at is null)
  end;
$$;
revoke execute on function public.share_preview(text, uuid) from public;
grant execute on function public.share_preview(text, uuid) to anon, authenticated;

-- =====================================================================
-- Version 28 : photos sur le mur des groupes
-- =====================================================================
alter table public.group_messages add column if not exists photo_url text;
-- texte facultatif quand il y a une photo
alter table public.group_messages drop constraint if exists group_messages_body_check;
alter table public.group_messages add constraint group_messages_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or photo_url is not null));
alter table public.group_messages drop constraint if exists group_messages_photo_url_own;
alter table public.group_messages add constraint group_messages_photo_url_own check (public.is_own_photo_url(photo_url)) not valid;

-- =====================================================================
-- Version 29 : statut « en ligne » et dernière connexion
--   Chaque appareil ouvert signale sa présence (au plus une fois par minute).
--   Un membre peut masquer son statut : on n'enregistre alors plus rien.
-- =====================================================================
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists show_presence boolean not null default true;

-- dernière activité réelle (privée, même si le statut est masqué) : sert à ne pas envoyer
-- d'e-mail à quelqu'un qui est en train d'utiliser le site
create table if not exists private.member_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  active_at timestamptz not null default now()
);

-- Adresse IP du visiteur, transmise par la passerelle de Supabase dans les en-têtes de la requête
-- (« cf-connecting-ip » posé par Cloudflare, sinon la première adresse de « x-forwarded-for »).
create or replace function private.client_ip()
returns text language sql stable as $$
  select nullif(trim(coalesce(
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
    split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
    current_setting('request.headers', true)::json ->> 'x-real-ip')), '');
$$;

-- adresses IP récentes de chaque membre (lisibles seulement par les administrateurs, via leur fiche)
create table if not exists private.member_ips (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, ip)
);

create or replace function private.note_ip()
returns void language plpgsql security definer set search_path = public, private as $$
declare
  addr text;
begin
  begin
    addr := private.client_ip();
  exception when others then
    return; -- en-têtes illisibles : on n'enregistre rien
  end;
  if auth.uid() is null or addr is null or length(addr) > 64 then return; end if;
  insert into private.member_ips (user_id, ip) values (auth.uid(), addr)
  on conflict (user_id, ip) do update set last_seen = now()
    where private.member_ips.last_seen < now() - interval '5 minutes';
  -- on garde les 20 adresses les plus récentes
  delete from private.member_ips m where m.user_id = auth.uid() and m.ip not in (
    select ip from private.member_ips where user_id = auth.uid() order by last_seen desc limit 20);
end $$;
revoke execute on function private.note_ip() from public, anon, authenticated;

create or replace function public.touch_presence()
returns void language sql security definer set search_path = public, private as $$
  select private.note_ip();
  insert into private.member_activity (user_id, active_at) values (auth.uid(), now())
  on conflict (user_id) do update set active_at = now()
    where private.member_activity.active_at < now() - interval '50 seconds';
  select set_config('cyclami.presence', '1', true);
  update public.profiles set last_seen_at = now()
  where id = auth.uid() and show_presence
    and (last_seen_at is null or last_seen_at < now() - interval '50 seconds');
$$;
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

create or replace function public.set_show_presence(p_show boolean)
returns void language sql security definer set search_path = public as $$
  select set_config('cyclami.presence', '1', true);
  update public.profiles
  set show_presence = p_show, last_seen_at = case when p_show then now() end
  where id = auth.uid();
$$;
revoke execute on function public.set_show_presence(boolean) from public, anon;
grant execute on function public.set_show_presence(boolean) to authenticated;

-- l'heure de présence ne s'écrit que par ces fonctions (pas de « toujours en ligne » trafiqué)
create or replace function public.guard_presence()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('cyclami.presence', true) is distinct from '1' and auth.uid() is not null then
    new.last_seen_at := old.last_seen_at;
    new.show_presence := old.show_presence;
  end if;
  return new;
end $$;
drop trigger if exists before_profile_presence on public.profiles;
create trigger before_profile_presence before update on public.profiles
  for each row execute function public.guard_presence();

-- =====================================================================
-- Version 30 : moins d'e-mails inutiles
--   - aucun e-mail (sauf modération) si le membre utilise le site en ce moment (≤ 3 min) :
--     il voit déjà la notification à l'écran ;
--   - messages : au plus un e-mail par conversation toutes les 2 h,
--     et au plus un e-mail de message toutes les 15 min toutes conversations confondues.
-- =====================================================================
create or replace function private.queue_email(
  p_user uuid, p_kind text, p_ref text, p_subject text, p_body text, p_link text,
  p_category text, p_throttle interval default interval '0')
returns void language plpgsql security definer set search_path = public, private as $$
declare
  prefs record;
  addr text;
  member record;
begin
  if p_user is null then return; end if;
  select * into prefs from public.notification_settings where user_id = p_user;
  if p_category = 'messages' and prefs.user_id is not null and not prefs.email_messages then return; end if;
  if p_category = 'activity' and prefs.user_id is not null and not prefs.email_activity then return; end if;
  if p_category <> 'moderation' and exists (
    select 1 from private.member_activity where user_id = p_user and active_at > now() - interval '3 minutes'
  ) then return; end if;
  if p_kind = 'message' then
    p_throttle := greatest(p_throttle, interval '2 hours');
    if exists (select 1 from private.email_outbox
               where user_id = p_user and kind = 'message' and created_at > now() - interval '15 minutes') then
      return;
    end if;
  end if;
  if p_throttle > interval '0' and exists (
    select 1 from private.email_outbox
    where user_id = p_user and kind = p_kind and ref = coalesce(p_ref, '') and created_at > now() - p_throttle
  ) then return; end if;
  select email into addr from auth.users where id = p_user;
  if addr is null or addr = '' then return; end if;
  select name, lang into member from public.profiles where id = p_user;
  insert into private.email_outbox (user_id, kind, ref, email, name, subject, body, link, lang)
  values (p_user, p_kind, coalesce(p_ref, ''), addr, coalesce(member.name, ''), p_subject, p_body, coalesce(p_link, '/'),
          coalesce(member.lang, 'fr'));
end $$;

-- =====================================================================
-- Version 31 : délai minimum entre deux créations (anti-rafale)
--   En plus des limites par heure / par jour : on ne peut pas enchaîner deux
--   sorties, sujets, annonces… à quelques secondes d'intervalle.
--   L'équipe de modération n'est pas concernée.
-- =====================================================================
create or replace function public.enforce_cooldown()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author_col text := tg_argv[0];
  wait_s int := tg_argv[1]::int;
  author uuid;
  last_at timestamptz;
begin
  author := (to_jsonb(new) ->> author_col)::uuid;
  if author is null or auth.uid() is null or public.is_staff() then return new; end if;
  -- les dates d'une série de sorties hebdomadaires sont créées d'un coup
  if tg_table_name = 'rides' and to_jsonb(new) ->> 'series_id' is not null then
    if exists (select 1 from public.rides where series_id = (to_jsonb(new) ->> 'series_id')::uuid) then
      return new;
    end if;
  end if;
  execute format('select max(created_at) from public.%I where %I = $1', tg_table_name, author_col)
    into last_at using author;
  if last_at is not null and last_at > now() - make_interval(secs => wait_s) then
    raise exception 'Doucement : attends encore % s avant de recommencer',
      ceil(extract(epoch from (last_at + make_interval(secs => wait_s) - now())))::int;
  end if;
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('rides', 'host_id', 1800),            -- 30 min
    ('forum_topics', 'author_id', 900),    -- 15 min
    ('forum_replies', 'author_id', 15),    -- 15 s
    ('posts', 'author_id', 600),           -- 10 min
    ('comments', 'author_id', 10),         -- 10 s
    ('listings', 'seller_id', 3600),       -- 1 h
    ('lost_alerts', 'owner_id', 1800),     -- 30 min
    ('groups', 'owner_id', 3600),          -- 1 h
    ('group_messages', 'author_id', 10),   -- 10 s
    ('sitting_requests', 'owner_id', 60),  -- 1 min (une demande par animal, à la suite)
    ('sitting_offers', 'sitter_id', 300)   -- 5 min
  ) as t (tbl, col, secs) loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists before_cooldown on public.%I', r.tbl);
      execute format('create trigger before_cooldown before insert on public.%I
                      for each row execute function public.enforce_cooldown(%L, %L)', r.tbl, r.col, r.secs);
    end if;
  end loop;
end $$;

-- =====================================================================
-- Version 32 : fiche administrateur d'un membre (sécurité et modération)
--   E-mail, mode de connexion, dates, adresses IP et appareils des dernières
--   sessions, position enregistrée (déjà arrondie à ~1 km). Réservé aux
--   administrateurs ; chaque consultation est inscrite au journal de modération.
-- =====================================================================
create or replace function public.admin_member_details(target uuid)
returns jsonb language plpgsql security definer set search_path = public, auth, private as $$
declare
  result jsonb;
  sessions jsonb := '[]'::jsonb;
  noted jsonb;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  -- adresses relevées par le site lui-même à chaque visite (voir private.note_ip)
  select coalesce(jsonb_agg(jsonb_build_object('ip', ip, 'user_agent', null, 'at', last_seen, 'first_seen', first_seen)
                            order by last_seen desc), '[]'::jsonb)
    into noted
    from (select * from private.member_ips where user_id = target order by last_seen desc limit 10) m;
  select jsonb_build_object(
      'email', u.email,
      'providers', coalesce(u.raw_app_meta_data -> 'providers', jsonb_build_array(u.raw_app_meta_data ->> 'provider')),
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'lat', p.lat, 'lng', p.lng, 'city', p.city, 'lang', p.lang)
    into result
    from auth.users u join public.profiles p on p.id = u.id where u.id = target;
  if result is null then raise exception 'Membre introuvable'; end if;
  -- adresses IP et appareils des sessions récentes (colonnes absentes sur les vieilles versions d'Auth)
  begin
    execute $q$
      select coalesce(jsonb_agg(s order by s.at desc), '[]'::jsonb) from (
        select host(ip) as ip, user_agent, coalesce(refreshed_at, updated_at, created_at) as at
        from auth.sessions where user_id = $1 and ip is not null
        order by coalesce(refreshed_at, updated_at, created_at) desc limit 5) s
    $q$ into sessions using target;
  exception when others then
    sessions := '[]'::jsonb;
  end;
  -- sinon : adresses IP du journal de connexion d'Auth (connexions, renouvellements de session)
  if sessions = '[]'::jsonb then
    begin
      execute $q$
        select coalesce(jsonb_agg(s order by s.at desc), '[]'::jsonb) from (
          select ip_address as ip, null::text as user_agent, max(created_at) as at
          from auth.audit_log_entries
          where payload ->> 'actor_id' = $1::text and coalesce(ip_address, '') <> ''
          group by ip_address order by max(created_at) desc limit 5) s
      $q$ into sessions using target;
    exception when others then
      sessions := '[]'::jsonb;
    end;
  end if;
  perform public.log_moderation('consultation des données personnelles', 'user', null, target, '');
  return result || jsonb_build_object('sessions', case when noted <> '[]'::jsonb then noted else sessions end);
end $$;
revoke execute on function public.admin_member_details(uuid) from public, anon;
grant execute on function public.admin_member_details(uuid) to authenticated;

-- =====================================================================
-- Version 33 : appareils des membres et fiche admin complète
--   Chaque appareil signale une fois par jour ses caractéristiques techniques
--   (navigateur, système, écran, langue, fuseau horaire, application installée,
--   notifications). Lisible seulement par les administrateurs, via la fiche admin.
-- =====================================================================
create table if not exists private.member_devices (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key text not null,
  user_agent text not null default '',
  info jsonb not null default '{}',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_key)
);

create or replace function public.report_device(p_info jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  ua text := left(coalesce(p_info ->> 'userAgent', ''), 400);
  info jsonb;
begin
  if auth.uid() is null then return; end if;
  -- seulement des champs connus, de taille raisonnable
  select coalesce(jsonb_object_agg(key, left(value #>> '{}', 120)), '{}') into info
  from jsonb_each(coalesce(p_info, '{}'))
  where key in ('platform', 'screen', 'viewport', 'pixelRatio', 'language', 'languages', 'timezone', 'standalone',
                'notifications', 'push', 'touch', 'memory', 'cores', 'connection', 'darkMode');
  -- adresse IP de la dernière visite depuis cet appareil
  begin
    info := info || jsonb_strip_nulls(jsonb_build_object('ip', private.client_ip()));
  exception when others then null;
  end;
  perform private.note_ip();
  insert into private.member_devices (user_id, device_key, user_agent, info)
  values (auth.uid(), md5(ua || coalesce(info ->> 'platform', '') || coalesce(info ->> 'screen', '')), ua, info)
  on conflict (user_id, device_key) do update set info = excluded.info, last_seen = now();
  -- on garde les 10 appareils les plus récents
  delete from private.member_devices d where d.user_id = auth.uid() and d.device_key not in (
    select device_key from private.member_devices where user_id = auth.uid() order by last_seen desc limit 10);
end $$;
revoke execute on function public.report_device(jsonb) from public, anon;
grant execute on function public.report_device(jsonb) to authenticated;

-- la fiche admin ajoute les appareils, l'activité et l'historique de modération
create or replace function public.admin_member_extra(target uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return jsonb_build_object(
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('user_agent', user_agent, 'info', info,
                  'first_seen', first_seen, 'last_seen', last_seen) order by last_seen desc), '[]')
                from private.member_devices where user_id = target),
    'last_active', (select active_at from private.member_activity where user_id = target),
    'show_presence', (select show_presence from public.profiles where id = target),
    'suspended_until', (select until from public.suspensions where user_id = target and until > now()),
    'counts', jsonb_build_object(
      'pets', (select count(*) from public.pets where owner_id = target),
      'posts', (select count(*) from public.posts where author_id = target),
      'comments', (select count(*) from public.comments where author_id = target),
      'rides_hosted', (select count(*) from public.rides where host_id = target),
      'rides_joined', (select count(*) from public.ride_participants where user_id = target),
      'messages_sent', (select count(*) from public.messages where sender_id = target),
      'listings', (select count(*) from public.listings where seller_id = target),
      'forum_topics', (select count(*) from public.forum_topics where author_id = target),
      'groups', (select count(*) from public.group_members where user_id = target),
      'reports_made', (select count(*) from public.reports where reporter_id = target),
      'reports_against', (select count(*) from public.reports where reported_id = target),
      'reports_open', (select count(*) from public.reports where reported_id = target and resolved_at is null),
      'warnings', (select count(*) from public.notifications where user_id = target and type = 'warning'),
      'blocked_by', (select count(*) from public.blocks where blocked_id = target),
      'blocking', (select count(*) from public.blocks where blocker_id = target)));
end $$;
revoke execute on function public.admin_member_extra(uuid) from public, anon;
grant execute on function public.admin_member_extra(uuid) to authenticated;

-- =====================================================================
-- Version 34 : plusieurs photos par alerte « animal perdu / trouvé »
--   photo_url reste la photo principale ; jusqu'à 5 photos en plus.
-- =====================================================================
alter table public.lost_alerts add column if not exists extra_photos text[] not null default '{}';
alter table public.lost_alerts drop constraint if exists lost_alerts_extra_photos_max;
alter table public.lost_alerts add constraint lost_alerts_extra_photos_max check (cardinality(extra_photos) <= 5);
alter table public.lost_alerts drop constraint if exists lost_alerts_extra_photos_own;
alter table public.lost_alerts add constraint lost_alerts_extra_photos_own check (public.are_own_photo_urls(extra_photos)) not valid;

-- =====================================================================
-- Version 35 : photo de profil du membre
--   Si elle est vide, c'est la photo du premier animal qui s'affiche.
-- =====================================================================
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (avatar_url is null or char_length(avatar_url) <= 500) not valid;
alter table public.profiles drop constraint if exists profiles_avatar_url_own;
alter table public.profiles add constraint profiles_avatar_url_own check (public.is_own_photo_url(avatar_url)) not valid;

-- =====================================================================
-- Version 36 : carnet de santé plus utile
--   1. Badge public « Vaccins à jour » : seul ce statut est visible, jamais le détail.
--      Pour chaque vaccin (même nom), on regarde la dernière injection :
--      à jour si aucune n'a de rappel dépassé, et au moins un vaccin noté.
--   2. Le gardien accepté lit le carnet de l'animal gardé, la veille de la garde
--      jusqu'au lendemain de la fin (lecture seule).
-- =====================================================================
create or replace function public.vaccinated_pets(p_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (h.pet_id, lower(trim(h.label))) h.pet_id, h.next_due
    from public.pet_health h
    where h.kind = 'vaccin' and h.done_on is not null and h.pet_id = any (p_ids[1:500])
    order by h.pet_id, lower(trim(h.label)), h.done_on desc, h.created_at desc
  )
  select pet_id from latest group by pet_id
  having bool_and(next_due is null or next_due >= current_date);
$$;
revoke all on function public.vaccinated_pets(uuid[]) from public, anon;
grant execute on function public.vaccinated_pets(uuid[]) to authenticated;

create or replace function public.can_read_pet_health(p_pet uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sitting_offers o
    join public.sitting_requests r on r.id = o.request_id
    where o.sitter_id = auth.uid() and o.status = 'acceptee' and r.status <> 'annulee'
      and r.owner_id = p_owner and (r.pet_id = p_pet or r.pet_id is null)
      and current_date between r.starts_on - 1 and r.ends_on + 1);
$$;
revoke all on function public.can_read_pet_health(uuid, uuid) from public, anon;
grant execute on function public.can_read_pet_health(uuid, uuid) to authenticated;

drop policy if exists "carnet lu par le gardien" on public.pet_health;
create policy "carnet lu par le gardien" on public.pet_health
  for select to authenticated using (public.can_read_pet_health(pet_id, owner_id));

-- =====================================================================
-- Version 37 : plusieurs photos par animal (photo_url reste la photo principale)
--   + format des numéros d'identification et d'agrément dans les annonces
-- =====================================================================
alter table public.pets add column if not exists extra_photos text[] not null default '{}';
alter table public.pets drop constraint if exists pets_extra_photos_max;
alter table public.pets add constraint pets_extra_photos_max check (cardinality(extra_photos) <= 7);
alter table public.pets drop constraint if exists pets_extra_photos_own;
alter table public.pets add constraint pets_extra_photos_own check (public.are_own_photo_urls(extra_photos)) not valid;

-- Puce électronique d'un chien ou d'un chat : 15 chiffres (norme ISO 11784)
-- ou ancien format à 10 caractères. Espaces et tirets ignorés.
alter table public.listings drop constraint if exists listings_chip_format;
alter table public.listings add constraint listings_chip_format check (
  species not in ('chien', 'chat') or identification = ''
  or regexp_replace(identification, '[\s.-]', '', 'g') ~ '^([0-9]{15}|[0-9A-Fa-f]{10})$') not valid;
-- Agrément d'éleveur : numéro HK / DF (Belgique) ou SIREN / SIRET (France).
alter table public.listings drop constraint if exists listings_approval_format;
alter table public.listings add constraint listings_approval_format check (
  approval_number = ''
  or upper(regexp_replace(approval_number, '[\s.-]', '', 'g')) ~ '^((HK|DF)[0-9]{5,12}|[0-9]{9}|[0-9]{14})$') not valid;

-- =====================================================================
-- Version 38 : site en anglais aussi (français / néerlandais / anglais)
--   e-mails et notifications push dans la langue du membre
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang in ('fr', 'nl', 'en'));

create or replace function private.email_on_message()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  sender_name text := coalesce((select name from public.profiles where id = new.sender_id), 'Un membre');
  lg text := coalesce((select lang from public.profiles where id = new.recipient_id), 'fr');
begin
  if lg = 'nl' then
    perform private.queue_email(new.recipient_id, 'message', new.sender_id::text,
      sender_name || ' stuurde je een bericht op Cyclami',
      sender_name || ' schreef je. Open Cyclami om het bericht te lezen en te antwoorden.',
      '/', 'messages', interval '30 minutes');
    perform private.send_push(new.recipient_id, sender_name || ' schreef je 💬',
      case when new.audio_path is not null then '🎤 Spraakbericht' when coalesce(new.body, '') = '' then '📷 Foto' else 'Nieuw bericht' end, '/', 'm:' || new.sender_id);
  elsif lg = 'en' then
    perform private.queue_email(new.recipient_id, 'message', new.sender_id::text,
      sender_name || ' sent you a message on Cyclami',
      sender_name || ' wrote to you. Open Cyclami to read the message and reply.',
      '/', 'messages', interval '30 minutes');
    perform private.send_push(new.recipient_id, sender_name || ' wrote to you 💬',
      case when new.audio_path is not null then '🎤 Voice message' when coalesce(new.body, '') = '' then '📷 Photo' else 'New message' end, '/', 'm:' || new.sender_id);
  else
    perform private.queue_email(new.recipient_id, 'message', new.sender_id::text,
      sender_name || ' t''a envoyé un message sur Cyclami',
      sender_name || ' t''a écrit. Ouvre Cyclami pour lire son message et lui répondre.',
      '/', 'messages', interval '30 minutes');
    perform private.send_push(new.recipient_id, sender_name || ' t''a écrit 💬',
      case when new.audio_path is not null then '🎤 Message vocal' when coalesce(new.body, '') = '' then '📷 Photo' else 'Nouveau message' end, '/', 'm:' || new.sender_id);
  end if;
  return null;
end $$;

create or replace function private.email_on_notification()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  lg text := coalesce((select lang from public.profiles where id = new.user_id), 'fr');
  actor text := coalesce((select name from public.profiles where id = new.actor_id),
                         case coalesce((select lang from public.profiles where id = new.user_id), 'fr') when 'nl' then 'Een lid' when 'en' then 'A member' else 'Un membre' end);
  title text := coalesce(new.data ->> 'title', '');
  subj text;
  txt text;
  cat text := 'activity';
  throttle interval := interval '0';
begin
  if lg = 'nl' then
    case new.type
      when 'ride_join' then
        subj := actor || ' neemt deel aan je fietstocht « ' || title || ' »';
        txt := actor || ' neemt deel aan je fietstocht « ' || title || ' ». Fijne fietstocht!';
      when 'ride_cancelled' then
        subj := 'Fietstocht geannuleerd: « ' || title || ' »';
        txt := 'De fietstocht « ' || title || ' » waaraan je deelnam, is geannuleerd.';
      when 'ride_updated' then
        subj := 'Fietstocht gewijzigd: « ' || title || ' »';
        txt := actor || ' heeft de plaats of het uur van de fietstocht « ' || title || ' » gewijzigd. Bekijk de nieuwe gegevens.';
      when 'comment' then
        subj := actor || ' reageerde op « ' || left(title, 40) || ' »';
        txt := actor || ' liet een reactie achter: « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'warning' then
        subj := 'Waarschuwing van het Cyclami-team';
        txt := 'Het moderatieteam geeft je een waarschuwing: ' || coalesce(new.data ->> 'reason', '');
        cat := 'moderation';
      when 'suspended' then
        subj := 'Je Cyclami-account is geschorst';
        txt := 'Je account is geschorst tot '
          || to_char((new.data ->> 'until')::timestamptz at time zone 'Europe/Brussels', 'DD/MM/YYYY "om" HH24:MI')
          || coalesce('. Reden: ' || nullif(new.data ->> 'reason', ''), '') || '.';
        cat := 'moderation';
      when 'content_removed' then
        subj := 'Een van je berichten werd verwijderd';
        txt := 'Het moderatieteam heeft « ' || coalesce(new.data ->> 'excerpt', '') || ' » verwijderd'
          || coalesce(' (' || nullif(new.data ->> 'reason', '') || ')', '') || '.';
        cat := 'moderation';
      when 'review' then
        subj := actor || ' beveelt je aan op Cyclami 👍';
        txt := actor || ' vond de fietstocht « ' || title || ' » met jou fijn'
          || coalesce(': « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'lost_pet' then
        if new.data ->> 'kind' = 'trouve' then
          subj := '🐾 Dier gevonden bij jou in de buurt';
          txt := actor || ' heeft een dier gevonden bij jou in de buurt' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Is het van jou of van een buur? Open Cyclami om de foto te bekijken.';
        else
          subj := '🚨 Dier verloren bij jou in de buurt: ' || title;
          txt := title || ' is verdwenen bij jou in de buurt' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Open Cyclami om de foto te bekijken en verwittig de eigenaar als je het ziet.';
        end if;
        throttle := interval '10 minutes';
      when 'pet_found' then
        subj := 'Goed nieuws: ' || title || ' is teruggevonden 🎉';
        txt := title || ', dat je in de meldingen zag, is teruggevonden. Bedankt voor je waakzaamheid!';
      when 'sitting_request' then
        subj := actor || ' wil oppassen op ' || title;
        txt := actor || ' reageert op je oppasvraag voor ' || title
          || coalesce(': « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'sitting_answer' then
        subj := 'Oppas voor ' || title || ': ' || case new.data ->> 'answer' when 'accepté' then 'aanvaard' when 'refusé' then 'geweigerd' else 'antwoord' end;
        txt := actor || ' heeft je voorstel om op ' || title || ' te passen '
          || case new.data ->> 'answer' when 'accepté' then 'aanvaard' when 'refusé' then 'geweigerd' else 'beantwoord' end || '.';
      when 'health_reminder' then
        subj := 'Gezondheidsherinnering voor ' || title || ': ' || coalesce(new.data ->> 'excerpt', '');
        txt := 'Kleine herinnering: « ' || coalesce(new.data ->> 'excerpt', '') || ' » voor ' || title
          || ' staat gepland op ' || coalesce(new.data ->> 'due', '?') || '. Denk eraan een afspraak te maken bij de dierenarts.';
      when 'forum_reply' then
        subj := actor || ' antwoordde op « ' || left(title, 60) || ' »';
        txt := actor || ' antwoordde in het forum op « ' || title || ' »: « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'pet_birthday' then
        subj := '🎂 Gelukkige verjaardag, ' || title || '!';
        txt := title || ' wordt vandaag ' || coalesce(new.data ->> 'years', '?') || ' jaar. Deel een foto met de buurt op Cyclami!';
      when 'ride_message' then
        subj := actor || ' schreef in de groepschat van « ' || left(title, 50) || ' »';
        txt := actor || ': « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'report_resolved' then
        subj := 'Je melding werd behandeld';
        txt := 'Bedankt! Het team heeft je melding behandeld' || coalesce(': ' || nullif(new.data ->> 'resolution', ''), '') || '.';
      else
        return null;
    end case;
  elsif lg = 'en' then
    case new.type
      when 'ride_join' then
        subj := actor || ' is joining your ride « ' || title || ' »';
        txt := actor || ' joined your ride « ' || title || ' ». Have a lovely ride!';
      when 'ride_cancelled' then
        subj := 'Ride cancelled: « ' || title || ' »';
        txt := 'The ride « ' || title || ' » you were taking part in has been cancelled.';
      when 'ride_updated' then
        subj := 'Ride updated: « ' || title || ' »';
        txt := actor || ' changed the place or time of the ride « ' || title || ' ». Check the new details.';
      when 'comment' then
        subj := actor || ' commented on « ' || left(title, 40) || ' »';
        txt := actor || ' left a comment: « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'warning' then
        subj := 'Warning from the Cyclami team';
        txt := 'The moderation team is giving you a warning: ' || coalesce(new.data ->> 'reason', '');
        cat := 'moderation';
      when 'suspended' then
        subj := 'Your Cyclami account is suspended';
        txt := 'Your account is suspended until '
          || to_char((new.data ->> 'until')::timestamptz at time zone 'Europe/Brussels', 'DD/MM/YYYY "at" HH24:MI')
          || coalesce('. Reason: ' || nullif(new.data ->> 'reason', ''), '') || '.';
        cat := 'moderation';
      when 'content_removed' then
        subj := 'One of your posts was removed';
        txt := 'The moderation team removed « ' || coalesce(new.data ->> 'excerpt', '') || ' »'
          || coalesce(' (' || nullif(new.data ->> 'reason', '') || ')', '') || '.';
        cat := 'moderation';
      when 'review' then
        subj := actor || ' recommends you on Cyclami 👍';
        txt := actor || ' enjoyed the ride « ' || title || ' » with you'
          || coalesce(': « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'lost_pet' then
        if new.data ->> 'kind' = 'trouve' then
          subj := '🐾 Pet found near you';
          txt := actor || ' found a pet near you' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Is it yours or a neighbour''s? Open Cyclami to see its photo.';
        else
          subj := '🚨 Lost pet near you: ' || title;
          txt := title || ' went missing near you' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Open Cyclami to see the photo and let the owner know if you spot it.';
        end if;
        throttle := interval '10 minutes';
      when 'pet_found' then
        subj := 'Good news: ' || title || ' has been found 🎉';
        txt := title || ', whom you saw in the alerts, has been found. Thanks for keeping an eye out!';
      when 'sitting_request' then
        subj := actor || ' offers to look after ' || title;
        txt := actor || ' answered your pet-sitting request for ' || title
          || coalesce(': « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'sitting_answer' then
        subj := 'Pet-sitting for ' || title || ': ' || case new.data ->> 'answer' when 'accepté' then 'accepted' when 'refusé' then 'declined' else 'answer' end;
        txt := actor || ' has ' || case new.data ->> 'answer' when 'accepté' then 'accepted' when 'refusé' then 'declined' else 'answered' end
          || ' your offer to look after ' || title || '.';
      when 'health_reminder' then
        subj := 'Health reminder for ' || title || ': ' || coalesce(new.data ->> 'excerpt', '');
        txt := 'Quick reminder: « ' || coalesce(new.data ->> 'excerpt', '') || ' » for ' || title
          || ' is due on ' || coalesce(new.data ->> 'due', '?') || '. Remember to book an appointment with the vet.';
      when 'forum_reply' then
        subj := actor || ' replied to « ' || left(title, 60) || ' »';
        txt := actor || ' replied on the forum to « ' || title || ' »: « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'pet_birthday' then
        subj := '🎂 Happy birthday, ' || title || '!';
        txt := title || ' turns ' || coalesce(new.data ->> 'years', '?') || ' today. Share a photo with the neighbourhood on Cyclami!';
      when 'ride_message' then
        subj := actor || ' wrote in the chat for « ' || left(title, 50) || ' »';
        txt := actor || ': « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'report_resolved' then
        subj := 'Your report has been handled';
        txt := 'Thank you! The team has handled your report' || coalesce(': ' || nullif(new.data ->> 'resolution', ''), '') || '.';
      else
        return null;
    end case;
  else
    case new.type
      when 'ride_join' then
        subj := actor || ' rejoint ta sortie « ' || title || ' »';
        txt := actor || ' a rejoint ta sortie « ' || title || ' ». Bonne promenade !';
      when 'ride_cancelled' then
        subj := 'Sortie annulée : « ' || title || ' »';
        txt := 'La sortie « ' || title || ' » à laquelle tu participais a été annulée.';
      when 'ride_updated' then
        subj := 'Sortie modifiée : « ' || title || ' »';
        txt := actor || ' a modifié le lieu ou l''horaire de la sortie « ' || title || ' ». Vérifie les nouvelles informations.';
      when 'comment' then
        subj := actor || ' a commenté « ' || left(title, 40) || ' »';
        txt := actor || ' a laissé un commentaire : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'warning' then
        subj := 'Avertissement de l''équipe Cyclami';
        txt := 'L''équipe de modération t''adresse un avertissement : ' || coalesce(new.data ->> 'reason', '');
        cat := 'moderation';
      when 'suspended' then
        subj := 'Ton compte Cyclami est suspendu';
        txt := 'Ton compte est suspendu jusqu''au '
          || to_char((new.data ->> 'until')::timestamptz at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
          || coalesce('. Motif : ' || nullif(new.data ->> 'reason', ''), '') || '.';
        cat := 'moderation';
      when 'content_removed' then
        subj := 'Un de tes contenus a été retiré';
        txt := 'L''équipe de modération a retiré « ' || coalesce(new.data ->> 'excerpt', '') || ' »'
          || coalesce(' (' || nullif(new.data ->> 'reason', '') || ')', '') || '.';
        cat := 'moderation';
      when 'review' then
        subj := actor || ' te recommande sur Cyclami 👍';
        txt := actor || ' a apprécié la sortie « ' || title || ' » avec toi'
          || coalesce(' : « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'lost_pet' then
        if new.data ->> 'kind' = 'trouve' then
          subj := '🐾 Animal trouvé près de chez toi';
          txt := actor || ' a trouvé un animal près de chez toi' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Est-ce le tien ou celui d''un voisin ? Ouvre Cyclami pour voir sa photo.';
        else
          subj := '🚨 Animal perdu près de chez toi : ' || title;
          txt := title || ' a disparu près de chez toi' || coalesce(' (' || nullif(new.data ->> 'place', '') || ')', '')
            || '. Ouvre Cyclami pour voir sa photo et prévenir son propriétaire si tu le vois.';
        end if;
        throttle := interval '10 minutes';
      when 'pet_found' then
        subj := 'Bonne nouvelle : ' || title || ' a été retrouvé 🎉';
        txt := title || ', que tu avais vu passer dans les alertes, a été retrouvé. Merci pour ta vigilance !';
      when 'sitting_request' then
        subj := actor || ' propose de garder ' || title;
        txt := actor || ' répond à ta demande de garde pour ' || title
          || coalesce(' : « ' || nullif(new.data ->> 'excerpt', '') || ' »', '') || '.';
      when 'sitting_answer' then
        subj := 'Garde de ' || title || ' : ' || coalesce(new.data ->> 'answer', 'réponse');
        txt := actor || ' a ' || coalesce(new.data ->> 'answer', 'répondu') || ' ta proposition de garder ' || title || '.';
      when 'health_reminder' then
        subj := 'Rappel santé pour ' || title || ' : ' || coalesce(new.data ->> 'excerpt', '');
        txt := 'Petit rappel : « ' || coalesce(new.data ->> 'excerpt', '') || ' » pour ' || title
          || ' est prévu le ' || coalesce(new.data ->> 'due', '?') || '. Pense à prendre rendez-vous chez le vétérinaire.';
      when 'forum_reply' then
        subj := actor || ' a répondu à « ' || left(title, 60) || ' »';
        txt := actor || ' a répondu sur le forum à « ' || title || ' » : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'pet_birthday' then
        subj := '🎂 Joyeux anniversaire, ' || title || ' !';
        txt := title || ' fête aujourd''hui ses ' || coalesce(new.data ->> 'years', '?') || ' ans. Partage une photo avec le quartier sur Cyclami !';
      when 'ride_message' then
        subj := actor || ' a écrit dans la discussion de « ' || left(title, 50) || ' »';
        txt := actor || ' : « ' || coalesce(new.data ->> 'excerpt', '') || ' »';
        throttle := interval '30 minutes';
      when 'report_resolved' then
        subj := 'Ton signalement a été traité';
        txt := 'Merci ! L''équipe a traité ton signalement' || coalesce(' : ' || nullif(new.data ->> 'resolution', ''), '') || '.';
      else
        return null; -- « j'aime » et autres : pas d'e-mail
    end case;
  end if;
  if new.type = 'ride_updated' then throttle := greatest(throttle, interval '30 minutes');
  elsif new.type = 'pet_found' then throttle := greatest(throttle, interval '1 day');
  end if;
  perform private.queue_email(new.user_id, new.type,
                              coalesce(new.ride_id::text, new.post_id::text, new.data ->> 'topic_id', new.data ->> 'alert_id'),
                              subj, txt, '/', cat, throttle);
  perform private.send_push(new.user_id, 'Cyclami 🐾', subj, '/', 'n:' || new.id);
  return null;
end $$;

-- =====================================================================
-- Version 39 : protection animale — annonces réservées aux refuges vérifiés
--   Wallonie (Code du bien-être des animaux, art. D.49) : une annonce pour vendre ou donner
--   un animal n'est permise que dans une revue ou un site spécialisé reconnu ; les refuges
--   peuvent faire de la publicité pour replacer leurs animaux. Cyclami n'étant pas un site
--   d'annonces spécialisé, seuls les refuges vérifiés par l'équipe publient des adoptions.
--   Les annonces des autres membres sont masquées (conservées, mais invisibles).
-- =====================================================================
create table if not exists public.shelters (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  approval_number text not null check (char_length(approval_number) between 3 and 30),
  region text not null default 'wallonie' check (region in ('wallonie', 'bruxelles', 'flandre', 'france', 'autre')),
  contact text not null default '' check (char_length(contact) <= 200),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  note text not null default '' check (char_length(note) <= 300),
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shelters enable row level security;

drop policy if exists "refuges vérifiés visibles" on public.shelters;
create policy "refuges vérifiés visibles" on public.shelters
  for select to authenticated using (status = 'verified' or user_id = auth.uid() or public.is_staff());
drop policy if exists "demander le statut de refuge" on public.shelters;
create policy "demander le statut de refuge" on public.shelters
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "modifier sa demande de refuge" on public.shelters;
create policy "modifier sa demande de refuge" on public.shelters
  for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "retirer sa demande de refuge" on public.shelters;
create policy "retirer sa demande de refuge" on public.shelters
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Seul un administrateur valide ou refuse ; un refuge qui modifie son nom ou son numéro repasse en vérification.
create or replace function public.guard_shelter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- décision d'un administrateur (y compris sur sa propre demande : changement explicite du statut)
  if public.is_admin() and (new.user_id is distinct from auth.uid()
       or (tg_op = 'UPDATE' and new.status is distinct from old.status)) then
    if new.status is distinct from coalesce(old.status, '') then
      new.verified_by := auth.uid();
      new.verified_at := case when new.status = 'verified' then now() else null end;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.note := ''; new.verified_by := null; new.verified_at := null;
  else
    new.note := old.note; new.verified_by := old.verified_by; new.verified_at := old.verified_at;
    if new.name is distinct from old.name or new.approval_number is distinct from old.approval_number
       or new.region is distinct from old.region or old.status = 'rejected' then
      new.status := 'pending'; new.verified_by := null; new.verified_at := null;
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists before_shelter_write on public.shelters;
create trigger before_shelter_write before insert or update on public.shelters
  for each row execute function public.guard_shelter();

create or replace function public.is_verified_shelter(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shelters where user_id = p_user and status = 'verified');
$$;
grant execute on function public.is_verified_shelter(uuid) to authenticated, anon;

-- Annonces : visibles seulement si elles viennent d'un refuge vérifié ; publication réservée aux refuges.
drop policy if exists "annonces lisibles par les membres" on public.listings;
create policy "annonces lisibles par les membres" on public.listings
  for select to authenticated using (
    (status <> 'retire' and hidden_at is null and public.is_verified_shelter(seller_id))
    or seller_id = auth.uid() or public.is_staff());
drop policy if exists "publier une annonce" on public.listings;
create policy "publier une annonce" on public.listings
  for insert to authenticated with check (seller_id = auth.uid() and public.is_verified_shelter(auth.uid()));
drop policy if exists "modifier son annonce" on public.listings;
create policy "modifier son annonce" on public.listings
  for update to authenticated using (seller_id = auth.uid())
  with check (seller_id = auth.uid() and (public.is_verified_shelter(auth.uid()) or status = 'retire'));

-- Aperçu des liens partagés : pas d'aperçu pour une annonce qui n'est pas d'un refuge vérifié.
create or replace function public.share_preview(p_kind text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'b' then (select jsonb_build_object(
        'title', '🐾 ' || title,
        'description', '📅 ' || to_char(starts_at at time zone 'Europe/Brussels', 'DD/MM à HH24"h"MI') || ' · 📍 ' || left(place, 80)
                       || ' — Sortie entre propriétaires d''animaux sur Cyclami.')
      from public.rides where id = p_id and hidden_at is null and starts_at > now() - interval '1 day')
    when 'a' then (select jsonb_build_object(
        'title', '🏠 ' || title || ' — à adopter',
        'description', species || coalesce(' · ' || nullif(city, ''), '') || ' — Adoption en refuge sur Cyclami.',
        'image', photo_urls[1])
      from public.listings where id = p_id and hidden_at is null and status in ('active', 'reserve')
        and public.is_verified_shelter(seller_id))
    when 'f' then (select jsonb_build_object(
        'title', '💬 ' || title,
        'description', left(regexp_replace(body, '\s+', ' ', 'g'), 180))
      from public.forum_topics where id = p_id and hidden_at is null)
    when 'p' then (select jsonb_build_object(
        'title', case when kind = 'perdu' then '🚨 Perdu : ' || coalesce(nullif(name, ''), species) else '🐾 Animal trouvé : ' || species end,
        'description', '📍 ' || left(place, 80) || ' — Partage pour aider à le retrouver.',
        'image', photo_url)
      from public.lost_alerts where id = p_id and hidden_at is null and status = 'active')
    when 'g' then (select jsonb_build_object(
        'title', emoji || ' ' || name,
        'description', coalesce(nullif(left(regexp_replace(description, '\s+', ' ', 'g'), 160), '') || ' · ', '')
                       || member_count || ' membre' || case when member_count > 1 then 's' else '' end
                       || coalesce(' · ' || nullif(city, ''), '') || ' — Groupe Cyclami.')
      from public.groups where id = p_id and hidden_at is null)
  end;
$$;
revoke execute on function public.share_preview(text, uuid) from public;
grant execute on function public.share_preview(text, uuid) to anon, authenticated;

-- Pas d'annonce déguisée ailleurs sur le site (fil, commentaires, forum, groupes, sorties) :
-- un texte qui propose de vendre ou de donner un animal est refusé (en français, néerlandais ou anglais).
create or replace function private.looks_like_animal_trade(p text)
returns boolean language sql immutable as $$
  with x as (select lower(coalesce(p, '')) as s)
  select s ~ '(chiots?|chatons?|chiens?|chiennes?|chats?|chattes?|lapins?|lapereaux|furets?|portées?|cobayes?|hamsters?|perruches?|poussins?)[^.!?\n]{0,40}(à|a) (vendre|donner|céder|ceder|réserver|reserver|placer)'
      or s ~ '\m(vends|vend|donne|donnons|cède|cede|propose)\M\s+((mes|ma|mon|nos|notre|des|un|une|le|la|les|[0-9]+|deux|trois|quatre|cinq|six) )?(adorables? |jeunes? |petits? |beaux? |belles? )?(chiots?|chatons?|chiens?|chiennes?|chats?|chattes?|lapins?|lapereaux|furets?|portées?|cobayes?)'
      or s ~ '(chiots?|chatons?|portées?|lapereaux)[^.!?\n]{0,60}([0-9]+ ?(€|eur|euros)|prix)'
      or s ~ '(pupp(y|ies)|kittens?|puppy''?s)[^.!?\n]{0,40}(for sale|to give away|available|te koop|gratis|af te halen)'
      or s ~ '(honden|katten|kittens|pups|puppy''s|konijnen)[^.!?\n]{0,40}(te koop|gratis|af te halen|ter adoptie)'
      or s ~ '\m(te koop|for sale)\M[^.!?\n]{0,25}(pupp|pups?\M|kitten|hond|kat|konijn|dog|cat|rabbit)'
  from x;
$$;

create or replace function public.block_animal_trade()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  j jsonb := to_jsonb(new);
  s text := concat_ws(E'\n', j ->> 'title', j ->> 'name', j ->> 'body', j ->> 'description', j ->> 'scene');
begin
  if public.is_staff() then return new; end if;
  if tg_op = 'UPDATE' and s is not distinct from concat_ws(E'\n', to_jsonb(old) ->> 'title', to_jsonb(old) ->> 'name',
       to_jsonb(old) ->> 'body', to_jsonb(old) ->> 'description', to_jsonb(old) ->> 'scene') then
    return new;
  end if;
  if private.looks_like_animal_trade(s) then
    raise exception 'animal_trade_forbidden' using
      hint = 'La vente et le don d’animaux ne sont autorisés que via les refuges (rubrique Adoptions).';
  end if;
  return new;
end $$;

do $$
declare tb text;
begin
  foreach tb in array array['posts', 'comments', 'forum_topics', 'forum_replies', 'group_messages', 'groups', 'rides', 'ride_messages'] loop
    if to_regclass('public.' || tb) is not null then
      execute format('drop trigger if exists before_block_animal_trade on public.%I', tb);
      execute format('create trigger before_block_animal_trade before insert or update on public.%I
        for each row execute function public.block_animal_trade()', tb);
    end if;
  end loop;
end $$;

-- Un chat est stérilisé avant d'être confié, refuges compris (plus d'exception « éleveur » : seuls les refuges publient).
alter table public.listings drop constraint if exists listings_cat_sterilized;
alter table public.listings add constraint listings_cat_sterilized check (species <> 'chat' or sterilized) not valid;

-- =====================================================================
-- Version 40 : propositions aux refuges (e-mail envoyé par un administrateur)
--   Un message unique et professionnel invite un refuge à rejoindre Cyclami.
--   Garde-fous : administrateurs seulement, 20 envois par jour, pas deux fois la même adresse
--   en 30 jours, et plus jamais une adresse qui a demandé à ne plus être contactée.
-- =====================================================================
create table if not exists private.shelter_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  shelter_name text not null default '',
  lang text not null default 'fr',
  note text not null default '',
  sent_by uuid references public.profiles (id) on delete set null,
  opted_out boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.shelter_invites add column if not exists is_test boolean not null default false;
create index if not exists shelter_invites_email_idx on private.shelter_invites (lower(email), created_at desc);

drop function if exists public.admin_invite_shelter(text, text, text, text);
-- p_test : e-mail de test (objet « [TEST] »), ne bloque pas l'adresse et n'apparaît pas dans l'historique.
create or replace function public.admin_invite_shelter(p_email text, p_name text default '', p_lang text default 'fr', p_note text default '', p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'notify_url');
  secret text := (select value from private.settings where key = 'notify_secret');
  addr text := lower(trim(coalesce(p_email, '')));
  nm text := left(trim(coalesce(p_name, '')), 100);
  lg text := case when p_lang in ('fr', 'nl', 'en') then p_lang else 'fr' end;
  note text := left(trim(coalesce(p_note, '')), 1000);
  me text := coalesce((select name from public.profiles where id = auth.uid()), '');
  hello text; subj text; body text; button text; foot text;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if addr !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'invite_bad_email'; end if;
  if not p_test and exists (select 1 from private.shelter_invites where lower(email) = addr and opted_out) then
    raise exception 'invite_opted_out';
  end if;
  if not p_test and exists (select 1 from private.shelter_invites where lower(email) = addr and not is_test and created_at > now() - interval '30 days') then
    raise exception 'invite_recent';
  end if;

  if lg = 'nl' then
    hello := case when nm <> '' then 'Beste team van « ' || nm || ' »,' else 'Geachte mevrouw, geachte heer,' end;
    subj := 'Partnervoorstel: laat uw dieren adopteren via Cyclami';
    body := 'Graag stel ik u Cyclami (cyclami.com) voor, een gratis sociaal netwerk dat dierenbaasjes in België en Frankrijk samenbrengt rond fietstochten, burenhulp, meldingen van verloren dieren en advies.'
      || E'\n\n' || 'We hebben ervoor gekozen onze rubriek « Adopties » uitsluitend voor te behouden aan erkende asielen. Zo respecteren we de Waalse dierenwelzijnsregels (artikel D.49 van het Waals Dierenwelzijnswetboek) en strijden we tegen ondoordachte handel en achterlating. Particulieren en fokkers kunnen er niets plaatsen.'
      || E'\n\n' || 'Cyclami is gloednieuw: de site moet zich nog bekendmaken, en we zouden het geweldig vinden om ' || case when nm <> '' then '« ' || nm || ' »' else 'uw asiel' end || ' bij onze allereerste leden te mogen verwelkomen. Concreet:'
      || E'\n' || '• inschrijven en plaatsen is volledig gratis, zonder commissie of reclame;'
      || E'\n' || '• uw dieren worden voorgesteld aan geëngageerde baasjes bij u in de buurt;'
      || E'\n' || '• elke advertentie vermeldt de naam van uw asiel en uw erkenningsnummer, gecontroleerd door ons team;'
      || E'\n' || '• kandidaat-adoptanten nemen contact op via een beveiligde chat; u kiest zelf de gezinnen;'
      || E'\n' || '• u kunt ook uw meldingen van verloren en gevonden dieren delen.'
      || E'\n\n' || 'Aansluiten gaat snel (ongeveer 5 minuten):'
      || E'\n' || '1. klik op de knop « Mijn asiel inschrijven » hieronder;'
      || E'\n' || '2. maak een gratis account aan (met uw e-mailadres of uw Google-account);'
      || E'\n' || '3. kies « Schrijf je een asiel in? »: u hoeft geen eigen dier voor te stellen, vul gewoon de naam, het adres, het erkenningsnummer en de contactgegevens (e-mail, telefoon, website) van het asiel in;'
      || E'\n' || '4. ons team controleert uw erkenning (meestal binnen 48 uur), daarna plaatst u uw dieren één voor één of allemaal tegelijk vanuit een spreadsheet (Excel, Google Sheets).'
      || E'\n\n' || 'Uw asiel krijgt ook een eigen pagina op Cyclami (zichtbaar op Google) met uw dieren, uw contactgegevens, uw noden (giften, vrijwilligers) en uw evenementen.'
      || coalesce(E'\n\n' || nullif(note, ''), '')
      || E'\n\n' || 'De site is nog volop in ontwikkeling: aarzel niet om ons een bug te melden of suggesties te doen, ze helpen ons Cyclami te verbeteren voor de asielen en hun dieren.'
      || E'\n\n' || 'Een vraag, een opmerking of zin om erover te praten? Beantwoord gewoon deze e-mail: uw bericht komt rechtstreeks bij ons team terecht (contact@cyclami.com), dat u persoonlijk antwoordt. We stellen het project ook graag mondeling aan u voor als u dat wenst.'
      || E'\n\n' || 'Met vriendelijke groeten,' || E'\n' || case when me <> '' then me || ', voor het Cyclami-team' else 'Het Cyclami-team' end || E'\n' || 'cyclami.com';
    button := 'Mijn asiel inschrijven';
    foot := 'U ontvangt dit eenmalige bericht omdat uw asiel publiek vermeld staat. Wilt u niet meer gecontacteerd worden? Antwoord dan « STOP » op deze e-mail. —';
  elsif lg = 'en' then
    hello := case when nm <> '' then 'Dear “' || nm || '” team,' else 'Dear Sir or Madam,' end;
    subj := 'Partnership proposal: help your animals find homes with Cyclami';
    body := 'I am pleased to introduce Cyclami (cyclami.com), a free social network that brings pet owners in Belgium and France together around rides, neighbourly help, lost-pet alerts and advice.'
      || E'\n\n' || 'We have chosen to reserve our “Adoptions” section exclusively for licensed shelters, in line with Walloon animal welfare rules (article D.49 of the Walloon Animal Welfare Code) and to fight irresponsible trade and abandonment. Private individuals and breeders cannot post there.'
      || E'\n\n' || 'Cyclami is brand new: the site still has to make itself known, and we would be delighted to see ' || case when nm <> '' then '“' || nm || '”' else 'your shelter' end || ' among our very first members. In practice:'
      || E'\n' || '• registering and posting are completely free, with no commission or advertising;'
      || E'\n' || '• your animals are shown to committed pet owners near you;'
      || E'\n' || '• every listing displays your shelter’s name and licence number, checked by our team;'
      || E'\n' || '• adopters contact you through secure messaging, and you remain in control of choosing families;'
      || E'\n' || '• you can also share your lost and found animal alerts.'
      || E'\n\n' || 'Joining is quick (about 5 minutes):'
      || E'\n' || '1. click the “Register my shelter” button below;'
      || E'\n' || '2. create a free account (with your email address or your Google account);'
      || E'\n' || '3. choose “Signing up a shelter?”: there is no need to add a personal pet, simply enter the shelter’s name, address, licence number and contact details (email, phone, website);'
      || E'\n' || '4. our team checks your licence (usually within 48 hours), then you post your animals one by one or all at once from a spreadsheet (Excel, Google Sheets).'
      || E'\n\n' || 'Your shelter also gets its own page on Cyclami (visible on Google) with your animals, your contact details, your needs (donations, volunteers) and your events.'
      || coalesce(E'\n\n' || nullif(note, ''), '')
      || E'\n\n' || 'The site is still under development: please don’t hesitate to report any bugs or share your suggestions, they help us improve Cyclami for shelters and their animals.'
      || E'\n\n' || 'Any questions, comments or would you like to talk it through? Simply reply to this email: your message goes straight to our team (contact@cyclami.com), who will answer you personally. We would also be happy to present the project in person if you wish.'
      || E'\n\n' || 'Kind regards,' || E'\n' || case when me <> '' then me || ', on behalf of the Cyclami team' else 'The Cyclami team' end || E'\n' || 'cyclami.com';
    button := 'Register my shelter';
    foot := 'You are receiving this one-off message because your shelter is publicly listed. If you would rather not be contacted again, simply reply “STOP” to this email. —';
  else
    hello := case when nm <> '' then 'Bonjour à toute l’équipe de « ' || nm || ' »,' else 'Madame, Monsieur,' end;
    subj := 'Proposition de partenariat : faites adopter vos animaux avec Cyclami';
    body := 'Je me permets de vous présenter Cyclami (cyclami.com), un réseau social gratuit qui rassemble les propriétaires d’animaux en Belgique et en France autour de sorties, d’entraide entre voisins, d’alertes pour les animaux perdus et de conseils.'
      || E'\n\n' || 'Nous avons fait le choix de réserver notre rubrique « Adoptions » exclusivement aux refuges agréés, afin de respecter les règles wallonnes de protection animale (article D.49 du Code wallon du bien-être des animaux) et de lutter contre le commerce irréfléchi et les abandons. Aucun particulier ni éleveur ne peut y publier.'
      || E'\n\n' || 'Cyclami vient tout juste de voir le jour : le site doit encore se faire connaître, et nous serions ravis de voir ' || case when nm <> '' then '« ' || nm || ' »' else 'votre refuge' end || ' parmi nos tout premiers membres. Concrètement :'
      || E'\n' || '• l’inscription et la publication sont entièrement gratuites, sans commission ni publicité ;'
      || E'\n' || '• vos animaux sont présentés à des propriétaires engagés, près de chez vous ;'
      || E'\n' || '• chaque annonce affiche le nom de votre refuge et votre numéro d’agrément, vérifié par notre équipe ;'
      || E'\n' || '• les adoptants vous contactent via une messagerie sécurisée, et vous gardez la main sur le choix des familles ;'
      || E'\n' || '• vous pouvez aussi relayer vos alertes d’animaux perdus et trouvés.'
      || E'\n\n' || 'Pour nous rejoindre, c’est rapide (environ 5 minutes) :'
      || E'\n' || '1. cliquez sur le bouton « Inscrire mon refuge » ci-dessous ;'
      || E'\n' || '2. créez un compte gratuit (avec votre adresse e-mail ou votre compte Google) ;'
      || E'\n' || '3. choisissez « Tu inscris un refuge ? » : inutile de présenter un animal personnel, indiquez simplement le nom, l’adresse, le numéro d’agrément et les coordonnées (e-mail, téléphone, site) du refuge ;'
      || E'\n' || '4. notre équipe vérifie votre agrément (en général sous 48 heures), puis vous publiez vos animaux un par un, ou tous d’un coup depuis un tableur (Excel, Google Sheets).'
      || E'\n\n' || 'Votre refuge dispose aussi de sa propre page sur Cyclami (visible sur Google), avec vos animaux, vos coordonnées, vos besoins (dons, bénévoles) et vos événements.'
      || coalesce(E'\n\n' || nullif(note, ''), '')
      || E'\n\n' || 'Le site est toujours en développement : n’hésitez pas à nous signaler les bugs que vous rencontrez et à nous faire part de vos suggestions, elles nous aident à améliorer Cyclami pour les refuges et leurs animaux.'
      || E'\n\n' || 'Une question, une remarque ou l’envie d’en discuter ? Répondez simplement à cet e-mail : votre message arrive directement à notre équipe (contact@cyclami.com), qui vous répondra personnellement. Nous pouvons aussi vous présenter le projet de vive voix si vous le souhaitez.'
      || E'\n\n' || 'Avec mes salutations les meilleures,' || E'\n' || case when me <> '' then me || ', pour l’équipe Cyclami' else 'L’équipe Cyclami' end || E'\n' || 'cyclami.com';
    button := 'Inscrire mon refuge';
    foot := 'Vous recevez ce message unique car votre refuge est référencé publiquement. Si vous ne souhaitez plus être contacté, répondez simplement « STOP » à cet e-mail. —';
  end if;

  if url is null or secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'invite_mail_unavailable';
  end if;
  if p_test then subj := '[TEST] ' || subj; end if;
  -- l'invitation est enregistrée d'abord : elle porte l'adresse de réponse de la discussion
  insert into private.shelter_invites (email, shelter_name, lang, note, sent_by, is_test) values (addr, nm, lg, note, auth.uid(), p_test);
  perform private.send_shelter_mail(addr, nm, subj, hello, body, button, foot, lg);
  insert into private.shelter_messages (email, invite_id, direction, subject, body, sent_by)
  select addr, id, 'out', subj, hello || E'\n\n' || body, auth.uid() from private.shelter_invites
   where lower(email) = addr order by created_at desc limit 1;
  if p_test then return jsonb_build_object('sent', true, 'test', true, 'subject', subj); end if;
  insert into public.moderation_log (actor_id, action, target_type, target_name, reason)
  values (auth.uid(), 'proposition refuge', 'invite', addr, nm);
  return jsonb_build_object('sent', true, 'subject', subj);
end $$;
revoke all on function public.admin_invite_shelter(text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_invite_shelter(text, text, text, text, boolean) to authenticated;

-- Historique des propositions (et « ne plus contacter »).
create or replace function public.admin_shelter_invites()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'shelter_name', i.shelter_name, 'lang', i.lang,
      'opted_out', i.opted_out, 'created_at', i.created_at, 'sent_by', p.name) order by i.created_at desc)
    from (select * from private.shelter_invites where not is_test order by created_at desc limit 100) i
    left join public.profiles p on p.id = i.sent_by), '[]');
end $$;
revoke all on function public.admin_shelter_invites() from public, anon;
grant execute on function public.admin_shelter_invites() to authenticated;

create or replace function public.admin_shelter_invite_optout(p_email text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  update private.shelter_invites set opted_out = true where lower(email) = lower(trim(p_email));
end $$;
revoke all on function public.admin_shelter_invite_optout(text) from public, anon;
grant execute on function public.admin_shelter_invite_optout(text) to authenticated;

-- =====================================================================
-- Version 41 : réponses des refuges reçues sur le site (discussions)
--   Chaque proposition a une adresse de réponse unique (refuge-<jeton>@<domaine de réception>).
--   Brevo reçoit l'e-mail (réception « inbound »), le service Cloudflare le transmet à la base,
--   qui le range dans la discussion du refuge et prévient les administrateurs.
--   Tant que la réception n'est pas activée (DNS à configurer), les réponses vont à contact@cyclami.com.
-- =====================================================================
alter table private.shelter_invites add column if not exists reply_token text;
update private.shelter_invites set reply_token = md5(random()::text || id::text) where reply_token is null;
create unique index if not exists shelter_invites_token_idx on private.shelter_invites (reply_token);

create table if not exists private.shelter_messages (
  id uuid primary key default gen_random_uuid(),
  email text not null,                -- adresse du refuge (clé de la discussion)
  invite_id uuid references private.shelter_invites (id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  from_name text not null default '',
  subject text not null default '',
  body text not null default '',
  message_id text,
  sent_by uuid references public.profiles (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shelter_messages_email_idx on private.shelter_messages (lower(email), created_at);
create unique index if not exists shelter_messages_msgid_idx on private.shelter_messages (message_id) where message_id is not null;

-- adresse de réponse d'une discussion (ou contact@ tant que la réception n'est pas activée)
create or replace function private.shelter_reply_address(p_email text)
returns text language sql stable security definer set search_path = public, private as $$
  select coalesce(
    (select 'refuge-' || i.reply_token || '@' || s.value
       from private.settings s, private.shelter_invites i
      where s.key = 'inbound_domain' and nullif(s.value, '') is not null and lower(i.email) = lower(p_email)
      order by i.created_at desc limit 1),
    'contact@cyclami.com');
$$;

alter table private.shelter_invites alter column reply_token set default md5(random()::text || clock_timestamp()::text);
drop trigger if exists after_shelter_invite on private.shelter_invites;
drop function if exists private.after_shelter_invite();

-- Envoi d'un e-mail de la discussion (proposition ou réponse) via le service d'e-mails.
create or replace function private.send_shelter_mail(p_to text, p_name text, p_subject text, p_hello text, p_body text,
  p_button text, p_footer text, p_lang text)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'notify_url');
  secret text := (select value from private.settings where key = 'notify_secret');
begin
  if url is null or secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'invite_mail_unavailable';
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('to', p_to, 'name', p_name, 'subject', p_subject, 'text', p_body,
                               'link', case p_lang when 'nl' then '/nl/refuges' when 'en' then '/en/refuges' else '/refuges' end,
                               'kind', 'shelter_invite', 'lang', p_lang, 'hello', p_hello, 'button', p_button, 'footer', p_footer,
                               'reply_to', private.shelter_reply_address(p_to), 'from', 'contact@cyclami.com'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret)
  );
end $$;

-- Réception d'une réponse (appelée par le service Cloudflare, avec la clé partagée).
create or replace function public.receive_shelter_email(p_secret text, p_to text[], p_from_email text, p_from_name text,
  p_subject text, p_body text, p_message_id text default null)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  token text;
  inv private.shelter_invites;
  addr text := lower(trim(coalesce(p_from_email, '')));
  admin record;
  mid uuid;
begin
  if p_secret is null or p_secret is distinct from (select value from private.settings where key = 'notify_secret') then
    raise exception 'Non autorisé';
  end if;
  if p_message_id is not null and exists (select 1 from private.shelter_messages where message_id = p_message_id) then
    return jsonb_build_object('duplicate', true);
  end if;
  select substring(lower(x) from 'refuge-([0-9a-f]{32})@') into token
    from unnest(coalesce(p_to, '{}')) x where lower(x) ~ 'refuge-[0-9a-f]{32}@' limit 1;
  if token is not null then select * into inv from private.shelter_invites where reply_token = token; end if;
  if inv.id is null then
    select * into inv from private.shelter_invites where lower(email) = addr order by created_at desc limit 1;
  end if;
  insert into private.shelter_messages (email, invite_id, direction, from_name, subject, body, message_id)
  values (coalesce(inv.email, addr), inv.id, 'in', left(coalesce(p_from_name, ''), 200), left(coalesce(p_subject, ''), 300),
          left(coalesce(p_body, ''), 20000), p_message_id)
  returning id into mid;
  -- un refuge qui répond STOP ne sera plus sollicité
  if coalesce(p_body, '') ~* '^\s*stop\M' then
    update private.shelter_invites set opted_out = true where lower(email) = lower(coalesce(inv.email, addr));
  end if;
  for admin in select user_id from public.admins where role = 'admin' loop
    insert into public.notifications (user_id, type, data)
    values (admin.user_id, 'shelter_reply', jsonb_build_object(
      'title', coalesce(nullif(inv.shelter_name, ''), nullif(p_from_name, ''), addr),
      'excerpt', left(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'), 120), 'email', coalesce(inv.email, addr)));
  end loop;
  return jsonb_build_object('stored', true, 'id', mid);
end $$;
revoke all on function public.receive_shelter_email(text, text[], text, text, text, text, text) from public;
grant execute on function public.receive_shelter_email(text, text[], text, text, text, text, text) to anon, authenticated;

-- Liste des discussions (administrateurs).
create or replace function public.admin_shelter_threads()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return coalesce((select jsonb_agg(t order by t.last_at desc) from (
    select g.k as email, g.last_at, g.unread,
           (select i.shelter_name from private.shelter_invites i where lower(i.email) = g.k and i.shelter_name <> ''
             order by i.created_at desc limit 1) as shelter_name,
           (select left(regexp_replace(x.body, '\s+', ' ', 'g'), 100) from private.shelter_messages x
             where lower(x.email) = g.k order by x.created_at desc limit 1) as last_excerpt,
           (select x.direction from private.shelter_messages x
             where lower(x.email) = g.k order by x.created_at desc limit 1) as last_direction
    from (select lower(m.email) as k, max(m.created_at) as last_at,
                 count(*) filter (where m.direction = 'in' and m.read_at is null) as unread
          from private.shelter_messages m group by lower(m.email)) g) t), '[]');
end $$;
revoke all on function public.admin_shelter_threads() from public, anon;
grant execute on function public.admin_shelter_threads() to authenticated;

-- Une discussion (la marque comme lue).
create or replace function public.admin_shelter_thread(p_email text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  update private.shelter_messages set read_at = now() where lower(email) = lower(p_email) and direction = 'in' and read_at is null;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'from_name', m.from_name,
      'subject', m.subject, 'body', m.body, 'created_at', m.created_at, 'sent_by', p.name) order by m.created_at)
    from private.shelter_messages m left join public.profiles p on p.id = m.sent_by
    where lower(m.email) = lower(p_email)), '[]');
end $$;
revoke all on function public.admin_shelter_thread(text) from public, anon;
grant execute on function public.admin_shelter_thread(text) to authenticated;

-- Répondre au refuge depuis le site.
create or replace function public.admin_reply_shelter(p_email text, p_body text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  addr text := lower(trim(coalesce(p_email, '')));
  txt text := left(trim(coalesce(p_body, '')), 5000);
  inv private.shelter_invites;
  last_subject text;
  lg text;
  me text := coalesce((select name from public.profiles where id = auth.uid()), '');
  sign text;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if txt = '' then raise exception 'Message vide'; end if;
  if not exists (select 1 from private.shelter_messages where lower(email) = addr) then raise exception 'Discussion introuvable'; end if;
  select * into inv from private.shelter_invites where lower(email) = addr order by created_at desc limit 1;
  lg := coalesce(inv.lang, 'fr');
  select subject into last_subject from private.shelter_messages where lower(email) = addr and subject <> '' order by created_at desc limit 1;
  last_subject := regexp_replace(coalesce(last_subject, 'Cyclami'), '^((re|tr|fw|fwd|aw|antw)\s*:\s*)+', '', 'i');
  sign := case lg when 'nl' then 'Met vriendelijke groeten,' when 'en' then 'Kind regards,' else 'Bien cordialement,' end
    || E'\n' || case when me <> '' then me || ' — Cyclami' else 'L’équipe Cyclami' end || E'\n' || 'cyclami.com';
  perform private.send_shelter_mail(addr, coalesce(inv.shelter_name, ''), 'Re: ' || last_subject,
    case lg when 'nl' then 'Hallo,' when 'en' then 'Hello,' else 'Bonjour,' end,
    txt || E'\n\n' || sign,
    case lg when 'nl' then 'Cyclami bekijken' when 'en' then 'Visit Cyclami' else 'Découvrir Cyclami' end,
    case lg when 'nl' then 'Beantwoord deze e-mail om ons te antwoorden. —' when 'en' then 'Reply to this email to answer us. —'
      else 'Répondez simplement à cet e-mail pour nous écrire. —' end, lg);
  insert into private.shelter_messages (email, invite_id, direction, subject, body, sent_by)
  values (addr, inv.id, 'out', 'Re: ' || last_subject, txt, auth.uid());
  return jsonb_build_object('sent', true);
end $$;
revoke all on function public.admin_reply_shelter(text, text) from public, anon;
grant execute on function public.admin_reply_shelter(text, text) to authenticated;

-- Activer la réception (après avoir configuré le DNS du domaine de réception), ou la couper.
create or replace function public.admin_set_inbound_domain(p_domain text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if coalesce(p_domain, '') <> '' and p_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'Domaine invalide'; end if;
  insert into private.settings (key, value) values ('inbound_domain', coalesce(p_domain, ''))
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.admin_set_inbound_domain(text) from public, anon;
grant execute on function public.admin_set_inbound_domain(text) to authenticated;

create or replace function public.admin_inbound_domain()
returns text language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return coalesce((select nullif(value, '') from private.settings where key = 'inbound_domain'), '');
end $$;
revoke all on function public.admin_inbound_domain() from public, anon;
grant execute on function public.admin_inbound_domain() to authenticated;

-- =====================================================================
-- Version 42 : adresse des refuges (placée sur une carte), visible par les membres
-- =====================================================================
alter table public.shelters add column if not exists address text not null default '';
alter table public.shelters drop constraint if exists shelters_address_check;
alter table public.shelters add constraint shelters_address_check check (char_length(address) <= 200);
alter table public.shelters add column if not exists lat double precision;
alter table public.shelters add column if not exists lng double precision;
alter table public.shelters drop constraint if exists shelters_coords_check;
alter table public.shelters add constraint shelters_coords_check check (
  (lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180));

-- =====================================================================
-- Version 43 : (retirée) langue(s) du refuge — colonne supprimée
-- =====================================================================
alter table public.shelters drop column if exists languages;

-- =====================================================================
-- Version 44 : le numéro d'agrément d'une annonce est celui du refuge (vérifié par l'équipe) :
--   plus de contrôle de format d'éleveur, qui refusait les numéros de refuge.
-- =====================================================================
alter table public.listings drop constraint if exists listings_approval_format;

-- =====================================================================
-- Version 45 : supprimer une discussion avec un refuge (administrateurs)
--   Les messages sont effacés ; l'historique des propositions (limites, « STOP ») est conservé.
-- =====================================================================
create or replace function public.admin_delete_shelter_thread(p_email text)
returns integer language plpgsql security definer set search_path = public, private as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  delete from private.shelter_messages where lower(email) = lower(trim(coalesce(p_email, '')));
  get diagnostics n = row_count;
  delete from public.notifications where type = 'shelter_reply' and lower(data->>'email') = lower(trim(coalesce(p_email, '')));
  insert into public.moderation_log (actor_id, action, target_type, target_name, reason)
  values (auth.uid(), 'discussion refuge supprimée', 'invite', lower(trim(p_email)), n || ' message(s)');
  return n;
end $$;
revoke all on function public.admin_delete_shelter_thread(text) from public, anon;
grant execute on function public.admin_delete_shelter_thread(text) to authenticated;

-- =====================================================================
-- Version 46 : le super administrateur peut modifier toutes les annonces (suppression déjà permise)
-- =====================================================================
drop policy if exists "modifier son annonce" on public.listings;
create policy "modifier son annonce" on public.listings
  for update to authenticated using (seller_id = auth.uid() or public.is_admin())
  with check ((seller_id = auth.uid() and (public.is_verified_shelter(auth.uid()) or status = 'retire')) or public.is_admin());

-- =====================================================================
-- Version 47 : le super administrateur peut tout gérer sur le site
--   (publications, commentaires, sorties, animaux, profils, avis, participants, gardes).
--   Restent privés : les messages privés et le carnet de santé.
-- =====================================================================
drop policy if exists "admin modifie les publications" on public.posts;
create policy "admin modifie les publications" on public.posts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin modifie les commentaires" on public.comments;
create policy "admin modifie les commentaires" on public.comments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin gère les sorties" on public.rides;
create policy "admin gère les sorties" on public.rides
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin gère les animaux" on public.pets;
create policy "admin gère les animaux" on public.pets
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin supprime les animaux" on public.pets;
create policy "admin supprime les animaux" on public.pets
  for delete to authenticated using (public.is_admin());
drop policy if exists "admin modifie les profils" on public.profiles;
create policy "admin modifie les profils" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin modifie les avis sur les lieux" on public.place_reviews;
create policy "admin modifie les avis sur les lieux" on public.place_reviews
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin retire un participant" on public.ride_participants;
create policy "admin retire un participant" on public.ride_participants
  for delete to authenticated using (public.is_admin());
drop policy if exists "admin retire une proposition de garde" on public.sitting_offers;
create policy "admin retire une proposition de garde" on public.sitting_offers
  for delete to authenticated using (public.is_admin());

-- =====================================================================
-- Version 48 : retirer une proposition de l'historique (administrateurs)
--   Un « STOP » reste mémorisé tant qu'une autre proposition à la même adresse le porte.
-- =====================================================================
create or replace function public.admin_delete_shelter_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare inv private.shelter_invites;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  delete from private.shelter_invites where id = p_id returning * into inv;
  if inv.id is not null then
    insert into public.moderation_log (actor_id, action, target_type, target_name, reason)
    values (auth.uid(), 'proposition refuge retirée', 'invite', inv.email, inv.shelter_name);
  end if;
end $$;
revoke all on function public.admin_delete_shelter_invite(uuid) from public, anon;
grant execute on function public.admin_delete_shelter_invite(uuid) to authenticated;

-- =====================================================================
-- Version 49 : discussions avec les refuges — nombre de réponses reçues (pour les mettre en tête)
-- =====================================================================
create or replace function public.admin_shelter_threads()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return coalesce((select jsonb_agg(t order by t.last_at desc) from (
    select g.k as email, g.last_at, g.unread, g.replies,
           (select i.shelter_name from private.shelter_invites i where lower(i.email) = g.k and i.shelter_name <> ''
             order by i.created_at desc limit 1) as shelter_name,
           (select left(regexp_replace(x.body, '\s+', ' ', 'g'), 100) from private.shelter_messages x
             where lower(x.email) = g.k order by x.created_at desc limit 1) as last_excerpt,
           (select x.direction from private.shelter_messages x
             where lower(x.email) = g.k order by x.created_at desc limit 1) as last_direction
    from (select lower(m.email) as k, max(m.created_at) as last_at,
                 count(*) filter (where m.direction = 'in' and m.read_at is null) as unread,
                 count(*) filter (where m.direction = 'in') as replies
          from private.shelter_messages m group by lower(m.email)) g) t), '[]');
end $$;
revoke all on function public.admin_shelter_threads() from public, anon;
grant execute on function public.admin_shelter_threads() to authenticated;

-- =====================================================================
-- Version 50 : statistiques des annonces pour les refuges (vues et demandes de contact)
--   Une vue ou un contact compte une fois par visiteur et par jour ; les visites du refuge lui-même ne comptent pas.
-- =====================================================================
create table if not exists private.listing_events (
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind text not null check (kind in ('view', 'contact')),
  viewer text not null check (char_length(viewer) between 8 and 64),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (listing_id, kind, viewer, day)
);

create or replace function public.record_listing_event(p_id uuid, p_kind text, p_viewer text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  who text := coalesce(auth.uid()::text, left(nullif(trim(p_viewer), ''), 64));
begin
  if p_kind not in ('view', 'contact') or who is null or char_length(who) < 8 then return; end if;
  if not exists (select 1 from public.listings l where l.id = p_id and l.seller_id is distinct from auth.uid()) then return; end if;
  insert into private.listing_events (listing_id, kind, viewer) values (p_id, p_kind, who) on conflict do nothing;
end $$;
revoke all on function public.record_listing_event(uuid, text, text) from public;
grant execute on function public.record_listing_event(uuid, text, text) to anon, authenticated;

-- statistiques de mes annonces (ou de toutes pour l'administrateur)
create or replace function public.listing_stats(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, private as $$
  select coalesce(jsonb_object_agg(l.id, jsonb_build_object(
      'views', (select count(*) from private.listing_events e where e.listing_id = l.id and e.kind = 'view'),
      'views_7d', (select count(*) from private.listing_events e where e.listing_id = l.id and e.kind = 'view' and e.day > current_date - 7),
      'contacts', (select count(*) from private.listing_events e where e.listing_id = l.id and e.kind = 'contact'))), '{}')
  from public.listings l
  where l.id = any(coalesce(p_ids, '{}')) and (l.seller_id = auth.uid() or public.is_admin());
$$;
revoke all on function public.listing_stats(uuid[]) from public, anon;
grant execute on function public.listing_stats(uuid[]) to authenticated;

-- =====================================================================
-- Version 51 : pages publiques (sans compte, trouvables sur Google)
--   Seules des informations publiques sont données : annonces des refuges vérifiés, refuges vérifiés,
--   sorties à venir (titre, lieu de rendez-vous, date) — jamais l'organisateur ni les participants.
-- =====================================================================
create or replace function public.public_listings(p_shelter uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select l.id, l.title, l.species, l.breed, l.sex, l.birth_date, l.kind, l.price_cents, l.photo_urls[1] as photo,
           l.city, l.status, l.created_at, l.seller_id as shelter_id, s.name as shelter_name
      from public.listings l join public.shelters s on s.user_id = l.seller_id and s.status = 'verified'
     where l.hidden_at is null and l.status in ('active', 'reserve') and (p_shelter is null or l.seller_id = p_shelter)
     order by l.created_at desc limit 300) x;
$$;

create or replace function public.public_listing(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'title', l.title, 'species', l.species, 'breed', l.breed, 'sex', l.sex,
           'birth_date', l.birth_date, 'kind', l.kind, 'price_cents', l.price_cents, 'photo_urls', l.photo_urls,
           'description', l.description, 'city', l.city, 'status', l.status, 'vaccinated', l.vaccinated,
           'sterilized', l.sterilized, 'created_at', l.created_at,
           'shelter', jsonb_build_object('id', s.user_id, 'name', s.name, 'approval_number', s.approval_number,
                                         'address', s.address, 'lat', s.lat, 'lng', s.lng))
    from public.listings l join public.shelters s on s.user_id = l.seller_id and s.status = 'verified'
   where l.id = p_id and l.hidden_at is null and l.status in ('active', 'reserve');
$$;

create or replace function public.public_shelters()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select s.user_id as id, s.name, s.region, s.address, s.lat, s.lng,
           (select count(*) from public.listings l where l.seller_id = s.user_id and l.hidden_at is null
               and l.status in ('active', 'reserve')) as animals
      from public.shelters s where s.status = 'verified' order by s.name) x;
$$;

create or replace function public.public_shelter(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.user_id, 'name', s.name, 'region', s.region, 'address', s.address,
           'lat', s.lat, 'lng', s.lng, 'approval_number', s.approval_number)
    from public.shelters s where s.user_id = p_id and s.status = 'verified';
$$;

create or replace function public.public_rides()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select w.id, w.title, w.place, w.starts_at, w.duration, w.pace, w.max_participants,
           (select count(*) from public.ride_participants p where p.ride_id = w.id) as participants
      from public.rides w where w.hidden_at is null and w.starts_at > now()
     order by w.starts_at limit 200) x;
$$;

create or replace function public.public_ride(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', w.id, 'title', w.title, 'place', w.place, 'starts_at', w.starts_at,
           'duration', w.duration, 'pace', w.pace, 'max_participants', w.max_participants, 'description', w.description,
           'participants', (select count(*) from public.ride_participants p where p.ride_id = w.id))
    from public.rides w where w.id = p_id and w.hidden_at is null and w.starts_at > now() - interval '1 day';
$$;

do $$
declare f text;
begin
  foreach f in array array['public_listings(uuid)', 'public_listing(uuid)', 'public_shelters()', 'public_shelter(uuid)',
                           'public_rides()', 'public_ride(uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- Version 52 : « Il a trouvé sa famille » — photo et mot du refuge quand un animal est adopté
-- =====================================================================
alter table public.listings add column if not exists adopted_photo text;
alter table public.listings add column if not exists adopted_text text not null default '';
alter table public.listings add column if not exists adopted_at timestamptz;
alter table public.listings drop constraint if exists listings_adopted_check;
alter table public.listings add constraint listings_adopted_check
  check (char_length(adopted_text) <= 500 and public.is_own_photo_url(adopted_photo));

-- histoires d'adoption récentes (pages publiques et rubrique Adoptions)
create or replace function public.public_adopted()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select l.id, l.title, l.species, coalesce(l.adopted_photo, l.photo_urls[1]) as photo, l.adopted_text, l.adopted_at,
           l.seller_id as shelter_id, s.name as shelter_name
      from public.listings l join public.shelters s on s.user_id = l.seller_id and s.status = 'verified'
     where l.status = 'cede' and l.hidden_at is null and l.adopted_at is not null
     order by l.adopted_at desc limit 24) x;
$$;
revoke all on function public.public_adopted() from public;
grant execute on function public.public_adopted() to anon, authenticated;

-- =====================================================================
-- Version 53 : besoins des refuges (dons, bénévoles…) visibles par tous ;
--   les membres à environ 25 km sont prévenus sur le site (pas d'e-mail : le quota reste pour l'essentiel).
-- =====================================================================
create table if not exists public.shelter_needs (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'don' check (kind in ('don', 'benevole', 'autre')),
  title text not null check (char_length(title) between 3 and 100),
  body text not null default '' check (char_length(body) <= 1000),
  expires_on date not null default (current_date + 30),
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shelter_needs_shelter_idx on public.shelter_needs (shelter_id, created_at desc);
alter table public.shelter_needs enable row level security;

drop policy if exists "besoins des refuges visibles" on public.shelter_needs;
create policy "besoins des refuges visibles" on public.shelter_needs for select to anon, authenticated
  using ((not closed and expires_on >= current_date and public.is_verified_shelter(shelter_id))
         or shelter_id = auth.uid() or public.is_admin());
drop policy if exists "publier un besoin" on public.shelter_needs;
create policy "publier un besoin" on public.shelter_needs for insert to authenticated
  with check (shelter_id = auth.uid() and public.is_verified_shelter(auth.uid()) and expires_on <= current_date + 90);
drop policy if exists "modifier son besoin" on public.shelter_needs;
create policy "modifier son besoin" on public.shelter_needs for update to authenticated
  using (shelter_id = auth.uid() or public.is_admin()) with check (shelter_id = auth.uid() or public.is_admin());
drop policy if exists "retirer son besoin" on public.shelter_needs;
create policy "retirer son besoin" on public.shelter_needs for delete to authenticated
  using (shelter_id = auth.uid() or public.is_admin());

create or replace function public.notify_shelter_need()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.shelters;
begin
  select * into s from public.shelters where user_id = new.shelter_id and status = 'verified';
  if s.user_id is null or s.lat is null then return new; end if;
  insert into public.notifications (user_id, actor_id, type, data)
  select p.id, new.shelter_id, 'shelter_need',
         jsonb_build_object('title', new.title, 'shelter', s.name, 'need_id', new.id, 'kind', new.kind)
    from public.profiles p
   where p.id <> new.shelter_id and p.lat is not null
     and abs(p.lat - s.lat) < 0.23 and abs(p.lng - s.lng) < 0.35
   limit 500;
  return new;
end $$;
drop trigger if exists after_shelter_need on public.shelter_needs;
create trigger after_shelter_need after insert on public.shelter_needs
  for each row execute function public.notify_shelter_need();

-- besoins en cours, avec le nom et la position du refuge (pages publiques et rubrique Adoptions)
create or replace function public.public_needs(p_shelter uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select n.id, n.kind, n.title, n.body, n.expires_on, n.created_at, n.shelter_id, s.name as shelter_name,
           s.address, s.lat, s.lng
      from public.shelter_needs n join public.shelters s on s.user_id = n.shelter_id and s.status = 'verified'
     where not n.closed and n.expires_on >= current_date and (p_shelter is null or n.shelter_id = p_shelter)
     order by n.created_at desc limit 100) x;
$$;
revoke all on function public.public_needs(uuid) from public;
grant execute on function public.public_needs(uuid) to anon, authenticated;

-- =====================================================================
-- Version 54 : recommandation après une garde (le propriétaire recommande la personne qui a gardé son animal)
-- =====================================================================
create table if not exists public.sitting_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sitting_requests (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  comment text not null default '' check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (request_id, sitter_id),
  check (reviewer_id <> sitter_id)
);
create index if not exists sitting_reviews_sitter_idx on public.sitting_reviews (sitter_id, created_at desc);
alter table public.sitting_reviews enable row level security;

-- garde à moi, proposition acceptée, terminée depuis 60 jours au plus
create or replace function public.can_review_sitting(p_request uuid, p_sitter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sitting_requests r
     where r.id = p_request and r.owner_id = auth.uid() and r.status <> 'annulee'
       and r.ends_on <= current_date and r.ends_on > current_date - 60
       and exists (select 1 from public.sitting_offers o where o.request_id = r.id and o.sitter_id = p_sitter and o.status = 'acceptee'));
$$;

drop policy if exists "recommandations de garde visibles" on public.sitting_reviews;
create policy "recommandations de garde visibles" on public.sitting_reviews for select to authenticated using (true);
drop policy if exists "recommander un gardien" on public.sitting_reviews;
create policy "recommander un gardien" on public.sitting_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and public.can_review_sitting(request_id, sitter_id) and not public.is_blocked_with(sitter_id));
drop policy if exists "retirer sa recommandation de garde" on public.sitting_reviews;
create policy "retirer sa recommandation de garde" on public.sitting_reviews for delete to authenticated
  using (reviewer_id = auth.uid() or public.is_staff());

create or replace function public.notify_sitting_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, data)
  select new.sitter_id, new.reviewer_id, 'sitting_review',
         jsonb_build_object('title', coalesce(p.name, ''), 'excerpt', left(new.comment, 120))
    from public.sitting_requests r left join public.pets p on p.id = r.pet_id where r.id = new.request_id;
  return null;
end $$;
drop trigger if exists after_sitting_review on public.sitting_reviews;
create trigger after_sitting_review after insert on public.sitting_reviews
  for each row execute function public.notify_sitting_review();

-- =====================================================================
-- Version 55 : statistiques Google (Search Console) dans l'administration
--   Remplies chaque jour par le workflow GitHub « Statistiques Google » (compte de service Google).
-- =====================================================================
create table if not exists private.search_console_days (
  day date primary key,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric not null default 0
);
create table if not exists private.search_console_top (
  kind text not null check (kind in ('query', 'page')),
  key text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric not null default 0,
  primary key (kind, key)
);

create or replace function public.admin_search_stats()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return jsonb_build_object(
    'updated_at', (select value from private.settings where key = 'search_console_updated'),
    'days', coalesce((select jsonb_agg(d order by d.day) from private.search_console_days d where d.day > current_date - 29), '[]'),
    'queries', coalesce((select jsonb_agg(x) from (select key, clicks, impressions, round(position, 1) as position
        from private.search_console_top where kind = 'query' order by clicks desc, impressions desc limit 10) x), '[]'),
    'pages', coalesce((select jsonb_agg(x) from (select key, clicks, impressions, round(position, 1) as position
        from private.search_console_top where kind = 'page' order by clicks desc, impressions desc limit 10) x), '[]'));
end $$;
revoke all on function public.admin_search_stats() from public, anon;
grant execute on function public.admin_search_stats() to authenticated;

-- =====================================================================
-- Version 56 : abonnements entre membres (comme sur Instagram)
-- =====================================================================
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id, created_at desc);
alter table public.follows enable row level security;

drop policy if exists "abonnements visibles" on public.follows;
create policy "abonnements visibles" on public.follows for select to authenticated using (true);
drop policy if exists "s'abonner" on public.follows;
create policy "s'abonner" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_with(followee_id));
-- se désabonner, ou retirer un abonné de sa liste
drop policy if exists "se désabonner" on public.follows;
create policy "se désabonner" on public.follows for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid() or public.is_staff());

-- bloquer quelqu'un retire aussi les abonnements dans les deux sens
create or replace function public.unfollow_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows where (follower_id = new.blocker_id and followee_id = new.blocked_id)
                               or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return null;
end $$;
drop trigger if exists after_block_unfollow on public.blocks;
create trigger after_block_unfollow after insert on public.blocks
  for each row execute function public.unfollow_on_block();

-- nouvel abonné : notification sur le site (une seule fois par personne et par jour)
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.notifications where user_id = new.followee_id and actor_id = new.follower_id
                   and type = 'follow' and created_at > now() - interval '1 day') then
    insert into public.notifications (user_id, actor_id, type, data) values (new.followee_id, new.follower_id, 'follow', '{}');
  end if;
  return null;
end $$;
drop trigger if exists after_follow_notify on public.follows;
create trigger after_follow_notify after insert on public.follows
  for each row execute function public.notify_follow();

-- compteurs d'un profil
create or replace function public.follow_counts(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows where followee_id = p_user),
    'following', (select count(*) from public.follows where follower_id = p_user),
    'i_follow', exists (select 1 from public.follows where follower_id = auth.uid() and followee_id = p_user),
    'follows_me', exists (select 1 from public.follows where follower_id = p_user and followee_id = auth.uid()));
$$;

-- liste des abonnés ('followers') ou des abonnements ('following') d'un profil
create or replace function public.follow_list(p_user uuid, p_kind text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select p.id, p.name, p.city, p.avatar_url,
           exists (select 1 from public.follows m where m.follower_id = auth.uid() and m.followee_id = p.id) as i_follow
      from public.follows f
      join public.profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
     where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
       and not public.is_blocked_with(p.id)
     order by f.created_at desc limit 500) x;
$$;
revoke all on function public.follow_counts(uuid) from public, anon;
grant execute on function public.follow_counts(uuid) to authenticated;
revoke all on function public.follow_list(uuid, text) from public, anon;
grant execute on function public.follow_list(uuid, text) to authenticated;

-- =====================================================================
-- Version 57 : note en étoiles (1 à 5) après une garde, à la place de la simple recommandation
--   Les recommandations déjà données comptent comme 5 étoiles.
-- =====================================================================
alter table public.sitting_reviews add column if not exists rating smallint not null default 5;
alter table public.sitting_reviews drop constraint if exists sitting_reviews_rating_check;
alter table public.sitting_reviews add constraint sitting_reviews_rating_check check (rating between 1 and 5);

create or replace function public.notify_sitting_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, data)
  select new.sitter_id, new.reviewer_id, 'sitting_review',
         jsonb_build_object('title', coalesce(p.name, ''), 'excerpt', left(new.comment, 120), 'rating', new.rating)
    from public.sitting_requests r left join public.pets p on p.id = r.pet_id where r.id = new.request_id;
  return null;
end $$;

-- Listes d'abonnés : photo du premier animal (image de profil par défaut d'un membre sans photo)
create or replace function public.follow_list(p_user uuid, p_kind text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select p.id, p.name, p.city, p.avatar_url,
           (select a.photo_url from public.pets a where a.owner_id = p.id and coalesce(a.photo_url, '') <> '' order by a.created_at limit 1) as pet_photo_url,
           exists (select 1 from public.follows m where m.follower_id = auth.uid() and m.followee_id = p.id) as i_follow
      from public.follows f
      join public.profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
     where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
       and not public.is_blocked_with(p.id)
     order by f.created_at desc limit 500) x;
$$;

-- =====================================================================
-- Version 58 : compte du fondateur
--   Tous les membres sont abonnés au compte du fondateur, sans pouvoir se désabonner (ni être retirés).
--   Sa photo de profil lui est réservée : personne d'autre ne peut reprendre la même adresse d'image
--   (le site refuse aussi l'envoi d'une copie de l'image, voir src/lib/reservedAvatar.js).
-- =====================================================================
-- le fondateur = le premier administrateur (rôle « admin », pas modérateur)
create or replace function public.owner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.admins where role = 'admin' order by created_at, user_id limit 1;
$$;
grant execute on function public.owner_id() to authenticated;

-- notification « s'est abonné(e) » : pas pour l'abonnement automatique de masse (rattrapage)
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('cyclami.silent_follow', true), '') = 'on' then return null; end if;
  if not exists (select 1 from public.notifications where user_id = new.followee_id and actor_id = new.follower_id
                   and type = 'follow' and created_at > now() - interval '1 day') then
    insert into public.notifications (user_id, actor_id, type, data) values (new.followee_id, new.follower_id, 'follow', '{}');
  end if;
  return null;
end $$;

-- abonnement au fondateur : impossible à retirer (sauf suppression du compte, en cascade)
drop policy if exists "se désabonner" on public.follows;
create policy "se désabonner" on public.follows for delete to authenticated
  using ((follower_id = auth.uid() or followee_id = auth.uid() or public.is_staff())
         and followee_id is distinct from public.owner_id());

-- bloquer le fondateur ne retire pas l'abonnement
create or replace function public.unfollow_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid := public.owner_id();
begin
  delete from public.follows where ((follower_id = new.blocker_id and followee_id = new.blocked_id)
                                 or (follower_id = new.blocked_id and followee_id = new.blocker_id))
                               and followee_id is distinct from owner;
  return null;
end $$;

-- chaque nouveau membre est abonné au fondateur
create or replace function public.follow_owner_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid := public.owner_id();
begin
  if owner is not null and new.id <> owner then
    insert into public.follows (follower_id, followee_id) values (new.id, owner) on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists after_profile_follow_owner on public.profiles;
create trigger after_profile_follow_owner after insert on public.profiles
  for each row execute function public.follow_owner_on_signup();

-- rattrapage : les membres existants (sans notification)
do $$
begin
  perform set_config('cyclami.silent_follow', 'on', true);
  insert into public.follows (follower_id, followee_id)
  select p.id, public.owner_id() from public.profiles p
   where public.owner_id() is not null and p.id <> public.owner_id()
  on conflict do nothing;
  perform set_config('cyclami.silent_follow', 'off', true);
end $$;

-- photo de profil du fondateur : la même adresse d'image est refusée pour les autres comptes
create or replace function public.guard_reserved_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is not null and new.avatar_url is distinct from old.avatar_url and new.id <> public.owner_id()
     and new.avatar_url = (select avatar_url from public.profiles where id = public.owner_id()) then
    raise exception 'Cette photo de profil est réservée.';
  end if;
  return new;
end $$;
drop trigger if exists before_profile_reserved_avatar on public.profiles;
create trigger before_profile_reserved_avatar before update of avatar_url on public.profiles
  for each row execute function public.guard_reserved_avatar();

-- compteurs : « owner » indique le compte du fondateur (abonnement verrouillé)
create or replace function public.follow_counts(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows where followee_id = p_user),
    'following', (select count(*) from public.follows where follower_id = p_user),
    'i_follow', exists (select 1 from public.follows where follower_id = auth.uid() and followee_id = p_user),
    'follows_me', exists (select 1 from public.follows where follower_id = p_user and followee_id = auth.uid()),
    'owner', p_user = public.owner_id());
$$;

create or replace function public.follow_list(p_user uuid, p_kind text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select p.id, p.name, p.city, p.avatar_url,
           (select a.photo_url from public.pets a where a.owner_id = p.id and coalesce(a.photo_url, '') <> '' order by a.created_at limit 1) as pet_photo_url,
           exists (select 1 from public.follows m where m.follower_id = auth.uid() and m.followee_id = p.id) as i_follow,
           p.id = public.owner_id() as is_owner
      from public.follows f
      join public.profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
     where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
       and not public.is_blocked_with(p.id)
     order by f.created_at desc limit 500) x;
$$;

-- =====================================================================
-- Version 59 : identification de la photo réservée par la base
--   Le site envoie avec chaque nouvelle photo de profil ses empreintes visuelles (« h1,h2,…|horodatage »).
--   La base refuse une photo sans empreintes neuves (ancien site resté en cache) ou trop proche de la
--   photo du fondateur (mêmes empreintes de référence que src/lib/reservedAvatar.js).
-- =====================================================================
alter table public.profiles add column if not exists avatar_hash text;
alter table public.profiles drop constraint if exists profiles_avatar_hash_check;
alter table public.profiles add constraint profiles_avatar_hash_check check (avatar_hash is null or char_length(avatar_hash) <= 200);

create or replace function public.is_reserved_avatar_hash(p_hashes text)
returns boolean language sql immutable set search_path = public as $$
  select exists (
    select 1
      from unnest(string_to_array(split_part(coalesce(p_hashes, ''), '|', 1), ',')) h,
           unnest(array['7062f4d6d6b666f4', '70e2f6f2b61766f4', '1c0d171717376616', '1c0d17333717661e']) r
     where h ~ '^[0-9a-f]{16}$'
       and length(replace((('x' || h)::bit(64) # ('x' || r)::bit(64))::text, '0', '')) <= 8);
$$;

create or replace function public.guard_reserved_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid := public.owner_id();
begin
  if new.avatar_url is null then
    new.avatar_hash := null;
    return new;
  end if;
  if new.avatar_url is not distinct from old.avatar_url or new.id = owner then return new; end if;
  if new.avatar_url = (select avatar_url from public.profiles where id = owner) then
    raise exception 'Cette photo de profil est réservée.';
  end if;
  -- nouvelle photo : empreintes envoyées avec elle (ancien site en cache : il faut recharger la page)
  if new.avatar_hash is null or new.avatar_hash is not distinct from old.avatar_hash then
    raise exception 'Recharge la page (version du site trop ancienne) puis choisis à nouveau ta photo.';
  end if;
  if public.is_reserved_avatar_hash(new.avatar_hash) then
    raise exception 'Cette photo de profil est réservée au fondateur d’Cyclami. Choisis-en une autre.';
  end if;
  return new;
end $$;
drop trigger if exists before_profile_reserved_avatar on public.profiles;
create trigger before_profile_reserved_avatar before update of avatar_url, avatar_hash on public.profiles
  for each row execute function public.guard_reserved_avatar();

-- =====================================================================
-- Version 60 : prénom (pseudo) figé après l'inscription
--   Choisi à l'inscription, encore modifiable jusqu'au premier animal (fin de l'accueil, utile avec Google),
--   ensuite seul le fondateur peut le changer.
-- =====================================================================
create or replace function public.guard_profile_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name and auth.uid() is not null
     and auth.uid() is distinct from public.owner_id()
     and exists (select 1 from public.pets where owner_id = new.id) then
    raise exception 'Ton prénom ne peut plus être modifié après l’inscription. Écris à l’équipe si besoin.';
  end if;
  return new;
end $$;
drop trigger if exists before_profile_name on public.profiles;
create trigger before_profile_name before update of name on public.profiles
  for each row execute function public.guard_profile_name();

-- =====================================================================
-- Version 61 : pseudos interdits
--   Les prénoms ne changeant plus après l'inscription, on refuse dès le départ les insultes et les noms
--   qui se font passer pour l'équipe (admin, Cyclami, modérateur…).
--   À l'inscription, un nom refusé devient « Membre » (choix d'un autre prénom pendant l'accueil) ;
--   ensuite, la modification est refusée. Le site vérifie avant l'envoi avec name_allowed().
-- =====================================================================
create or replace function public.name_problem(p_name text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  base text := translate(lower(coalesce(p_name, '')),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ0134578@$€!|',
    'aaaaaaceeeeiiiinooooouuuuyyoaoieastbasei' || 'i');
  flat text := regexp_replace(base, '[^a-z]', '', 'g');
  squeezed text := regexp_replace(flat, '(.)\1+', '\1', 'g');
  words text[] := array_remove(regexp_split_to_array(regexp_replace(base, '[^a-z]+', ' ', 'g'), ' '), '');
begin
  -- noms d'équipe (n'importe où dans le prénom)
  if flat ~ '(admin|cyclami|moderat|moderator|fondateur|founder|officiel|official|beheerder|webmaster)'
     or squeezed ~ '(admin|cyclami|moderat|fondateur|founder|oficiel|oficial)'
     or words && array['modo', 'equipe', 'team', 'root', 'system', 'systeme', 'staff', 'support'] then
    return 'reserve';
  end if;
  -- insultes (dans le prénom, ou mot entier pour les mots courts qui existent dans des prénoms)
  if flat ~ '(connard|conasse|connasse|salope|salaud|putain|encule|batard|merde|niquer|niquetamere|tamere|enfoire|branleur|tapette|negre|bougnoul|youpin|hitler|couille|fuck|bitch|whore|asshole|motherf|nigger|nigga|faggot|klootzak|mongool|flikker|kanker|godver)'
     or squeezed ~ '(conard|conase|salope|putain|encule|batard|merde|fuck|bitch|niger|niga)'
     or words && array['pd', 'fdp', 'ntm', 'tg', 'con', 'conne', 'pute', 'bite', 'suce', 'nique', 'nazi', 'cul', 'zob',
                       'shit', 'cunt', 'dick', 'slut', 'retard', 'kut', 'lul', 'hoer', 'tering', 'sex', 'sexe', 'porn', 'porno'] then
    return 'insulte';
  end if;
  -- (un même prénom que le fondateur est autorisé : son badge « Fondateur » le distingue)
  return null;
end $$;

-- vérification avant l'envoi (inscription : aussi pour les visiteurs non connectés)
create or replace function public.name_allowed(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.name_problem(p_name) is null;
$$;
grant execute on function public.name_allowed(text) to anon, authenticated;
revoke all on function public.name_problem(text) from public, anon;

create or replace function public.guard_name_words()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.name_problem(new.name) is null then return new; end if;
  if tg_op = 'INSERT' then
    new.name := 'Membre';
    return new;
  end if;
  if new.name is not distinct from old.name or auth.uid() is not distinct from public.owner_id() then return new; end if;
  raise exception 'Ce prénom n’est pas autorisé. Choisis-en un autre.';
end $$;
drop trigger if exists before_profile_name_words on public.profiles;
create trigger before_profile_name_words before insert or update of name on public.profiles
  for each row execute function public.guard_name_words();

-- =====================================================================
-- Version 62 : « Télécharger mes données » (RGPD, droit d'accès et portabilité)
--   Tout ce que le membre a créé ou reçu, en un seul fichier JSON. Pas les signalements le concernant
--   (pour protéger les personnes qui signalent) ni les clés techniques des notifications push.
-- =====================================================================
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  return jsonb_build_object(
    'export_date', now(),
    'compte', (select jsonb_build_object('email', u.email, 'inscrit_le', u.created_at) from auth.users u where u.id = me),
    'profil', (select to_jsonb(p) - 'avatar_hash' from public.profiles p where p.id = me),
    'animaux', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.pets x where x.owner_id = me),
    'carnet_de_sante', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.pet_health x where x.owner_id = me),
    'publications', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.posts x where x.author_id = me),
    'commentaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.comments x where x.author_id = me),
    'mentions_j_aime', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.post_likes x where x.user_id = me),
    'messages_prives', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.messages x where x.sender_id = me or x.recipient_id = me),
    'sorties_organisees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rides x where x.host_id = me),
    'sorties_rejointes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.ride_participants x where x.user_id = me),
    'messages_de_sortie', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.ride_messages x where x.author_id = me),
    'recommandations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.ride_reviews x where x.reviewer_id = me or x.reviewee_id = me),
    'gardes_demandees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.sitting_requests x where x.owner_id = me),
    'gardes_proposees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.sitting_offers x where x.sitter_id = me),
    'avis_de_garde', (select coalesce(jsonb_agg(to_jsonb(x) - 'request_id'), '[]') from public.sitting_reviews x where x.reviewer_id = me or x.sitter_id = me),
    'annonces', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.listings x where x.seller_id = me),
    'alertes_animal_perdu', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.lost_alerts x where x.owner_id = me),
    'forum_sujets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.forum_topics x where x.author_id = me),
    'forum_reponses', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.forum_replies x where x.author_id = me),
    'groupes_crees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.groups x where x.owner_id = me),
    'groupes_rejoints', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.group_members x where x.user_id = me),
    'messages_de_groupe', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.group_messages x where x.author_id = me),
    'avis_sur_des_lieux', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.place_reviews x where x.user_id = me),
    'refuge', (select to_jsonb(x) from public.shelters x where x.user_id = me),
    'besoins_du_refuge', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.shelter_needs x where x.shelter_id = me),
    'dons_de_materiel', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.gear_items x where x.owner_id = me),
    'lieux_favoris', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.place_favorites x where x.user_id = me),
    'evenements_du_refuge', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.shelter_events x where x.shelter_id = me),
    'abonnements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.follows x where x.follower_id = me),
    'abonnes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.follows x where x.followee_id = me),
    'membres_bloques', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.blocks x where x.blocker_id = me),
    'mes_signalements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.reports x where x.reporter_id = me),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.notifications x where x.user_id = me),
    'preferences_e_mail', (select to_jsonb(x) from public.notification_settings x where x.user_id = me),
    'points_xp', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.xp_events x where x.user_id = me),
    'appareils_notifies', (select count(*) from public.push_subscriptions x where x.user_id = me)
  );
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- =====================================================================
-- Version 63 : suggestions de membres à suivre
--   Membres proches (30 km) ou qui ont un animal de la même race, pas encore suivis, ni bloqués.
--   La distance est arrondie au kilomètre : jamais la position.
-- =====================================================================
create or replace function public.follow_suggestions()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select id, lat, lng from public.profiles where id = auth.uid()),
  my_breeds as (select distinct lower(breed) b from public.pets where owner_id = auth.uid() and breed <> ''),
  my_species as (select distinct species s from public.pets where owner_id = auth.uid()),
  c as (
    select p.id, p.name, p.city, p.avatar_url,
           case when me.lat is not null and p.lat is not null then
             round((6371 * acos(least(1, greatest(-1, cos(radians(me.lat)) * cos(radians(p.lat)) * cos(radians(p.lng - me.lng))
                                + sin(radians(me.lat)) * sin(radians(p.lat))))))::numeric)
           end as km,
           (select a.breed from public.pets a where a.owner_id = p.id and a.breed <> '' and lower(a.breed) in (select b from my_breeds) limit 1) as breed,
           exists (select 1 from public.pets a where a.owner_id = p.id and a.species in (select s from my_species)) as same_species,
           (select a.photo_url from public.pets a where a.owner_id = p.id and coalesce(a.photo_url, '') <> '' order by a.created_at limit 1) as pet_photo_url,
           p.created_at
      from public.profiles p, me
     where p.id <> me.id
       and not exists (select 1 from public.follows f where f.follower_id = me.id and f.followee_id = p.id)
       and not public.is_blocked_with(p.id)
       and exists (select 1 from public.pets a where a.owner_id = p.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'avatar_url', avatar_url,
                                               'pet_photo_url', pet_photo_url, 'km', km, 'breed', breed) order by score desc), '[]')
    from (
      select *, (case when breed is not null then 40 else 0 end)
              + (case when same_species then 10 else 0 end)
              + (case when km is not null and km <= 30 then 30 - km else 0 end) as score
        from c
       where breed is not null or (km is not null and km <= 30)
       order by score desc, created_at desc
       limit 12) s;
$$;
revoke all on function public.follow_suggestions() from public, anon;
grant execute on function public.follow_suggestions() to authenticated;

-- =====================================================================
-- Version 64 : recherche globale (membres, animaux, annonces, forum, sorties, groupes)
--   Fonction « invoker » : les règles d'accès de chaque table s'appliquent normalement.
-- =====================================================================
create or replace function public.global_search(p_query text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  q text := '%' || replace(replace(replace(trim(coalesce(p_query, '')), '\', ''), '%', ''), '_', '') || '%';
begin
  if char_length(trim(coalesce(p_query, ''))) < 2 then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(x), '[]') from (
      select p.id, p.name, p.city, p.avatar_url,
             (select a.photo_url from public.pets a where a.owner_id = p.id and coalesce(a.photo_url, '') <> '' order by a.created_at limit 1) as pet_photo_url
        from public.profiles p
       where p.name ilike q and not public.is_blocked_with(p.id)
       order by (lower(p.name) = lower(trim(p_query))) desc, p.name limit 10) x),
    'pets', (select coalesce(jsonb_agg(x), '[]') from (
      select a.id, a.name, a.emoji, a.photo_url, a.breed, a.owner_id, p.name as owner_name
        from public.pets a join public.profiles p on p.id = a.owner_id
       where (a.name ilike q or a.breed ilike q) and not public.is_blocked_with(a.owner_id)
       order by (lower(a.name) = lower(trim(p_query))) desc, a.name limit 10) x),
    'listings', (select coalesce(jsonb_agg(x), '[]') from (
      select l.id, l.title, l.photo_urls[1] as photo
        from public.listings l
       where l.title ilike q and l.hidden_at is null and l.status in ('active', 'reserve')
       order by l.created_at desc limit 8) x),
    'topics', (select coalesce(jsonb_agg(x), '[]') from (
      select f.id, f.title, f.reply_count
        from public.forum_topics f
       where (f.title ilike q or f.body ilike q) and f.hidden_at is null
       order by f.last_reply_at desc limit 8) x),
    'rides', (select coalesce(jsonb_agg(x), '[]') from (
      select w.id, w.title, w.starts_at
        from public.rides w
       where w.title ilike q and w.hidden_at is null and w.starts_at > now() - interval '1 day'
       order by w.starts_at limit 8) x),
    'groups', (select coalesce(jsonb_agg(x), '[]') from (
      select g.id, g.name, g.city
        from public.groups g
       where (g.name ilike q or g.city ilike q) and g.hidden_at is null
       order by g.created_at desc limit 8) x)
  );
end $$;
revoke all on function public.global_search(text) from public, anon;
grant execute on function public.global_search(text) to authenticated;

-- =====================================================================
-- Version 65 : événements des refuges (portes ouvertes, collectes, journées d'adoption…)
--   Visibles par tous (pages publiques comprises) jusqu'à leur fin ; les membres à environ 25 km
--   sont prévenus sur le site.
-- =====================================================================
create table if not exists public.shelter_events (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'portes_ouvertes' check (kind in ('portes_ouvertes', 'collecte', 'adoption', 'autre')),
  title text not null check (char_length(title) between 3 and 100),
  body text not null default '' check (char_length(body) <= 1000),
  place text not null default '' check (char_length(place) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '14 days')
);
create index if not exists shelter_events_shelter_idx on public.shelter_events (shelter_id, starts_at);
create index if not exists shelter_events_upcoming_idx on public.shelter_events (ends_at) where not cancelled;
alter table public.shelter_events enable row level security;

drop policy if exists "événements des refuges visibles" on public.shelter_events;
create policy "événements des refuges visibles" on public.shelter_events for select to anon, authenticated
  using ((not cancelled and ends_at > now() and public.is_verified_shelter(shelter_id))
         or shelter_id = auth.uid() or public.is_admin());
drop policy if exists "publier un événement" on public.shelter_events;
create policy "publier un événement" on public.shelter_events for insert to authenticated
  with check (shelter_id = auth.uid() and public.is_verified_shelter(auth.uid())
              and starts_at > now() - interval '1 day' and starts_at < now() + interval '1 year');
drop policy if exists "modifier son événement" on public.shelter_events;
create policy "modifier son événement" on public.shelter_events for update to authenticated
  using (shelter_id = auth.uid() or public.is_admin()) with check (shelter_id = auth.uid() or public.is_admin());
drop policy if exists "retirer son événement" on public.shelter_events;
create policy "retirer son événement" on public.shelter_events for delete to authenticated
  using (shelter_id = auth.uid() or public.is_admin());

create or replace function public.notify_shelter_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.shelters;
begin
  select * into s from public.shelters where user_id = new.shelter_id and status = 'verified';
  if s.user_id is null or s.lat is null then return new; end if;
  insert into public.notifications (user_id, actor_id, type, data)
  select p.id, new.shelter_id, 'shelter_event',
         jsonb_build_object('title', new.title, 'shelter', s.name, 'event_id', new.id, 'starts_at', new.starts_at, 'shelter_id', new.shelter_id)
    from public.profiles p
   where p.id <> new.shelter_id and p.lat is not null
     and abs(p.lat - s.lat) < 0.23 and abs(p.lng - s.lng) < 0.35
   limit 500;
  return new;
end $$;
drop trigger if exists after_shelter_event on public.shelter_events;
create trigger after_shelter_event after insert on public.shelter_events
  for each row execute function public.notify_shelter_event();

-- événements à venir, avec le nom et la position du refuge (pages publiques et rubrique Adoptions)
create or replace function public.public_events(p_shelter uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select e.id, e.kind, e.title, e.body, e.starts_at, e.ends_at, e.shelter_id, s.name as shelter_name,
           coalesce(nullif(e.place, ''), s.address) as place, s.lat, s.lng
      from public.shelter_events e join public.shelters s on s.user_id = e.shelter_id and s.status = 'verified'
     where not e.cancelled and e.ends_at > now() and (p_shelter is null or e.shelter_id = p_shelter)
     order by e.starts_at limit 100) x;
$$;
revoke all on function public.public_events(uuid) from public;
grant execute on function public.public_events(uuid) to anon, authenticated;

-- =====================================================================
-- Version 66 : réactions aux messages privés (❤️ 😂 😮 😢 👍 🐾), une par personne et par message
--   Enregistrées sur le message lui-même : la messagerie en temps réel les transmet déjà.
-- =====================================================================
alter table public.messages add column if not exists sender_reaction text;
alter table public.messages add column if not exists recipient_reaction text;
alter table public.messages drop constraint if exists messages_reactions_check;
alter table public.messages add constraint messages_reactions_check check (
  (sender_reaction is null or sender_reaction in ('❤️', '😂', '😮', '😢', '👍', '🐾'))
  and (recipient_reaction is null or recipient_reaction in ('❤️', '😂', '😮', '😢', '👍', '🐾')));

create or replace function public.react_message(p_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null or auth.uid() not in (m.sender_id, m.recipient_id) then raise exception 'Message introuvable'; end if;
  if public.is_blocked_with(case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end) then
    raise exception 'Action non autorisée.';
  end if;
  if m.sender_id = auth.uid() then
    update public.messages set sender_reaction = nullif(p_emoji, '') where id = p_id;
  else
    update public.messages set recipient_reaction = nullif(p_emoji, '') where id = p_id;
  end if;
end $$;
revoke all on function public.react_message(uuid, text) from public, anon;
grant execute on function public.react_message(uuid, text) to authenticated;

-- =====================================================================
-- Version 67 : signaler une photo de profil (motif « avatar ») ; l'équipe la retire en un clic
-- =====================================================================
create or replace function public.mod_remove_avatar(p_user uuid, p_report uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Action réservée à l’équipe'; end if;
  if p_user = public.owner_id() and auth.uid() <> p_user then raise exception 'Action non autorisée.'; end if;
  update public.profiles set avatar_url = null, avatar_hash = null where id = p_user;
  insert into public.notifications (user_id, actor_id, type, data)
  values (p_user, auth.uid(), 'content_removed', jsonb_build_object('kind', 'avatar', 'reason', 'Photo de profil inappropriée'));
  if p_report is not null then
    update public.reports set resolved_at = now(), resolved_by = auth.uid(), resolution = 'Photo de profil retirée'
     where id = p_report and resolved_at is null;
  end if;
  insert into public.moderation_log (actor_id, action, target_type, target_user, reason)
  values (auth.uid(), 'remove_avatar', 'avatar', p_user, 'Photo de profil inappropriée');
end $$;
revoke all on function public.mod_remove_avatar(uuid, uuid) from public, anon;
grant execute on function public.mod_remove_avatar(uuid, uuid) to authenticated;

-- =====================================================================
-- Version 68 : modification d'un refuge déjà vérifié → en attente de validation par l'équipe
--   Le refuge reste vérifié (ses annonces restent en ligne) avec ses anciennes informations ;
--   les changements demandés sont gardés dans pending_changes jusqu'à la décision de l'équipe.
-- =====================================================================
alter table public.shelters add column if not exists pending_changes jsonb;
alter table public.shelters add column if not exists pending_at timestamptz;

create or replace function public.guard_shelter()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  new.updated_at := now();
  -- changements validés par l'équipe (admin_review_shelter_changes)
  if coalesce(current_setting('cyclami.apply_shelter', true), '') = 'on' then return new; end if;
  -- décision d'un administrateur (y compris sur sa propre demande : changement explicite du statut)
  if public.is_admin() and (new.user_id is distinct from auth.uid()
       or (tg_op = 'UPDATE' and new.status is distinct from old.status)) then
    if new.status is distinct from coalesce(old.status, '') then
      new.verified_by := auth.uid();
      new.verified_at := case when new.status = 'verified' then now() else null end;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.note := ''; new.verified_by := null; new.verified_at := null;
    new.pending_changes := null; new.pending_at := null;
    return new;
  end if;
  new.note := old.note; new.verified_by := old.verified_by; new.verified_at := old.verified_at;
  if old.status = 'verified' then
    -- refuge vérifié : la demande de changement attend l'équipe, la fiche publique ne change pas
    if new.name is distinct from old.name then changes := changes || jsonb_build_object('name', new.name); end if;
    if new.approval_number is distinct from old.approval_number then changes := changes || jsonb_build_object('approval_number', new.approval_number); end if;
    if new.region is distinct from old.region then changes := changes || jsonb_build_object('region', new.region); end if;
    if new.contact is distinct from old.contact then changes := changes || jsonb_build_object('contact', new.contact); end if;
    if new.address is distinct from old.address or new.lat is distinct from old.lat or new.lng is distinct from old.lng then
      changes := changes || jsonb_build_object('address', new.address, 'lat', new.lat, 'lng', new.lng);
    end if;
    new.name := old.name; new.approval_number := old.approval_number; new.region := old.region;
    new.contact := old.contact; new.address := old.address; new.lat := old.lat; new.lng := old.lng;
    new.status := 'verified';
    if changes <> '{}'::jsonb then
      new.pending_changes := changes;
      new.pending_at := now();
    else
      new.pending_changes := old.pending_changes; new.pending_at := old.pending_at;
    end if;
    return new;
  end if;
  -- demande pas encore validée (ou refusée) : corrigée directement, et repart en vérification
  new.pending_changes := null; new.pending_at := null;
  if new.name is distinct from old.name or new.approval_number is distinct from old.approval_number
     or new.region is distinct from old.region or old.status = 'rejected' then
    new.status := 'pending'; new.verified_by := null; new.verified_at := null;
  else
    new.status := old.status;
  end if;
  return new;
end $$;

-- décision de l'équipe sur une demande de modification (accepter : les nouvelles informations remplacent les anciennes)
create or replace function public.admin_review_shelter_changes(p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if not public.is_admin() then raise exception 'Action réservée à l’administration'; end if;
  select pending_changes into c from public.shelters where user_id = p_user;
  if c is null then raise exception 'Aucune modification en attente'; end if;
  perform set_config('cyclami.apply_shelter', 'on', true);
  if p_accept then
    update public.shelters set
      name = coalesce(c ->> 'name', name),
      approval_number = coalesce(c ->> 'approval_number', approval_number),
      region = coalesce(c ->> 'region', region),
      contact = coalesce(c ->> 'contact', contact),
      address = case when c ? 'address' then coalesce(c ->> 'address', '') else address end,
      lat = case when c ? 'lat' then (c ->> 'lat')::double precision else lat end,
      lng = case when c ? 'lng' then (c ->> 'lng')::double precision else lng end,
      pending_changes = null, pending_at = null, verified_by = auth.uid(), verified_at = now()
     where user_id = p_user;
  else
    update public.shelters set pending_changes = null, pending_at = null where user_id = p_user;
  end if;
  perform set_config('cyclami.apply_shelter', 'off', true);
  -- le refuge est prévenu de la décision
  insert into public.notifications (user_id, actor_id, type, data)
  select p_user, auth.uid(), 'shelter_status', jsonb_build_object('kind', case when p_accept then 'changes_accepted' else 'changes_refused' end, 'title', name)
    from public.shelters where user_id = p_user;
end $$;
revoke all on function public.admin_review_shelter_changes(uuid, boolean) from public, anon;
grant execute on function public.admin_review_shelter_changes(uuid, boolean) to authenticated;

-- =====================================================================
-- Version 69 : le refuge est prévenu des décisions de l'équipe (vérification acceptée ou refusée)
-- =====================================================================
create or replace function public.notify_shelter_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('verified', 'rejected') and new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, actor_id, type, data)
    values (new.user_id, auth.uid(), 'shelter_status', jsonb_build_object('kind', new.status, 'title', new.name, 'note', new.note));
  end if;
  return null;
end $$;
drop trigger if exists after_shelter_status on public.shelters;
create trigger after_shelter_status after update of status on public.shelters
  for each row execute function public.notify_shelter_status();

-- =====================================================================
-- Version 70 : rappel pour noter une garde, badge « Gardien de confiance »
--   1. Le lendemain de la fin d'une garde (jusqu'à 3 jours après), le propriétaire reçoit
--      « Comment s'est passée la garde ? Note … » s'il n'a pas encore noté la personne.
--   2. Gardien de confiance : au moins 3 gardes notées, moyenne de 4,5 étoiles ou plus.
-- =====================================================================
create or replace function private.send_sitting_rate_reminders(p_user uuid default null)
returns int language plpgsql security definer set search_path = public, private as $$
declare
  r record;
  n int := 0;
  today date := (now() at time zone 'Europe/Brussels')::date;
begin
  for r in
    select q.id as request_id, q.owner_id, o.sitter_id, coalesce(p.name, '') as pet_name
      from public.sitting_requests q
      join public.sitting_offers o on o.request_id = q.id and o.status = 'acceptee'
      left join public.pets p on p.id = q.pet_id
     where q.status <> 'annulee' and q.ends_on < today and q.ends_on >= today - 3
       and (p_user is null or q.owner_id = p_user)
       and not exists (select 1 from public.sitting_reviews v where v.request_id = q.id and v.sitter_id = o.sitter_id)
       and not exists (select 1 from public.notifications x where x.user_id = q.owner_id and x.type = 'sitting_rate'
                         and x.data ->> 'request_id' = q.id::text and x.actor_id = o.sitter_id)
  loop
    insert into public.notifications (user_id, actor_id, type, data)
    values (r.owner_id, r.sitter_id, 'sitting_rate', jsonb_build_object('title', r.pet_name, 'request_id', r.request_id));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.check_my_health_reminders()
returns int language sql security definer set search_path = public, private as $$
  select private.send_health_reminders(auth.uid()) + private.send_birthdays(auth.uid()) + private.send_sitting_rate_reminders(auth.uid());
$$;
revoke all on function public.check_my_health_reminders() from public, anon;
grant execute on function public.check_my_health_reminders() to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'cyclami-notes-garde';
    perform cron.schedule('cyclami-notes-garde', '10 9 * * *', 'select private.send_sitting_rate_reminders()');
  end if;
exception when others then
  raise notice 'pg_cron indisponible : rappels de note envoyés à l''ouverture du site (%)', sqlerrm;
end $$;

-- statistiques de garde de quelques membres : nombre d'avis, moyenne, gardien de confiance
create or replace function public.sitter_stats(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(sitter_id, jsonb_build_object('count', c, 'average', a, 'trusted', c >= 3 and a >= 4.5)), '{}'::jsonb)
    from (select sitter_id, count(*) as c, round(avg(rating)::numeric, 2) as a
            from public.sitting_reviews where sitter_id = any(p_ids) group by sitter_id) s;
$$;
revoke all on function public.sitter_stats(uuid[]) from public, anon;
grant execute on function public.sitter_stats(uuid[]) to authenticated;

-- le gardien est félicité quand il devient « Gardien de confiance » (une seule fois)
create or replace function public.notify_trusted_sitter()
returns trigger language plpgsql security definer set search_path = public as $$
declare c int; a numeric;
begin
  select count(*), avg(rating) into c, a from public.sitting_reviews where sitter_id = new.sitter_id;
  if c >= 3 and a >= 4.5 and not exists (select 1 from public.notifications where user_id = new.sitter_id and type = 'trusted_sitter') then
    insert into public.notifications (user_id, type, data) values (new.sitter_id, 'trusted_sitter', jsonb_build_object('count', c));
  end if;
  return null;
end $$;
drop trigger if exists after_sitting_review_trusted on public.sitting_reviews;
create trigger after_sitting_review_trusted after insert on public.sitting_reviews
  for each row execute function public.notify_trusted_sitter();

-- =====================================================================
-- Version 71 : don de matériel entre voisins (cage, laisse, panier, croquettes entamées…)
--   Uniquement des objets, toujours gratuits : jamais d'animaux (même filtre que le reste du site).
--   La position est celle du profil (déjà arrondie à ~1 km).
-- =====================================================================
create table if not exists public.gear_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  body text not null default '' check (char_length(body) <= 500),
  category text not null default 'autre' check (category in ('couchage', 'transport', 'alimentation', 'jouets', 'soins', 'promenade', 'autre')),
  species text not null default 'tous' check (species in ('chien', 'chat', 'rongeur', 'oiseau', 'autre', 'tous')),
  photo_url text check (photo_url is null or char_length(photo_url) <= 500),
  city text not null default '',
  lat double precision,
  lng double precision,
  status text not null default 'dispo' check (status in ('dispo', 'reserve', 'donne')),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gear_items_recent_idx on public.gear_items (created_at desc) where status <> 'donne';
create index if not exists gear_items_owner_idx on public.gear_items (owner_id);
alter table public.gear_items enable row level security;

drop policy if exists "objets visibles" on public.gear_items;
create policy "objets visibles" on public.gear_items for select to authenticated
  using ((hidden_at is null and not public.is_blocked_with(owner_id)) or owner_id = auth.uid() or public.is_staff());
drop policy if exists "donner un objet" on public.gear_items;
create policy "donner un objet" on public.gear_items for insert to authenticated
  with check (owner_id = auth.uid() and public.is_own_photo_url(photo_url));
drop policy if exists "modifier son objet" on public.gear_items;
create policy "modifier son objet" on public.gear_items for update to authenticated
  using (owner_id = auth.uid() or public.is_staff()) with check ((owner_id = auth.uid() and public.is_own_photo_url(photo_url)) or public.is_staff());
drop policy if exists "retirer son objet" on public.gear_items;
create policy "retirer son objet" on public.gear_items for delete to authenticated
  using (owner_id = auth.uid() or public.is_staff());

-- ville et position copiées du profil ; 10 objets par jour au plus
create or replace function public.prepare_gear_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select city, lat, lng into new.city, new.lat, new.lng from public.profiles where id = new.owner_id;
    new.created_at := now();
    new.hidden_at := null;
    if not public.is_staff() and (select count(*) from public.gear_items where owner_id = new.owner_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Trop d''objets publiés aujourd''hui : réessaie demain';
    end if;
  elsif not public.is_staff() then
    new.owner_id := old.owner_id; new.created_at := old.created_at; new.hidden_at := old.hidden_at;
    new.city := old.city; new.lat := old.lat; new.lng := old.lng;
  end if;
  return new;
end $$;
drop trigger if exists before_gear_item on public.gear_items;
create trigger before_gear_item before insert or update on public.gear_items
  for each row execute function public.prepare_gear_item();
drop trigger if exists before_insert_guard on public.gear_items;
create trigger before_insert_guard before insert on public.gear_items
  for each row execute function public.guard_member_activity();
drop trigger if exists before_block_animal_trade on public.gear_items;
create trigger before_block_animal_trade before insert or update on public.gear_items
  for each row execute function public.block_animal_trade();
drop trigger if exists before_cooldown on public.gear_items;
create trigger before_cooldown before insert on public.gear_items
  for each row execute function public.enforce_cooldown('owner_id', '30');

-- =====================================================================
-- Version 72 : dons pour soutenir le site (ponctuels ou mensuels)
--   Les paiements passent par un service externe (Stripe, Ko-fi, Liberapay, PayPal…) : Cyclami ne
--   voit ni ne garde aucune donnée bancaire. L'administrateur colle les deux liens dans l'administration.
-- =====================================================================
create or replace function public.donation_links()
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'once', (select value from private.settings where key = 'donate_once'),
    'monthly', (select value from private.settings where key = 'donate_monthly'));
$$;
revoke all on function public.donation_links() from public;
grant execute on function public.donation_links() to anon, authenticated;

create or replace function public.admin_set_donation_links(p_once text, p_monthly text)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  k text; v text;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  foreach k in array array['donate_once', 'donate_monthly'] loop
    v := nullif(trim(case when k = 'donate_once' then p_once else p_monthly end), '');
    if v is null then
      delete from private.settings where key = k;
    elsif v !~ '^https://\S{4,}$' or length(v) > 500 then
      raise exception 'Lien de don invalide : il doit commencer par https://';
    else
      insert into private.settings (key, value) values (k, v) on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
end $$;
revoke all on function public.admin_set_donation_links(text, text) from public, anon;
grant execute on function public.admin_set_donation_links(text, text) to authenticated;

-- =====================================================================
-- Version 73 : lieux favoris (parcs, espaces chiens, points d'eau… d'OpenStreetMap), visibles par soi seul
-- =====================================================================
create table if not exists public.place_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id text not null check (char_length(place_id) between 2 and 40),
  kind text not null default 'park' check (char_length(kind) <= 20),
  name text not null default '' check (char_length(name) <= 150),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table public.place_favorites enable row level security;
drop policy if exists "mes lieux favoris" on public.place_favorites;
create policy "mes lieux favoris" on public.place_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- 200 favoris au plus
create or replace function public.limit_place_favorites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.place_favorites where user_id = new.user_id) >= 200 then
    raise exception 'Trop de lieux favoris (200 au maximum)';
  end if;
  return new;
end $$;
drop trigger if exists before_place_favorite on public.place_favorites;
create trigger before_place_favorite before insert on public.place_favorites
  for each row execute function public.limit_place_favorites();

-- =====================================================================
-- Version 74 : matériel entre voisins — don ou vente d'affaires pour animaux (jamais d'animaux)
--   Le prix est indicatif : Cyclami ne gère aucun paiement, les membres s'arrangent entre eux.
-- =====================================================================
alter table public.gear_items add column if not exists kind text not null default 'don';
alter table public.gear_items add column if not exists price_cents int;
alter table public.gear_items drop constraint if exists gear_items_kind_check;
alter table public.gear_items add constraint gear_items_kind_check check (kind in ('don', 'vente'));
alter table public.gear_items drop constraint if exists gear_items_price_check;
alter table public.gear_items add constraint gear_items_price_check check (
  (kind = 'don' and price_cents is null) or (kind = 'vente' and price_cents between 50 and 200000));

-- =====================================================================
-- Version 75 : plusieurs photos par annonce de matériel (6 au total : la principale + 5)
-- =====================================================================
alter table public.gear_items add column if not exists extra_photos text[] not null default '{}';
alter table public.gear_items drop constraint if exists gear_items_extra_photos_max;
alter table public.gear_items add constraint gear_items_extra_photos_max check (cardinality(extra_photos) <= 5);
alter table public.gear_items drop constraint if exists gear_items_extra_photos_own;
alter table public.gear_items add constraint gear_items_extra_photos_own check (public.are_own_photo_urls(extra_photos)) not valid;

-- =====================================================================
-- Version 76 : espèce « Autre » → on précise quel animal c'est (rangé dans « race » : furet, tortue…)
--   Seulement pour les nouveaux animaux et les modifications (anciens profils inchangés).
-- =====================================================================
alter table public.pets drop constraint if exists pets_other_species_named;
alter table public.pets add constraint pets_other_species_named check (species <> 'autre' or char_length(trim(breed)) >= 2) not valid;

-- =====================================================================
-- Version 77 : jeux (quiz du jour, memory des animaux, attrape la balle)
--   Un meilleur score par membre, par jeu et par jour ; classements du jour et de la semaine.
--   Les scores sont bornés (impossible d'envoyer un score irréaliste) et les points d'XP plafonnés
--   (quiz : 2 par bonne réponse, une fois par jour ; memory et balle : 5 par jour en finissant une partie).
-- =====================================================================
create table if not exists public.game_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (game in ('quiz', 'memory', 'ball')),
  day date not null,
  score int not null,
  duration_ms int not null default 0 check (duration_ms between 0 and 3600000),
  created_at timestamptz not null default now(),
  primary key (user_id, game, day)
);
create index if not exists game_scores_day_idx on public.game_scores (game, day);
alter table public.game_scores enable row level security;
drop policy if exists "scores visibles" on public.game_scores;
create policy "scores visibles" on public.game_scores for select to authenticated using (true);

-- enregistre une partie : garde le meilleur score du jour, donne les points d'XP
create or replace function public.submit_game_score(p_game text, p_score int, p_duration_ms int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Europe/Brussels')::date;
  better boolean;
  prev public.game_scores;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_game = 'quiz' and (p_score < 0 or p_score > 5) then raise exception 'Score invalide'; end if;
  if p_game = 'memory' and (p_score < 8 or p_score > 300) then raise exception 'Score invalide'; end if;
  if p_game = 'ball' and (p_score < 0 or p_score > 80) then raise exception 'Score invalide'; end if;
  if p_game not in ('quiz', 'memory', 'ball') then raise exception 'Jeu inconnu'; end if;
  select * into prev from public.game_scores where user_id = me and game = p_game and day = today;
  -- quiz : une seule partie par jour (mêmes questions pour tout le monde)
  if p_game = 'quiz' and prev.user_id is not null then
    return jsonb_build_object('saved', false, 'best', prev.score, 'already', true);
  end if;
  better := prev.user_id is null
    or (p_game = 'memory' and (p_score < prev.score or (p_score = prev.score and p_duration_ms < prev.duration_ms)))
    or (p_game <> 'memory' and (p_score > prev.score or (p_score = prev.score and p_duration_ms < prev.duration_ms)));
  if better then
    insert into public.game_scores (user_id, game, day, score, duration_ms) values (me, p_game, today, p_score, greatest(0, least(p_duration_ms, 3600000)))
    on conflict (user_id, game, day) do update set score = excluded.score, duration_ms = excluded.duration_ms, created_at = now();
  end if;
  if p_game = 'quiz' and p_score > 0 then
    perform public.xp_award(me, 'game_quiz', today::text, p_score * 2);
  elsif p_game = 'memory' then
    perform public.xp_award(me, 'game_memory', today::text, 5);
  elsif p_game = 'ball' and p_score >= 10 then
    perform public.xp_award(me, 'game_ball', today::text, 5);
  end if;
  return jsonb_build_object('saved', better, 'best', case when better then p_score else prev.score end);
end $$;
revoke all on function public.submit_game_score(text, int, int) from public, anon;
grant execute on function public.submit_game_score(text, int, int) to authenticated;

-- classement d'un jeu : aujourd'hui (p_days = 1) ou sur 7 jours (meilleur score de chaque membre)
create or replace function public.game_leaderboard(p_game text, p_days int default 1)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select distinct on (s.user_id) s.user_id, s.score, s.duration_ms
      from public.game_scores s
     where s.game = p_game and s.day > (now() at time zone 'Europe/Brussels')::date - greatest(1, least(p_days, 30))
       and not public.is_blocked_with(s.user_id)
     order by s.user_id,
              case when p_game = 'memory' then s.score else -s.score end, s.duration_ms)
  select coalesce(jsonb_agg(jsonb_build_object('id', b.user_id, 'name', p.name, 'avatar_url', p.avatar_url, 'score', b.score, 'duration_ms', b.duration_ms)
           order by case when p_game = 'memory' then b.score else -b.score end, b.duration_ms), '[]')
    from (select * from b order by case when p_game = 'memory' then score else -score end, duration_ms limit 20) b
    join public.profiles p on p.id = b.user_id;
$$;
revoke all on function public.game_leaderboard(text, int) from public, anon;
grant execute on function public.game_leaderboard(text, int) to authenticated;

-- mes scores du jour (pour savoir si le quiz est déjà fait)
create or replace function public.my_game_scores()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(game, jsonb_build_object('score', score, 'duration_ms', duration_ms)), '{}'::jsonb)
    from public.game_scores where user_id = auth.uid() and day = (now() at time zone 'Europe/Brussels')::date;
$$;
revoke all on function public.my_game_scores() from public, anon;
grant execute on function public.my_game_scores() to authenticated;

-- =====================================================================
-- Version 78 : tchat général (tous les membres, en temps réel)
--   500 caractères par message, 8 messages par minute, liens seulement après 3 jours d'ancienneté,
--   messages des membres bloqués cachés, signalables et modérables comme le reste.
-- =====================================================================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);
create index if not exists chat_messages_author_idx on public.chat_messages (author_id, created_at desc);
alter table public.chat_messages enable row level security;

drop policy if exists "lire le tchat général" on public.chat_messages;
create policy "lire le tchat général" on public.chat_messages
  for select to authenticated using (
    (hidden_at is null and not public.is_blocked_with(author_id)) or author_id = auth.uid() or public.is_staff());
drop policy if exists "écrire dans le tchat général" on public.chat_messages;
create policy "écrire dans le tchat général" on public.chat_messages
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "supprimer son message du tchat" on public.chat_messages;
create policy "supprimer son message du tchat" on public.chat_messages
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

create or replace function public.prepare_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
begin
  if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
    raise exception 'Ton compte est suspendu';
  end if;
  new.body := btrim(new.body);
  if new.body = '' then raise exception 'Message vide'; end if;
  if not public.is_staff() then
    if (select count(*) from public.chat_messages where author_id = new.author_id and created_at > now() - interval '1 minute') >= 8 then
      raise exception 'Trop de messages d''un coup : patiente une minute';
    end if;
    if (select count(*) from public.chat_messages where author_id = new.author_id and created_at > now() - interval '1 day') >= 200 then
      raise exception 'Trop de messages aujourd''hui : réessaie demain';
    end if;
    select created_at into joined from public.profiles where id = new.author_id;
    if new.body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|be|fr|net|org|io|me|ly)\M)' and joined > now() - interval '3 days' then
      raise exception 'Les liens sont autorisés dans le tchat après 3 jours sur Cyclami';
    end if;
  end if;
  new.hidden_at := null;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists before_chat_message on public.chat_messages;
create trigger before_chat_message before insert on public.chat_messages
  for each row execute function public.prepare_chat_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
exception when undefined_object then
  raise notice 'publication supabase_realtime absente (base de test)';
end $$;

-- le tchat ne garde que les 90 derniers jours
delete from public.chat_messages where created_at < now() - interval '90 days';

-- =====================================================================
-- Version 79 : « Donner mon avis / signaler un bug »
--   Texte, capture d'écran facultative, page et appareil ; lus seulement par les administrateurs.
-- =====================================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'autre' check (kind in ('bug', 'idee', 'autre')),
  body text not null check (char_length(body) between 3 and 2000),
  page text not null default '' check (char_length(page) <= 40),
  device jsonb not null default '{}'::jsonb,
  photo_url text check (photo_url is null or (char_length(photo_url) <= 500 and photo_url ~ '^https://')),
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;

drop policy if exists "envoyer un avis" on public.feedback;
create policy "envoyer un avis" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "avis lus par les administrateurs" on public.feedback;
create policy "avis lus par les administrateurs" on public.feedback
  for select to authenticated using (public.is_admin() or user_id = auth.uid());
drop policy if exists "avis traités par les administrateurs" on public.feedback;
create policy "avis traités par les administrateurs" on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "avis supprimés par les administrateurs" on public.feedback;
create policy "avis supprimés par les administrateurs" on public.feedback
  for delete to authenticated using (public.is_admin());

create or replace function public.prepare_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Merci pour tous ces retours ! Tu pourras en envoyer d''autres demain.';
  end if;
  new.status := 'new';
  new.created_at := now();
  -- l'appareil : quelques champs courts seulement
  new.device := jsonb_strip_nulls(jsonb_build_object(
    'ua', left(new.device->>'ua', 300), 'screen', left(new.device->>'screen', 20), 'lang', left(new.device->>'lang', 10),
    'standalone', left(new.device->>'standalone', 5), 'theme', left(new.device->>'theme', 10), 'version', left(new.device->>'version', 40)));
  return new;
end $$;
drop trigger if exists before_feedback on public.feedback;
create trigger before_feedback before insert on public.feedback
  for each row execute function public.prepare_feedback();

-- les administrateurs sont prévenus de chaque nouvel avis
create or replace function public.notify_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, data)
  select a.user_id, new.user_id, 'feedback', jsonb_build_object('kind', new.kind, 'excerpt', left(new.body, 120))
    from public.admins a where a.role = 'admin' and a.user_id is distinct from new.user_id;
  return null;
end $$;
drop trigger if exists after_feedback on public.feedback;
create trigger after_feedback after insert on public.feedback
  for each row execute function public.notify_feedback();

-- =====================================================================
-- Version 80 : badge « Pionnier » pour les 100 premiers membres
-- =====================================================================
-- rang d'inscription du membre s'il fait partie des 100 premiers, sinon null
create or replace function public.pioneer_rank(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select r from (
    select id, row_number() over (order by created_at, id)::int as r from public.profiles
  ) x where x.id = p_user and x.r <= 100;
$$;
revoke all on function public.pioneer_rank(uuid) from public, anon;
grant execute on function public.pioneer_rank(uuid) to authenticated;

-- =====================================================================
-- Version 81 : alerte « animal perdu / trouvé » visible sans compte (lien de l'affiche à QR code)
--   Ni le propriétaire ni la position exacte : seulement l'animal, le lieu décrit et la date.
-- =====================================================================
create or replace function public.public_lost_alert(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'kind', a.kind, 'name', a.name, 'species', a.species,
           'description', a.description, 'photo_url', a.photo_url, 'place', a.place,
           'seen_at', a.seen_at, 'status', a.status)
    from public.lost_alerts a
   where a.id = p_id and a.hidden_at is null and (a.status = 'active' or a.resolved_at > now() - interval '30 days');
$$;
revoke all on function public.public_lost_alert(uuid) from public;
grant execute on function public.public_lost_alert(uuid) to anon, authenticated;

-- =====================================================================
-- Version 82 : tchat général — répondre à un message, @mentions, photos, membres en ligne
-- =====================================================================
alter table public.chat_messages add column if not exists reply_to uuid references public.chat_messages (id) on delete set null;
alter table public.chat_messages add column if not exists photo_url text;
alter table public.chat_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.chat_messages add column if not exists audio_path text; -- vocaux (version 88)
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check
  check (char_length(body) <= 500 and (char_length(body) >= 1 or photo_url is not null or audio_path is not null));
alter table public.chat_messages drop constraint if exists chat_messages_photo_check;
alter table public.chat_messages add constraint chat_messages_photo_check
  check (photo_url is null or (char_length(photo_url) <= 500 and photo_url ~ '^https://'));

create or replace function public.prepare_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
begin
  if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
    raise exception 'Ton compte est suspendu';
  end if;
  new.body := btrim(coalesce(new.body, ''));
  if new.body = '' and new.photo_url is null and new.audio_path is null then raise exception 'Message vide'; end if;
  if not public.is_staff() then
    if (select count(*) from public.chat_messages where author_id = new.author_id and created_at > now() - interval '1 minute') >= 8 then
      raise exception 'Trop de messages d''un coup : patiente une minute';
    end if;
    if (select count(*) from public.chat_messages where author_id = new.author_id and created_at > now() - interval '1 day') >= 200 then
      raise exception 'Trop de messages aujourd''hui : réessaie demain';
    end if;
    select created_at into joined from public.profiles where id = new.author_id;
    if new.body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|be|fr|net|org|io|me|ly)\M)' and joined > now() - interval '3 days' then
      raise exception 'Les liens sont autorisés dans le tchat après 3 jours sur Cyclami';
    end if;
  end if;
  -- réponse : seulement à un message visible du tchat
  if new.reply_to is not null and not exists (select 1 from public.chat_messages where id = new.reply_to and hidden_at is null) then
    new.reply_to := null;
  end if;
  -- mentions : au plus 5 membres dont le « @prénom » figure vraiment dans le message (jamais soi-même)
  new.mentions := coalesce((
    select array_agg(p.id) from (
      select distinct p.id from public.profiles p
       where p.id = any (coalesce(new.mentions, '{}')) and p.id <> new.author_id
         and position(lower('@' || p.name) in lower(new.body)) > 0
       limit 5) p), '{}');
  new.hidden_at := null;
  new.created_at := now();
  return new;
end $$;

-- prévient les membres mentionnés et l'auteur du message auquel on répond
-- (au plus une notification non lue par personne toutes les 10 minutes)
create or replace function public.notify_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, data)
  select u.uid, new.author_id, 'chat_mention', jsonb_build_object('excerpt', left(coalesce(nullif(new.body, ''), case when new.audio_path is not null then '🎤' else '📷' end), 120), 'reply', u.reply)
    from (
      select distinct on (x.uid) x.uid, x.reply from (
        select unnest(new.mentions) as uid, false as reply
        union all
        select author_id, true from public.chat_messages where id = new.reply_to
      ) x order by x.uid, x.reply desc
    ) u
   where u.uid <> new.author_id
     and not exists (select 1 from public.blocks b where (b.blocker_id = u.uid and b.blocked_id = new.author_id)
                                                     or (b.blocker_id = new.author_id and b.blocked_id = u.uid))
     and not exists (select 1 from public.notifications n where n.user_id = u.uid and n.type = 'chat_mention'
                       and n.read_at is null and n.created_at > now() - interval '10 minutes');
  return null;
end $$;
drop trigger if exists after_chat_message on public.chat_messages;
create trigger after_chat_message after insert on public.chat_messages
  for each row execute function public.notify_chat_message();

-- nombre de membres en ligne (actifs ces 5 dernières minutes), sans dire qui
create or replace function public.online_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles where last_seen_at > now() - interval '5 minutes';
$$;
revoke all on function public.online_count() from public, anon;
grant execute on function public.online_count() to authenticated;

-- =====================================================================
-- Version 83 : refuges — suivi des propositions et relance unique
--   Pour chaque proposition : le refuge s'est-il inscrit ? a-t-il répondu ?
--   Relance : une seule fois, au plus tôt 14 jours après la proposition, seulement aux refuges
--   qui n'ont ni répondu, ni créé de compte, ni demandé à ne plus être contactés.
-- =====================================================================
alter table private.shelter_invites add column if not exists relaunched_at timestamptz;

create or replace function private.shelter_invite_state(p_email text)
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'joined', exists (select 1 from auth.users u join public.shelters s on s.user_id = u.id where lower(u.email) = lower(p_email)),
    'replied', exists (select 1 from private.shelter_messages m where lower(m.email) = lower(p_email) and m.direction = 'in'));
$$;

-- propositions à relancer (la plus récente de chaque adresse)
create or replace function private.shelters_to_relaunch()
returns setof private.shelter_invites language sql stable security definer set search_path = public, private as $$
  select i.* from private.shelter_invites i
   where not i.is_test and not i.opted_out and i.relaunched_at is null
     and i.created_at < now() - interval '14 days'
     and not exists (select 1 from private.shelter_invites j where lower(j.email) = lower(i.email) and not j.is_test
                       and (j.created_at > i.created_at or j.opted_out or j.relaunched_at is not null))
     and not (private.shelter_invite_state(i.email) ->> 'joined')::boolean
     and not (private.shelter_invite_state(i.email) ->> 'replied')::boolean
   order by i.created_at;
$$;

create or replace function public.admin_shelter_invites()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'shelter_name', i.shelter_name, 'lang', i.lang,
      'opted_out', i.opted_out, 'created_at', i.created_at, 'sent_by', p.name, 'relaunched_at', i.relaunched_at,
      'joined', (st ->> 'joined')::boolean, 'replied', (st ->> 'replied')::boolean,
      'can_relaunch', i.id in (select id from private.shelters_to_relaunch())) order by i.created_at desc)
    from (select *, private.shelter_invite_state(email) as st from private.shelter_invites where not is_test order by created_at desc limit 500) i
    left join public.profiles p on p.id = i.sent_by), '[]');
end $$;
revoke all on function public.admin_shelter_invites() from public, anon;
grant execute on function public.admin_shelter_invites() to authenticated;

-- Relance (au plus p_max refuges par appel, 30 maximum) : court rappel vers la page « Refuges »
create or replace function public.admin_relaunch_shelters(p_max int default 20)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  inv private.shelter_invites;
  me text := coalesce((select name from public.profiles where id = auth.uid()), '');
  nm text; hello text; subj text; body text; button text; foot text;
  sent int := 0;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  for inv in select * from private.shelters_to_relaunch() limit greatest(1, least(coalesce(p_max, 20), 30)) loop
    nm := inv.shelter_name;
    if inv.lang = 'nl' then
      hello := case when nm <> '' then 'Beste team van « ' || nm || ' »,' else 'Geachte mevrouw, geachte heer,' end;
      subj := 'Herinnering: uw dieren gratis ter adoptie op Cyclami';
      body := 'Enkele weken geleden stelde ik u Cyclami voor, het gratis netwerk voor dierenbaasjes in België en Frankrijk, waar de rubriek Adopties voorbehouden is aan erkende asielen.'
        || E'\n\n' || 'Sindsdien is het nog eenvoudiger geworden: u kunt zich inschrijven zonder een eigen dier voor te stellen, en al uw dieren in één keer importeren vanuit een spreadsheet (Excel, Google Sheets). Alles staat uitgelegd op één pagina.'
        || E'\n\n' || 'Is het nu geen goed moment, of heeft u vragen? Beantwoord gewoon deze e-mail. Dit is ons laatste bericht, tenzij u ons antwoordt.'
        || E'\n\n' || 'Met vriendelijke groeten,' || E'\n' || case when me <> '' then me || ', voor het Cyclami-team' else 'Het Cyclami-team' end;
      button := 'Alles over Cyclami voor asielen';
      foot := 'Laatste bericht: antwoord « STOP » als u niet meer gecontacteerd wilt worden. —';
    elsif inv.lang = 'en' then
      hello := case when nm <> '' then 'Dear “' || nm || '” team,' else 'Dear Sir or Madam,' end;
      subj := 'Reminder: list your animals for adoption on Cyclami, for free';
      body := 'A few weeks ago I introduced Cyclami, the free network for pet owners in Belgium and France, whose Adoptions section is reserved for licensed shelters.'
        || E'\n\n' || 'It is now even simpler: you can register without presenting a pet of your own, and import all your animals at once from a spreadsheet (Excel, Google Sheets). Everything is explained on a single page.'
        || E'\n\n' || 'Not the right time, or any questions? Simply reply to this email. This is our last message unless you reply.'
        || E'\n\n' || 'Kind regards,' || E'\n' || case when me <> '' then me || ', on behalf of the Cyclami team' else 'The Cyclami team' end;
      button := 'Cyclami for shelters';
      foot := 'Last message: reply “STOP” if you would rather not be contacted again. —';
    else
      hello := case when nm <> '' then 'Bonjour à toute l’équipe de « ' || nm || ' »,' else 'Madame, Monsieur,' end;
      subj := 'Petit rappel : vos animaux à l’adoption sur Cyclami, gratuitement';
      body := 'Il y a quelques semaines, je vous ai présenté Cyclami, le réseau gratuit des propriétaires d’animaux en Belgique et en France, dont la rubrique Adoptions est réservée aux refuges agréés.'
        || E'\n\n' || 'Depuis, c’est encore plus simple : vous pouvez vous inscrire sans présenter d’animal personnel, et importer tous vos animaux d’un coup depuis un tableur (Excel, Google Sheets). Tout est expliqué sur une seule page.'
        || E'\n\n' || 'Ce n’est pas le bon moment, ou vous avez des questions ? Répondez simplement à cet e-mail. C’est notre dernier message, sauf si vous nous répondez.'
        || E'\n\n' || 'Avec mes salutations les meilleures,' || E'\n' || case when me <> '' then me || ', pour l’équipe Cyclami' else 'L’équipe Cyclami' end;
      button := 'Cyclami pour les refuges';
      foot := 'Dernier message : répondez « STOP » si vous ne souhaitez plus être contacté. —';
    end if;
    perform private.send_shelter_mail(lower(inv.email), nm, subj, hello, body, button, foot, inv.lang);
    update private.shelter_invites set relaunched_at = now() where id = inv.id;
    insert into private.shelter_messages (email, invite_id, direction, subject, body, sent_by)
    values (lower(inv.email), inv.id, 'out', subj, hello || E'\n\n' || body, auth.uid());
    sent := sent + 1;
  end loop;
  if sent > 0 then
    insert into public.moderation_log (actor_id, action, target_type, target_name, reason)
    values (auth.uid(), 'relance refuges', 'invite', sent || ' refuge(s)', '');
  end if;
  return jsonb_build_object('sent', sent, 'remaining', (select count(*) from private.shelters_to_relaunch()));
end $$;
revoke all on function public.admin_relaunch_shelters(int) from public, anon;
grant execute on function public.admin_relaunch_shelters(int) to authenticated;

-- =====================================================================
-- Version 84 : supprimer un compte (administrateur), sans bloquer l'adresse e-mail
--   Contrairement au bannissement, la personne pourra se réinscrire. Jamais un membre de l'équipe.
-- =====================================================================
create or replace function public.admin_delete_user(target uuid, reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if target = auth.uid() or target = public.owner_id() or exists (select 1 from public.admins where user_id = target) then
    raise exception 'Impossible de supprimer le compte d''un membre de l''équipe';
  end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'Compte introuvable'; end if;
  perform public.log_moderation('suppression du compte', 'user', null, target, coalesce(reason, ''));
  delete from auth.users where id = target;
end $$;
revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- =====================================================================
-- Version 85 : tableau de bord de l'administration
--   Tendances (cette semaine / la précédente), activité, entraide, et ce qui attend une action.
-- =====================================================================
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public, private as $$
declare
  admin boolean := public.is_admin();
begin
  if not public.is_staff() then raise exception 'Réservé à l''équipe du site'; end if;
  return json_build_object(
    'members', (select count(*) from public.profiles),
    'members_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'members_prev_7d', (select count(*) from public.profiles where created_at between now() - interval '14 days' and now() - interval '7 days'),
    'active_7d', (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
    'online', (select count(*) from public.profiles where last_seen_at > now() - interval '5 minutes'),
    'pets', (select count(*) from public.pets),
    'rides_upcoming', (select count(*) from public.rides where starts_at > now() and hidden_at is null),
    'rides_7d', (select count(*) from public.rides where created_at > now() - interval '7 days'),
    'posts', (select count(*) from public.posts),
    'posts_7d', (select count(*) from public.posts where created_at > now() - interval '7 days'),
    'messages', (select count(*) from public.messages),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'chat_7d', (select count(*) from public.chat_messages where created_at > now() - interval '7 days'),
    'lost_active', (select count(*) from public.lost_alerts where status = 'active' and hidden_at is null),
    'listings_active', (select count(*) from public.listings where status in ('active', 'reserve') and hidden_at is null),
    'shelters_verified', (select count(*) from public.shelters where status = 'verified'),
    'signups_14d', (select coalesce(json_agg(json_build_object('day', d.day, 'n', coalesce(c.n, 0)) order by d.day), '[]'::json)
                      from generate_series(current_date - 13, current_date, interval '1 day') as d(day)
                      left join (select created_at::date as day, count(*) as n from public.profiles
                                  where created_at >= current_date - 13 group by 1) c on c.day = d.day),
    -- à traiter
    'reports_open', (select count(*) from public.reports where resolved_at is null),
    'feedback_new', case when admin then (select count(*) from public.feedback where status = 'new') end,
    'shelters_pending', case when admin then (select count(*) from public.shelters where status = 'pending') end,
    'shelter_changes', case when admin then (select count(*) from public.shelters where status = 'verified' and pending_changes is not null) end,
    'shelter_replies', case when admin then (select count(*) from private.shelter_messages where direction = 'in' and read_at is null) end,
    'errors_24h', case when admin then (select count(*) from public.client_errors where last_at > now() - interval '1 day') end
  );
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;


-- =====================================================================
-- Version 86 : pages publiques par ville — « Sorties et rencontres entre chiens à … » (/sorties/<ville>)
--   et « Animaux perdus à … » (/perdus/<ville>). Seulement des chiffres et des informations publiques :
--   aucun membre n'est nommé, aucune position exacte n'est renvoyée.
-- =====================================================================
create or replace function private.km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * acos(least(1, greatest(-1, cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1))
                                            + sin(radians(lat1)) * sin(radians(lat2)))));
$$;

create or replace function public.public_city(p_lat double precision, p_lng double precision, p_km double precision default 15)
returns jsonb language sql stable security definer set search_path = public as $$
  with near as (
    select p.id from public.profiles p
     where p.lat is not null and p.lat between p_lat - 1 and p_lat + 1 and p.lng between p_lng - 1.5 and p_lng + 1.5
       and private.km(p_lat, p_lng, p.lat, p.lng) <= least(p_km, 30)
  ), animals as (
    select a.* from public.pets a join near n on n.id = a.owner_id
  )
  select jsonb_build_object(
    'members', (select count(*) from near),
    'pets', (select count(*) from animals),
    'dogs', (select count(*) from animals where species = 'chien'),
    'cats', (select count(*) from animals where species = 'chat'),
    -- races présentes chez au moins deux membres (pas de texte isolé)
    'breeds', (select coalesce(jsonb_agg(b order by n desc, b), '[]') from (
                 select initcap(lower(trim(breed))) as b, count(distinct owner_id) as n from animals
                  where species = 'chien' and char_length(trim(breed)) between 3 and 40
                  group by 1 having count(distinct owner_id) >= 2 order by 2 desc limit 8) x),
    'rides', (select coalesce(jsonb_agg(x order by x.starts_at), '[]') from (
                select w.id, w.title, w.place, w.starts_at, w.duration, w.pace, w.max_participants,
                       (select count(*) from public.ride_participants wp where wp.ride_id = w.id) as participants
                  from public.rides w
                 where w.hidden_at is null and w.starts_at > now() and w.lat is not null
                   and private.km(p_lat, p_lng, w.lat, w.lng) <= least(p_km, 30) + 5
                 order by w.starts_at limit 30) x),
    'lost_active', (select count(*) from public.lost_alerts a where a.status = 'active' and a.hidden_at is null
                      and private.km(p_lat, p_lng, a.lat, a.lng) <= least(p_km, 30) + 10),
    'shelters', (select coalesce(jsonb_agg(x order by x.name), '[]') from (
                   select s.user_id as id, s.name, s.address,
                          (select count(*) from public.listings l where l.seller_id = s.user_id and l.status in ('active', 'reserve') and l.hidden_at is null) as animals
                     from public.shelters s
                    where s.status = 'verified' and s.lat is not null
                      and private.km(p_lat, p_lng, s.lat, s.lng) <= least(p_km, 30) + 15
                    limit 20) x)
  );
$$;
revoke all on function public.public_city(double precision, double precision, double precision) from public;
grant execute on function public.public_city(double precision, double precision, double precision) to anon, authenticated;

-- Alertes « perdu / trouvé » en cours (et retrouvés depuis moins de 30 jours), autour d'un point ou partout.
-- Le lieu décrit et la date, mais pas la position exacte ni le propriétaire.
create or replace function public.public_lost_alerts(p_lat double precision default null, p_lng double precision default null, p_km double precision default 25)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.solved, x.seen_at desc), '[]') from (
    select a.id, a.kind, a.name, a.species, a.photo_url, a.place, a.seen_at, a.status, a.status <> 'active' as solved,
           -- position arrondie (~10 km) : seulement pour ranger l'alerte dans la bonne ville
           round(a.lat::numeric, 1) as lat, round(a.lng::numeric, 1) as lng
      from public.lost_alerts a
     where a.hidden_at is null and (a.status = 'active' or a.resolved_at > now() - interval '30 days')
       and (p_lat is null or private.km(p_lat, p_lng, a.lat, a.lng) <= least(p_km, 50))
     order by a.status <> 'active', a.seen_at desc limit 100) x;
$$;
revoke all on function public.public_lost_alerts(double precision, double precision, double precision) from public;
grant execute on function public.public_lost_alerts(double precision, double precision, double precision) to anon, authenticated;

-- =====================================================================
-- Version 87 : rappel la veille d'une sortie, et « nouveau membre près de chez toi »
--   1. Chaque jour vers 18 h, l'organisateur et les participants d'une sortie prévue le lendemain
--      reçoivent un rappel (notification, e-mail selon leurs préférences, téléphone).
--   2. Quand un membre présente son premier animal, les membres actifs à moins de 5 km sont prévenus
--      (au plus une fois par jour chacun, jamais entre membres qui se sont bloqués).
-- =====================================================================
create or replace function private.send_ride_reminders(p_user uuid default null)
returns int language plpgsql security definer set search_path = public, private as $$
declare
  r record;
  n int := 0;
  tomorrow date := (now() at time zone 'Europe/Brussels')::date + 1;
begin
  for r in
    select w.id, w.title, w.place, w.starts_at, x.uid
      from public.rides w
      cross join lateral (select w.host_id as uid union select p.user_id from public.ride_participants p where p.ride_id = w.id) x
     where w.hidden_at is null and (w.starts_at at time zone 'Europe/Brussels')::date = tomorrow
       and (p_user is null or x.uid = p_user)
       and not exists (select 1 from public.notifications o where o.user_id = x.uid and o.type = 'ride_reminder' and o.ride_id = w.id)
  loop
    insert into public.notifications (user_id, actor_id, type, ride_id, data)
    values (r.uid, null, 'ride_reminder', r.id, jsonb_build_object('title', r.title, 'place', r.place,
            'time', to_char(r.starts_at at time zone 'Europe/Brussels', 'HH24:MI')));
    n := n + 1;
  end loop;
  return n;
end $$;

-- rappels envoyés à l'ouverture du site quand pg_cron n'est pas disponible
create or replace function public.check_my_health_reminders()
returns int language sql security definer set search_path = public, private as $$
  select private.send_health_reminders(auth.uid()) + private.send_birthdays(auth.uid())
       + private.send_sitting_rate_reminders(auth.uid()) + private.send_ride_reminders(auth.uid());
$$;
revoke all on function public.check_my_health_reminders() from public, anon;
grant execute on function public.check_my_health_reminders() to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'cyclami-rappels-sorties';
    perform cron.schedule('cyclami-rappels-sorties', '0 16 * * *', 'select private.send_ride_reminders()');
  end if;
exception when others then
  raise notice 'pg_cron indisponible : rappels de sortie envoyés à l''ouverture du site (%)', sqlerrm;
end $$;

-- nouveau membre (premier animal présenté, et position connue) : les voisins actifs à moins de 5 km sont prévenus
create or replace function private.announce_member(p_uid uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  me record;
  pet record;
begin
  select id, lat, lng into me from public.profiles where id = p_uid;
  if me.lat is null then return; end if;
  select name, species into pet from public.pets where owner_id = p_uid order by created_at limit 1;
  if pet.name is null then return; end if;
  -- une seule annonce par membre
  if exists (select 1 from public.notifications where actor_id = p_uid and type = 'member_nearby') then return; end if;
  insert into public.notifications (user_id, actor_id, type, data)
  select p.id, me.id, 'member_nearby', jsonb_build_object('title', pet.name, 'species', pet.species,
           'km', round(private.km(me.lat, me.lng, p.lat, p.lng)::numeric, 1))
    from public.profiles p
   where p.id <> me.id and p.lat is not null
     and p.lat between me.lat - 0.1 and me.lat + 0.1 and p.lng between me.lng - 0.15 and me.lng + 0.15
     and private.km(me.lat, me.lng, p.lat, p.lng) <= 5
     and p.last_seen_at > now() - interval '30 days'
     and not exists (select 1 from public.blocks b where (b.blocker_id = p.id and b.blocked_id = me.id) or (b.blocker_id = me.id and b.blocked_id = p.id))
     and not exists (select 1 from public.notifications o where o.user_id = p.id and o.type = 'member_nearby' and o.created_at > now() - interval '1 day')
   order by private.km(me.lat, me.lng, p.lat, p.lng)
   limit 200;
end $$;

create or replace function private.notify_member_nearby()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if tg_table_name = 'pets' then
    if not exists (select 1 from public.pets where owner_id = new.owner_id and id <> new.id) then
      perform private.announce_member(new.owner_id);
    end if;
  elsif old.lat is null and new.lat is not null then
    perform private.announce_member(new.id);
  end if;
  return null;
end $$;
drop trigger if exists after_first_pet on public.pets;
create trigger after_first_pet after insert on public.pets
  for each row execute function private.notify_member_nearby();
drop trigger if exists after_first_position on public.profiles;
create trigger after_first_position after update of lat on public.profiles
  for each row execute function private.notify_member_nearby();

-- e-mail et téléphone pour ces deux notifications (les autres sont gérées par email_on_notification)
create or replace function private.email_on_notification_more()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  lg text := coalesce((select lang from public.profiles where id = new.user_id), 'fr');
  actor text := coalesce((select name from public.profiles where id = new.actor_id), '');
  title text := coalesce(new.data ->> 'title', '');
  place text := coalesce(new.data ->> 'place', '');
  at_time text := coalesce(new.data ->> 'time', '');
  subj text;
  txt text;
begin
  if new.type = 'ride_reminder' then
    subj := case lg when 'nl' then '⏰ Morgen om ' || at_time || ': « ' || title || ' »'
                    when 'en' then '⏰ Tomorrow at ' || at_time || ': « ' || title || ' »'
                    else '⏰ Demain à ' || at_time || ' : « ' || title || ' »' end;
    txt := case lg when 'nl' then 'Kleine herinnering: de fietstocht « ' || title || ' » is morgen om ' || at_time || ' (' || place || '). Vergeet de leiband en een zakje niet! Kan je niet komen? Meld je af in Cyclami, zo weten de anderen het.'
                   when 'en' then 'Quick reminder: the ride « ' || title || ' » is tomorrow at ' || at_time || ' (' || place || '). Don''t forget the lead and a poo bag! Can''t make it? Leave the ride in Cyclami so the others know.'
                   else 'Petit rappel : la sortie « ' || title || ' » a lieu demain à ' || at_time || ' (' || place || '). N''oublie pas la laisse et un petit sac ! Tu ne peux plus venir ? Désinscris-toi dans Cyclami pour prévenir les autres.' end;
    perform private.queue_email(new.user_id, new.type, new.ride_id::text, subj, txt, '/', 'activity', interval '1 day');
  elsif new.type = 'member_nearby' then
    subj := case lg when 'nl' then '👋 ' || actor || ' en ' || title || ' zijn nieuw bij jou in de buurt'
                    when 'en' then '👋 ' || actor || ' and ' || title || ' just joined near you'
                    else '👋 ' || actor || ' et ' || title || ' viennent d''arriver près de chez toi' end;
    txt := case lg when 'nl' then actor || ' heeft zich net ingeschreven op Cyclami met ' || title || ', op ongeveer ' || replace(coalesce(new.data ->> 'km', '?'), '.', ',') || ' km van jou. Zeg hallo of stel een fietstocht voor!'
                   when 'en' then actor || ' just joined Cyclami with ' || title || ', about ' || coalesce(new.data ->> 'km', '?') || ' km from you. Say hello or suggest a ride!'
                   else actor || ' vient de s''inscrire sur Cyclami avec ' || title || ', à environ ' || replace(coalesce(new.data ->> 'km', '?'), '.', ',') || ' km de chez toi. Dis-lui bonjour ou propose une sortie !' end;
    perform private.queue_email(new.user_id, new.type, '', subj, txt, '/', 'activity', interval '3 days');
  elsif new.type = 'verification' then
    if (new.data ->> 'approved')::boolean then
      subj := case lg when 'nl' then '✅ Je profiel is geverifieerd' when 'en' then '✅ Your profile is verified' else '✅ Ton profil est vérifié' end;
      txt := case lg when 'nl' then 'Goed nieuws: je profiel is geverifieerd. De badge « Geverifieerd profiel » staat nu op je profiel. De video is verwijderd.'
                     when 'en' then 'Good news: your profile is verified. The « Verified profile » badge now shows on your profile. The video has been deleted.'
                     else 'Bonne nouvelle : ton profil est vérifié. Le badge « Profil vérifié » apparaît maintenant sur ton profil. La vidéo a été supprimée.' end;
    else
      subj := case lg when 'nl' then 'Verificatie van je profiel' when 'en' then 'Your profile verification' else 'Vérification de ton profil' end;
      txt := case lg when 'nl' then 'De verificatie van je profiel is niet gelukt' when 'en' then 'Your profile verification did not succeed' else 'La vérification de ton profil n''a pas abouti' end
        || coalesce(' : ' || nullif(new.data ->> 'reason', ''), '') || '. '
        || case lg when 'nl' then 'Je kunt het opnieuw proberen. De video is verwijderd.' when 'en' then 'You can try again. The video has been deleted.' else 'Tu peux réessayer. La vidéo a été supprimée.' end;
    end if;
    perform private.queue_email(new.user_id, new.type, new.id::text, subj, txt, '/', 'moderation', interval '0');
  elsif new.type = 'referral' then
    subj := case lg when 'nl' then '🎉 ' || actor || ' heeft zich ingeschreven dankzij jou'
                    when 'en' then '🎉 ' || actor || ' joined thanks to you'
                    else '🎉 ' || actor || ' s''est inscrit grâce à toi' end;
    txt := case lg when 'nl' then actor || ' heeft zich net ingeschreven op Cyclami via jouw link. Bedankt om de buurt te laten groeien! Nodig er nog meer uit om de badge « Ambassadeur » te krijgen.'
                   when 'en' then actor || ' just joined Cyclami through your link. Thanks for growing the neighbourhood! Invite more to earn the « Ambassador » badge.'
                   else actor || ' vient de s''inscrire sur Cyclami grâce à ton lien. Merci de faire grandir le quartier ! Invites-en d''autres pour obtenir le badge « Ambassadeur ».' end;
    perform private.queue_email(new.user_id, new.type, new.actor_id::text, subj, txt, '/', 'activity', interval '1 day');
  elsif new.type = 'hazard' then
    title := case new.data ->> 'kind'
      when 'poison' then case lg when 'nl' then 'Vergiftigd lokaas' when 'en' then 'Poisoned bait' else 'Boulettes empoisonnées' end
      when 'chenilles' then case lg when 'nl' then 'Processierupsen' when 'en' then 'Processionary caterpillars' else 'Chenilles processionnaires' end
      when 'algues' then case lg when 'nl' then 'Blauwalgen' when 'en' then 'Blue-green algae' else 'Algues bleues' end
      when 'verre' then case lg when 'nl' then 'Glasscherven' when 'en' then 'Broken glass' else 'Verre cassé' end
      when 'tiques' then case lg when 'nl' then 'Veel teken' when 'en' then 'Lots of ticks' else 'Beaucoup de tiques' end
      when 'chien' then case lg when 'nl' then 'Agressieve loslopende hond' when 'en' then 'Aggressive loose dog' else 'Chien agressif en liberté' end
      else coalesce(nullif(new.data ->> 'title', ''), case lg when 'nl' then 'Gevaar' when 'en' then 'Danger' else 'Danger' end) end;
    subj := case lg when 'nl' then '⚠️ Gevaar bij jou in de buurt: ' || title || ' (' || place || ')'
                    when 'en' then '⚠️ Danger near you: ' || title || ' (' || place || ')'
                    else '⚠️ Danger près de chez toi : ' || title || ' (' || place || ')' end;
    txt := case lg when 'nl' then 'Een buur meldt « ' || title || ' » bij ' || place || '. Wees voorzichtig tijdens je fietstochten en open Cyclami om de kaart te bekijken.'
                   when 'en' then 'A neighbour reports « ' || title || ' » at ' || place || '. Be careful on your rides and open Cyclami to see the map.'
                   else 'Un voisin signale « ' || title || ' » : ' || place || '. Sois prudent pendant tes sorties et ouvre Cyclami pour voir la carte.' end;
    perform private.queue_email(new.user_id, new.type, new.data ->> 'hazard_id', subj, txt, '/', 'activity', interval '6 hours');
  else
    return null;
  end if;
  perform private.send_push(new.user_id, 'Cyclami 🐾', subj, '/', 'n:' || new.id);
  return null;
end $$;
drop trigger if exists email_on_notification_more on public.notifications;
create trigger email_on_notification_more after insert on public.notifications
  for each row execute function private.email_on_notification_more();

-- =====================================================================
-- Version 88 : messages vocaux (messages privés et tchat général)
--   Enregistrés dans un stockage privé « voice-notes » (2 minutes maximum) : l'auteur et le
--   destinataire d'un message privé peuvent l'écouter ; un vocal du tchat, tous les membres connectés.
-- =====================================================================
alter table public.messages add column if not exists audio_path text;
alter table public.messages add column if not exists audio_seconds int;
alter table public.chat_messages add column if not exists audio_path text;
alter table public.chat_messages add column if not exists audio_seconds int;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 5242880, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "déposer un vocal" on storage.objects;
create policy "déposer un vocal" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "écouter les vocaux" on storage.objects;
create policy "écouter les vocaux" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-notes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.messages m where m.audio_path = name and m.recipient_id = auth.uid())
      or exists (select 1 from public.chat_messages c where c.audio_path = name and c.hidden_at is null)
    )
  );

drop policy if exists "supprimer ses vocaux" on storage.objects;
create policy "supprimer ses vocaux" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

-- un vocal est rangé dans le dossier de son auteur, et dure au plus 2 minutes
alter table public.messages drop constraint if exists messages_audio_check;
alter table public.messages add constraint messages_audio_check check (audio_path is null or (
  audio_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|ogg|m4a|mp3)$' and split_part(audio_path, '/', 1) = sender_id::text
  and audio_seconds between 1 and 120));
alter table public.chat_messages drop constraint if exists chat_messages_audio_check;
alter table public.chat_messages add constraint chat_messages_audio_check check (audio_path is null or (
  audio_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|ogg|m4a|mp3)$' and split_part(audio_path, '/', 1) = author_id::text
  and audio_seconds between 1 and 120));

-- texte, photo ou vocal
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 2000 and (char_length(body) > 0 or photo_url is not null or audio_path is not null));
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check
  check (char_length(body) <= 500 and (char_length(body) >= 1 or photo_url is not null or audio_path is not null));

-- =====================================================================
-- Version 89 : « écouté » — l'expéditeur d'un message vocal voit quand le destinataire l'a écouté
-- =====================================================================
alter table public.messages add column if not exists audio_played_at timestamptz;

create or replace function public.mark_voice_played(p_id uuid)
returns timestamptz language sql security definer set search_path = public as $$
  update public.messages
     set audio_played_at = coalesce(audio_played_at, now()), read_at = coalesce(read_at, now())
   where id = p_id and recipient_id = auth.uid() and audio_path is not null
  returning audio_played_at;
$$;
revoke all on function public.mark_voice_played(uuid) from public, anon;
grant execute on function public.mark_voice_played(uuid) to authenticated;

-- =====================================================================
-- Version 90 : alertes « danger » du quartier (boulettes empoisonnées, chenilles processionnaires,
--   algues bleues, verre cassé, tiques, chien agressif…). Visibles des membres connectés, sur la carte ;
--   les voisins actifs à moins de 3 km sont prévenus. Une alerte expire seule (durée selon le danger),
--   « Toujours là » la prolonge, « Plus là » (l'auteur, ou 2 membres) la ferme.
-- =====================================================================
create table if not exists public.hazards (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('poison', 'chenilles', 'algues', 'verre', 'tiques', 'chien', 'autre')),
  description text not null default '' check (char_length(description) <= 500),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 500 and public.is_own_photo_url(photo_url))),
  place text not null check (char_length(place) between 1 and 150),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  expires_at timestamptz not null default now() + interval '7 days',
  resolved_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists hazards_active_idx on public.hazards (expires_at, lat, lng);
-- « Autre danger » : le membre nomme le danger
alter table public.hazards add column if not exists title text not null default '';
alter table public.hazards drop constraint if exists hazards_title_check;
alter table public.hazards add constraint hazards_title_check
  check (char_length(title) <= 60 and (kind <> 'autre' or char_length(btrim(title)) >= 3));
alter table public.hazards enable row level security;

create table if not exists public.hazard_votes (
  hazard_id uuid not null references public.hazards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('still', 'gone')),
  created_at timestamptz not null default now(),
  primary key (hazard_id, user_id)
);
alter table public.hazard_votes enable row level security;
drop policy if exists "voir les votes de danger" on public.hazard_votes;
create policy "voir les votes de danger" on public.hazard_votes for select to authenticated using (true);

drop policy if exists "dangers visibles" on public.hazards;
create policy "dangers visibles" on public.hazards
  for select to authenticated using (hidden_at is null or author_id = auth.uid() or public.is_staff());
drop policy if exists "signaler un danger" on public.hazards;
create policy "signaler un danger" on public.hazards
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "supprimer son danger" on public.hazards;
create policy "supprimer son danger" on public.hazards
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

-- durée d'une alerte selon le danger
create or replace function private.hazard_life(p_kind text)
returns interval language sql immutable as $$
  select case p_kind when 'poison' then interval '7 days' when 'chenilles' then interval '21 days'
                     when 'algues' then interval '14 days' when 'tiques' then interval '14 days'
                     when 'chien' then interval '2 days' else interval '3 days' end;
$$;

create or replace function public.prepare_hazard()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if exists (select 1 from public.suspensions where user_id = new.author_id and until > now()) then
    raise exception 'Ton compte est suspendu';
  end if;
  if not public.is_staff() and (select count(*) from public.hazards where author_id = new.author_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Trop de dangers signalés aujourd''hui';
  end if;
  new.description := btrim(new.description);
  new.place := btrim(new.place);
  new.title := case when new.kind = 'autre' then btrim(new.title) else '' end;
  new.created_at := now();
  new.expires_at := now() + private.hazard_life(new.kind);
  new.resolved_at := null;
  new.hidden_at := null;
  return new;
end $$;
drop trigger if exists before_hazard on public.hazards;
create trigger before_hazard before insert on public.hazards
  for each row execute function public.prepare_hazard();

-- voisins actifs à moins de 3 km (au plus 4 alertes « danger » par jour et par membre)
create or replace function public.notify_hazard()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.notifications (user_id, actor_id, type, data)
  select p.id, new.author_id, 'hazard', jsonb_build_object('kind', new.kind, 'title', new.title, 'place', new.place, 'hazard_id', new.id)
    from public.profiles p
   where p.id <> new.author_id and p.lat is not null
     and p.lat between new.lat - 0.03 and new.lat + 0.03 and p.lng between new.lng - 0.045 and new.lng + 0.045
     and private.km(new.lat, new.lng, p.lat, p.lng) <= 3
     and p.last_seen_at > now() - interval '30 days'
     and not exists (select 1 from public.blocks b where (b.blocker_id = p.id and b.blocked_id = new.author_id)
                                                     or (b.blocker_id = new.author_id and b.blocked_id = p.id))
     and (select count(*) from public.notifications o where o.user_id = p.id and o.type = 'hazard' and o.created_at > now() - interval '1 day') < 4
   limit 500;
  return null;
end $$;
drop trigger if exists after_hazard on public.hazards;
create trigger after_hazard after insert on public.hazards
  for each row execute function public.notify_hazard();

-- « Toujours là » (prolonge) ou « Plus là » (ferme : l'auteur, l'équipe, ou 2 membres)
create or replace function public.vote_hazard(p_id uuid, p_vote text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  h public.hazards;
  gone int;
begin
  if auth.uid() is null or p_vote not in ('still', 'gone') then raise exception 'Action non autorisée'; end if;
  select * into h from public.hazards where id = p_id and hidden_at is null and resolved_at is null and expires_at > now();
  if h.id is null then raise exception 'Cette alerte est terminée'; end if;
  insert into public.hazard_votes (hazard_id, user_id, vote) values (p_id, auth.uid(), p_vote)
  on conflict (hazard_id, user_id) do update set vote = excluded.vote, created_at = now();
  if p_vote = 'still' then
    update public.hazards set expires_at = least(greatest(expires_at, now() + private.hazard_life(kind)), created_at + interval '60 days')
     where id = p_id;
  else
    select count(*) into gone from public.hazard_votes where hazard_id = p_id and vote = 'gone';
    if h.author_id = auth.uid() or public.is_staff() or gone >= 2 then
      update public.hazards set resolved_at = now() where id = p_id;
    end if;
  end if;
  return (select jsonb_build_object('expires_at', expires_at, 'resolved', resolved_at is not null) from public.hazards where id = p_id);
end $$;
revoke all on function public.vote_hazard(uuid, text) from public, anon;
grant execute on function public.vote_hazard(uuid, text) to authenticated;

-- =====================================================================
-- Version 91 : suivi des sorties au GPS — distance et durée seulement (le tracé reste sur le téléphone),
--   kilomètres cumulés par animal et badges (10, 50, 100, 500 km).
-- =====================================================================
create table if not exists public.ride_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pet_ids uuid[] not null default '{}',
  started_at timestamptz not null,
  duration_s int not null check (duration_s between 60 and 6 * 3600),
  distance_m int not null check (distance_m between 50 and 50000),
  created_at timestamptz not null default now(),
  -- vitesse moyenne plausible pour une sortie (≤ 15 km/h, même en courant)
  check (distance_m <= duration_s * 4.2)
);
create index if not exists ride_tracks_user_idx on public.ride_tracks (user_id, started_at desc);
create index if not exists ride_tracks_pets_idx on public.ride_tracks using gin (pet_ids);
alter table public.ride_tracks enable row level security;

drop policy if exists "voir ses sorties suivies" on public.ride_tracks;
create policy "voir ses sorties suivies" on public.ride_tracks for select to authenticated using (user_id = auth.uid());
drop policy if exists "enregistrer une sortie suivie" on public.ride_tracks;
create policy "enregistrer une sortie suivie" on public.ride_tracks for insert to authenticated with check (
  user_id = auth.uid() and started_at <= now() and started_at > now() - interval '2 days'
  and not exists (select 1 from unnest(pet_ids) as p where not exists (select 1 from public.pets where id = p and owner_id = auth.uid())));
drop policy if exists "supprimer une sortie suivie" on public.ride_tracks;
create policy "supprimer une sortie suivie" on public.ride_tracks for delete to authenticated using (user_id = auth.uid());

-- pas plus de 10 sorties suivies par jour
create or replace function public.guard_ride_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ride_tracks where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Trop de sorties enregistrées aujourd''hui';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists before_ride_track on public.ride_tracks;
create trigger before_ride_track before insert on public.ride_tracks
  for each row execute function public.guard_ride_track();

-- kilomètres parcourus par des animaux (visible de tous les membres : seulement le total)
create or replace function public.pet_distances(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(p, km), '{}') from (
    select p, round(sum(t.distance_m) / 1000.0, 1) as km
      from public.ride_tracks t cross join lateral unnest(t.pet_ids) as p
     where p = any (p_ids)
     group by p) x;
$$;
revoke all on function public.pet_distances(uuid[]) from public, anon;
grant execute on function public.pet_distances(uuid[]) to authenticated;

-- =====================================================================
-- Version 92 : parrainage — lien personnel (cyclami.com/?p=<code>), badge « Ambassadeur »
--   à 3 filleuls qui ont présenté leur animal, et classement des quartiers les plus actifs.
-- =====================================================================
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;

-- code de parrainage : les 10 premiers caractères de l'identifiant (sans tirets)
create or replace function public.referral_code(p_user uuid)
returns text language sql immutable as $$ select left(replace(p_user::text, '-', ''), 10); $$;

-- le nouveau membre (inscrit depuis moins de 7 jours) indique qui l'a invité ; une seule fois
create or replace function public.claim_referral(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  sponsor uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.referred_by is not null or me.created_at < now() - interval '7 days' then return false; end if;
  if p_code !~ '^[0-9a-f]{10}$' then return false; end if;
  select id into sponsor from public.profiles where public.referral_code(id) = p_code and id <> me.id limit 1;
  if sponsor is null then return false; end if;
  perform set_config('cyclami.referral', '1', true);
  update public.profiles set referred_by = sponsor where id = me.id;
  insert into public.notifications (user_id, actor_id, type, data) values (sponsor, me.id, 'referral', '{}');
  return true;
end $$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- le parrain ne se choisit que par claim_referral (pas en modifiant son profil)
create or replace function public.protect_referred_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is distinct from old.referred_by and coalesce(current_setting('cyclami.referral', true), '0') <> '1' then
    new.referred_by := old.referred_by;
  end if;
  return new;
end $$;
drop trigger if exists before_profile_protect_referral on public.profiles;
create trigger before_profile_protect_referral before update on public.profiles
  for each row execute function public.protect_referred_by();

-- filleuls d'un membre : nombre (avec un animal présenté) ; la liste des prénoms seulement pour soi
create or replace function public.referral_stats(p_user uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', case when coalesce(p_user, auth.uid()) = auth.uid() then public.referral_code(auth.uid()) end,
    'count', (select count(*) from public.profiles f where f.referred_by = coalesce(p_user, auth.uid())
                and exists (select 1 from public.pets where owner_id = f.id)),
    'pending', (select count(*) from public.profiles f where f.referred_by = coalesce(p_user, auth.uid())
                  and not exists (select 1 from public.pets where owner_id = f.id)),
    'members', case when coalesce(p_user, auth.uid()) = auth.uid() then (
       select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'has_pet', exists (select 1 from public.pets where owner_id = f.id)) order by f.created_at desc), '[]')
         from public.profiles f where f.referred_by = auth.uid()) end
  );
$$;
revoke all on function public.referral_stats(uuid) from public, anon;
grant execute on function public.referral_stats(uuid) to authenticated;

-- quartiers les plus actifs (30 derniers jours) : membres actifs, sorties organisées, nouveaux membres
create or replace function public.top_neighbourhoods()
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select lower(btrim(city)) as k, min(btrim(city)) as city, count(*) as members,
           count(*) filter (where last_seen_at > now() - interval '30 days') as active,
           count(*) filter (where created_at > now() - interval '30 days') as newcomers
      from public.profiles where btrim(city) <> '' group by 1 having count(*) >= 2
  ), w as (
    select lower(btrim(h.city)) as k, count(*) as rides
      from public.rides x join public.profiles h on h.id = x.host_id
     where x.created_at > now() - interval '30 days' and x.hidden_at is null and btrim(h.city) <> ''
     group by 1
  )
  select coalesce(jsonb_agg(x order by x.score desc, x.city), '[]') from (
    select m.city, m.members, m.active, m.newcomers, coalesce(w.rides, 0) as rides,
           m.active + 2 * m.newcomers + 3 * coalesce(w.rides, 0) as score
      from m left join w on w.k = m.k
     order by score desc, m.city
     limit 10) x;
$$;
revoke all on function public.top_neighbourhoods() from public, anon;
grant execute on function public.top_neighbourhoods() to authenticated;

-- =====================================================================
-- Version 93 : profil vérifié — courte vidéo filmée en direct dans l'appli (pas d'envoi de fichier),
--   avec des gestes et un code tirés au hasard par le serveur juste avant ; contrôle à la main par
--   l'équipe (aucune reconnaissance faciale automatique) ; vidéo supprimée dès la décision.
-- =====================================================================
alter table public.profiles add column if not exists verified_at timestamptz;

create table if not exists public.profile_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge jsonb not null,
  status text not null default 'started' check (status in ('started', 'submitted', 'approved', 'rejected')),
  video_path text,
  signals jsonb not null default '{}',
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  reason text not null default ''
);
create index if not exists profile_verifications_user_idx on public.profile_verifications (user_id, created_at desc);
alter table public.profile_verifications enable row level security;
drop policy if exists "voir ses vérifications" on public.profile_verifications;
create policy "voir ses vérifications" on public.profile_verifications
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- un membre ne peut pas se déclarer vérifié lui-même
create or replace function public.protect_verified_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verified_at is distinct from old.verified_at and coalesce(current_setting('cyclami.verify', true), '0') <> '1' then
    new.verified_at := old.verified_at;
  end if;
  return new;
end $$;
drop trigger if exists before_profile_protect_verified on public.profiles;
create trigger before_profile_protect_verified before update on public.profiles
  for each row execute function public.protect_verified_at();

-- vidéos : stockage privé, déposées par le membre dans son dossier, visibles de l'administration seulement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verifications', 'verifications', false, 26214400, array['video/webm', 'video/mp4'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "déposer sa vidéo de vérification" on storage.objects;
create policy "déposer sa vidéo de vérification" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verifications' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "voir les vidéos de vérification" on storage.objects;
create policy "voir les vidéos de vérification" on storage.objects
  for select to authenticated using (bucket_id = 'verifications' and public.is_admin());
drop policy if exists "supprimer les vidéos de vérification" on storage.objects;
create policy "supprimer les vidéos de vérification" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verifications' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- 1. défi tiré au hasard : 3 gestes parmi 8 et un code à 4 chiffres à dire, valable 5 minutes
create or replace function public.start_verification()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  acts text[];
  code text;
  row public.profile_verifications;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from public.profiles where id = me and verified_at is not null) then raise exception 'Ton profil est déjà vérifié'; end if;
  if exists (select 1 from public.profile_verifications where user_id = me and status = 'submitted') then
    raise exception 'Ta vidéo est déjà en cours de vérification';
  end if;
  if (select count(*) from public.profile_verifications where user_id = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Trop d''essais aujourd''hui : réessaie demain';
  end if;
  select array_agg(a) into acts from (
    select a from unnest(array['tete_gauche', 'tete_droite', 'trois_doigts', 'pouce', 'main_front', 'clin_oeil', 'sourire', 'main_oreille']) a
     order by random() limit 3) x;
  code := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.profile_verifications (user_id, challenge) values (me, jsonb_build_object('actions', acts, 'code', code))
  returning * into row;
  return jsonb_build_object('id', row.id, 'actions', acts, 'code', code, 'expires_at', row.created_at + interval '5 minutes');
end $$;
revoke all on function public.start_verification() from public, anon;
grant execute on function public.start_verification() to authenticated;

-- 2. vidéo envoyée : elle doit avoir été filmée dans les 5 minutes (+ temps d'envoi)
create or replace function public.submit_verification(p_id uuid, p_path text, p_signals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profile_verifications;
begin
  select * into v from public.profile_verifications where id = p_id and user_id = auth.uid() and status = 'started';
  if v.id is null then raise exception 'Vérification introuvable'; end if;
  if v.created_at < now() - interval '15 minutes' then raise exception 'Le défi a expiré : recommence'; end if;
  if p_path !~ ('^' || auth.uid()::text || '/' || p_id::text || '\.(webm|mp4)$') then raise exception 'Fichier non valide'; end if;
  update public.profile_verifications
     set status = 'submitted', video_path = p_path, submitted_at = now(),
         signals = coalesce(p_signals, '{}') || jsonb_build_object('delay_s', extract(epoch from now() - v.created_at)::int)
   where id = p_id;
end $$;
revoke all on function public.submit_verification(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_verification(uuid, text, jsonb) to authenticated;

-- 3. administration : vidéos à vérifier, puis décision (la vidéo est ensuite supprimée par le site)
create or replace function public.admin_verifications()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''administration'; end if;
  return (select coalesce(jsonb_agg(x order by x.submitted_at), '[]') from (
    select v.id, v.user_id, v.challenge, v.video_path, v.signals, v.submitted_at, v.created_at,
           p.name, p.avatar_url, p.created_at as member_since,
           (select count(*) from public.profile_verifications o where o.user_id = v.user_id and o.status = 'rejected') as rejected_before
      from public.profile_verifications v join public.profiles p on p.id = v.user_id
     where v.status = 'submitted') x);
end $$;
revoke all on function public.admin_verifications() from public, anon;
grant execute on function public.admin_verifications() to authenticated;

create or replace function public.admin_decide_verification(p_id uuid, p_approve boolean, p_reason text default '')
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profile_verifications;
begin
  if not public.is_admin() then raise exception 'Réservé à l''administration'; end if;
  select * into v from public.profile_verifications where id = p_id and status = 'submitted';
  if v.id is null then raise exception 'Déjà traitée'; end if;
  update public.profile_verifications
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid(),
         reason = left(coalesce(p_reason, ''), 300), video_path = null, signals = '{}'
   where id = p_id;
  if p_approve then
    perform set_config('cyclami.verify', '1', true);
    update public.profiles set verified_at = now() where id = v.user_id;
  end if;
  insert into public.notifications (user_id, actor_id, type, data)
  values (v.user_id, null, 'verification', jsonb_build_object('approved', p_approve, 'reason', left(coalesce(p_reason, ''), 300)));
  return v.video_path; -- à supprimer du stockage
end $$;
revoke all on function public.admin_decide_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_verification(uuid, boolean, text) to authenticated;

-- =====================================================================
-- Version 94 : page d'un refuge plus complète — contact (membres connectés seulement), date de
--   vérification, nombre d'animaux à adopter et d'animaux déjà adoptés.
-- =====================================================================
create or replace function public.public_shelter(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.user_id, 'name', s.name, 'region', s.region, 'address', s.address,
           'lat', s.lat, 'lng', s.lng, 'approval_number', s.approval_number, 'verified_at', s.verified_at,
           'contact', case when auth.uid() is not null then nullif(s.contact, '') end,
           'animals', (select count(*) from public.listings l where l.seller_id = s.user_id and l.hidden_at is null and l.status in ('active', 'reserve')),
           'adopted', (select count(*) from public.listings l where l.seller_id = s.user_id and l.hidden_at is null and l.status = 'cede'))
    from public.shelters s where s.user_id = p_id and s.status = 'verified';
$$;

-- =====================================================================
-- Version 95 : coordonnées des refuges — e-mail, téléphone et site web (champs séparés),
--   modifiables par le refuge (sans validation) et par l'administration ; visibles des membres connectés.
--   Pré-remplies une fois depuis l'ancien champ « contact ».
-- =====================================================================
alter table public.shelters add column if not exists email text not null default '';
alter table public.shelters add column if not exists phone text not null default '';
alter table public.shelters add column if not exists website text not null default '';
alter table public.shelters drop constraint if exists shelters_email_check;
alter table public.shelters add constraint shelters_email_check
  check (email = '' or (char_length(email) <= 120 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
alter table public.shelters drop constraint if exists shelters_phone_check;
alter table public.shelters add constraint shelters_phone_check
  check (phone = '' or (char_length(phone) <= 40 and phone ~ '^\+?[0-9][0-9 ./()-]{5,38}$'));
alter table public.shelters drop constraint if exists shelters_website_check;
alter table public.shelters add constraint shelters_website_check
  check (website = '' or (char_length(website) <= 200 and website ~ '^https?://[^[:space:]]+\.[^[:space:]]+$'));

-- reprise de l'ancien champ libre « contact » (une seule fois : seulement les champs encore vides)
do $$
declare
  r record;
  e text; w text; p text; rest text;
begin
  perform set_config('cyclami.apply_shelter', 'on', true);
  for r in select user_id, contact from public.shelters where contact <> '' and email = '' and phone = '' and website = '' loop
    e := substring(r.contact from '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}');
    w := substring(r.contact from '(https?://[^[:space:],;]+|www\.[^[:space:],;]+)');
    rest := replace(replace(r.contact, coalesce(e, ''), ''), coalesce(w, ''), '');
    p := btrim(substring(rest from '\+?[0-9][0-9 ./()-]{6,30}[0-9]'));
    if w is not null and w !~ '^https?://' then w := 'https://' || w; end if;
    update public.shelters set
      email = case when e is not null and char_length(e) <= 120 then lower(e) else '' end,
      website = case when w is not null and char_length(w) <= 200 and w ~ '^https?://[^[:space:]]+\.[^[:space:]]+$' then w else '' end,
      phone = case when p is not null and p ~ '^\+?[0-9][0-9 ./()-]{5,38}$' then p else '' end
     where user_id = r.user_id;
  end loop;
  perform set_config('cyclami.apply_shelter', 'off', true);
end $$;

create or replace function public.public_shelter(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.user_id, 'name', s.name, 'region', s.region, 'address', s.address,
           'lat', s.lat, 'lng', s.lng, 'approval_number', s.approval_number, 'verified_at', s.verified_at,
           'contact', case when auth.uid() is not null then nullif(s.contact, '') end,
           'email', case when auth.uid() is not null then nullif(s.email, '') end,
           'phone', case when auth.uid() is not null then nullif(s.phone, '') end,
           'website', case when auth.uid() is not null then nullif(s.website, '') end,
           'has_contact', (s.email <> '' or s.phone <> '' or s.website <> '' or s.contact <> ''),
           'animals', (select count(*) from public.listings l where l.seller_id = s.user_id and l.hidden_at is null and l.status in ('active', 'reserve')),
           'adopted', (select count(*) from public.listings l where l.seller_id = s.user_id and l.hidden_at is null and l.status = 'cede'))
    from public.shelters s where s.user_id = p_id and s.status = 'verified';
$$;

-- =====================================================================
-- Version 96 : le compte administrateur n'a plus de refuge à son nom (suppression unique de celui
--   créé pour les essais) ; il peut publier un animal à adopter AU NOM d'un refuge vérifié
--   (ex. un refuge qui envoie ses animaux par e-mail) : l'annonce appartient au refuge, qui reçoit
--   les demandes d'adoption.
-- =====================================================================
do $$
begin
  if not exists (select 1 from private.settings where key = 'migration_v96_admin_shelter') then
    delete from public.shelters where user_id in (select user_id from public.admins where role = 'admin');
    insert into private.settings (key, value) values ('migration_v96_admin_shelter', now()::text);
  end if;
end $$;

drop policy if exists "publier une annonce" on public.listings;
create policy "publier une annonce" on public.listings
  for insert to authenticated with check (
    (seller_id = auth.uid() and public.is_verified_shelter(auth.uid()))
    or (public.is_admin() and public.is_verified_shelter(seller_id)));

-- =====================================================================
-- Version 97 : le super administrateur peut tout créer, modifier et supprimer sur le site.
--   Restent privés (même pour lui) : messages privés, carnet de santé, sorties GPS, réglages et
--   abonnements de notification, blocages ; et protégés : équipe, journal de modération, sanctions.
-- =====================================================================
do $$
declare
  tbl text;
begin
  foreach tbl in array array['profiles', 'pets', 'rides', 'ride_participants', 'ride_messages', 'ride_reviews', 'posts', 'post_likes',
    'comments', 'follows', 'forum_topics', 'forum_replies', 'groups', 'group_members', 'group_messages', 'chat_messages',
    'listings', 'shelters', 'shelter_needs', 'shelter_events', 'lost_alerts', 'hazards', 'hazard_votes', 'gear_items',
    'sitting_requests', 'sitting_offers', 'sitting_reviews', 'place_reviews', 'place_favorites', 'game_scores', 'reports',
    'feedback', 'client_errors'] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('drop policy if exists "administration : accès complet" on public.%I', tbl);
      execute format('create policy "administration : accès complet" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', tbl);
    end if;
  end loop;
end $$;
