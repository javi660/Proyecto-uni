import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination.jsx';

describe('Pagination', () => {
  test('no muestra nada sin resultados', () => {
    const { container } = render(<Pagination meta={{ page: 1, pageSize: 20, total: 0 }} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('una sola página: resumen sin botones', () => {
    render(<Pagination meta={{ page: 1, pageSize: 20, total: 7 }} onPageChange={() => {}} />);
    expect(screen.getByText('Mostrando 1–7 de 7')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('navega y deshabilita los extremos', async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination meta={{ page: 1, pageSize: 10, total: 25 }} onPageChange={onPageChange} />);
    expect(screen.getByText('Mostrando 1–10 de 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /página anterior/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /página siguiente/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(<Pagination meta={{ page: 3, pageSize: 10, total: 25 }} onPageChange={onPageChange} />);
    expect(screen.getByText('Mostrando 21–25 de 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /página siguiente/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /página anterior/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });
});
