import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, beforeEach, vi, it, type Mock } from 'vitest';
import { renderWithQueryClient } from '../test/utils';
import { MCPPanel } from './MCPPanel';
import type { MCPServerResponse } from '../lib/api';
import { api } from '../lib/api';

vi.mock('../lib/api', () => {
  return {
    api: {
      getMcpServers: vi.fn(),
      mcpSearch: vi.fn(),
      mcpChat: vi.fn(),
    },
  };
});

type MockedApi = {
  getMcpServers: Mock;
  mcpSearch: Mock;
  mcpChat: Mock;
};

const mockedApi = api as unknown as MockedApi;

const serversPayload = {
  servers: [
    {
      id: 'energy-service',
      name: 'Energy Service',
      url: 'http://localhost:4000',
      type: 'http' as const,
      description: 'Antwortet auf Energiemarktfragen',
      defaultTools: {
        search: 'search-tool',
        chat: 'chat-tool',
      },
      enabled: true,
      isDefault: true,
      tools: [
        { name: 'search-tool', description: 'Suche im Energiemarkt' },
        { name: 'chat-tool', description: 'Chat zum Energiemarkt' },
      ],
    },
  ],
};

const searchResponse: MCPServerResponse = {
  serverId: 'energy-service',
  serverName: 'Energy Service',
  serverDescription: 'Antwortet auf Energiemarktfragen',
  tool: 'search-tool',
  result: {
    results: [
      {
        text: 'EDIFACT Einführung',
        score: 0.92,
        sourceCollection: 'combined',
      },
    ],
  },
};

const chatResponse: MCPServerResponse = {
  serverId: 'energy-service',
  serverName: 'Energy Service',
  serverDescription: 'Antwortet auf Energiemarktfragen',
  tool: 'chat-tool',
  result: {
    response: 'Hier ist die Antwort aus dem MCP.',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getMcpServers.mockResolvedValue(serversPayload);
  mockedApi.mcpSearch.mockResolvedValue(searchResponse);
  mockedApi.mcpChat.mockResolvedValue(chatResponse);
});

describe('MCPPanel', () => {
  it('shows server options and search results with metadata', async () => {
    renderWithQueryClient(<MCPPanel />);

    await waitFor(() => expect(mockedApi.getMcpServers).toHaveBeenCalled());

  const serverHeaders = await screen.findAllByText('Energy Service');
  expect(serverHeaders.length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText('Suche nach Energiemarkt-Themen...');
    await userEvent.type(searchInput, 'EDIFACT');

    fireEvent.click(screen.getByRole('button', { name: /suchen/i }));

    await waitFor(() => {
      expect(mockedApi.mcpSearch).toHaveBeenCalledWith({
        query: 'EDIFACT',
        collection: 'combined',
        limit: 10,
        serverId: 'energy-service',
        tool: undefined,
        autoSelect: false,
        allowedServerIds: undefined,
      });
    });

    expect(await screen.findByText('EDIFACT Einführung')).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes('Quelle') && content.includes('Energy Service') && content.includes('search-tool'),
      ),
    ).toBeInTheDocument();
  });

  it('appends chat responses with server label', async () => {
    renderWithQueryClient(<MCPPanel />);

  await waitFor(() => expect(mockedApi.getMcpServers).toHaveBeenCalled());

  await screen.findAllByText('Energy Service');
  await userEvent.click(screen.getByRole('button', { name: /chat/i }));

  const chatInput = await screen.findByPlaceholderText('Frage stellen...');
    await userEvent.type(chatInput, 'Wie funktioniert GPKE?');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(mockedApi.mcpChat).toHaveBeenCalled());

    expect(await screen.findByText('Hier ist die Antwort aus dem MCP.')).toBeInTheDocument();
    expect(screen.getByText('Energy Service (chat-tool)')).toBeInTheDocument();
  });
});
