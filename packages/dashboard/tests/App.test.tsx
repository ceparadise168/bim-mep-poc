// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

describe('App', () => {
  it('should render navigation', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('BIM MEP Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Building Overview')).toBeInTheDocument();
    expect(screen.getByText('Anomaly Center')).toBeInTheDocument();
    expect(screen.getByText('Energy Analysis')).toBeInTheDocument();
  });

  it('should render building overview by default', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    // BuildingOverview renders "Loading..." initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render anomaly center page', () => {
    render(
      <MemoryRouter initialEntries={['/anomalies']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Anomaly & Alert Center')).toBeInTheDocument();
  });

  it('should render energy analysis page', () => {
    render(
      <MemoryRouter initialEntries={['/energy']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Energy & Comfort Analysis')).toBeInTheDocument();
  });

  it('should have navigation links', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(3);
  });
});
