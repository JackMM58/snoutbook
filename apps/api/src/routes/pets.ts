import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pet, PetPhoto, VaccineRecord } from '@snoutbook/shared';
import { getPool, type Db } from '../db';
import { auth } from '../lib/auth';
import { handle, HttpError, notFound } from '../lib/errors';
import { petFileKey, putObject, signedUrl } from '../vendors/storage';

export const petsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']);

const PET_COLUMNS = `id, client_id AS "clientId", name, breed, weight_lbs AS "weightLbs", coat_type AS "coatType",
  birthday, temperament_notes AS "temperamentNotes"`;

async function getPet(db: Db, businessId: string, petId: string): Promise<Pet> {
  const { rows } = await db.query<Pet>(`SELECT ${PET_COLUMNS} FROM pets WHERE id = $1 AND business_id = $2`, [petId, businessId]);
  if (!rows[0]) throw notFound('Pet');
  return rows[0];
}

async function loadVaccines(db: Db, petId: string): Promise<VaccineRecord[]> {
  const { rows } = await db.query<Omit<VaccineRecord, 'fileUrl'> & { storageKey: string | null }>(
    `SELECT id, pet_id AS "petId", type, expires_on AS "expiresOn", file_name AS "fileName", storage_key AS "storageKey"
       FROM vaccine_records WHERE pet_id = $1 ORDER BY type, expires_on DESC`,
    [petId],
  );
  return Promise.all(
    rows.map(async ({ storageKey, ...record }) => ({
      ...record,
      fileUrl: storageKey ? await signedUrl(storageKey) : null,
    })),
  );
}

async function loadPhotos(db: Db, petId: string): Promise<PetPhoto[]> {
  const { rows } = await db.query<{ id: string; storageKey: string; caption: string | null; uploadedAt: string }>(
    `SELECT id, storage_key AS "storageKey", caption, uploaded_at AS "uploadedAt"
       FROM pet_photos WHERE pet_id = $1 ORDER BY uploaded_at DESC LIMIT 24`,
    [petId],
  );
  return Promise.all(rows.map(async ({ storageKey, ...photo }) => ({ ...photo, url: await signedUrl(storageKey) })));
}

petsRouter.get(
  '/pets/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const db = getPool();
    const pet = await getPet(db, businessId, req.params.id!);
    const [{ rows: clients }, vaccines, photos, { rows: visits }] = await Promise.all([
      db.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName", phone, email,
                address_line1 AS "addressLine1", city, zip, gate_notes AS "gateNotes"
           FROM clients WHERE id = $1`,
        [pet.clientId],
      ),
      loadVaccines(db, pet.id),
      loadPhotos(db, pet.id),
      db.query(
        `SELECT a.id, a.starts_at AS "startsAt", a.status, sv.name AS "serviceName", s.name AS "groomerName"
           FROM appointments a
           JOIN services sv ON sv.id = a.service_id
           JOIN staff s ON s.id = a.groomer_id
          WHERE a.pet_id = $1
          ORDER BY a.starts_at DESC
          LIMIT 10`,
        [pet.id],
      ),
    ]);
    res.json({ pet, client: clients[0], vaccines, photos, visits });
  }),
);

const petBody = z.object({
  name: z.string().trim().min(1).max(60),
  breed: z.string().trim().max(80).nullable().default(null),
  weightLbs: z.number().positive().max(250).nullable().default(null),
  coatType: z.enum(['short', 'double', 'curly', 'wire', 'long', 'combination']).nullable().default(null),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  temperamentNotes: z.string().max(2000).nullable().default(null),
});

petsRouter.post(
  '/clients/:clientId/pets',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const p = petBody.parse(req.body);
    const { rows } = await getPool().query<Pet>(
      `INSERT INTO pets (business_id, client_id, name, breed, weight_lbs, coat_type, birthday, temperament_notes)
       SELECT $1, c.id, $3, $4, $5, $6, $7, $8 FROM clients c WHERE c.id = $2 AND c.business_id = $1
       RETURNING ${PET_COLUMNS}`,
      [businessId, req.params.clientId, p.name, p.breed, p.weightLbs, p.coatType, p.birthday, p.temperamentNotes],
    );
    if (!rows[0]) throw notFound('Client');
    res.status(201).json({ pet: rows[0] });
  }),
);

petsRouter.patch(
  '/pets/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const p = petBody.parse(req.body);
    const { rows } = await getPool().query<Pet>(
      `UPDATE pets SET name = $3, breed = $4, weight_lbs = $5, coat_type = $6, birthday = $7, temperament_notes = $8
        WHERE id = $1 AND business_id = $2
        RETURNING ${PET_COLUMNS}`,
      [req.params.id, businessId, p.name, p.breed, p.weightLbs, p.coatType, p.birthday, p.temperamentNotes],
    );
    if (!rows[0]) throw notFound('Pet');
    res.json({ pet: rows[0] });
  }),
);

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new HttpError(400, 'Attach a file', 'file_required');
  if (!ALLOWED_TYPES.has(file.mimetype)) throw new HttpError(415, 'Upload a photo or a PDF', 'unsupported_file');
  return file;
}

petsRouter.post(
  '/pets/:id/photos',
  upload.single('photo'),
  handle(async (req, res) => {
    const { businessId, staffId } = auth(req);
    const db = getPool();
    const pet = await getPet(db, businessId, req.params.id!);
    const file = requireFile(req.file);
    const key = petFileKey(businessId, pet.id, file.originalname);
    await putObject(key, file.buffer, file.mimetype);
    const caption = typeof req.body.caption === 'string' ? req.body.caption.slice(0, 200) : null;
    await db.query('INSERT INTO pet_photos (pet_id, storage_key, caption, uploaded_by) VALUES ($1, $2, $3, $4)', [
      pet.id,
      key,
      caption,
      staffId,
    ]);
    res.status(201).json({ photos: await loadPhotos(db, pet.id) });
  }),
);

const vaccineBody = z.object({
  type: z.enum(['rabies', 'dhpp', 'bordetella']),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

petsRouter.post(
  '/pets/:id/vaccines',
  upload.single('file'),
  handle(async (req, res) => {
    const { businessId, staffId } = auth(req);
    const db = getPool();
    const pet = await getPet(db, businessId, req.params.id!);
    const body = vaccineBody.parse(req.body);

    let key: string | null = null;
    let fileName: string | null = null;
    if (req.file) {
      const file = requireFile(req.file);
      key = petFileKey(businessId, pet.id, file.originalname);
      fileName = file.originalname.slice(0, 200);
      await putObject(key, file.buffer, file.mimetype);
    }

    await db.query(
      `INSERT INTO vaccine_records (pet_id, type, expires_on, storage_key, file_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pet.id, body.type, body.expiresOn, key, fileName, staffId],
    );
    res.status(201).json({ vaccines: await loadVaccines(db, pet.id) });
  }),
);

petsRouter.patch(
  '/vaccines/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    const { expiresOn } = vaccineBody.pick({ expiresOn: true }).parse(req.body);
    const { rows } = await getPool().query<{ petId: string }>(
      `UPDATE vaccine_records v SET expires_on = $3
         FROM pets p
        WHERE v.id = $1 AND p.id = v.pet_id AND p.business_id = $2
        RETURNING v.pet_id AS "petId"`,
      [req.params.id, businessId, expiresOn],
    );
    if (!rows[0]) throw notFound('Vaccine record');
    res.json({ vaccines: await loadVaccines(getPool(), rows[0].petId) });
  }),
);

petsRouter.delete(
  '/vaccines/:id',
  handle(async (req, res) => {
    const { businessId } = auth(req);
    // The file stays in the bucket; lifecycle rules clean up orphaned keys.
    const { rowCount } = await getPool().query(
      `DELETE FROM vaccine_records v USING pets p WHERE v.id = $1 AND p.id = v.pet_id AND p.business_id = $2`,
      [req.params.id, businessId],
    );
    if (!rowCount) throw notFound('Vaccine record');
    res.status(204).end();
  }),
);
