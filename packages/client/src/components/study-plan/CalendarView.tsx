import { useState, useMemo } from 'react';
import { useStudyPlanStore } from '../../stores/studyPlanStore';
import type { StudyPlanDay, StudyPlanTaskType } from '@ace-prep/shared';
import styles from './CalendarView.module.css';

interface DayInfo {
  date: Date;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isExamDay: boolean;
  planDay: StudyPlanDay | null;
  taskCounts: Record<StudyPlanTaskType, number>;
  totalTasks: number;
  completedTasks: number;
  isMissed: boolean; // past day with incomplete tasks
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const TASK_TYPE_COLORS: Record<StudyPlanTaskType, string> = {
  learning: '#3b82f6', // blue
  practice: '#8b5cf6', // purple
  review: '#f59e0b', // amber
  drill: '#ef4444', // red
};

const TASK_TYPE_LABELS: Record<StudyPlanTaskType, string> = {
  learning: 'Learning',
  practice: 'Practice',
  review: 'Review',
  drill: 'Drill',
};

function getMonthDays(
  year: number,
  month: number,
  planDays: StudyPlanDay[],
  examDate: string
): DayInfo[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();

  // Create map of plan days by date string for quick lookup
  const planDayMap = new Map<string, StudyPlanDay>();
  for (const day of planDays) {
    planDayMap.set(day.date, day);
  }

  const days: DayInfo[] = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0);
  const prevMonthDays = prevMonthLastDay.getDate();
  for (let i = startPadding - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthDays - i);
    const dateString = formatDateString(date);
    days.push(createDayInfo(date, dateString, false, today, examDate, planDayMap.get(dateString)));
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateString = formatDateString(date);
    days.push(createDayInfo(date, dateString, true, today, examDate, planDayMap.get(dateString)));
  }

  // Next month padding to fill grid (always show 6 weeks = 42 days)
  const totalCells = 42;
  const remaining = totalCells - days.length;
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(year, month + 1, i);
    const dateString = formatDateString(date);
    days.push(createDayInfo(date, dateString, false, today, examDate, planDayMap.get(dateString)));
  }

  return days;
}

function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function createDayInfo(
  date: Date,
  dateString: string,
  isCurrentMonth: boolean,
  today: Date,
  examDate: string,
  planDay: StudyPlanDay | undefined
): DayInfo {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  const isToday = dateOnly.getTime() === today.getTime();
  const isPast = dateOnly < today;
  const isFuture = dateOnly > today;
  const isExamDay = dateString === examDate;

  const taskCounts: Record<StudyPlanTaskType, number> = {
    learning: 0,
    practice: 0,
    review: 0,
    drill: 0,
  };

  let totalTasks = 0;
  let completedTasks = 0;

  if (planDay) {
    for (const task of planDay.tasks) {
      taskCounts[task.taskType]++;
      totalTasks++;
      if (task.completedAt) {
        completedTasks++;
      }
    }
  }

  const isMissed = isPast && planDay !== undefined && !planDay.isComplete && totalTasks > 0;

  return {
    date,
    dateString,
    isCurrentMonth,
    isToday,
    isPast,
    isFuture,
    isExamDay,
    planDay: planDay ?? null,
    taskCounts,
    totalTasks,
    completedTasks,
    isMissed,
  };
}

interface TaskDetailProps {
  day: DayInfo;
  onClose: () => void;
}

function TaskDetail({ day, onClose }: TaskDetailProps) {
  const { date, planDay, isExamDay, taskCounts, totalTasks, completedTasks, isMissed } = day;

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.taskDetail}>
      <div className={styles.taskDetailHeader}>
        <h4 className={styles.taskDetailDate}>{formattedDate}</h4>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {isExamDay && (
        <div className={styles.examBadge}>
          <span className={styles.examIcon}>🎯</span>
          <span>Exam Day!</span>
        </div>
      )}

      {totalTasks === 0 ? (
        <p className={styles.noTasks}>No tasks scheduled</p>
      ) : (
        <>
          <div className={styles.taskSummary}>
            <span className={isMissed ? styles.missed : planDay?.isComplete ? styles.complete : ''}>
              {completedTasks}/{totalTasks} tasks {planDay?.isComplete ? '✓' : isMissed ? '⚠' : ''}
            </span>
          </div>

          <ul className={styles.taskTypeList}>
            {(Object.keys(taskCounts) as StudyPlanTaskType[]).map((type) => {
              const count = taskCounts[type];
              if (count === 0) return null;

              return (
                <li key={type} className={styles.taskTypeItem}>
                  <span
                    className={styles.taskTypeDot}
                    style={{ backgroundColor: TASK_TYPE_COLORS[type] }}
                  />
                  <span className={styles.taskTypeName}>{TASK_TYPE_LABELS[type]}</span>
                  <span className={styles.taskTypeCount}>{count}</span>
                </li>
              );
            })}
          </ul>

          {planDay?.tasks && planDay.tasks.length > 0 && (
            <ul className={styles.taskList}>
              {planDay.tasks.map((task) => (
                <li
                  key={task.id}
                  className={`${styles.taskItem} ${task.completedAt ? styles.taskCompleted : ''}`}
                >
                  <span className={styles.taskIcon}>{task.completedAt ? '✓' : '○'}</span>
                  <span className={styles.taskLabel}>
                    {TASK_TYPE_LABELS[task.taskType]}
                    {task.estimatedMinutes && ` · ${task.estimatedMinutes}min`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function CalendarView() {
  const { activePlan } = useStudyPlanStore();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<DayInfo | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days = useMemo(() => {
    const planDays = activePlan?.plan.days ?? [];
    const examDate = activePlan?.plan.targetExamDate ?? '';
    return getMonthDays(year, month, planDays, examDate);
  }, [year, month, activePlan?.plan.days, activePlan?.plan.targetExamDate]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const handleDayClick = (day: DayInfo) => {
    if (day.totalTasks > 0 || day.isExamDay) {
      setSelectedDay(day);
    }
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          onClick={handlePrevMonth}
          aria-label="Previous month"
        >
          ‹
        </button>

        <div className={styles.monthYear}>
          <span className={styles.month}>{MONTH_NAMES[month]}</span>
          <span className={styles.year}>{year}</span>
        </div>

        <button
          type="button"
          className={styles.navButton}
          onClick={handleNextMonth}
          aria-label="Next month"
        >
          ›
        </button>

        <button type="button" className={styles.todayButton} onClick={handleGoToToday}>
          Today
        </button>
      </div>

      <div className={styles.weekdayHeader}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className={styles.weekday}>
            {label}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {days.map((day, index) => {
          const hasActivity = day.totalTasks > 0 || day.isExamDay;
          const isSelected = selectedDay?.dateString === day.dateString;

          return (
            <button
              key={index}
              type="button"
              className={`
                ${styles.day}
                ${!day.isCurrentMonth ? styles.otherMonth : ''}
                ${day.isToday ? styles.today : ''}
                ${day.isPast && day.isCurrentMonth ? styles.past : ''}
                ${day.isFuture && day.isCurrentMonth ? styles.future : ''}
                ${day.isExamDay ? styles.examDay : ''}
                ${day.planDay?.isComplete ? styles.dayComplete : ''}
                ${day.isMissed ? styles.dayMissed : ''}
                ${isSelected ? styles.selected : ''}
                ${hasActivity ? styles.clickable : ''}
              `}
              onClick={() => handleDayClick(day)}
              disabled={!hasActivity}
              aria-label={`${day.date.toDateString()}${day.totalTasks > 0 ? `, ${day.totalTasks} tasks` : ''}${day.isExamDay ? ', Exam day' : ''}`}
            >
              <span className={styles.dayNumber}>{day.date.getDate()}</span>

              {day.planDay?.isComplete && !day.isExamDay && (
                <span className={styles.checkmark}>✓</span>
              )}

              {day.isMissed && <span className={styles.warningIndicator}>!</span>}

              {day.isExamDay && <span className={styles.examIndicator}>🎯</span>}

              {day.totalTasks > 0 && !day.isExamDay && (
                <div className={styles.taskDots}>
                  {(Object.keys(day.taskCounts) as StudyPlanTaskType[]).map((type) => {
                    if (day.taskCounts[type] === 0) return null;
                    return (
                      <span
                        key={type}
                        className={styles.taskDot}
                        style={{ backgroundColor: TASK_TYPE_COLORS[type] }}
                        title={`${day.taskCounts[type]} ${TASK_TYPE_LABELS[type]}`}
                      />
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && <TaskDetail day={selectedDay} onClose={() => setSelectedDay(null)} />}

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span
            className={styles.legendDot}
            style={{ backgroundColor: TASK_TYPE_COLORS.learning }}
          />
          <span>Learning</span>
        </div>
        <div className={styles.legendItem}>
          <span
            className={styles.legendDot}
            style={{ backgroundColor: TASK_TYPE_COLORS.practice }}
          />
          <span>Practice</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: TASK_TYPE_COLORS.review }} />
          <span>Review</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: TASK_TYPE_COLORS.drill }} />
          <span>Drill</span>
        </div>
      </div>
    </div>
  );
}
