# Task Plan: 看板全链路修复

## Goal
修复看板 14 项缺陷，实现稳定可观测的自动工作流（调度幂等、校验有超时、人机回写完整、失败可恢复）。

## Current Phase
Phase 2

## Phases

### Phase 1: 分析与规划 - complete
- [x] 完成全链路代码审计
- [x] 识别 14 项问题并分级 P0/P1/P2
- **Status:** complete

### Phase 2: 并行修复 - in_progress
- **Status:** in_progress

| Agent | 负责文件 | 职责 |
|-------|---------|------|
| A-调度与并发 | service.js, dispatcher.js, reconciler.js, feature-routes-runtime.js | 双循环合并、并发口径、CAS、lease/resume |
| B-校验与评估 | checker.js, evaluator.js | waiting超时、自愈上限、diff分页、报告无答案处理、评估重试 |
| C-前端体验 | BoardView.tsx, boardModel.ts, useBoardStore.ts | Return笔记弹窗、列拆分、Blocked重试、乐观回滚隔离、编辑粒度 |
| D-数据与Git | git-repo.js, routes.js, service.js(edit部分协同A), git worktree GC | .git检测、init安全、worktree清理、CAS协同 |

> 文件归属互斥：A 独占 service.js/dispatcher.js/reconciler.js/feature-routes-runtime.js；B 独占 checker.js/evaluator.js；C 独占 BoardView/*, useBoardStore.ts；D 独占 git-repo.js。routes.js 由 D 负责但需与 A 协调的 claim 接口复用同一锁。

### Phase 3: 集成验证 - pending
- [ ] 各 agent 完成 git commit
- [ ] 在 main 合并后全量单测 + type-check
- **Status:** pending

### Phase 4: 验收 - pending
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 4 并行 agent | 文件不重叠，最大化并发 |
| 单文件 CAS 版本号而非全局锁 | 最小侵入，保持现有原子写语义 |
| waiting-* 计入 checkAttempts | 复用已有预算，避免新字段 |
| 前端 Return 需 Dialog 而非 ContextMenu 直接调用 | 符合现有 DetailDialog 模式 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- 每个 agent 完成需在 worktree 内 git add + commit
- 合并用 git merge --no-edit
