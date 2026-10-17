# SecureRAG Studio MVP

## Target User

A university department that answers student questions from approved policy documents.

## Main Workflow

1. Administrator registers an approved document.
2. The system stores document metadata and prepares it for retrieval.
3. The user selects the corpus and asks a question.
4. The backend validates the question.
5. The system retrieves relevant document chunks.
6. The AI produces an answer using only those chunks.
7. The system validates the structured output.
8. The UI displays the answer, evidence, and diagnostics.
9. If evidence is missing, the system returns a not-found response.
10. The question and result are recorded for evaluation.

## Mandatory Features

- Approved corpus register
- Document ingestion or registration
- Question interface
- Structured grounded answer
- Exact evidence snippets
- Citation and source panel
- Not-found behavior
- Retrieval diagnostics
- Citation coverage function
- Retrieval-quality function
- Prompt-injection tests
- Evaluation dashboard
- Safe error handling
- Public deployment

## Non-Goals

- Whole-web search
- Private student data
- Legal or medical advice
- AI-controlled authorization
- Answers without evidence

## Scope Constraints

The project uses a bounded approved corpus.

It explicitly excludes:

- Open-ended web research
- Confidential documents
- Using the language model as the only security control
