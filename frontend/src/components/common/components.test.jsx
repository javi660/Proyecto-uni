import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ConfirmDialog, DataTable, Input, Modal, StatusBadge } from './index.js';

describe('Button', () => {
  test('en carga se deshabilita y no ejecuta el clic', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Guardar</Button>);
    const button = screen.getByRole('button', { name: /guardar/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  test('enlaza etiqueta, error y descripción de forma accesible', () => {
    render(<Input label="Correo" error="Correo inválido" required />);
    const input = screen.getByLabelText(/correo/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Correo inválido');
    expect(screen.getByRole('alert')).toHaveTextContent('Correo inválido');
  });
});

describe('Modal y ConfirmDialog', () => {
  test('cierra con Escape y con el botón cerrar; no renderiza si está cerrado', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open={false} title="Título" onClose={onClose}>Contenido</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<Modal open title="Título" onClose={onClose}>Contenido</Modal>);
    expect(screen.getByRole('dialog', { name: 'Título' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('ConfirmDialog confirma y cancela', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="¿Desactivar?" message="Se desactivará el usuario" confirmLabel="Desactivar" danger onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('mientras carga, Escape no cierra el diálogo de confirmación', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open loading title="t" message="m" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('DataTable y StatusBadge', () => {
  const columns = [
    { key: 'codigo', header: 'Código' },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge status={r.estado} /> },
  ];

  test('muestra filas, estado vacío y carga', () => {
    const { rerender } = render(<DataTable columns={columns} rows={[{ id: 1, codigo: 'SOL-2026-000001', estado: 'EN_PROCESO' }]} rowKey={(r) => r.id} />);
    expect(screen.getByText('SOL-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('En proceso')).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyTitle="Nada por aquí" />);
    expect(screen.getByText('Nada por aquí')).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
