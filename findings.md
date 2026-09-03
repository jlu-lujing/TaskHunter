# Findings

## 关键发现
- 调度双循环：feature-routes-runtime.js:239 reclaimLoop + 425 reconcileLoop
- activeCount 仅 running lease
- refreshLease 清 resumeAttempts 导致无限 resume
- waiting-* 无超时计数
- Return 无 note 输入
- edit 粗暴回 planning
- worktree 无 GC
- isGitRepository 仅检查 .git 文件夹

## 待补充
- 各 agent 完成后补充详细 findings
