import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import ServiceTaskPanel, { ExtendedBpmnModeler } from './ServiceTaskPanel';
import apiService from '@/services/api';

// Mock the API service
vi.mock('@/services/api', () => ({
  default: {
    getServiceTasks: vi.fn(),
  },
}));

// Mock data for service tasks
const mockServiceTasks = [
  {
    name: 'http',
    description: 'Make HTTP requests to external services and APIs',
    properties: [
      {
        name: 'url',
        label: 'URL',
        type: 'string',
        required: true,
        description: 'URL to send the request to',
      },
      {
        name: 'method',
        label: 'Method',
        type: 'string',
        required: true,
        default: 'GET',
        options: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method to use',
      },
    ],
  },
  {
    name: 'logger',
    description: 'Log messages during process execution',
    properties: [
      {
        name: 'level',
        label: 'Log Level',
        type: 'string',
        required: true,
        default: 'info',
        options: ['info', 'warning', 'error', 'debug'],
        description: 'Logging level',
      },
      {
        name: 'message',
        label: 'Message',
        type: 'string',
        required: true,
        description: 'Message to log',
      },
    ],
  },
];

// Mock modeler
const mockModeler = {
  get: vi.fn().mockImplementation((module) => {
    if (module === 'elementRegistry') {
      return {
        get: vi.fn().mockImplementation((id) => ({
          id,
          businessObject: {
            extensionElements: {
              values: [],
            },
          },
        })),
      };
    }
    if (module === 'modeling') {
      return {
        updateProperties: vi.fn(),
      };
    }
    if (module === 'moddle') {
      return {
        create: vi.fn().mockImplementation((type) => {
          if (type === 'bpmn:ExtensionElements') {
            return { values: [] };
          }
          if (type === 'pythmata:Properties') {
            return { values: [] };
          }
          if (type === 'pythmata:Property') {
            return { name: 'test', value: 'test' };
          }
          if (type === 'pythmata:ServiceTaskConfig') {
            return { taskName: 'test', properties: { values: [] } };
          }
          return {};
        }),
      };
    }
    return null;
  }),
  // Add required BpmnModeler properties to satisfy TypeScript
  importXML: vi.fn(),
  saveXML: vi.fn(),
  destroy: vi.fn(),
} as unknown as ExtendedBpmnModeler;

describe('ServiceTaskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the API response
    (apiService.getServiceTasks as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockServiceTasks,
    });
  });

  it('renders loading state initially', () => {
    const anchorEl = document.createElement('div');
    document.body.appendChild(anchorEl);

    render(
      <ServiceTaskPanel
        elementId="test-element"
        modeler={mockModeler}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders service task selector after loading', async () => {
    render(
      <ServiceTaskPanel
        elementId="test-element"
        modeler={mockModeler}
        onClose={() => {}}
      />
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Check that the service task selector is rendered
    expect(screen.getByLabelText('Service Task Type')).toBeInTheDocument();
    // The select is initially empty, so we check for the presence of the select element
    expect(
      screen.getByRole('combobox', { name: 'Service Task Type' })
    ).toBeInTheDocument();
  });

  it('displays task properties when a task is selected', async () => {
    render(
      <ServiceTaskPanel
        elementId="test-element"
        modeler={mockModeler}
        onClose={() => {}}
      />
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Select a task
    const selectElement = screen.getByRole('combobox');
    act(() => {
      fireEvent.mouseDown(selectElement);
    });
    // Wait for the dropdown to appear
    await waitFor(() => {
      expect(screen.getByText('http')).toBeInTheDocument();
    });
    act(() => {
      fireEvent.click(screen.getByText('http'));
    });

    // Check that the task properties are displayed
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Method')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    // Mock API error
    (apiService.getServiceTasks as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API error')
    );

    render(
      <ServiceTaskPanel
        elementId="test-element"
        modeler={mockModeler}
        onClose={() => {}}
      />
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Check that the error message is displayed
    expect(
      screen.getByText('Failed to load service tasks. Please try again.')
    ).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onCloseMock = vi.fn();
    render(
      <ServiceTaskPanel
        elementId="test-element"
        modeler={mockModeler}
        onClose={onCloseMock}
      />
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the close button
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
    });

    // Check that onClose was called
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('saves service task configuration when save button is clicked', async () => {
    // Create a more detailed mock for the modeler
    const updatePropertiesMock = vi.fn();
    const elementRegistryMock = {
      get: vi.fn().mockReturnValue({
        id: 'test-element',
        businessObject: {
          extensionElements: {
            values: [],
          },
        },
      }),
    };

    const modelingMock = {
      updateProperties: updatePropertiesMock,
    };

    const mddleMock = {
      create: vi.fn().mockImplementation((type) => {
        if (type === 'bpmn:ExtensionElements') {
          return { values: [] };
        }
        if (type === 'pythmata:Properties') {
          return { values: [] };
        }
        if (type === 'pythmata:Property') {
          return { name: 'test', value: 'test' };
        }
        if (type === 'pythmata:ServiceTaskConfig') {
          return { taskName: 'test', properties: { values: [] } };
        }
        return {};
      }),
    };

    const customMockModeler = {
      get: vi.fn().mockImplementation((module) => {
        if (module === 'elementRegistry') return elementRegistryMock;
        if (module === 'modeling') return modelingMock;
        if (module === 'moddle') return mddleMock;
        return null;
      }),
      importXML: vi.fn(),
      saveXML: vi.fn(),
      destroy: vi.fn(),
    } as unknown as ExtendedBpmnModeler;

    const onCloseMock = vi.fn();
    render(
      <ServiceTaskPanel
        elementId="test-element"
        modeler={customMockModeler}
        onClose={onCloseMock}
      />
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Select a task
    const selectElement = screen.getByRole('combobox');
    fireEvent.mouseDown(selectElement);
    // Wait for the dropdown to appear
    await waitFor(() => {
      expect(screen.getByText('http')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('http'));

    // Find the URL input and fill it
    // Wait for the URL input to appear
    await waitFor(() => {
      expect(screen.getByLabelText('URL')).toBeInTheDocument();
    });

    // Find the URL input by label
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });

    // Find the save button using data-testid
    const saveButton = screen.getByTestId('save-service-task');

    // Click the save button
    act(() => {
      fireEvent.click(saveButton);
    });

    // Wait for both the onClose to be called and updateProperties to be called
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
      expect(updatePropertiesMock).toHaveBeenCalled();
    });
  });
});
