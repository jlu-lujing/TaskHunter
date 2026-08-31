import express from 'express';
import { asControlError } from '../taskhunter-control/error.js';
import { createBoardService } from './service.js';

const sendError = (res, error, fallbackMessage) => {
  const controlError = asControlError(error);
  return res.status(controlError.statusCode).json({ error: controlError.message || fallbackMessage });
};

export const registerBoardRoutes = (app, dependencies) => {
  const service = dependencies.boardService || createBoardService(dependencies);

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
      return res.status(201).json(await service.create(req.body && typeof req.body === 'object' ? req.body : {}));
    } catch (error) {
      const controlError = asControlError(error);
      if (controlError.statusCode >= 500) console.error('[Board] failed to create task:', error);
      return sendError(res, error, 'Failed to create task');
    }
  });

  app.patch('/api/board/tasks/:taskId', express.json({ limit: '256kb' }), async (req, res) => {
    try {
      return res.json(await service.update(req.params.taskId, req.body && typeof req.body === 'object' ? req.body : {}));
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
};
