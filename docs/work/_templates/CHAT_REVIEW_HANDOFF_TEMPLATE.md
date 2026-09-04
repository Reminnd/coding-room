# CHAT REVIEW HANDOFF — <stage_id>

<!-- CHAT_REVIEW_HANDOFF_V1 -->

- status: ready_for_chat_review | under_review | accepted | changes_requested
- repository: <owner/repo>
- stage_id: <stage_id>
- pull_request: <number/url>
- base_branch: <branch observed at handoff>
- base_sha: <actual reviewed base>
- head_branch: <branch observed at handoff>
- head_sha: <actual reviewed head>
- stage_contract_path: <repository-relative Stage Contract path>
- accepted_contracts: <links>
- verification: <commands and results>
- review_authority: chatgpt_fixed_chat
- user_action_required: conduct formal review in the fixed ChatGPT chat against this PR
