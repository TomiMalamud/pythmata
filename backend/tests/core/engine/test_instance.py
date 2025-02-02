from datetime import datetime
from typing import Dict, Optional
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pythmata.core.config import Settings
from pythmata.core.engine.executor import ProcessExecutor
from pythmata.core.engine.instance import (
    InvalidProcessDefinitionError,
    InvalidStateTransitionError,
    InvalidVariableError,
    ProcessInstanceError,
    ProcessInstanceManager,
)
from pythmata.core.engine.token import Token
from pythmata.core.state import StateManager
from pythmata.models.process import (
    ProcessDefinition,
    ProcessInstance,
    ProcessStatus,
    Variable,
)

# Test Data
SIMPLE_PROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_1" />
    <bpmn:endEvent id="End_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""

MULTI_START_PROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" />
    <bpmn:startEvent id="Start_2" />
    <bpmn:task id="Task_1" />
    <bpmn:endEvent id="End_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Start_2" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""


@pytest.fixture
async def process_definition(session: AsyncSession) -> ProcessDefinition:
    """Create a test process definition."""
    definition = ProcessDefinition(
        id=uuid4(), name="Test Process", version=1, bpmn_xml=SIMPLE_PROCESS_XML
    )
    session.add(definition)
    await session.commit()
    return definition


@pytest.fixture
async def multi_start_process_definition(session: AsyncSession) -> ProcessDefinition:
    """Create a test process definition with multiple start events."""
    definition = ProcessDefinition(
        id=uuid4(),
        name="Multi Start Process",
        version=1,
        bpmn_xml=MULTI_START_PROCESS_XML,
    )
    session.add(definition)
    await session.commit()
    return definition


@pytest.fixture
async def state_manager(test_settings: Settings) -> StateManager:
    """Create a test state manager."""
    manager = StateManager(test_settings)
    await manager.connect()
    yield manager
    await manager.disconnect()


@pytest.fixture
async def process_executor(state_manager: StateManager) -> ProcessExecutor:
    """Create a test process executor."""
    return ProcessExecutor(state_manager)


@pytest.fixture
async def instance_manager(
    session: AsyncSession,
    process_executor: ProcessExecutor,
    state_manager: StateManager,
) -> ProcessInstanceManager:
    """Create a test process instance manager."""
    return ProcessInstanceManager(session, process_executor, state_manager)


class TestProcessInstanceCreation:
    async def test_create_basic_instance(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test creating a basic process instance without variables.

        Should:
        1. Create a new process instance record
        2. Initialize instance with default start event
        3. Set instance status to RUNNING
        4. Create initial token at start event
        """
        # Create instance
        instance = await instance_manager.create_instance(process_definition.id)

        # Verify instance creation
        assert instance.status == ProcessStatus.RUNNING
        assert instance.definition_id == process_definition.id
        assert instance.start_time is not None
        assert instance.end_time is None

        # Verify token creation
        tokens = await state_manager.get_token_positions(str(instance.id))
        assert len(tokens) == 1
        assert tokens[0]["node_id"] == "Start_1"

    async def test_create_instance_with_variables(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test creating a process instance with initial variables.

        Should:
        1. Create instance with provided variables
        2. Store variables with correct types
        3. Make variables accessible in process scope
        """
        # Create instance with variables
        variables = {
            "amount": {"type": "integer", "value": 1000},
            "approved": {"type": "boolean", "value": False},
            "notes": {"type": "string", "value": "Test notes"},
        }
        instance = await instance_manager.create_instance(
            process_definition.id, variables=variables
        )

        # Verify variables
        variables = await instance_manager.get_instance_variables(instance.id)
        assert len(variables) == 3
        assert variables["amount"] == 1000
        assert variables["approved"] is False
        assert variables["notes"] == "Test notes"

    async def test_create_instance_with_specific_start_event(
        self,
        session: AsyncSession,
        multi_start_process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test creating an instance with a specified start event.

        Should:
        1. Create instance starting from specified event
        2. Initialize token at correct start event
        3. Handle valid start event selection
        """
        start_event_id = "Start_2"

        # Create instance with specific start event
        instance = await instance_manager.create_instance(
            multi_start_process_definition.id, start_event_id=start_event_id
        )

        # Verify token creation at specific start event
        tokens = await state_manager.get_token_positions(str(instance.id))
        assert len(tokens) == 1
        assert tokens[0]["node_id"] == start_event_id

    async def test_create_instance_with_invalid_process_definition(
        self,
        session: AsyncSession,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test error handling for invalid process definition.

        Should:
        1. Validate process definition exists
        2. Handle missing/invalid process definition gracefully
        3. Prevent instance creation for invalid definition
        """
        with pytest.raises(InvalidProcessDefinitionError):
            await instance_manager.create_instance(
                uuid4()
            )  # Non-existent definition ID

    async def test_create_instance_with_invalid_variables(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test error handling for invalid variable data.

        Should:
        1. Validate variable types
        2. Handle invalid variable values
        3. Prevent instance creation with invalid variables
        """
        # Try to create instance with invalid variable
        invalid_variables = {"invalid_var": {"type": "invalid_type", "value": "test"}}

        with pytest.raises(InvalidVariableError):
            await instance_manager.create_instance(
                process_definition.id, variables=invalid_variables
            )


class TestProcessInstanceState:
    async def test_suspend_instance(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test suspending a running process instance.

        Should:
        1. Change instance status to SUSPENDED
        2. Preserve instance state
        3. Prevent further token movement
        """
        # Create and suspend instance
        instance = await instance_manager.create_instance(process_definition.id)
        instance = await instance_manager.suspend_instance(instance.id)

        # Verify suspension
        assert instance.status == ProcessStatus.SUSPENDED

        # Verify tokens are preserved
        tokens = await state_manager.get_token_positions(str(instance.id))
        assert len(tokens) == 1
        assert tokens[0]["node_id"] == "Start_1"

    async def test_resume_instance(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test resuming a suspended process instance.

        Should:
        1. Change instance status back to RUNNING
        2. Restore instance state
        3. Allow token movement to continue
        """
        # Create and suspend instance
        instance = await instance_manager.create_instance(process_definition.id)
        instance = await instance_manager.suspend_instance(instance.id)

        # Resume instance
        instance = await instance_manager.resume_instance(instance.id)

        # Verify resumption
        assert instance.status == ProcessStatus.RUNNING

        # Verify tokens are preserved and can move
        tokens = await state_manager.get_token_positions(str(instance.id))
        assert len(tokens) == 1
        assert tokens[0]["node_id"] == "Start_1"

        # Test token can move
        token = Token.from_dict(tokens[0])
        new_token = await process_executor.move_token(token, "Task_1")
        assert new_token.node_id == "Task_1"

    async def test_terminate_instance(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test terminating a process instance.

        Should:
        1. Change instance status to COMPLETED
        2. Set end time
        3. Clean up instance state
        4. Remove all tokens
        """
        # Create and terminate instance
        instance = await instance_manager.create_instance(process_definition.id)
        instance = await instance_manager.terminate_instance(instance.id)

        # Verify termination
        assert instance.status == ProcessStatus.COMPLETED
        assert instance.end_time is not None

        # Verify tokens are removed
        tokens = await state_manager.get_token_positions(str(instance.id))
        assert len(tokens) == 0

    async def test_handle_error_state(
        self,
        session: AsyncSession,
        process_definition: ProcessDefinition,
        state_manager: StateManager,
        process_executor: ProcessExecutor,
        instance_manager: ProcessInstanceManager,
    ):
        """
        Test handling process instance errors.

        Should:
        1. Change instance status to ERROR
        2. Preserve instance state for debugging
        3. Prevent further token movement
        4. Allow error recovery
        """
        # Create instance and set error state
        instance = await instance_manager.create_instance(process_definition.id)
        instance = await instance_manager.set_error_state(instance.id)

        # Verify error state
        assert instance.status == ProcessStatus.ERROR

        # Verify tokens are preserved
        tokens = await state_manager.get_token_positions(str(instance.id))
        assert len(tokens) == 1
        assert tokens[0]["node_id"] == "Start_1"

        # Test recovery by resuming to RUNNING state
        instance = await instance_manager.resume_instance(instance.id)
        assert instance.status == ProcessStatus.RUNNING
