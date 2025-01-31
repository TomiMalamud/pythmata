import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiService from '@/services/api';
import {
  Box,
  Paper,
  AppBar,
  Toolbar,
  Button,
  TextField,
  CircularProgress,
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import BpmnModeler from 'bpmn-js/lib/Modeler';

// Default empty BPMN diagram
const emptyBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="156" y="81" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const ProcessDesigner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [processName, setProcessName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initializeModeler = async () => {
      if (!containerRef.current) return;

      try {
        // Initialize BPMN modeler
        modelerRef.current = new BpmnModeler({
          container: containerRef.current,
          keyboard: {
            bindTo: document,
          },
        });

        if (id) {
          // TODO: Fetch existing process
          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setProcessName('Existing Process');
          await modelerRef.current.importXML(emptyBpmn);
        } else {
          // Create new process
          setProcessName('New Process');
          await modelerRef.current.importXML(emptyBpmn);
        }
      } catch (error) {
        console.error('Error initializing BPMN modeler:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeModeler();

    return () => {
      modelerRef.current?.destroy();
    };
  }, [id]);

  const handleSave = async () => {
    if (!modelerRef.current || !processName) return;

    try {
      setSaving(true);
      const { xml } = await modelerRef.current.saveXML({ format: true });
      
      if (id) {
        // Update existing process
        await apiService.updateProcessDefinition(id, {
          name: processName,
          bpmnXml: xml
        });
      } else {
        // Create new process
        await apiService.createProcessDefinition({
          name: processName,
          bpmnXml: xml
        });
      }
      
      // Navigate back to process list
      navigate('/processes');
    } catch (error) {
      console.error('Error saving process:', error);
      // Show error notification
      alert('Failed to save process. Please try again.');
    } finally {
      setSaving(false);
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
    <Box sx={{ height: 'calc(100vh - 128px)', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="static"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar>
          <TextField
            value={processName}
            onChange={(e) => setProcessName(e.target.value)}
            variant="standard"
            placeholder="Process Name"
            sx={{ flexGrow: 1 }}
          />
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ ml: 2 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Toolbar>
      </AppBar>

      <Paper
        ref={containerRef}
        sx={{
          flexGrow: 1,
          overflow: 'hidden',
          '& .djs-palette': {
            position: 'fixed',
          },
        }}
      />
    </Box>
  );
};

export default ProcessDesigner;
