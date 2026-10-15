-- Vérifications fonctionnelles de supabase/schema.sql sur une base de test (après stubs.sql et le schéma).
-- Tout se passe dans une transaction annulée à la fin : la base reste vide.
-- Les rôles sont joués comme sur Supabase : set role authenticated / anon + request.jwt.claim.sub.
-- Usage : psql -v ON_ERROR_STOP=1 -q -f supabase/test/checks.sql
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

-- ---------- comptes : fondateur (admin), Alice et Bruno ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'srlvma.ai@gmail.com', now(), '{"name": "Fondateur", "city": "Namur"}'),
  ('22222222-2222-2222-2222-222222222222', 'alice@example.com', now(), '{"name": "Alice", "city": "Namur"}'),
  ('33333333-3333-3333-3333-333333333333', 'bruno@example.com', now(), '{"name": "Bruno", "city": "Jambes"}');

do $$ begin
  assert (select count(*) from public.profiles) = 3, 'profils créés à l''inscription';
  assert exists (select 1 from public.admins where user_id = '11111111-1111-1111-1111-111111111111' and role = 'admin'),
    'srlvma.ai@gmail.com est le premier administrateur';
  assert public.owner_id() = '11111111-1111-1111-1111-111111111111', 'fondateur = premier admin';
  assert exists (select 1 from public.follows where follower_id = '22222222-2222-2222-2222-222222222222'
                 and followee_id = '11111111-1111-1111-1111-111111111111'), 'abonnement automatique au fondateur';
end $$;

-- un type de notification d'Anigrame est refusé
do $$ begin
  begin
    insert into public.notifications (user_id, type) values ('22222222-2222-2222-2222-222222222222', 'lost_pet');
    raise exception 'type lost_pet accepté';
  exception when check_violation then null;
  end;
end $$;

-- ---------- Alice : profil cycliste, vélos ----------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

update public.profiles set level = 'intermediaire', disciplines = '{route,vtt_gravel}', usual_speed = 24,
  lat = 50.46, lng = 4.86, bio = 'Je roule le week-end', availability = '{samedi_matin}', name = 'Alice D'
  where id = auth.uid();
select public.touch_presence();

do $$ begin
  assert (select level from public.profiles where id = auth.uid()) = 'intermediaire', 'niveau enregistré';
  assert (select xp from public.profiles where id = auth.uid()) = 20, 'XP profil complet';
  -- le prénom est figé une fois le profil cycliste rempli
  begin
    update public.profiles set name = 'Autre' where id = auth.uid();
    raise exception 'prénom modifiable après l''accueil';
  exception when raise_exception then
    if sqlerrm like 'prénom modifiable%' then raise; end if;
  end;
  begin
    update public.profiles set usual_speed = 70 where id = auth.uid();
    raise exception 'vitesse 70 acceptée';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set disciplines = '{course_a_pied}' where id = auth.uid();
    raise exception 'discipline inconnue acceptée';
  exception when check_violation then null;
  end;
end $$;

insert into public.bikes (owner_id, name, kind, brand, photo_url) values
  (auth.uid(), '  Mon Canyon ', 'route', 'Canyon',
   'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/photos/22222222-2222-2222-2222-222222222222/velo.jpg');
insert into public.bikes (owner_id, name, kind) select auth.uid(), 'Vélo ' || i, 'gravel' from generate_series(2, 10) i;

do $$ begin
  assert (select name from public.bikes where brand = 'Canyon') = 'Mon Canyon', 'nom du vélo nettoyé';
  assert (select xp from public.profiles where id = auth.uid()) = 35, 'XP photo de vélo (+15)';
  begin
    insert into public.bikes (owner_id, name, kind) values (auth.uid(), 'Onzième', 'ville');
    raise exception '11e vélo accepté';
  exception when raise_exception then
    if sqlerrm like '11e%' then raise; end if;
  end;
  assert (select count(*) from public.bikes where owner_id = auth.uid()) = 10, '10 vélos au plus';
  begin
    update public.bikes set photo_url = 'https://exemple.com/espion.jpg' where name = 'Vélo 2';
    raise exception 'photo étrangère acceptée';
  exception when check_violation then null;
  end;
  begin
    update public.bikes set kind = 'trottinette' where name = 'Vélo 3';
    raise exception 'type de vélo inconnu accepté';
  exception when check_violation then null;
  end;
end $$;
delete from public.bikes where name = 'Vélo 10';

-- ---------- Alice organise une sortie demain à 9 h avec un tracé ----------
insert into public.rides (host_id, title, place, starts_at, duration, max_participants, description, lat, lng,
                          ride_type, level, avg_speed, distance_km, elevation_m, no_drop, route)
values (auth.uid(), 'Boucle de la Meuse', 'Pont de Jambes',
        ((now() at time zone 'Europe/Brussels')::date + 1 + time '09:00') at time zone 'Europe/Brussels',
        180, 8, 'Café à mi-parcours', 50.46, 4.87, 'route', 'intermediaire', 26.5, 72.4, 650, true,
        '[[50.46, 4.87], [50.40, 4.90], [50.35, 4.88], [50.46, 4.87]]');

do $$ begin
  assert (select count(*) from public.ride_participants) = 1, 'l''organisatrice participe à sa sortie';
  assert (select jsonb_array_length(route) from public.rides) = 4, 'tracé enregistré';
  assert (select xp from public.profiles where id = auth.uid()) = 65, 'XP sortie organisée (+30)';
  begin
    update public.rides set route = '[[50.46, 4.87]]';
    raise exception 'tracé d''un seul point accepté';
  exception when check_violation then null;
  end;
  begin
    update public.rides set route = '{"type": "LineString"}';
    raise exception 'tracé non tableau accepté';
  exception when check_violation then null;
  end;
  begin
    update public.rides set route = '[[50.46, 4.87], ["a", 4.9]]';
    raise exception 'point invalide accepté';
  exception when check_violation then null;
  end;
  begin
    update public.rides set level = 'expert';
    raise exception 'niveau inconnu accepté';
  exception when check_violation then null;
  end;
  begin
    update public.rides set distance_km = 500;
    raise exception 'distance 500 km acceptée';
  exception when check_violation then null;
  end;
end $$;

insert into public.posts (author_id, body) values (auth.uid(), 'Belle sortie ce matin 🚴');

-- danger : travaux (30 jours) et nid-de-poule (7 jours)
insert into public.hazards (author_id, kind, place, lat, lng) values (auth.uid(), 'travaux', 'Rue de Dave', 50.44, 4.87);
insert into public.hazards (author_id, kind, place, lat, lng) values (auth.uid(), 'nid_de_poule', 'Chaussée de Liège', 50.47, 4.88);
do $$ begin
  assert (select expires_at from public.hazards where kind = 'travaux') > now() + interval '29 days', 'travaux : 30 jours';
  assert (select expires_at from public.hazards where kind = 'nid_de_poule') < now() + interval '8 days', 'nid-de-poule : 7 jours';
  begin
    insert into public.hazards (author_id, kind, place, lat, lng) values (auth.uid(), 'poison', 'Parc', 50.44, 4.87);
    raise exception 'ancien type de danger accepté';
  exception when check_violation then null;
  end;
end $$;

-- ---------- Bruno rejoint la sortie ----------
reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

insert into public.ride_participants (ride_id, user_id) select id, auth.uid() from public.rides;
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 20, 'XP participation (+20)';
end $$;

-- profil cycliste de Bruno (position puis niveau) : Alice, active et à moins de 10 km, est prévenue
update public.profiles set lat = 50.45, lng = 4.88 where id = auth.uid();
update public.profiles set level = 'debutant', disciplines = '{route}' where id = auth.uid();

-- trace GPS rattachée à la sortie
insert into public.ride_tracks (user_id, ride_id, started_at, duration_s, distance_m, max_speed)
select auth.uid(), id, now() - interval '3 hours', 9000, 70000, 52.3 from public.rides;
do $$ begin
  assert (select avg_speed from public.ride_tracks) = 28.0, 'vitesse moyenne calculée par la base';
  assert public.rider_distances(array[auth.uid()]) ->> auth.uid()::text = '70.0', 'kilomètres cumulés';
  begin
    insert into public.ride_tracks (user_id, started_at, duration_s, distance_m) values (auth.uid(), now() - interval '1 hour', 600, 20000);
    raise exception 'vitesse de 120 km/h acceptée';
  exception when check_violation then null;
  end;
end $$;

-- signalement : nouvelle catégorie « conduite dangereuse »
insert into public.reports (reporter_id, reported_id, reason, category, target_type, target_id)
select auth.uid(), host_id, 'Grille les feux', 'conduite_dangereuse', 'ride', id from public.rides;

reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = '22222222-2222-2222-2222-222222222222' and type = 'ride_join'),
    'notification ride_join';
  assert exists (select 1 from public.notifications where user_id = '22222222-2222-2222-2222-222222222222' and type = 'member_nearby'
                 and actor_id = '33333333-3333-3333-3333-333333333333' and data ->> 'level' = 'debutant' and not data ? 'species'),
    'notification member_nearby sans animal';
  -- profil 20 + photo de vélo 15 + sortie organisée 30 + publication 10 + invité 5
  assert (select xp from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 80, 'XP invité (+5)';
end $$;

-- ---------- rappel la veille (tâche planifiée) ----------
select private.send_ride_reminders();
do $$ begin
  assert (select count(*) from public.notifications where type = 'ride_reminder') = 2, 'rappel pour l''organisatrice et le participant';
  assert (select body from private.email_outbox where user_id = '33333333-3333-3333-3333-333333333333' and kind = 'ride_reminder')
         like '%N''oublie pas ton casque, de l''eau et une chambre à air%', 'texte du rappel (FR)';
  assert (select value from private.settings where key = 'notify_url') like 'https://%/api/notify', 'adresse /api/notify';
end $$;

-- ---------- pages publiques (sans compte) ----------
set local role anon;
do $$
declare
  r jsonb;
begin
  r := public.public_rides() -> 0;
  assert r ->> 'ride_type' = 'route' and r ->> 'level' = 'intermediaire' and (r ->> 'no_drop')::boolean
         and (r ->> 'distance_km')::numeric = 72.4 and (r ->> 'elevation_m')::int = 650 and (r ->> 'avg_speed')::numeric = 26.5
         and not r ? 'pace' and not r ? 'route', 'public_rides : nouveaux champs';
  r := public.public_ride((r ->> 'id')::uuid);
  assert (r ->> 'has_route')::boolean and (r ->> 'participants')::int = 2, 'public_ride';
  r := public.public_city(50.46, 4.86, 15);
  assert (r ->> 'members')::int = 2 and (r -> 'levels' ->> 'intermediaire')::int = 1
         and (r -> 'disciplines' ->> 'route')::int = 2 and jsonb_array_length(r -> 'rides') = 1, 'public_city';
  r := public.share_preview('b', (select (public.public_rides() -> 0 ->> 'id')::uuid));
  assert r ->> 'title' = '🚴 Boucle de la Meuse' and r ->> 'description' like '%72,4 km%pas de lâchage%', 'aperçu de partage';
end $$;

-- ---------- administration (fondateur) ----------
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$
declare
  s json;
begin
  s := public.admin_stats();
  assert (s ->> 'bikes')::int = 9 and (s ->> 'riders')::int = 2 and (s ->> 'km_7d')::int = 70
         and (s ->> 'hazards_active')::int = 2 and (s ->> 'reports_open')::int = 1, 'admin_stats';
  assert (select bikes from public.admin_members() where id = '22222222-2222-2222-2222-222222222222') = 9, 'admin_members';
  assert (public.admin_member_extra('22222222-2222-2222-2222-222222222222') -> 'counts' ->> 'bikes')::int = 9, 'admin_member_extra';
end $$;

-- ---------- Alice : RPC du site ----------
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.follow_suggestions();
  assert r -> 0 ->> 'id' = '33333333-3333-3333-3333-333333333333' and (r -> 0 ->> 'common_disciplines')::int = 1, 'follow_suggestions';
  r := public.global_search('Bru');
  assert jsonb_array_length(r -> 'members') = 1 and not r ? 'pets', 'global_search';
  assert (public.member_achievements(auth.uid()) ->> 'bikes')::int = 9, 'member_achievements';
  r := public.export_my_data();
  assert jsonb_array_length(r -> 'velos') = 9 and not r ? 'animaux', 'export_my_data';
  assert public.check_my_reminders() = 0, 'check_my_reminders (déjà envoyés)';
  assert (public.referral_stats() ->> 'count')::int = 0, 'referral_stats';
  assert (select count(*) from public.xp_leaderboard(7)) >= 2, 'xp_leaderboard';
end $$;

-- ---------- Bruno supprime son compte ----------
reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 'compte supprimé';
  assert (select count(*) from public.ride_participants) = 1, 'participations supprimées';
  assert (select count(*) from public.ride_tracks) = 0, 'traces GPS supprimées avec le compte';
end $$;

-- le compte du fondateur ne peut pas être supprimé
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'compte admin supprimé';
  exception when raise_exception then
    if sqlerrm = 'compte admin supprimé' then raise; end if;
  end;
end $$;
reset role;

\o
select 'Vérifications fonctionnelles : OK';
rollback;
