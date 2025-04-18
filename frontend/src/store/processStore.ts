import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  ProcessDefinition,
  ProcessInstance,
  ProcessStats,
} from '@/types/process';
import apiService from '@/services/api';
import { ProcessVariableValue } from '@/types/process';
import {
  prepareVariablesForBackend,
  VariableValidationError,
} from '@/utils/validateVariables';

interface ProcessState {
  // Process Definitions
  definitions: ProcessDefinition[];
  selectedDefinition: ProcessDefinition | null;
  definitionsLoading: boolean;
  definitionsError: string | null;

  // Process Instances
  instances: ProcessInstance[];
  selectedInstance: ProcessInstance | null;
  instancesLoading: boolean;
  instancesError: string | null;

  // Stats
  stats: ProcessStats | null;
  statsLoading: boolean;
  statsError: string | null;

  // Actions
  fetchDefinitions: () => Promise<void>;
  fetchDefinition: (id: string) => Promise<void>;
  createDefinition: (name: string, bpmn_xml: string) => Promise<void>;
  updateDefinition: (
    id: string,
    name: string,
    bpmn_xml: string
  ) => Promise<void>;
  deleteDefinition: (id: string) => Promise<void>;

  fetchInstances: (definitionId?: string) => Promise<void>;
  fetchInstance: (id: string) => Promise<void>;
  startInstance: (
    definitionId: string,
    variables?: Record<string, ProcessVariableValue>
  ) => Promise<void>;
  suspendInstance: (id: string) => Promise<void>;
  resumeInstance: (id: string) => Promise<void>;

  fetchStats: () => Promise<void>;
  clearErrors: () => void;
}

const useProcessStore = create<ProcessState>()(
  devtools((set, get) => ({
    // Initial state
    definitions: [],
    selectedDefinition: null,
    definitionsLoading: false,
    definitionsError: null,

    instances: [],
    selectedInstance: null,
    instancesLoading: false,
    instancesError: null,

    stats: null,
    statsLoading: false,
    statsError: null,

    // Actions
    fetchDefinitions: async () => {
      try {
        set({ definitionsLoading: true, definitionsError: null });
        const response = await apiService.getProcessDefinitions();
        set({
          definitions: response.data.items,
          definitionsLoading: false,
        });
      } catch {
        set({
          definitionsLoading: false,
          definitionsError: 'Failed to fetch process definitions',
        });
      }
    },

    fetchDefinition: async (id: string) => {
      try {
        set({ definitionsLoading: true, definitionsError: null });
        const response = await apiService.getProcessDefinition(id);
        set({
          selectedDefinition: response.data,
          definitionsLoading: false,
        });
      } catch {
        set({
          definitionsLoading: false,
          definitionsError: 'Failed to fetch process definition',
        });
      }
    },

    createDefinition: async (name: string, bpmnXml: string) => {
      try {
        set({ definitionsLoading: true, definitionsError: null });
        await apiService.createProcessDefinition({ name, bpmnXml });
        await get().fetchDefinitions();
      } catch {
        set({
          definitionsLoading: false,
          definitionsError: 'Failed to create process definition',
        });
      }
    },

    updateDefinition: async (id: string, name: string, bpmnXml: string) => {
      try {
        set({ definitionsLoading: true, definitionsError: null });
        await apiService.updateProcessDefinition(id, { name, bpmnXml });
        await get().fetchDefinitions();
      } catch {
        set({
          definitionsLoading: false,
          definitionsError: 'Failed to update process definition',
        });
      }
    },

    deleteDefinition: async (id: string) => {
      try {
        set({ definitionsLoading: true, definitionsError: null });
        await apiService.deleteProcessDefinition(id);
        await get().fetchDefinitions();
      } catch {
        set({
          definitionsLoading: false,
          definitionsError: 'Failed to delete process definition',
        });
      }
    },

    fetchInstances: async (definitionId?: {
      definitionId?: string;
      page?: number;
      pageSize?: number;
      status?: string;
    }) => {
      try {
        set({ instancesLoading: true, instancesError: null });
        const response = await apiService.getProcessInstances(definitionId);
        set({
          instances: response.data.items,
          instancesLoading: false,
        });
      } catch {
        set({
          instancesLoading: false,
          instancesError: 'Failed to fetch process instances',
        });
      }
    },

    fetchInstance: async (id: string) => {
      try {
        set({ instancesLoading: true, instancesError: null });
        const response = await apiService.getProcessInstance(id);
        set({
          selectedInstance: response.data,
          instancesLoading: false,
        });
      } catch {
        set({
          instancesLoading: false,
          instancesError: 'Failed to fetch process instance',
        });
      }
    },

    startInstance: async (
      definitionId: string,
      variables?: Record<string, ProcessVariableValue>
    ) => {
      try {
        set({ instancesLoading: true, instancesError: null });

        // Validate and prepare variables for backend
        const preparedVariables = variables
          ? prepareVariablesForBackend(variables)
          : undefined;

        // Start the process instance with validated variables
        await apiService.startProcessInstance({
          definitionId,
          variables: preparedVariables,
        });
        await get().fetchInstances();
      } catch (error) {
        console.error('Error starting process instance:', error);

        // Handle validation errors specifically
        if (error instanceof VariableValidationError) {
          set({
            instancesLoading: false,
            instancesError: `Variable validation error: ${error.message}`,
          });
        } else {
          set({
            instancesLoading: false,
            instancesError: 'Failed to start process instance',
          });
        }
      }
    },

    suspendInstance: async (id: string) => {
      try {
        set({ instancesLoading: true, instancesError: null });
        await apiService.suspendProcessInstance(id);
        await get().fetchInstance(id);
      } catch {
        set({
          instancesLoading: false,
          instancesError: 'Failed to suspend process instance',
        });
      }
    },

    resumeInstance: async (id: string) => {
      try {
        set({ instancesLoading: true, instancesError: null });
        await apiService.resumeProcessInstance(id);
        await get().fetchInstance(id);
      } catch {
        set({
          instancesLoading: false,
          instancesError: 'Failed to resume process instance',
        });
      }
    },

    fetchStats: async () => {
      try {
        set({ statsLoading: true, statsError: null });
        const response = await apiService.getProcessStats();
        set({
          stats: response.data,
          statsLoading: false,
        });
      } catch {
        set({
          statsLoading: false,
          statsError: 'Failed to fetch process stats',
        });
      }
    },

    clearErrors: () => {
      set({
        definitionsError: null,
        instancesError: null,
        statsError: null,
      });
    },
  }))
);

export default useProcessStore;
