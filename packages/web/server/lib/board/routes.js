import express from 'express';
import { asControlError } from '../taskhunter-control/error.js';
import { createBoardService } from './service.js';

const sendError = (res, error, fallbackMessage) => {
  const controlError = asControlError(error);
  return res.status(controlError.statusCode).json({ error: controlError.message || fallbackMessage });
};

export const registerBoardRoutes = (app, dependencies) => {
  const service = dependencies.boardService || createBoardService(dependencies);
  const { dispatcher, evaluator } = dependencies;

  const maybeAutoClaim = (task) => {
    if (!dispatcher || !task || task.status !== 'ready') return;
    void (async () => {
      const { config } = await service.list();
      if (config.automationDefault !== 'auto') return;
      await dispatcher.claimTask(task.id);
    })().catch((error) => console.warn('[Board] auto-claim failed:', error?.message ?? error));
  };

  // Cards entering ready get judged automatically; the response never waits
  // on the evaluator. automationDefault 'auto' additionally starts the work.
  const evaluateInBackground = (task) => {
    if (!evaluator || !task || task.status !== 'ready') return;
    if (task.evaluation && task.evaluation.status !== 'failed') return;
    evaluator.evaluateTask(task.id)
      .then((result) => maybeAutoClaim(result.task))
      .catch((error) => console.warn('[Board] evaluation failed:', error?.message ?? error));
  };

  app.get('/api/board', async (_req, res) => {
    try {
      return res.json(await service.list());
    } catch (error) {
      console.error('[Board] failed to list tasks:', error);
      return sendError(res, error, 'Failed to load board');
    }
  });

  app.post('/api/board/tasks', express.json({ limit: '256kb' }), async (req, res) => {
    try {
      const created = await service.create(req.body && typeof req.body === 'object' ? req.body : {});
      evaluateInBackground(created.task);
      return res.status(201).json(created);
    } catch (error) {
      const controlError = asControlError(error);
      if (controlError.statusCode >= 500) console.error('[Board] failed to create task:', error);
      return sendError(res, error, 'Failed to create task');
    }
  });

  app.patch('/api/board/tasks/:taskId', express.json({ limit: '256kb' }), async (req, res) => {
    try {
      const updated = await service.update(req.params.taskId, req.body && typeof req.body === 'object' ? req.body : {});
      evaluateInBackground(updated.task);
      return res.json(updated);
    } catch (error) {
      const controlError = asControlError(error);
      if (controlError.statusCode >= 500) console.error('[Board] failed to update task:', error);
      return sendError(res, error, 'Failed to update task');
    }
  });

  app.delete('/api/board/tasks/:taskId', async (req, res) => {
    try {
      return res.json(await service.remove(req.params.taskId));
    } catch (error) {
      const controlError = asControlError(error);
      if (controlError.statusCode >= 500) console.error('[Board] failed to delete task:', error);
      return sendError(res, error, 'Failed to delete task');
    }
  });

  app.put('/api/board/config', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      return res.json(await service.updateConfig(req.body && typeof req.body === 'object' ? req.body : {}));
    } catch (error) {
      const controlError = asControlError(error);
      if (controlError.statusCode >= 500) console.error('[Board] failed to update config:', error);
      return sendError(res, error, 'Failed to update board config');
    }
  });

  if (evaluator) {
    app.post('/api/board/tasks/:taskId/evaluate', async (req, res) => {
      try {
        const result = await evaluator.evaluateTask(req.params.taskId);
        maybeAutoClaim(result.task);
        return res.json(result);
      } catch (error) {
        const controlError = asControlError(error);
        if (controlError.statusCode >= 500) console.error('[Board] evaluation failed:', error);
        return sendError(res, error, 'Failed to evaluate task');
      }
    });
  }

  if (dispatcher) {
    app.post('/api/board/tasks/:taskId/claim', async (req, res) => {
      try {
        return res.json(await dispatcher.claimTask(req.params.taskId));
      } catch (error) {
        const controlError = asControlError(error);
        if (controlError.statusCode >= 500) console.error('[Board] claim failed:', error);
        return sendError(res, error, 'Failed to claim task');
      }
    });
  }
};
