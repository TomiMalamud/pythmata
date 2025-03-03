import os
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from pythmata.api.routes import router as process_router
from pythmata.core.bpmn.parser import BPMNParser
from pythmata.core.config import Settings
from pythmata.core.database import get_db, init_db
from pythmata.core.engine.executor import ProcessExecutor
from pythmata.core.engine.instance import ProcessInstanceManager
from pythmata.core.events import EventBus
from pythmata.core.services import get_service_task_registry
from pythmata.core.state import StateManager
from pythmata.models.process import ProcessDefinition as ProcessDefinitionModel
from pythmata.utils.logger import get_logger

logger = get_logger(__name__)


async def handle_timer_triggered(data: dict) -> None:
    """
    Handle process.timer_triggered event by creating a process instance and publishing a process.started event.
    
    This function is specifically for handling timer events and avoids the event loop conflicts
    that can occur when creating process instances directly in the timer callback.
    
    Args:
        data: Dictionary containing instance_id, definition_id, and other timer information
    """
    try:
        instance_id = data["instance_id"]
        definition_id = data["definition_id"]
        logger.info(f"Handling process.timer_triggered event for instance {instance_id}")
        
        # Get required services
        settings = Settings()
        event_bus = EventBus(settings)
        db = get_db()
        
        # Connect to services
        await event_bus.connect()
        
        # Ensure database is connected
        if not db.is_connected:
            logger.info("Database not connected, connecting...")
            await db.connect()
            logger.info("Database connected successfully")
        
        try:
            # Create the process instance in the database
            async with db.session() as session:
                from datetime import UTC, datetime
                from pythmata.models.process import ProcessInstance, ProcessStatus
                
                instance_uuid = UUID(instance_id)
                instance = ProcessInstance(
                    id=instance_uuid,
                    definition_id=UUID(definition_id),
                    status=ProcessStatus.RUNNING,
                    start_time=datetime.now(UTC),
                )
                session.add(instance)
                await session.commit()
                logger.info(f"Process instance {instance_id} created in database from timer event")
            
            # Publish process.started event to trigger the normal process execution flow
            await event_bus.publish(
                "process.started",
                {
                    "instance_id": instance_id,
                    "definition_id": definition_id,
                    "variables": {},
                    "source": "timer_event",
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
            logger.info(f"Published process.started event for timer-triggered instance {instance_id}")
            
        finally:
            await event_bus.disconnect()
            
    except Exception as e:
        logger.error(f"Error handling process.timer_triggered event: {e}", exc_info=True)


async def handle_process_started(data: dict) -> None:
    """
    Handle process.started event by initializing and executing a new process instance.

    This function follows BPMN lifecycle management best practices:
    1. Process Definition Loading
    2. Instance Initialization
    3. Token Creation and Management
    4. Process Execution

    Args:
        data: Dictionary containing instance_id and definition_id
    """
    try:
        instance_id = data["instance_id"]
        definition_id = data["definition_id"]
        logger.info(f"Handling process.started event for instance {instance_id}")

        # Get required services
        logger.info("[ProcessStarted] Initializing required services")
        try:
            settings = Settings()
            logger.info("[ProcessStarted] Settings initialized successfully")
        except Exception as e:
            logger.error(f"[ProcessStarted] Failed to initialize settings: {str(e)}")
            logger.error(
                "[ProcessStarted] Please check configuration files and environment variables"
            )
            raise

        state_manager = StateManager(settings)
        logger.info("[ProcessStarted] State manager initialized")
        db = get_db()

        # Connect to state manager only since database is managed by FastAPI lifespan
        await state_manager.connect()
        try:
            # 1. Load Process Definition
            async with db.session() as session:
                logger.info("Loading process definition...")
                stmt = select(ProcessDefinitionModel).filter(
                    ProcessDefinitionModel.id == definition_id
                )
                logger.debug(f"Executing query: {stmt}")
                result = await session.execute(stmt)
                logger.debug(f"Query result type: {type(result)}")

                definition = result.scalar_one_or_none()
                logger.debug(
                    f"Definition type: {type(definition)}, value: {definition}"
                )

                if not definition:
                    logger.error(f"Process definition {definition_id} not found")
                    return
                logger.info(f"Definition loaded successfully: {definition_id}")

                # 2. Check if process instance already exists in database
                # This is critical for timer events which may publish process.started
                # before the instance is created in the database
                from datetime import UTC, datetime

                from pythmata.models.process import ProcessInstance, ProcessStatus

                instance_uuid = UUID(instance_id)
                instance_result = await session.execute(
                    select(ProcessInstance).filter(ProcessInstance.id == instance_uuid)
                )
                instance = instance_result.scalar_one_or_none()

                # If instance doesn't exist, create it
                if not instance:
                    logger.info(
                        f"Process instance {instance_id} not found in database, creating it"
                    )
                    instance = ProcessInstance(
                        id=instance_uuid,
                        definition_id=UUID(definition_id),
                        status=ProcessStatus.RUNNING,
                        start_time=datetime.now(UTC),
                    )
                    session.add(instance)
                    await session.commit()
                    logger.info(f"Process instance {instance_id} created in database")
                else:
                    logger.info(
                        f"Process instance {instance_id} already exists in database"
                    )

                # 3. Parse and Validate BPMN
                try:
                    parser = BPMNParser()
                    logger.debug(
                        f"Definition bpmn_xml type: {type(definition.bpmn_xml)}"
                    )
                    logger.debug(f"Definition bpmn_xml value: {definition.bpmn_xml}")
                    process_graph = parser.parse(definition.bpmn_xml)
                    logger.debug(f"Process graph after parsing: {process_graph}")
                    logger.info("BPMN XML parsed successfully")
                except Exception as e:
                    logger.error(f"Failed to parse BPMN XML: {e}")
                    return

                # Validate start event existence and type
                start_event = next(
                    (
                        node
                        for node in process_graph["nodes"]
                        if hasattr(node, "event_type") and node.event_type == "start"
                    ),
                    None,
                )
                if not start_event:
                    logger.error("No start event found in process definition")
                    return
                logger.info(f"Validated start event: {start_event.id}")

            # 4. Initialize Process Instance
            async with db.session() as session:
                # Create instance manager with proper initialization
                instance_manager = ProcessInstanceManager(session, None, state_manager)
                executor = ProcessExecutor(
                    state_manager=state_manager, instance_manager=instance_manager
                )
                instance_manager.executor = executor

                # 5. Check for existing tokens
                logger.debug("Checking for existing tokens...")
                existing_tokens = await state_manager.get_token_positions(instance_id)
                logger.debug(
                    f"Token check result type: {type(existing_tokens)}, value: {existing_tokens}"
                )

                if existing_tokens is not None and len(existing_tokens) > 0:
                    logger.info(
                        f"Found existing tokens for instance {instance_id}: {existing_tokens}"
                    )
                    logger.debug("Skipping token creation due to existing tokens")
                else:
                    logger.debug("No existing tokens found, creating initial token")
                    # Create initial token only if none exist
                    initial_token = await executor.create_initial_token(
                        instance_id, start_event.id
                    )
                    logger.info(
                        f"Created initial token: {initial_token.id} at {start_event.id}"
                    )

                # 6. Execute Process (will use existing tokens if any)
                logger.debug(
                    f"Preparing to execute process with graph: {process_graph}"
                )
                logger.info(f"Starting process execution for instance {instance_id}")
                await executor.execute_process(instance_id, process_graph)
                logger.info(f"Process {instance_id} execution completed successfully")

        finally:
            await state_manager.disconnect()

    except Exception as e:
        logger.error(f"Error handling process.started event: {e}", exc_info=True)

        # Try to set error state and clean up if possible
        try:
            logger.info("[ErrorCleanup] Attempting to initialize services for cleanup")
            try:
                settings = Settings()
                logger.info("[ErrorCleanup] Settings initialized for cleanup")
            except Exception as e:
                logger.error(
                    f"[ErrorCleanup] Failed to initialize settings for cleanup: {str(e)}"
                )
                raise

            state_manager = StateManager(settings)
            logger.info("[ErrorCleanup] State manager initialized for cleanup")
            await state_manager.connect()

            async with get_db().session() as session:
                instance_manager = ProcessInstanceManager(session, None, state_manager)
                await instance_manager.handle_error(instance_id, e)
        except Exception as cleanup_error:
            logger.error(f"Error during cleanup: {cleanup_error}")

        # Re-raise to ensure proper error handling at higher levels
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    # Startup
    settings = Settings()
    app.state.event_bus = EventBus(settings)
    app.state.state_manager = StateManager(settings)

    # Discover plugins
    plugin_dir = os.environ.get("PYTHMATA_PLUGIN_DIR", "/app/plugins")
    if os.path.isdir(plugin_dir):
        from pythmata.core.plugin import discover_plugins

        logger.info(f"Discovering plugins from {plugin_dir}")
        discover_plugins(plugin_dir)
    else:
        logger.info(
            f"Plugin directory not found: {plugin_dir}, skipping plugin discovery"
        )

    # Initialize and connect services
    logger.info("Initializing database...")
    init_db(settings)
    db = get_db()
    logger.info("Connecting to database...")
    await db.connect()  # Establish database connection
    logger.info("Database connected successfully")

    logger.info("Connecting to event bus...")
    await app.state.event_bus.connect()
    logger.info("Event bus connected successfully")

    logger.info("Connecting to state manager...")
    await app.state.state_manager.connect()
    logger.info("State manager connected successfully")

    # Subscribe to process.started events
    await app.state.event_bus.subscribe(
        routing_key="process.started",
        callback=handle_process_started,
        queue_name="process_execution",
    )
    logger.info("Subscribed to process.started events")
    
    # Subscribe to process.timer_triggered events
    await app.state.event_bus.subscribe(
        routing_key="process.timer_triggered",
        callback=handle_timer_triggered,
        queue_name="timer_execution",
    )
    logger.info("Subscribed to process.timer_triggered events")

    # Initialize and start timer scheduler
    from pythmata.core.engine.events.timer_scheduler import TimerScheduler

    app.state.timer_scheduler = TimerScheduler(
        app.state.state_manager, app.state.event_bus
    )

    # Recover timer state from previous run if needed
    await app.state.timer_scheduler.recover_from_crash()
    logger.info("Timer state recovered from previous run")

    # Start the timer scheduler
    await app.state.timer_scheduler.start()
    logger.info("Timer scheduler started")

    # Log registered service tasks
    registry = get_service_task_registry()
    tasks = registry.list_tasks()
    logger.info(f"Registered service tasks: {[task['name'] for task in tasks]}")

    yield

    # Shutdown - ensure all services attempt to disconnect even if some fail
    errors = []

    logger.info("Shutting down services...")

    # Stop timer scheduler
    try:
        logger.info("Stopping timer scheduler...")
        await app.state.timer_scheduler.stop()
        logger.info("Timer scheduler stopped successfully")
    except Exception as e:
        logger.error(f"Error stopping timer scheduler: {e}")
        errors.append(e)

    try:
        logger.info("Disconnecting database...")
        await db.disconnect()
        logger.info("Database disconnected successfully")
    except Exception as e:
        logger.error(f"Error disconnecting database: {e}")
        errors.append(e)

    try:
        await app.state.event_bus.disconnect()
    except Exception as e:
        errors.append(e)

    try:
        await app.state.state_manager.disconnect()
    except Exception as e:
        errors.append(e)

    # If any errors occurred during disconnect, raise the first one
    if errors:
        raise errors[0]


app = FastAPI(
    title="Pythmata",
    description="A Python-based BPMN workflow engine",
    version="0.1.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Import and include routers
app.include_router(process_router, prefix="/api")
