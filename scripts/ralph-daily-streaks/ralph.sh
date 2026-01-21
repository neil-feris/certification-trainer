#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop (Claude CLI version)
# Usage: ./ralph.sh [max_iterations]

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Extract feature name from directory (e.g., ralph-profile-details -> profile-details)
SCRIPT_DIRNAME="$(basename "$SCRIPT_DIR")"
FEATURE_NAME="${SCRIPT_DIRNAME#ralph-}"

# If directory is just "ralph", check for legacy prd.json or fail
if [ "$FEATURE_NAME" = "ralph" ]; then
  if [ -f "$PROJECT_DIR/tasks/prd.json" ]; then
    FEATURE_NAME=""
    PRD_FILE="$PROJECT_DIR/tasks/prd.json"
  else
    echo "Error: Could not determine feature name from directory: $SCRIPT_DIRNAME"
    echo "Expected format: scripts/ralph-{feature-name}/"
    exit 1
  fi
else
  PRD_FILE="$PROJECT_DIR/tasks/prd-${FEATURE_NAME}.json"
fi

PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

# Verify PRD file exists
if [ ! -f "$PRD_FILE" ]; then
  echo "Error: PRD file not found: $PRD_FILE"
  exit 1
fi

# Archive previous run if branch changed
if [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"

    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
if [ -n "$CURRENT_BRANCH" ]; then
  echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
fi

# Initialize progress file if needed
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

LOG_FILE="$SCRIPT_DIR/ralph-output.log"

echo "Starting Ralph (Claude CLI) - Max iterations: $MAX_ITERATIONS"
echo "Feature: ${FEATURE_NAME:-legacy}"
echo "PRD file: $PRD_FILE"
echo "Project directory: $PROJECT_DIR"
echo "Log file: $LOG_FILE"
echo ""
echo "To watch output in another terminal:"
echo "  tail -f $LOG_FILE"
echo ""

CONSECUTIVE_ERRORS=0
MAX_CONSECUTIVE_ERRORS=5

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════════════"

  PROMPT=$(cat "$SCRIPT_DIR/prompt.md")
  ITER_LOG="$SCRIPT_DIR/.iter-output.tmp"
  echo "--- Iteration $i started at $(date) ---" >> "$LOG_FILE"
  cd "$PROJECT_DIR" && claude --dangerously-skip-permissions -p "$PROMPT" 2>&1 | tee -a "$LOG_FILE" | tee "$ITER_LOG"
  echo "--- Iteration $i ended at $(date) ---" >> "$LOG_FILE"

  # Use only current iteration's output for checks
  OUTPUT=$(cat "$ITER_LOG")

  # Check for rate limit / quota exceeded
  if echo "$OUTPUT" | grep -qiE "(rate.?limit|quota|429|exceeded.*limit|credit|too many requests|overloaded)"; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  QUOTA/RATE LIMIT HIT - Pausing Ralph"
    echo "═══════════════════════════════════════════════════════"
    echo "Stopped at iteration $i of $MAX_ITERATIONS"
    echo "Resume when quota resets: $0 $((MAX_ITERATIONS - i + 1))"
    exit 2
  fi

  # Check for server errors / empty responses - retry with backoff
  if echo "$OUTPUT" | grep -qiE "(500|502|503|504|internal server error|api_error|service unavailable|No messages returned)"; then
    CONSECUTIVE_ERRORS=$((CONSECUTIVE_ERRORS + 1))
    echo "⚠️  Server error (attempt $CONSECUTIVE_ERRORS of $MAX_CONSECUTIVE_ERRORS)"

    if [ $CONSECUTIVE_ERRORS -ge $MAX_CONSECUTIVE_ERRORS ]; then
      echo "TOO MANY SERVER ERRORS - Pausing Ralph"
      echo "Resume later: $0 $((MAX_ITERATIONS - i + 1))"
      exit 3
    fi

    WAIT_TIME=$((CONSECUTIVE_ERRORS * 30))
    echo "Waiting ${WAIT_TIME}s before retry..."
    sleep $WAIT_TIME
    continue
  fi

  CONSECUTIVE_ERRORS=0

  # Check for completion
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    exit 0
  fi

  REMAINING=$(jq '[.userStories[] | select(.passes==false)] | length' "$PRD_FILE" 2>/dev/null || echo "999")
  if [ "$REMAINING" -eq 0 ]; then
    echo "Ralph completed all tasks! (verified via prd.json)"
    exit 0
  fi

  echo "Iteration $i complete. $REMAINING stories remaining..."
  sleep 2
done

echo "Ralph reached max iterations. Check progress: cat $PRD_FILE | jq '.userStories[] | {id, passes}'"
exit 1
