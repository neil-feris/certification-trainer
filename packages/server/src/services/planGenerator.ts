/**
 * Study Plan Generation Service
 *
 * Generates personalized day-by-day study schedules based on:
 * - Target exam date
 * - Current readiness scores (weaker domains get more time)
 * - Learning path progress (incomplete items distributed early)
 * - Spaced repetition due cards
 * - Practice intensity increases closer to exam
 */

import { eq, and, lte, sql, desc, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schemaTypes from '../db/schema.js';
import {
  studyPlans,
  studyPlanDays,
  studyPlanTasks,
  spacedRepetition,
  learningPathProgress,
} from '../db/schema.js';
import type {
  StudyPlanWithDays,
  StudyPlanDay,
  StudyPlanTask,
  StudyPlanTaskType,
  DomainReadiness,
} from '@ace-prep/shared';
import { calculateReadinessScore } from './readinessService.js';
import { LEARNING_PATH_ITEMS } from '../data/learningPathContent.js';

type DB = BetterSQLite3Database<typeof schemaTypes>;

// Time allocation constants (in minutes)
const MIN_DAILY_STUDY_MINUTES = 30;
const MAX_DAILY_STUDY_MINUTES = 120;
const LEARNING_TASK_MINUTES = 45; // Time for a learning path item
const PRACTICE_TASK_MINUTES = 30; // Time for domain practice
const REVIEW_TASK_MINUTES = 15; // Time for spaced repetition review
const DRILL_TASK_MINUTES = 15; // Time for a timed drill

// Phase distribution (% of total days)
const EARLY_PHASE_RATIO = 0.4; // 40% of days - focus on learning
const MIDDLE_PHASE_RATIO = 0.3; // 30% of days - mixed learning + practice
// Note: Late phase is implicitly 0.3 (remaining 30% of days - heavy practice + drills)

interface GenerationContext {
  userId: number;
  certificationId: number;
  targetExamDate: Date;
  totalDays: number;
  domainReadiness: DomainReadiness[];
  incompleteLearningItems: number[];
  dueReviewCards: number;
}

/**
 * Generate a personalized study plan for a user.
 * Creates daily tasks from start date to target exam date.
 */
export async function generateStudyPlan(
  userId: number,
  certificationId: number,
  targetExamDate: string,
  db: DB
): Promise<StudyPlanWithDays> {
  const targetDate = new Date(targetExamDate);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  // Calculate total days until exam
  const totalDays = Math.ceil((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  if (totalDays < 1) {
    throw new Error('Target exam date must be in the future');
  }

  // Get current readiness scores
  const { score: readinessScore } = await calculateReadinessScore(userId, certificationId, db);

  // Get incomplete learning path items
  const completedItems = await db
    .select({ pathItemOrder: learningPathProgress.pathItemOrder })
    .from(learningPathProgress)
    .where(
      and(
        eq(learningPathProgress.userId, userId),
        eq(learningPathProgress.certificationId, certificationId)
      )
    )
    .all();

  const completedSet = new Set(completedItems.map((item) => item.pathItemOrder));
  const incompleteLearningItems = LEARNING_PATH_ITEMS.filter(
    (item) => !completedSet.has(item.order)
  ).map((item) => item.order);

  // Get count of due spaced repetition cards
  const now = new Date();
  const dueCardsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(spacedRepetition)
    .where(and(eq(spacedRepetition.userId, userId), lte(spacedRepetition.nextReviewAt, now)))
    .get();

  const dueReviewCards = dueCardsResult?.count ?? 0;

  // Build generation context
  const context: GenerationContext = {
    userId,
    certificationId,
    targetExamDate: targetDate,
    totalDays,
    domainReadiness: readinessScore.domains,
    incompleteLearningItems,
    dueReviewCards,
  };

  // Archive any existing active plans for this user/certification
  await db
    .update(studyPlans)
    .set({ status: 'abandoned', updatedAt: now })
    .where(
      and(
        eq(studyPlans.userId, userId),
        eq(studyPlans.certificationId, certificationId),
        eq(studyPlans.status, 'active')
      )
    );

  // Create the new study plan
  const [newPlan] = await db
    .insert(studyPlans)
    .values({
      userId,
      certificationId,
      targetExamDate,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Generate days and tasks
  const days = await generateDaysAndTasks(newPlan.id, startDate, context, db);

  return {
    id: newPlan.id,
    userId: newPlan.userId,
    certificationId: newPlan.certificationId,
    targetExamDate: newPlan.targetExamDate,
    status: newPlan.status as 'active' | 'completed' | 'abandoned',
    createdAt: newPlan.createdAt,
    updatedAt: newPlan.updatedAt,
    days,
  };
}

/**
 * Generate all days and their tasks for a study plan.
 */
async function generateDaysAndTasks(
  planId: number,
  startDate: Date,
  context: GenerationContext,
  db: DB
): Promise<StudyPlanDay[]> {
  const days: StudyPlanDay[] = [];

  // Calculate phase boundaries
  const earlyPhaseEnd = Math.floor(context.totalDays * EARLY_PHASE_RATIO);
  const middlePhaseEnd = earlyPhaseEnd + Math.floor(context.totalDays * MIDDLE_PHASE_RATIO);

  // Sort domains by readiness score (ascending) to focus on weaker areas
  const sortedDomains = [...context.domainReadiness].sort((a, b) => a.score - b.score);
  const weakDomains = sortedDomains.slice(0, Math.ceil(sortedDomains.length / 2));

  // Track which learning items have been assigned
  let learningItemIndex = 0;

  for (let dayNum = 0; dayNum < context.totalDays; dayNum++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + dayNum);
    const dateString = currentDate.toISOString().split('T')[0];

    // Insert the day
    const [newDay] = await db
      .insert(studyPlanDays)
      .values({
        studyPlanId: planId,
        date: dateString,
        isComplete: false,
      })
      .returning();

    // Determine phase and generate tasks
    const tasks: StudyPlanTask[] = [];
    const phase = dayNum < earlyPhaseEnd ? 'early' : dayNum < middlePhaseEnd ? 'middle' : 'late';

    // Generate tasks based on phase
    const taskValues = generateDayTasks(
      newDay.id,
      phase,
      dayNum,
      context,
      weakDomains,
      learningItemIndex
    );

    // Track learning item progress
    const learningTasks = taskValues.filter((t) => t.taskType === 'learning');
    learningItemIndex += learningTasks.length;

    // Insert tasks
    if (taskValues.length > 0) {
      const insertedTasks = await db.insert(studyPlanTasks).values(taskValues).returning();

      tasks.push(
        ...insertedTasks.map((t) => ({
          id: t.id,
          studyPlanDayId: t.studyPlanDayId,
          taskType: t.taskType as StudyPlanTaskType,
          targetId: t.targetId,
          estimatedMinutes: t.estimatedMinutes,
          completedAt: t.completedAt,
          notes: t.notes,
        }))
      );
    }

    days.push({
      id: newDay.id,
      studyPlanId: planId,
      date: dateString,
      isComplete: false,
      tasks,
    });
  }

  return days;
}

/**
 * Generate tasks for a single day based on the current phase.
 */
function generateDayTasks(
  dayId: number,
  phase: 'early' | 'middle' | 'late',
  dayNum: number,
  context: GenerationContext,
  weakDomains: DomainReadiness[],
  learningItemIndex: number
): Array<{
  studyPlanDayId: number;
  taskType: string;
  targetId: number | null;
  estimatedMinutes: number;
  completedAt: null;
  notes: string | null;
}> {
  const tasks: Array<{
    studyPlanDayId: number;
    taskType: string;
    targetId: number | null;
    estimatedMinutes: number;
    completedAt: null;
    notes: string | null;
  }> = [];

  // Calculate target study time based on phase
  // Late phase has longer sessions to maximize practice
  const targetMinutes =
    phase === 'early'
      ? MIN_DAILY_STUDY_MINUTES + 15
      : phase === 'middle'
        ? MIN_DAILY_STUDY_MINUTES + 30
        : MAX_DAILY_STUDY_MINUTES;

  let remainingMinutes = targetMinutes;

  // Phase-specific task generation
  switch (phase) {
    case 'early':
      // Focus: Learning path items + some review
      // Add learning task if there are incomplete items
      if (learningItemIndex < context.incompleteLearningItems.length) {
        const pathItemOrder = context.incompleteLearningItems[learningItemIndex];
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'learning',
          targetId: pathItemOrder,
          estimatedMinutes: LEARNING_TASK_MINUTES,
          completedAt: null,
          notes: `Complete learning path item #${pathItemOrder}`,
        });
        remainingMinutes -= LEARNING_TASK_MINUTES;
      }

      // Add review task every other day if there are due cards
      if (
        dayNum % 2 === 0 &&
        context.dueReviewCards > 0 &&
        remainingMinutes >= REVIEW_TASK_MINUTES
      ) {
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'review',
          targetId: null,
          estimatedMinutes: REVIEW_TASK_MINUTES,
          completedAt: null,
          notes: 'Review spaced repetition cards',
        });
        remainingMinutes -= REVIEW_TASK_MINUTES;
      }
      break;

    case 'middle':
      // Focus: Mix of learning, practice on weak domains, regular review
      // Add learning task every other day
      if (
        dayNum % 2 === 0 &&
        learningItemIndex < context.incompleteLearningItems.length &&
        remainingMinutes >= LEARNING_TASK_MINUTES
      ) {
        const pathItemOrder = context.incompleteLearningItems[learningItemIndex];
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'learning',
          targetId: pathItemOrder,
          estimatedMinutes: LEARNING_TASK_MINUTES,
          completedAt: null,
          notes: `Complete learning path item #${pathItemOrder}`,
        });
        remainingMinutes -= LEARNING_TASK_MINUTES;
      }

      // Add practice task targeting weak domains
      if (weakDomains.length > 0 && remainingMinutes >= PRACTICE_TASK_MINUTES) {
        // Rotate through weak domains
        const domainIndex = dayNum % weakDomains.length;
        const targetDomain = weakDomains[domainIndex];
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'practice',
          targetId: targetDomain.domainId,
          estimatedMinutes: PRACTICE_TASK_MINUTES,
          completedAt: null,
          notes: `Practice: ${targetDomain.domainName}`,
        });
        remainingMinutes -= PRACTICE_TASK_MINUTES;
      }

      // Add review task
      if (context.dueReviewCards > 0 && remainingMinutes >= REVIEW_TASK_MINUTES) {
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'review',
          targetId: null,
          estimatedMinutes: REVIEW_TASK_MINUTES,
          completedAt: null,
          notes: 'Review spaced repetition cards',
        });
        remainingMinutes -= REVIEW_TASK_MINUTES;
      }
      break;

    case 'late':
      // Focus: Heavy practice, drills, daily review - exam crunch time
      // Daily practice on weak domains
      if (weakDomains.length > 0 && remainingMinutes >= PRACTICE_TASK_MINUTES) {
        const domainIndex = dayNum % weakDomains.length;
        const targetDomain = weakDomains[domainIndex];
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'practice',
          targetId: targetDomain.domainId,
          estimatedMinutes: PRACTICE_TASK_MINUTES,
          completedAt: null,
          notes: `Intensive practice: ${targetDomain.domainName}`,
        });
        remainingMinutes -= PRACTICE_TASK_MINUTES;
      }

      // Add drill task every day
      if (remainingMinutes >= DRILL_TASK_MINUTES) {
        // Alternate between general drills and domain-specific
        const drillDomainIndex = dayNum % (weakDomains.length + 1);
        const isDomainDrill = drillDomainIndex < weakDomains.length;
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'drill',
          targetId: isDomainDrill ? weakDomains[drillDomainIndex].domainId : null,
          estimatedMinutes: DRILL_TASK_MINUTES,
          completedAt: null,
          notes: isDomainDrill
            ? `Timed drill: ${weakDomains[drillDomainIndex].domainName}`
            : 'Timed drill: Mixed domains',
        });
        remainingMinutes -= DRILL_TASK_MINUTES;
      }

      // Add a second practice session if time allows
      if (weakDomains.length > 1 && remainingMinutes >= PRACTICE_TASK_MINUTES) {
        const secondDomainIndex = (dayNum + 1) % weakDomains.length;
        const targetDomain = weakDomains[secondDomainIndex];
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'practice',
          targetId: targetDomain.domainId,
          estimatedMinutes: PRACTICE_TASK_MINUTES,
          completedAt: null,
          notes: `Additional practice: ${targetDomain.domainName}`,
        });
        remainingMinutes -= PRACTICE_TASK_MINUTES;
      }

      // Daily review in late phase
      if (context.dueReviewCards > 0 && remainingMinutes >= REVIEW_TASK_MINUTES) {
        tasks.push({
          studyPlanDayId: dayId,
          taskType: 'review',
          targetId: null,
          estimatedMinutes: REVIEW_TASK_MINUTES,
          completedAt: null,
          notes: 'Review spaced repetition cards',
        });
        remainingMinutes -= REVIEW_TASK_MINUTES;
      }
      break;
  }

  return tasks;
}

/**
 * Regenerate tasks for remaining days of an existing plan.
 * Keeps completed tasks, regenerates pending ones.
 */
export async function regenerateStudyPlan(
  planId: number,
  keepCompletedTasks: boolean,
  db: DB
): Promise<{ plan: StudyPlanWithDays; tasksRemoved: number; tasksGenerated: number }> {
  // Get existing plan
  const plan = await db.select().from(studyPlans).where(eq(studyPlans.id, planId)).get();

  if (!plan) {
    throw new Error('Study plan not found');
  }

  if (plan.status !== 'active') {
    throw new Error('Can only regenerate active plans');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayString = today.toISOString().split('T')[0];

  // Get all days for this plan
  const existingDays = await db
    .select()
    .from(studyPlanDays)
    .where(eq(studyPlanDays.studyPlanId, planId))
    .orderBy(studyPlanDays.date)
    .all();

  // Count tasks to be removed
  let tasksRemoved = 0;
  let tasksGenerated = 0;

  // Get updated context
  const { score: readinessScore } = await calculateReadinessScore(
    plan.userId,
    plan.certificationId,
    db
  );

  const completedItems = await db
    .select({ pathItemOrder: learningPathProgress.pathItemOrder })
    .from(learningPathProgress)
    .where(
      and(
        eq(learningPathProgress.userId, plan.userId),
        eq(learningPathProgress.certificationId, plan.certificationId)
      )
    )
    .all();

  const completedSet = new Set(completedItems.map((item) => item.pathItemOrder));
  const incompleteLearningItems = LEARNING_PATH_ITEMS.filter(
    (item) => !completedSet.has(item.order)
  ).map((item) => item.order);

  const dueCardsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(spacedRepetition)
    .where(and(eq(spacedRepetition.userId, plan.userId), lte(spacedRepetition.nextReviewAt, today)))
    .get();

  const targetDate = new Date(plan.targetExamDate);
  const remainingDays = existingDays.filter((d) => d.date >= todayString);
  const totalRemainingDays = remainingDays.length;

  const context: GenerationContext = {
    userId: plan.userId,
    certificationId: plan.certificationId,
    targetExamDate: targetDate,
    totalDays: totalRemainingDays,
    domainReadiness: readinessScore.domains,
    incompleteLearningItems,
    dueReviewCards: dueCardsResult?.count ?? 0,
  };

  const sortedDomains = [...context.domainReadiness].sort((a, b) => a.score - b.score);
  const weakDomains = sortedDomains.slice(0, Math.ceil(sortedDomains.length / 2));

  const earlyPhaseEnd = Math.floor(totalRemainingDays * EARLY_PHASE_RATIO);
  const middlePhaseEnd = earlyPhaseEnd + Math.floor(totalRemainingDays * MIDDLE_PHASE_RATIO);

  let learningItemIndex = 0;

  // Process each remaining day
  for (let i = 0; i < remainingDays.length; i++) {
    const day = remainingDays[i];

    // Get existing tasks for this day
    const existingTasks = await db
      .select()
      .from(studyPlanTasks)
      .where(eq(studyPlanTasks.studyPlanDayId, day.id))
      .all();

    // Separate completed and incomplete tasks
    const completedTasks = existingTasks.filter((t) => t.completedAt !== null);
    const incompleteTasks = existingTasks.filter((t) => t.completedAt === null);

    // Remove incomplete tasks (or all if not keeping completed)
    const tasksToRemove = keepCompletedTasks ? incompleteTasks : existingTasks;
    for (const task of tasksToRemove) {
      await db.delete(studyPlanTasks).where(eq(studyPlanTasks.id, task.id));
      tasksRemoved++;
    }

    // Calculate remaining time budget if keeping completed tasks
    let usedMinutes = 0;
    if (keepCompletedTasks) {
      usedMinutes = completedTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    }

    // Determine phase
    const phase = i < earlyPhaseEnd ? 'early' : i < middlePhaseEnd ? 'middle' : 'late';

    // Generate new tasks
    const newTasks = generateDayTasks(day.id, phase, i, context, weakDomains, learningItemIndex);

    // Filter to fit within remaining budget
    const targetMinutes =
      phase === 'early'
        ? MIN_DAILY_STUDY_MINUTES + 15
        : phase === 'middle'
          ? MIN_DAILY_STUDY_MINUTES + 30
          : MAX_DAILY_STUDY_MINUTES;

    const budgetRemaining = targetMinutes - usedMinutes;
    let minutesUsed = 0;
    const tasksToInsert = newTasks.filter((t) => {
      if (minutesUsed + t.estimatedMinutes <= budgetRemaining) {
        minutesUsed += t.estimatedMinutes;
        return true;
      }
      return false;
    });

    // Insert new tasks
    if (tasksToInsert.length > 0) {
      await db.insert(studyPlanTasks).values(tasksToInsert);
      tasksGenerated += tasksToInsert.length;
    }

    // Track learning item progress
    const learningTasks = tasksToInsert.filter((t) => t.taskType === 'learning');
    learningItemIndex += learningTasks.length;
  }

  // Update plan's updatedAt
  await db.update(studyPlans).set({ updatedAt: new Date() }).where(eq(studyPlans.id, planId));

  // Fetch and return updated plan
  const updatedPlan = await getStudyPlanWithDays(planId, db);
  if (!updatedPlan) {
    throw new Error('Failed to fetch updated plan');
  }

  return { plan: updatedPlan, tasksRemoved, tasksGenerated };
}

/**
 * Fetch a study plan with all its days and tasks.
 * Uses a single query with JOIN to avoid N+1 problem.
 */
export async function getStudyPlanWithDays(
  planId: number,
  db: DB
): Promise<StudyPlanWithDays | null> {
  const plan = await db.select().from(studyPlans).where(eq(studyPlans.id, planId)).get();

  if (!plan) {
    return null;
  }

  // Fetch days for this plan
  const days = await db
    .select()
    .from(studyPlanDays)
    .where(eq(studyPlanDays.studyPlanId, planId))
    .orderBy(studyPlanDays.date)
    .all();

  if (days.length === 0) {
    return {
      id: plan.id,
      userId: plan.userId,
      certificationId: plan.certificationId,
      targetExamDate: plan.targetExamDate,
      status: plan.status as 'active' | 'completed' | 'abandoned',
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      days: [],
    };
  }

  // Fetch ALL tasks for ALL days in a single query (fixes N+1)
  const dayIds = days.map((d) => d.id);
  const allTasks = await db
    .select()
    .from(studyPlanTasks)
    .where(inArray(studyPlanTasks.studyPlanDayId, dayIds))
    .all();

  // Group tasks by day ID for efficient lookup
  const tasksByDayId = new Map<number, typeof allTasks>();
  for (const task of allTasks) {
    const dayTasks = tasksByDayId.get(task.studyPlanDayId) ?? [];
    dayTasks.push(task);
    tasksByDayId.set(task.studyPlanDayId, dayTasks);
  }

  // Build days with tasks
  const daysWithTasks: StudyPlanDay[] = days.map((day) => {
    const tasks = tasksByDayId.get(day.id) ?? [];
    return {
      id: day.id,
      studyPlanId: day.studyPlanId,
      date: day.date,
      isComplete: day.isComplete,
      tasks: tasks.map((t) => ({
        id: t.id,
        studyPlanDayId: t.studyPlanDayId,
        taskType: t.taskType as StudyPlanTaskType,
        targetId: t.targetId,
        estimatedMinutes: t.estimatedMinutes,
        completedAt: t.completedAt,
        notes: t.notes,
      })),
    };
  });

  return {
    id: plan.id,
    userId: plan.userId,
    certificationId: plan.certificationId,
    targetExamDate: plan.targetExamDate,
    status: plan.status as 'active' | 'completed' | 'abandoned',
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    days: daysWithTasks,
  };
}

/**
 * Get the active study plan for a user/certification.
 */
export async function getActiveStudyPlan(
  userId: number,
  certificationId: number,
  db: DB
): Promise<StudyPlanWithDays | null> {
  const plan = await db
    .select()
    .from(studyPlans)
    .where(
      and(
        eq(studyPlans.userId, userId),
        eq(studyPlans.certificationId, certificationId),
        eq(studyPlans.status, 'active')
      )
    )
    .orderBy(desc(studyPlans.createdAt))
    .get();

  if (!plan) {
    return null;
  }

  return getStudyPlanWithDays(plan.id, db);
}
