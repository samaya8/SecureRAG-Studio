# SecureRAG Studio Release Checklist

This checklist must be reviewed before merging a release into `main`.

## 1. Architecture

- [ ] MVP scope is finalized.
- [ ] Non-goals are documented.
- [ ] Architecture document is complete.
- [ ] Architecture diagram is included.
- [ ] Frontend and backend responsibilities are clear.
- [ ] Trust boundaries are documented.
- [ ] AI-provider boundary is documented.
- [ ] Supported, not-found, suspicious, and error flows are defined.

---

## 2. API Contract

- [ ] `ApprovedDocument` matches the implementation.
- [ ] `QueryRequest` matches the implementation.
- [ ] `Citation` matches the implementation.
- [ ] `QueryResponse` matches the implementation.
- [ ] `ErrorResponse` matches the implementation.
- [ ] Field names are consistent across backend and frontend.
- [ ] Score ranges are consistently defined as `0–100`.
- [ ] Supported response example is valid.
- [ ] Not-found response example is valid.
- [ ] Error codes are implemented consistently.

---

## 3. Integration

- [ ] Backend document route works.
- [ ] Backend query route works.
- [ ] Approved corpus is loaded correctly.
- [ ] Unapproved documents are excluded.
- [ ] Frontend uses the real backend API.
- [ ] Question form submits successfully.
- [ ] Answer panel displays correctly.
- [ ] Evidence snippets display correctly.
- [ ] Retrieval diagnostics display correctly.
- [ ] Not-found flow works.
- [ ] Suspicious-request flow works.
- [ ] Frontend and backend contracts match.

---

## 4. Testing

- [ ] Valid grounded question passes.
- [ ] Empty question is rejected.
- [ ] Invalid question is rejected.
- [ ] Unknown corpus is handled safely.
- [ ] Empty corpus is handled safely.
- [ ] Unsupported question returns `notFound: true`.
- [ ] Prompt-injection request is detected or safely rejected.
- [ ] Retrieval failure is handled safely.
- [ ] Provider failure is handled safely.
- [ ] Missing environment variables are handled safely.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Production smoke tests pass.
- [ ] At least 15 evaluation cases have been executed.
- [ ] Test evidence or screenshots are saved.

---

## 5. Security

- [ ] No real API keys are committed.
- [ ] `.env` and `.env.local` are ignored.
- [ ] `.env.example` contains placeholders only.
- [ ] API keys are used server-side only.
- [ ] Input length is validated.
- [ ] Malformed requests are rejected.
- [ ] Only approved documents are searchable.
- [ ] Authorization is implemented outside the model.
- [ ] Prompt-injection tests have been executed.
- [ ] Answers without evidence are rejected.
- [ ] Raw provider errors are hidden.
- [ ] Stack traces are not shown to users.
- [ ] Logs do not contain secrets.

---

## 6. Documentation

- [ ] README is current.
- [ ] Architecture documentation is complete.
- [ ] API contracts are complete.
- [ ] Security boundaries are complete.
- [ ] Known limitations are documented.
- [ ] Setup instructions are correct.
- [ ] Environment variables are explained.
- [ ] Testing commands are documented.
- [ ] Team responsibilities are documented.
- [ ] AI usage disclosure is complete.
- [ ] Screenshots are current.

---

## 7. Deployment

- [ ] Working code is pushed to GitHub.
- [ ] Deployment platform is connected to the correct repository.
- [ ] Deployment uses the correct branch.
- [ ] Server environment variables are configured.
- [ ] No environment variable is exposed in browser code.
- [ ] Public URL loads successfully.
- [ ] Backend API works in production.
- [ ] Normal grounded question works in production.
- [ ] Not-found question works in production.
- [ ] Prompt-injection test works in production.
- [ ] Mobile layout is tested.
- [ ] Desktop layout is tested.
- [ ] Deployment screenshots are saved.

---

## 8. Final Demonstration

- [ ] Team members can explain their contributions.
- [ ] Approved documents are demonstrated.
- [ ] A supported question is demonstrated.
- [ ] Exact citation evidence is demonstrated.
- [ ] An unsupported question is demonstrated.
- [ ] A prompt-injection attempt is demonstrated.
- [ ] Evaluation results are demonstrated.
- [ ] Architecture is explained.
- [ ] Security boundaries are explained.
- [ ] Known limitations are explained.
- [ ] Public deployment is available.

---

## 9. Rollback Readiness

- [ ] Previous stable commit is identified.
- [ ] Previous deployment is available or recoverable.
- [ ] Release changes are documented.
- [ ] Database or corpus changes are reversible.
- [ ] Environment-variable changes are recorded.
- [ ] Team knows how to restore the previous stable release.
- [ ] Rollback has been discussed before the final release.

---

## 10. Final Approval

- [ ] Somaya confirms backend readiness.
- [ ] Mohab confirms frontend and evaluation readiness.
- [ ] Sara confirms architecture and integration readiness.
- [ ] All high-priority issues are closed.
- [ ] No blocking issue remains.
- [ ] Release is approved for merging into `main`.
