from app.models.retrieval_result import RetrievalResult


class PromptBuilder:
    """
    Builds a grounded prompt using retrieved context.
    """

    SYSTEM_PROMPT = """
You are an AI assistant answering questions using retrieved documents.

Instructions:
1. Answer ONLY using the provided context.
2. If the answer cannot be found in the context, reply exactly:
   "I don't have enough information to answer that."
3. Never make up facts or use outside knowledge.
4. Keep the answer clear and concise.
5. Every factual statement must include citations in this format:
   (filename, page)
6. If multiple documents support the same statement, cite all relevant sources.
"""

    def build(
        self,
        question: str,
        results: list[RetrievalResult],
    ) -> str:
        """
        Build the prompt sent to the LLM.
        """

        context_sections = []
        MAX_CONTEXT_CHARS = 1000

        for i, result in enumerate(results, start=1):

            content = (
                result.text[:MAX_CONTEXT_CHARS] + "..."
                if len(result.text) > MAX_CONTEXT_CHARS
                else result.text
            )

            context_sections.append(
                f"""
    [Document {i}]
    File: {result.filename}
    Page: {result.page}
    Score: {result.score:.4f}

    Content:
    {content}
    """
            )

        context_text = "\n----------------------------------------\n".join(context_sections)

        prompt = f"""
{self.SYSTEM_PROMPT}

========================================
RETRIEVED CONTEXT
========================================

{context_text}

========================================
USER QUESTION
========================================

{question}

========================================
ANSWER
========================================
"""

        return prompt.strip()