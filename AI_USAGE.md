# AI Usage Disclosure

## Purpose

AI tools were used during the development of SecureRAG Studio as supporting tools.

They did not replace the team's responsibility for architecture, implementation, validation, testing, security, or final decisions.

## Supported Activities

AI tools were used to support:

- Brainstorming
- Project planning
- Documentation drafting
- Documentation review
- Code explanation
- Debugging assistance
- Test-case generation
- Security-case brainstorming
- Grammar and formatting improvement
- Research and concept clarification

## Human Review

All AI-assisted content was reviewed, modified, and validated by the team before being included in the project.

AI-generated code or documentation was not accepted automatically.

The team checked that generated work:

- Matched the agreed project scope
- Followed the shared API contracts
- Did not expose secrets
- Met security requirements
- Could be explained by the responsible team member
- Worked correctly through testing

## Responsibility

The team remains fully responsible for:

- Architecture decisions
- Source-code implementation
- Document approval rules
- Security controls
- Testing
- Evaluation
- Deployment
- Final project results

## Application AI Usage

SecureRAG Studio also uses an AI provider to generate grounded answers from retrieved evidence.

The provider is not treated as a source of truth.

The application:

- Searches only approved documents
- Supplies retrieved evidence to the provider
- Requires structured output
- Validates citations
- Calculates evaluation scores using normal code
- Returns not-found when sufficient evidence is unavailable
- Keeps authorization and approval decisions outside the AI model
