

from app.ingestion.chunker import Chunker
from app.ingestion.loaders import DocumentLoader

loader = DocumentLoader()

documents = loader.load("Genetic Algorithms.pdf")

chunker = Chunker()

chunks = chunker.chunk_documents(documents)

print(f"Documents: {len(documents)}")
print(f"Chunks: {len(chunks)}")

print()

for chunk in chunks[:5]:

    print("=" * 60)
    print(chunk.chunk_id)
    print(chunk.filename)
    print(chunk.page)
    print(len(chunk.text))
    print(chunk.text[:250])