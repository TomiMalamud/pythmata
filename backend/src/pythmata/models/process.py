import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import JSON, DateTime
from sqlalchemy import Enum as SQLAEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class ProcessStatus(str, Enum):
    """Process instance status."""

    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    SUSPENDED = "SUSPENDED"
    ERROR = "ERROR"


class ProcessDefinition(Base):
    """BPMN process definition."""

    __tablename__ = "process_definitions"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(nullable=False)
    bpmn_xml: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Relationships
    instances: Mapped[list["ProcessInstance"]] = relationship(
        "ProcessInstance", back_populates="definition", cascade="all, delete-orphan"
    )
    scripts: Mapped[list["Script"]] = relationship(
        "Script", back_populates="process_definition", cascade="all, delete-orphan"
    )


class ProcessInstance(Base):
    """Running instance of a process definition."""

    __tablename__ = "process_instances"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    definition_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_definitions.id"), nullable=False
    )
    status: Mapped[ProcessStatus] = mapped_column(
        SQLAEnum(ProcessStatus), nullable=False, default=ProcessStatus.RUNNING
    )
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Relationships
    definition: Mapped[ProcessDefinition] = relationship(
        "ProcessDefinition", back_populates="instances"
    )
    variables: Mapped[list["Variable"]] = relationship(
        "Variable", back_populates="instance", cascade="all, delete-orphan"
    )
    script_executions: Mapped[list["ScriptExecution"]] = relationship(
        "ScriptExecution", back_populates="instance", cascade="all, delete-orphan"
    )


class Script(Base):
    """Script definition for a process node."""

    __tablename__ = "scripts"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    process_def_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_definitions.id"), nullable=False
    )
    node_id: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Relationships
    process_definition: Mapped[ProcessDefinition] = relationship(
        "ProcessDefinition", back_populates="scripts"
    )
    executions: Mapped[list["ScriptExecution"]] = relationship(
        "ScriptExecution", back_populates="script", cascade="all, delete-orphan"
    )


class ScriptExecution(Base):
    """Record of a script execution."""

    __tablename__ = "script_executions"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    script_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scripts.id"), nullable=False
    )
    instance_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_instances.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    # Relationships
    script: Mapped[Script] = relationship("Script", back_populates="executions")
    instance: Mapped[ProcessInstance] = relationship(
        "ProcessInstance", back_populates="script_executions"
    )


class Variable(Base):
    """Process variable with history."""

    __tablename__ = "variables"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    instance_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_instances.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    value_type: Mapped[str] = mapped_column(String(50), nullable=False)
    value_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    scope_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    version: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    # Relationships
    instance: Mapped[ProcessInstance] = relationship(
        "ProcessInstance", back_populates="variables"
    )
