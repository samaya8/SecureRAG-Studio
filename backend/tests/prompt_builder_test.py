from app.generation.prompt_builder import PromptBuilder
from app.ingestion.embedder import Embedder
from app.retrieval.retriever import Retriever
from app.retrieval.vector_store import VectorStore

embedder = Embedder()
store = VectorStore()
retriever = Retriever(store, embedder)

results = retriever.retrieve(
    "What is a genetic algorithm?"
)

builder = PromptBuilder()

prompt = builder.build(
    "What is a genetic algorithm?",
    results,
)

print(prompt)