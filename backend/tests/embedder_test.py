from app.ingestion.chunker import Chunker
from app.ingestion.embedder import Embedder
from app.ingestion.loaders import DocumentLoader

loader = DocumentLoader()

documents = loader.load("Genetic Algorithms.pdf")

chunker = Chunker()

chunks = chunker.chunk_documents(documents)

embedder = Embedder()

embedded_chunks = embedder.embed_chunks(chunks)

print("=" * 70)
print(f"Chunks: {len(chunks)}")
print(f"Embedded Chunks: {len(embedded_chunks)}")
print("=" * 70)

first = embedded_chunks[0]

print("Chunk ID:")
print(first.chunk.chunk_id)

print()

print("Vector Dimension:")
print(len(first.embedding))

print()

print("First 10 Values:")

print(first.embedding[:10])