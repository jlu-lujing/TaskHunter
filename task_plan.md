# Task Plan: 看板全链路修复

## Goal
修复看板 14 项缺陷，实现稳定可观测的自动工作流（调度幂等、校验有超时、人机回写完整、失败可恢复）。

## Current Phase
Phase 3 - complete

## Phases

### Phase 1: 分析与规划 - complete
- [x] 完成全链路代码审计
- [x] 识别 14 项问题并分级 P0/P1/P2
- **Status:** complete

### Phase 2: 并行修复 - complete
| Agent | 负责文件 | 职责 | Commit |
|-------|---------|------|--------|
| A-调度与并发 | service.js, dispatcher.js, reconciler.js, feature-routes-runtime.js | 双循环合并、CAS、lease/resume | 21dd1b2db |
| B-校验与评估 | checker.js, evaluator.js | waiting超时、diff分页、评估重试 | ffbd30300 |
| C-前端体验 | BoardView.tsx, boardModel.ts, useBoardStore.ts | Return笔记弹窗、Blocked重试、列徽章、乐观回滚隔离 | 5e32a2cf7 |
| D-数据与Git | git-repo.js, service.js(清理), feature-routes-runtime.js(分页) | Git检测、init安全、worktree GC | 0a3584eb2 |

> 冲突处理：A/D 在 service.js/service GC 上的重叠已手动合并（CAS rev + scheduleCleanup 保留）。

### Phase 3: 集成验证 - complete
- [x] 合并 worktree-agent-A/B/C/D 到 main（--no-edit，D 需手动解决冲突）
- [x] main 上 type-check ui/web 通过
- [x] board 单测 72 pass
- [x] dead-code 仅 2 遗留
- **Status:** complete

### Phase 4: 验收 - pending
- [ ] 演示 Return 带 note 流转
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 单循环统一调度 | 消除双 30s 竞态，reconcilePass 内先 releaseStaleClaims 再 dispatchPass |
| CAS rev 字段 | 最小侵入乐观锁，冲突 409 重试一次 |
| waiting-* 10分钟超时计费 | 复用 checkAttempts 预算，避免永久 checking |
| Return Dialog | 保持 ContextMenu/Direct 按钮统一入口 |
| blocked retry 按有无 plan 区分 queued/planning | 已评估的卡可直接重入队列 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| service.js 合并冲突 (CAS vs cleanup) | 1 | 保留 saveDoc(doc, rev) + 追加 scheduleCleanup |

## Notes
- 待 push 前需与 origin/main rebase（如有上游新提交）
