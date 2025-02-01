import pytest
from pathlib import Path

from pythmata.core.config import Settings, RedisSettings, ServerSettings, DatabaseSettings, RabbitMQSettings, SecuritySettings, ProcessSettings

@pytest.fixture
def test_data_dir() -> Path:
    """Returns the path to the test data directory."""
    return Path(__file__).parent / "data"

@pytest.fixture(autouse=True)
def setup_test_data_dir(test_data_dir: Path):
    """Creates the test data directory if it doesn't exist."""
    test_data_dir.mkdir(parents=True, exist_ok=True)

@pytest.fixture
def test_settings() -> Settings:
    """Create test settings with Redis configuration."""
    return Settings(
        server=ServerSettings(
            host="localhost",
            port=8000,
            debug=True,
            workers=1,
            reload=True
        ),
        database=DatabaseSettings(
            url="postgresql://postgres:postgres@localhost:5432/pythmata_test",
            pool_size=5,
            max_overflow=10,
            echo=False
        ),
        redis=RedisSettings(
            url="redis://localhost:6379/0",
            pool_size=10,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        ),
        rabbitmq=RabbitMQSettings(
            url="amqp://guest:guest@localhost:5672/",
            connection_attempts=3,
            retry_delay=1,
            heartbeat=60
        ),
        security=SecuritySettings(
            secret_key="test-secret-key",
            token_expire_minutes=30,
            algorithm="HS256",
            access_token_expire_minutes=30
        ),
        process=ProcessSettings(
            script_timeout=30,
            max_instances=100,
            cleanup_interval=60,
            max_retries=3
        )
    )
