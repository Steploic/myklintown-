-- Seed minimal pour les démos de pitch.
-- Insère la commune Yaoundé III et quelques secteurs, plus une structure pilote.

insert into public.communes (id, nom, code) values
  ('00000000-0000-0000-0000-000000000001', 'Yaoundé III', 'YDE3')
on conflict (code) do nothing;

insert into public.secteurs (commune_id, nom) values
  ('00000000-0000-0000-0000-000000000001', 'Nsam-Efoulan'),
  ('00000000-0000-0000-0000-000000000001', 'Mvog-Mbi'),
  ('00000000-0000-0000-0000-000000000001', 'Obobogo'),
  ('00000000-0000-0000-0000-000000000001', 'Etoa-Meki')
on conflict do nothing;

insert into public.structures (nom, type, contact_nom, contact_telephone, nb_menages_couverts) values
  ('Pré-collecte Nsam', 'pre_collecte', 'Mme Atangana', '+237690000001', 240),
  ('École publique Nsam', 'ecole', 'M. Mvondo', '+237690000002', 1)
on conflict do nothing;
