import { describe, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttachmentPicker from './AttachmentPicker.jsx';

const pdf = (name = 'acta.pdf', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

function Harness({ onChange = () => {} }) {
  const [files, setFiles] = useState([]);
  return <AttachmentPicker files={files} onChange={(next) => { setFiles(next); onChange(next); }} />;
}

const setup = () => userEvent.setup({ applyAccept: false });

describe('AttachmentPicker', () => {
  test('agrega y quita archivos válidos', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.upload(screen.getByLabelText('Seleccionar archivos adjuntos'), pdf());
    expect(screen.getByText('acta.pdf')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'acta.pdf' })]);

    await user.click(screen.getByRole('button', { name: 'Quitar acta.pdf' }));
    expect(screen.queryByText('acta.pdf')).toBeNull();
  });

  test('rechaza tipo no permitido y tamaño excesivo con mensajes claros', async () => {
    const user = setup();
    render(<Harness />);
    const input = screen.getByLabelText('Seleccionar archivos adjuntos');
    await user.upload(input, new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('"virus.exe": solo se permiten archivos PDF, PNG, JPG o DOCX');
    expect(screen.queryByRole('list', { name: /archivos seleccionados/i })).toBeNull();

    await user.upload(input, pdf('enorme.pdf', 5 * 1024 * 1024 + 1));
    expect(await screen.findByRole('alert')).toHaveTextContent('supera el tamaño máximo de 5 MB');
  });

  test('máximo 3 archivos: al llegar al límite el botón se deshabilita', async () => {
    const user = setup();
    render(<Harness />);
    const input = screen.getByLabelText('Seleccionar archivos adjuntos');
    await user.upload(input, [pdf('a.pdf', 1), pdf('b.pdf', 2), pdf('c.pdf', 3), pdf('d.pdf', 4)]);
    expect(within(screen.getByRole('list', { name: /archivos seleccionados/i })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Solo puedes adjuntar hasta 3 archivos');
    expect(screen.getByRole('button', { name: 'Agregar archivos' })).toBeDisabled();
  });

  test('no permite el mismo archivo dos veces', async () => {
    const user = setup();
    render(<Harness />);
    const input = screen.getByLabelText('Seleccionar archivos adjuntos');
    await user.upload(input, pdf());
    await user.upload(input, pdf());
    expect(within(screen.getByRole('list', { name: /archivos seleccionados/i })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('ya está en la lista');
  });
});
