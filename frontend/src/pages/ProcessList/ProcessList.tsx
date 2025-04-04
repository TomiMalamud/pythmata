import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '@/services/api';
import { formatDate } from '@/utils/dateUtils';
import { ProcessDefinition } from '@/types/process';
import {
  prepareVariablesForBackend,
  VariableValidationError,
} from '@/utils/validateVariables';
import useConfirmDialog from '@/hooks/useConfirmDialog';
import {
  Box,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Chip,
  CircularProgress,
  Link,
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  ListAlt as ListAltIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import ProcessVariablesDialog, {
  ProcessVariables,
} from '@/components/shared/ProcessVariablesDialog/ProcessVariablesDialog';

const ProcessList = () => {
  const navigate = useNavigate();
  const { confirmDelete, ConfirmDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [processes, setProcesses] = useState<
    (ProcessDefinition & {
      activeInstances: number;
      totalInstances: number;
    })[]
  >([]);
  const [selectedProcess, setSelectedProcess] =
    useState<ProcessDefinition | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const response = await apiService.getProcessDefinitions();
        setProcesses(response.data.items);
      } catch {
        alert('Failed to load processes. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchProcesses();
  }, []);

  const handleStartProcess = async (process: ProcessDefinition) => {
    if (
      !process.variableDefinitions ||
      process.variableDefinitions.length === 0
    ) {
      // If no variables defined, start process directly
      try {
        const payload = {
          definitionId: process.id,
          variables: {},
        };

        const response = await apiService.startProcessInstance(payload);
        navigate(`/processes/${process.id}/instances/${response.data.id}`);
      } catch (error) {
        console.error('Failed to start process:', error);
        if (error instanceof VariableValidationError) {
          alert(`Variable validation error: ${error.message}`);
        } else if (error instanceof Error) {
          alert(error.message);
        } else {
          alert('An unexpected error occurred');
        }
      }
      return;
    }

    // If process has variables, show dialog
    setSelectedProcess(process);
    setDialogOpen(true);
  };

  const handleStartProcessSubmit = async (variables: ProcessVariables) => {
    if (!selectedProcess) return;

    try {
      // Validate and prepare variables for backend
      const preparedVariables = prepareVariablesForBackend(variables);

      const response = await apiService.startProcessInstance({
        definitionId: selectedProcess.id,
        variables: preparedVariables,
      });

      navigate(
        `/processes/${selectedProcess.id}/instances/${response.data.id}`
      );
    } catch (error) {
      if (error instanceof VariableValidationError) {
        alert(`Variable validation error: ${error.message}`);
      } else if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  const handleEditProcess = (processId: string) => {
    navigate(`/processes/${processId}`);
  };

  const handleDeleteProcess = async (processId: string) => {
    try {
      const processName =
        processes.find((p) => p.id === processId)?.name || 'this process';
      const confirmed = await confirmDelete(`process "${processName}"`);

      if (confirmed) {
        await apiService.deleteProcessDefinition(processId);

        // Refresh the process list
        setProcesses(processes.filter((process) => process.id !== processId));
      }
    } catch (error) {
      console.error('Failed to delete process:', error);
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('An unexpected error occurred while deleting the process');
      }
    }
  };

  /**
   * Creates a copy of an existing process definition
   * @param process The process definition to copy
   */
  const handleCopyProcess = async (process: ProcessDefinition) => {
    try {
      // Create a new process with the same data
      const newProcess = {
        name: `Copy of ${process.name}`,
        bpmnXml: process.bpmnXml,
        variableDefinitions: process.variableDefinitions,
      };

      // Call the API to create the new process
      const response = await apiService.createProcessDefinition(newProcess);

      // Add the new process to the list
      setProcesses([
        ...processes,
        {
          ...response.data,
          activeInstances: 0,
          totalInstances: 0,
        },
      ]);

      // Show success message
      alert('Process copied successfully');
    } catch (error) {
      console.error('Failed to copy process:', error);
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('An unexpected error occurred while copying the process');
      }
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
        }}
      >
        <Typography variant="h4">Process Definitions</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/processes/new')}
        >
          New Process
        </Button>
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Active Instances</TableCell>
                <TableCell>Total Instances</TableCell>
                <TableCell>Last Modified</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {processes.map((process) => (
                <TableRow key={process.id}>
                  <TableCell>{process.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={`v${process.version}`}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      component="button"
                      onClick={() =>
                        navigate(`/processes/${process.id}/instances`)
                      }
                      sx={{ textDecoration: 'none' }}
                    >
                      {process.activeInstances}
                    </Link>
                  </TableCell>
                  <TableCell>{process.totalInstances}</TableCell>
                  <TableCell>{formatDate(process.updatedAt)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      color="primary"
                      onClick={() =>
                        navigate(`/processes/${process.id}/diagram`)
                      }
                      title="View Diagram"
                    >
                      <VisibilityIcon />
                    </IconButton>
                    <IconButton
                      color="primary"
                      onClick={() =>
                        navigate(`/processes/${process.id}/instances`)
                      }
                      title="View Instances"
                    >
                      <ListAltIcon />
                    </IconButton>
                    <IconButton
                      color="primary"
                      onClick={() => handleStartProcess(process)}
                      title="Start Process"
                    >
                      <PlayArrowIcon />
                    </IconButton>
                    <IconButton
                      color="primary"
                      onClick={() => handleEditProcess(process.id)}
                      title="Edit Process"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="primary"
                      onClick={() => handleCopyProcess(process)}
                      title="Copy Process"
                    >
                      <ContentCopyIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDeleteProcess(process.id)}
                      title="Delete Process"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {processes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="textSecondary">
                      No processes found. Create a new process to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <ProcessVariablesDialog
        open={dialogOpen}
        processId={selectedProcess?.id || ''}
        variableDefinitions={selectedProcess?.variableDefinitions || []}
        onClose={() => {
          setDialogOpen(false);
          setSelectedProcess(null);
        }}
        onSubmit={handleStartProcessSubmit}
      />
      <ConfirmDialog />
    </Box>
  );
};

export default ProcessList;
