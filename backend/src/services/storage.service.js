'use strict';

const fs = require('fs/promises');
const path = require('path');
const { env } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Almacenamiento de objetos (adjuntos). Interfaz: put(key, buffer, mime), get(key), remove(key).
 *
 * - Producción: bucket PRIVADO de Supabase Storage (service role key, solo desde el backend).
 * - Pruebas: memoria.
 * - Desarrollo sin Supabase configurado: carpeta local `backend/.storage` (ignorada por git).
 *
 * Las claves las genera siempre el sistema (`solicitudes/{id}/{uuid}.{ext}`); aquí se vuelven
 * a verificar para impedir recorridos de ruta.
 */

const KEY_PATTERN = /^solicitudes\/\d+\/[0-9a-f-]{36}\.(pdf|png|jpg|docx)$/;

function assertSafeKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new Error('Clave de almacenamiento no válida');
  }
}

function createMemoryDriver() {
  const objects = new Map();
  return {
    name: 'memory',
    async put(key, buffer) { objects.set(key, Buffer.from(buffer)); },
    async get(key) {
      const found = objects.get(key);
      if (!found) throw Object.assign(new Error('Objeto no encontrado'), { code: 'STORAGE_NOT_FOUND' });
      return Buffer.from(found);
    },
    async remove(key) { objects.delete(key); },
    _objects: objects,
  };
}

function createLocalDriver(baseDir) {
  const resolve = (key) => {
    const full = path.resolve(baseDir, key);
    if (!full.startsWith(path.resolve(baseDir) + path.sep)) throw new Error('Clave de almacenamiento no válida');
    return full;
  };
  return {
    name: 'local',
    async put(key, buffer) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, buffer, { flag: 'wx' });
    },
    async get(key) {
      try {
        return await fs.readFile(resolve(key));
      } catch (error) {
        if (error.code === 'ENOENT') throw Object.assign(new Error('Objeto no encontrado'), { code: 'STORAGE_NOT_FOUND' });
        throw error;
      }
    },
    async remove(key) { await fs.rm(resolve(key), { force: true }); },
  };
}

function createSupabaseDriver({ url, serviceKey, bucket }) {
  // Carga perezosa: solo se requiere la librería si realmente se usa Supabase Storage.
  // eslint-disable-next-line global-require
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = () => client.storage.from(bucket);
  return {
    name: 'supabase',
    async put(key, buffer, mime) {
      const { error } = await storage().upload(key, buffer, { contentType: mime, upsert: false });
      if (error) throw new Error(`Supabase Storage: ${error.message}`);
    },
    async get(key) {
      const { data, error } = await storage().download(key);
      if (error || !data) throw Object.assign(new Error('Objeto no encontrado'), { code: 'STORAGE_NOT_FOUND' });
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(key) {
      const { error } = await storage().remove([key]);
      if (error) logger.warn('No se pudo eliminar un objeto de Storage', { key });
    },
  };
}

let driver = null;

function getDriver() {
  if (driver) return driver;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    driver = createSupabaseDriver({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.STORAGE_BUCKET });
  } else if (env.NODE_ENV === 'test') {
    driver = createMemoryDriver();
  } else {
    driver = createLocalDriver(path.resolve(__dirname, '../../.storage'));
    logger.warn('Almacenamiento local de adjuntos (Supabase Storage no configurado)');
  }
  return driver;
}

/** Solo para pruebas: sustituye el controlador de almacenamiento. */
function setDriverForTests(custom) { driver = custom; }

module.exports = {
  createMemoryDriver,
  setDriverForTests,
  put: async (key, buffer, mime) => { assertSafeKey(key); return getDriver().put(key, buffer, mime); },
  get: async (key) => { assertSafeKey(key); return getDriver().get(key); },
  remove: async (key) => { assertSafeKey(key); return getDriver().remove(key); },
  driverName: () => getDriver().name,
};
