import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '@/services/api';
import { formatDate } from '@/utils/date';
import { ProcessDefinition } from '@/types/process';
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
} from '@mui/icons-material';
import ProcessVariablesDialog, {
  ProcessVariables,
} from '@/components/shared/ProcessVariablesDialog/ProcessVariablesDialog';

const ProcessList = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [processes, setProcesses] = useState<
    (ProcessDefinition & {
      active_instances: number;
      total_instances: number;
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
      !process.variable_definitions ||
      process.variable_definitions.length === 0
    ) {
      // If no variables defined, start process directly
      try {
        const payload = {
          definition_id: process.id,
          variables: {},
        };

        const response = await apiService.startProcessInstance(payload);
        navigate(`/processes/${process.id}/instances/${response.data.id}`);
      } catch (error) {
        console.error('Failed to start process:', error);
        if (error instanceof Error) {
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
      const response = await apiService.startProcessInstance({
        definition_id: selectedProcess.id,
        variables,
      });
      navigate(
        `/processes/${selectedProcess.id}/instances/${response.data.id}`
      );
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  const handleEditProcess = (processId: string) => {
    navigate(`/processes/${processId}`);
  };

  const handleDeleteProcess = (_processId: string) => {
    // TODO: Implement process deletion
    alert('Process deletion functionality not yet implemented');
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
                      {process.active_instances}
                    </Link>
                  </TableCell>
                  <TableCell>{process.total_instances}</TableCell>
                  <TableCell>{formatDate(process.updated_at)}</TableCell>
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
        variableDefinitions={selectedProcess?.variable_definitions || []}
        onClose={() => {
          setDialogOpen(false);
          setSelectedProcess(null);
        }}
        onSubmit={handleStartProcessSubmit}
      />
    </Box>
  );
};

export default ProcessList;
