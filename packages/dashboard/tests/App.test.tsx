// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const never = new Promise<never>(() => {});

vi.mock('../src/api', () => ({
  api: {
    getBuildingDashboard: vi.fn(() => never),
    getAnomalies: vi.fn(() => never),
    getChaosScenarios: vi.fn(() => never),
    getEnergyAnalytics: vi.fn(() => never),
    getComfortAnalytics: vi.fn(() => never),
  },
  connectWebSocket: vi.fn(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    close: vi.fn(),
  })),
}));

import App from '../src/App';

function renderApp(initialEntries: string[] = ['/']) {
  render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('should render navigation', () => {
    renderApp();
    expect(screen.getByText('BIM MEP')).toBeInTheDocument();
    expect(screen.getByText('Building Overview')).toBeInTheDocument();
    expect(screen.getByText('Anomaly Center')).toBeInTheDocument();
    expect(screen.getByText('Energy Analysis')).toBeInTheDocument();
  });

  it('should render building overview by default', () => {
    renderApp(['/']);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render anomaly center page', () => {
    renderApp(['/anomalies']);
    expect(screen.getByText('Anomaly & Alert Center')).toBeInTheDocument();
  });

  it('should render energy analysis page', () => {
    renderApp(['/energy']);
    expect(screen.getByText('Energy & Comfort Analysis')).toBeInTheDocument();
  });

  it('should have navigation links', () => {
    renderApp();
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(3);
  });
});
