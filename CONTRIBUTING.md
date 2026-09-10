# Working together

1. Clone the repository and read the product scope and first-release specification.
2. Select a roadmap item and open an issue with the problem, scope, and acceptance criteria.
3. Create a branch such as `feat/movement-trigger` or `docs/fund-policy`.
4. Keep changes focused and document any policy assumption.
5. Open a pull request, include validation evidence, and ask the other collaborator to review.
6. Merge after review and update the roadmap/linked issue.

This review process is a team convention; repository branch protection has not been configured. The application stack and setup commands will be added when selected.

Use synthetic data for initial fixtures. Never commit credentials, private Fund documents, real portfolio exports, or restricted vendor content. Store runtime secrets outside git. Keep `.env.example` limited to names and nonsecret placeholders if one is introduced.

Changes to movement semantics, learning boundaries, model approval, or cross-team access need a corresponding decision record. Distinguish proposals from approved Fund policy.

For implementation, validate deterministic threshold math and edge cases, source provenance, permission boundaries, duplicate/retry handling, and analyst approval boundaries as applicable. Document commands and results in the pull request.
