-- Pet profiles v2: more pet details, groomer photos, vaccine records with files.

ALTER TABLE pets
  ADD COLUMN coat_type text CHECK (coat_type IN ('short', 'double', 'curly', 'wire', 'long', 'combination')),
  ADD COLUMN birthday date;

CREATE TABLE pet_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,
  caption      text,
  uploaded_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pet_photos_pet_idx ON pet_photos (pet_id, uploaded_at DESC);

CREATE TABLE vaccine_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('rabies', 'dhpp', 'bordetella')),
  expires_on   date NOT NULL,
  storage_key  text,
  file_name    text,
  created_by   uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vaccine_records_pet_idx ON vaccine_records (pet_id);
