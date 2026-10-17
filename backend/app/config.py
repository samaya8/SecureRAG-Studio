from pydantic_settings import BaseSettings


class Settings(BaseSettings):

    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333

    COLLECTION_NAME: str = "secure_rag"

    TOP_K: int = 5

    SCORE_THRESHOLD: float = 0.65


settings = Settings()