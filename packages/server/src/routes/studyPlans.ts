import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { studyPlans, studyPlanDays, studyPlanTasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type {
  CreateStudyPlanRequest,
  StudyPlanResponse,
  StudyPlanWithDays,
  StudyPlanTask,
  CompleteTaskRequest,
  CompleteTaskResponse,
  RegenerateStudyPlanRequest,
  RegenerateStudyPlanResponse,
  XPAwardResponse,
} from '@ace-prep/shared';
import { XP_AWARDS } from '@ace-prep/shared';
import { idParamSchema, formatZodError } from '../validation/schemas.js';
import { resolveCertificationId, parseCertificationIdFromQuery } from '../db/certificationUtils.js';
import { authenticate } from '../middleware/auth.js';
import {
  generateStudyPlan,
  getStudyPlanWithDays,
  getActiveStudyPlan,
  regenerateStudyPlan,
} from '../services/planGenerator.js';
import { awardCustomXP } from '../services/xpService.js';
import { z } from 'zod';

// Validation schemas
const createStudyPlanSchema = z.object({
  certificationId: z.number().int().positive().optional(),
  targetExamDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'targetExamDate must be in YYYY-MM-DD format'),
});

const completeTaskSchema = z.object({
  notes: z.string().max(500).optional(),
});

const regeneratePlanSchema = z.object({
  keepCompletedTasks: z.boolean().optional().default(true),
});

const taskIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a positive integer').transform(Number),
  taskId: z.string().regex(/^\d+$/, 'taskId must be a positive integer').transform(Number),
});

/**
 * Build StudyPlanResponse from a plan with days
 */
function buildStudyPlanResponse(plan: StudyPlanWithDays): StudyPlanResponse {
  const today = new Date().toISOString().split('T')[0];
  const todaysDay = plan.days.find((d) => d.date === today);
  const todaysTasks = todaysDay?.tasks ?? [];

  const totalDays = plan.days.length;
  const completedDays = plan.days.filter((d) => d.isComplete).length;
  const totalTasks = plan.days.reduce((sum, d) => sum + d.tasks.length, 0);
  const completedTasks = plan.days.reduce(
    (sum, d) => sum + d.tasks.filter((t) => t.completedAt !== null).length,
    0
  );
  const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    plan,
    todaysTasks,
    progress: {
      totalDays,
      completedDays,
      totalTasks,
      completedTasks,
      percentComplete,
    },
  };
}

export async function studyPlanRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);

  // POST /api/study-plans - Create new study plan
  fastify.post<{ Body: CreateStudyPlanRequest }>('/', async (request, reply) => {
    const parseResult = createStudyPlanSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { certificationId, targetExamDate } = parseResult.data;

    // Resolve certification ID
    const certId = await resolveCertificationId(certificationId, reply);
    if (certId === null) return;

    const userId = parseInt(request.user!.id, 10);

    // Validate target date is in the future
    const targetDate = new Date(targetExamDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (targetDate <= today) {
      return reply.status(400).send({ error: 'Target exam date must be in the future' });
    }

    try {
      // generateStudyPlan already handles archiving existing active plans
      const plan = await generateStudyPlan(userId, certId, targetExamDate, db);
      const response = buildStudyPlanResponse(plan);
      return reply.status(201).send(response);
    } catch (error: any) {
      fastify.log.error(error, 'Failed to generate study plan');
      return reply.status(500).send({
        error: 'Failed to generate study plan',
        message: error.message,
      });
    }
  });

  // GET /api/study-plans/active - Get active study plan for current user/certification
  fastify.get<{ Querystring: { certificationId?: string } }>('/active', async (request, reply) => {
    const certId = await parseCertificationIdFromQuery(request.query.certificationId, reply);
    if (certId === null) return;

    const userId = parseInt(request.user!.id, 10);

    const plan = await getActiveStudyPlan(userId, certId, db);

    if (!plan) {
      return reply.status(404).send({ error: 'No active study plan found' });
    }

    return buildStudyPlanResponse(plan);
  });

  // GET /api/study-plans/:id - Get specific study plan by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const planId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    const plan = await getStudyPlanWithDays(planId, db);

    if (!plan) {
      return reply.status(404).send({ error: 'Study plan not found' });
    }

    // Verify ownership
    if (plan.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    return buildStudyPlanResponse(plan);
  });

  // PATCH /api/study-plans/:id/tasks/:taskId - Mark task complete
  fastify.patch<{
    Params: { id: string; taskId: string };
    Body: CompleteTaskRequest;
  }>('/:id/tasks/:taskId', async (request, reply) => {
    const paramResult = taskIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const { id: planId, taskId } = paramResult.data;

    const bodyResult = completeTaskSchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { notes } = bodyResult.data;

    const userId = parseInt(request.user!.id, 10);

    // Verify plan exists and belongs to user
    const [plan] = await db
      .select()
      .from(studyPlans)
      .where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));

    if (!plan) {
      return reply.status(404).send({ error: 'Study plan not found' });
    }

    if (plan.status !== 'active') {
      return reply.status(400).send({ error: 'Cannot modify tasks on inactive plan' });
    }

    // Get the task and verify it belongs to this plan
    const [task] = await db
      .select({
        task: studyPlanTasks,
        day: studyPlanDays,
      })
      .from(studyPlanTasks)
      .innerJoin(studyPlanDays, eq(studyPlanTasks.studyPlanDayId, studyPlanDays.id))
      .where(and(eq(studyPlanTasks.id, taskId), eq(studyPlanDays.studyPlanId, planId)));

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    // Check if already completed
    if (task.task.completedAt !== null) {
      // Return current state without awarding XP again
      const dayComplete = await checkDayComplete(task.day.id);
      const response: CompleteTaskResponse = {
        task: {
          id: task.task.id,
          studyPlanDayId: task.task.studyPlanDayId,
          taskType: task.task.taskType as StudyPlanTask['taskType'],
          targetId: task.task.targetId,
          estimatedMinutes: task.task.estimatedMinutes,
          completedAt: task.task.completedAt,
          notes: task.task.notes,
        },
        dayComplete,
      };
      return response;
    }

    const now = new Date();

    // Mark task as complete
    await db
      .update(studyPlanTasks)
      .set({
        completedAt: now,
        notes: notes ?? task.task.notes,
      })
      .where(eq(studyPlanTasks.id, taskId));

    // Check if day is now complete
    const dayComplete = await checkDayComplete(task.day.id);

    if (dayComplete) {
      await db
        .update(studyPlanDays)
        .set({ isComplete: true })
        .where(eq(studyPlanDays.id, task.day.id));
    }

    // Award XP for task completion (with idempotency check)
    let xpUpdate: XPAwardResponse | undefined;
    try {
      const xpSource = `STUDY_PLAN_TASK_${taskId}`;
      const result = await awardCustomXP(userId, XP_AWARDS.STUDY_SESSION_COMPLETE, xpSource);
      xpUpdate = result ?? undefined;
    } catch (error) {
      fastify.log.error(
        { userId, taskId, error: error instanceof Error ? error.message : String(error) },
        'Failed to award XP for study plan task completion'
      );
    }

    // Update plan's updatedAt
    await db.update(studyPlans).set({ updatedAt: now }).where(eq(studyPlans.id, planId));

    const response: CompleteTaskResponse = {
      task: {
        id: task.task.id,
        studyPlanDayId: task.task.studyPlanDayId,
        taskType: task.task.taskType as StudyPlanTask['taskType'],
        targetId: task.task.targetId,
        estimatedMinutes: task.task.estimatedMinutes,
        completedAt: now,
        notes: notes ?? task.task.notes,
      },
      dayComplete,
      xpUpdate,
    };

    return response;
  });

  // DELETE /api/study-plans/:id - Abandon study plan
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const planId = paramResult.data.id;
    const userId = parseInt(request.user!.id, 10);

    // Verify ownership
    const [plan] = await db
      .select()
      .from(studyPlans)
      .where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));

    if (!plan) {
      return reply.status(404).send({ error: 'Study plan not found' });
    }

    if (plan.status !== 'active') {
      return reply.status(400).send({ error: 'Plan is already inactive' });
    }

    // Set status to abandoned
    const now = new Date();
    await db
      .update(studyPlans)
      .set({ status: 'abandoned', updatedAt: now })
      .where(eq(studyPlans.id, planId));

    return { success: true };
  });

  // POST /api/study-plans/:id/regenerate - Regenerate remaining days
  fastify.post<{
    Params: { id: string };
    Body: RegenerateStudyPlanRequest;
  }>('/:id/regenerate', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send(formatZodError(paramResult.error));
    }
    const planId = paramResult.data.id;

    const bodyResult = regeneratePlanSchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      return reply.status(400).send(formatZodError(bodyResult.error));
    }
    const { keepCompletedTasks } = bodyResult.data;

    const userId = parseInt(request.user!.id, 10);

    // Verify ownership
    const [existingPlan] = await db
      .select()
      .from(studyPlans)
      .where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));

    if (!existingPlan) {
      return reply.status(404).send({ error: 'Study plan not found' });
    }

    if (existingPlan.status !== 'active') {
      return reply.status(400).send({ error: 'Can only regenerate active plans' });
    }

    try {
      const result = await regenerateStudyPlan(planId, keepCompletedTasks ?? true, db);

      const response: RegenerateStudyPlanResponse = {
        plan: result.plan,
        tasksRemoved: result.tasksRemoved,
        tasksGenerated: result.tasksGenerated,
      };

      return response;
    } catch (error: any) {
      fastify.log.error(error, 'Failed to regenerate study plan');
      return reply.status(500).send({
        error: 'Failed to regenerate study plan',
        message: error.message,
      });
    }
  });
}

/**
 * Check if all tasks for a day are complete
 */
async function checkDayComplete(dayId: number): Promise<boolean> {
  const tasks = await db
    .select()
    .from(studyPlanTasks)
    .where(eq(studyPlanTasks.studyPlanDayId, dayId));

  return tasks.length > 0 && tasks.every((t) => t.completedAt !== null);
}
