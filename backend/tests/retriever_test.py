from app.ingestion.embedder import Embedder
from app.retrieval.vector_store import VectorStore
from app.retrieval.retriever import Retriever

embedder = Embedder()
store = VectorStore()

retriever = Retriever(store, embedder)

results = retriever.retrieve(
    "What is a genetic algorithm?",
    top_k=3,
)

print("=" * 80)

for i, result in enumerate(results, start=1):

    print(f"Result {i}")
    print(f"Score      : {result.score:.4f}")
    print(f"File       : {result.filename}")
    print(f"Page       : {result.page}")
    print(f"Chunk Index: {result.chunk_index}")
    print()
    print(result.text)
    print("=" * 80)