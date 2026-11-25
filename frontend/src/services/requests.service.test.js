import { beforeEach, describe, expect, test, vi } from 'vitest';
import api, { ApiError } from './api.js';
import { requestsApi } from './requests.service.js';

vi.mock('./api.js', async (original) => {
  const actual = await original();
  return { ...actual, default: { get: vi.fn(), post: vi.fn() } };
});

beforeEach(() => vi.clearAllMocks());

describe('requestsApi', () => {
  test('list quita parámetros vacíos y devuelve items + meta', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id_solicitud: 1 }], meta: { page: 1, pageSize: 20, total: 1 } } });
    const result = await requestsApi.list({ q: '', estado: 'ASIGNADA', page: 1 });
    expect(api.get).toHaveBeenCalledWith('/requests', { params: { estado: 'ASIGNADA', page: 1 } });
    expect(result).toEqual({ items: [{ id_solicitud: 1 }], meta: { page: 1, pageSize: 20, total: 1 } });
  });

  test('create y get usan los endpoints correctos', async () => {
    api.post.mockResolvedValue({ data: { data: { id_solicitud: 5 } } });
    api.get.mockResolvedValue({ data: { data: { id_solicitud: 5 } } });
    await requestsApi.create({ id_servicio: 1, asunto: 'a', descripcion: 'b' });
    expect(api.post).toHaveBeenCalledWith('/requests', { id_servicio: 1, asunto: 'a', descripcion: 'b' });
    await requestsApi.get(5);
    expect(api.get).toHaveBeenCalledWith('/requests/5');
  });

  test('uploadAttachment envía multipart con el campo "archivo"', async () => {
    api.post.mockResolvedValue({ data: { data: { id_adjunto: 1 } } });
    const file = new File(['%PDF-1.4'], 'acta.pdf', { type: 'application/pdf' });
    await requestsApi.uploadAttachment(7, file);
    const [url, form] = api.post.mock.calls[0];
    expect(url).toBe('/requests/7/attachments');
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('archivo').name).toBe('acta.pdf');
  });

  test('downloadAttachment descarga como blob y dispara el guardado con el nombre original', async () => {
    api.get.mockResolvedValue({ data: new Blob(['x'], { type: 'application/pdf' }) });
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await requestsApi.downloadAttachment({ id_adjunto: 3, nombre_original: 'Acta.pdf' });
    expect(api.get).toHaveBeenCalledWith('/attachments/3/download', { responseType: 'blob' });
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  test('si la descarga falla, lee el mensaje del servidor dentro del Blob', async () => {
    const body = JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'El archivo ya no está disponible', details: [] } });
    api.get.mockRejectedValue({ response: { status: 404, data: new Blob([body], { type: 'application/json' }) } });
    await expect(requestsApi.downloadAttachment({ id_adjunto: 3, nombre_original: 'a.pdf' })).rejects.toMatchObject({
      status: 404, code: 'NOT_FOUND', message: 'El archivo ya no está disponible',
    });
    await expect(requestsApi.downloadAttachment({ id_adjunto: 3, nombre_original: 'a.pdf' })).rejects.toBeInstanceOf(ApiError);
  });
});
