from app.ingestion.chunker import Chunker
from app.ingestion.embedder import Embedder
from app.ingestion.loaders import DocumentLoader
from app.retrieval.vector_store import VectorStore

loader = DocumentLoader()
documents = loader.load("Genetic Algorithms.pdf")

chunker = Chunker()
chunks = chunker.chunk_documents(documents)

embedder = Embedder()
embedded = embedder.embed_chunks(chunks)

store = VectorStore()

store.create_collection()

store.upsert_chunks(embedded)

print("SUCCESS!")
print(f"Inserted {len(embedded)} chunks into Qdrant.")