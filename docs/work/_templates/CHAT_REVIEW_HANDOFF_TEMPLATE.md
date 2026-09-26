# CHAT REVIEW HANDOFF — <stage_id>

<!-- CHAT_REVIEW_HANDOFF_V1 -->

- status: ready_for_chat_review
- repository: <owner/repo>
- pull_request_number: <number>
- workflow_id: <workflow_id>
- stage_id: <stage_id>
- base_branch: <branch observed at handoff>
- base_sha: <actual reviewed base>
- head_branch: <branch observed at handoff>
- head_sha: <actual reviewed head>
- stage_contract_path: <repository-relative Stage Contract path>
- router_contract_path: <repository-relative Router Contract path>
- verification_id: <exact PASS verification identity>
- review_authority: chatgpt_fixed_chat
- handoff_id: <stable handoff identity>

该 closed handoff 只投影 ready-for-review 事实；它不是 Formal Review decision、acceptance、closure authorization或 Git-write authority，不得增加额外字段承载这些语义。
