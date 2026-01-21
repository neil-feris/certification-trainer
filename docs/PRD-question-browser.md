# PRD: Question Browser Page

## Overview
A Question Browser feature allowing users to browse, search, and filter the entire question bank with pagination.

---

## API Design

### Enhanced Question Listing
**Endpoint**: `GET /api/questions`

**Query Parameters**:
```typescript
interface QuestionBrowseParams {
  certificationId?: number;
  domainId?: number;
  topicId?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  search?: string;           // Full-text search on questionText
  sortBy?: 'createdAt' | 'difficulty' | 'domain';
  sortOrder?: 'asc' | 'desc';
  limit?: number;            // default: 50, max: 200
  offset?: number;           // default: 0
}
```

**Response**: `PaginatedResponse<QuestionWithDomain>`

### Filter Options Endpoint
**Endpoint**: `GET /api/questions/filters`

**Query Parameters**:
```typescript
interface FilterOptionsParams {
  certificationId?: number; // Scope domains/topics to certification
}
```

**Response**:
```typescript
interface QuestionFilterOptions {
  certifications: { id: number; code: string; name: string }[];
  domains: { id: number; name: string; certificationId: number }[];
  topics: { id: number; name: string; domainId: number }[];
  difficulties: ('easy' | 'medium' | 'hard')[];
  totalQuestions: number;
}
```

---

## Shared Types

**File**: `packages/shared/src/index.ts`

Add after existing types (~line 286):
```typescript
// Question Browser Types
export interface QuestionBrowseParams {
  certificationId?: number;
  domainId?: number;
  topicId?: number;
  difficulty?: Difficulty;
  search?: string;
  sortBy?: 'createdAt' | 'difficulty' | 'domain';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface QuestionFilterOptions {
  certifications: Pick<Certification, 'id' | 'code' | 'name'>[];
  domains: Pick<Domain, 'id' | 'name' | 'certificationId'>[];
  topics: Pick<Topic, 'id' | 'name' | 'domainId'>[];
  difficulties: Difficulty[];
  totalQuestions: number;
}
```

---

## Validation Schema

**File**: `packages/server/src/validation/schemas.ts`

```typescript
export const questionBrowseQuerySchema = questionQuerySchema.extend({
  search: z.string().max(200).optional(),
  sortBy: z.enum(['createdAt', 'difficulty', 'domain']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
```

---

## Database Queries

**File**: `packages/server/src/routes/questions.ts`

### Search with LIKE
```typescript
import { like, desc, asc, or } from 'drizzle-orm';

// Add search condition to existing GET / handler
if (search) {
  conditions.push(like(questions.questionText, `%${search}%`));
}

// Add sorting
const orderByClause = sortBy === 'difficulty'
  ? (sortOrder === 'asc' ? asc(questions.difficulty) : desc(questions.difficulty))
  : sortBy === 'domain'
  ? (sortOrder === 'asc' ? asc(domains.name) : desc(domains.name))
  : (sortOrder === 'asc' ? asc(questions.createdAt) : desc(questions.createdAt));
```

### Filter Options Query
```typescript
fastify.get('/filters', async (request, reply) => {
  const { certificationId } = request.query as { certificationId?: string };
  const certId = certificationId ? Number(certificationId) : undefined;

  const certs = db.select({
    id: certifications.id,
    code: certifications.code,
    name: certifications.name
  }).from(certifications).where(eq(certifications.isActive, true)).all();

  let domainsQuery = db.select({
    id: domains.id,
    name: domains.name,
    certificationId: domains.certificationId
  }).from(domains);

  if (certId) {
    domainsQuery = domainsQuery.where(eq(domains.certificationId, certId));
  }
  const doms = domainsQuery.all();

  let topicsQuery = db.select({
    id: topics.id,
    name: topics.name,
    domainId: topics.domainId
  }).from(topics);

  if (certId) {
    const domainIds = doms.map(d => d.id);
    topicsQuery = topicsQuery.where(inArray(topics.domainId, domainIds));
  }
  const tops = topicsQuery.all();

  const [{ count: totalQuestions }] = db.select({ count: sql`count(*)` })
    .from(questions)
    .where(certId ? eq(questions.certificationId, certId) : undefined)
    .all();

  return {
    certifications: certs,
    domains: doms,
    topics: tops,
    difficulties: ['easy', 'medium', 'hard'],
    totalQuestions: Number(totalQuestions)
  };
});
```

---

## Client API Layer

**File**: `packages/client/src/api/client.ts`

### Extended Interface
```typescript
interface QuestionListParams {
  certificationId?: number;
  domainId?: number;
  topicId?: number;
  difficulty?: string;
  search?: string;        // NEW
  sortBy?: string;        // NEW
  sortOrder?: string;     // NEW
  limit?: number;
  offset?: number;
}
```

### Updated list method
```typescript
list: (params: QuestionListParams = {}) => {
  const searchParams = new URLSearchParams();
  if (params.certificationId) searchParams.set('certificationId', String(params.certificationId));
  if (params.domainId) searchParams.set('domainId', String(params.domainId));
  if (params.topicId) searchParams.set('topicId', String(params.topicId));
  if (params.difficulty) searchParams.set('difficulty', params.difficulty);
  if (params.search) searchParams.set('search', params.search);           // NEW
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);           // NEW
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);  // NEW
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  return request<PaginatedResponse<QuestionWithDomain>>(`/questions${query ? `?${query}` : ''}`);
},
```

### New getFilterOptions method
```typescript
getFilterOptions: (certificationId?: number) => {
  const params = certificationId ? `?certificationId=${certificationId}` : '';
  return request<QuestionFilterOptions>(`/questions/filters${params}`);
},
```

---

## Component Architecture

### Component Hierarchy
```
packages/client/src/components/questions/
├── QuestionBrowser.tsx          # Main container, URL state sync
├── QuestionBrowser.module.css   # Styles
├── QuestionFilters.tsx          # Search + filter dropdowns
├── QuestionList.tsx             # Question cards grid
├── QuestionCard.tsx             # Individual question preview
├── QuestionDetailModal.tsx      # Full question modal
├── QuestionDetailModal.module.css
└── index.ts                     # Barrel export

packages/client/src/components/common/
├── Pagination.tsx               # Reusable pagination
└── Pagination.module.css
```

### QuestionBrowser.tsx Pattern
```typescript
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useCertificationStore } from '../../stores/certificationStore';
import { questionApi } from '../../api/client';
import { QuestionFilters } from './QuestionFilters';
import { QuestionList } from './QuestionList';
import { QuestionDetailModal } from './QuestionDetailModal';
import { Pagination } from '../common/Pagination';
import styles from './QuestionBrowser.module.css';

export function QuestionBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionWithDomain | null>(null);

  // Parse URL params
  const params = {
    certificationId: searchParams.get('certificationId')
      ? Number(searchParams.get('certificationId'))
      : selectedCertificationId ?? undefined,
    domainId: searchParams.get('domainId') ? Number(searchParams.get('domainId')) : undefined,
    topicId: searchParams.get('topicId') ? Number(searchParams.get('topicId')) : undefined,
    difficulty: searchParams.get('difficulty') || undefined,
    search: searchParams.get('search') || undefined,
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: searchParams.get('sortOrder') || 'desc',
    limit: 20,
    offset: Number(searchParams.get('offset')) || 0,
  };

  // Fetch questions
  const { data, isLoading, error } = useQuery({
    queryKey: ['questions', 'browse', params],
    queryFn: () => questionApi.list(params),
    placeholderData: keepPreviousData,
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['questions', 'filters', params.certificationId],
    queryFn: () => questionApi.getFilterOptions(params.certificationId),
    staleTime: 5 * 60_000,
  });

  const updateFilter = (key: string, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set(key, value);
    else newParams.delete(key);
    if (key !== 'offset') newParams.set('offset', '0'); // Reset pagination
    setSearchParams(newParams);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Question Bank</h1>
        <span className={styles.count}>
          {data?.total ?? 0} questions
        </span>
      </header>

      <QuestionFilters
        params={params}
        filterOptions={filterOptions}
        onFilterChange={updateFilter}
      />

      <QuestionList
        questions={data?.items ?? []}
        isLoading={isLoading}
        error={error}
        onQuestionClick={setSelectedQuestion}
      />

      {data && data.total > params.limit && (
        <Pagination
          total={data.total}
          limit={params.limit}
          offset={params.offset}
          onPageChange={(offset) => updateFilter('offset', String(offset))}
        />
      )}

      {selectedQuestion && (
        <QuestionDetailModal
          question={selectedQuestion}
          onClose={() => setSelectedQuestion(null)}
        />
      )}
    </div>
  );
}
```

### QuestionFilters.tsx Pattern
```typescript
interface QuestionFiltersProps {
  params: QuestionBrowseParams;
  filterOptions?: QuestionFilterOptions;
  onFilterChange: (key: string, value: string | undefined) => void;
}

export function QuestionFilters({ params, filterOptions, onFilterChange }: QuestionFiltersProps) {
  const [searchInput, setSearchInput] = useState(params.search || '');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange('search', searchInput || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Filter domains by selected certification
  const filteredDomains = filterOptions?.domains.filter(
    d => !params.certificationId || d.certificationId === params.certificationId
  ) ?? [];

  // Filter topics by selected domain
  const filteredTopics = filterOptions?.topics.filter(
    t => !params.domainId || t.domainId === params.domainId
  ) ?? [];

  return (
    <div className={styles.filters}>
      <input
        type="search"
        placeholder="Search questions..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className={styles.searchInput}
      />

      <select
        value={params.certificationId || ''}
        onChange={(e) => {
          onFilterChange('certificationId', e.target.value || undefined);
          onFilterChange('domainId', undefined); // Reset cascading
          onFilterChange('topicId', undefined);
        }}
      >
        <option value="">All Certifications</option>
        {filterOptions?.certifications.map(c => (
          <option key={c.id} value={c.id}>{c.code}</option>
        ))}
      </select>

      <select
        value={params.domainId || ''}
        onChange={(e) => {
          onFilterChange('domainId', e.target.value || undefined);
          onFilterChange('topicId', undefined);
        }}
      >
        <option value="">All Domains</option>
        {filteredDomains.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      <select
        value={params.topicId || ''}
        onChange={(e) => onFilterChange('topicId', e.target.value || undefined)}
      >
        <option value="">All Topics</option>
        {filteredTopics.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <select
        value={params.difficulty || ''}
        onChange={(e) => onFilterChange('difficulty', e.target.value || undefined)}
      >
        <option value="">All Difficulties</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>

      <select
        value={`${params.sortBy}-${params.sortOrder}`}
        onChange={(e) => {
          const [sortBy, sortOrder] = e.target.value.split('-');
          onFilterChange('sortBy', sortBy);
          onFilterChange('sortOrder', sortOrder);
        }}
      >
        <option value="createdAt-desc">Newest First</option>
        <option value="createdAt-asc">Oldest First</option>
        <option value="difficulty-asc">Difficulty (Easy→Hard)</option>
        <option value="difficulty-desc">Difficulty (Hard→Easy)</option>
        <option value="domain-asc">Domain (A→Z)</option>
      </select>
    </div>
  );
}
```

### QuestionCard.tsx Pattern
```typescript
interface QuestionCardProps {
  question: QuestionWithDomain;
  onClick: () => void;
}

export function QuestionCard({ question, onClick }: QuestionCardProps) {
  const truncatedText = question.questionText.length > 150
    ? question.questionText.slice(0, 150) + '...'
    : question.questionText;

  return (
    <div className={styles.card} onClick={onClick}>
      <p className={styles.questionText}>{truncatedText}</p>
      <div className={styles.meta}>
        <span className={styles.domain}>{question.domainName}</span>
        <span className={`${styles.difficulty} ${styles[question.difficulty]}`}>
          {question.difficulty}
        </span>
      </div>
    </div>
  );
}
```

### QuestionDetailModal.tsx Pattern
```typescript
interface QuestionDetailModalProps {
  question: QuestionWithDomain;
  onClose: () => void;
}

export function QuestionDetailModal({ question, onClose }: QuestionDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const options = JSON.parse(question.options) as string[];
  const correctAnswers = JSON.parse(question.correctAnswers) as number[];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <div className={styles.header}>
          <span className={styles.domain}>{question.domainName}</span>
          <span className={`${styles.difficulty} ${styles[question.difficulty]}`}>
            {question.difficulty}
          </span>
        </div>

        <p className={styles.questionText}>{question.questionText}</p>

        <div className={styles.options}>
          {options.map((opt, idx) => (
            <div
              key={idx}
              className={`${styles.option} ${correctAnswers.includes(idx) ? styles.correct : ''}`}
            >
              <span className={styles.optionLabel}>
                {String.fromCharCode(65 + idx)}
              </span>
              <span>{opt}</span>
              {correctAnswers.includes(idx) && (
                <span className={styles.checkmark}>✓</span>
              )}
            </div>
          ))}
        </div>

        {question.explanation && (
          <div className={styles.explanation}>
            <h4>Explanation</h4>
            <p>{question.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Pagination.tsx Pattern
```typescript
interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  const goToPage = (page: number) => {
    onPageChange((page - 1) * limit);
  };

  return (
    <div className={styles.pagination}>
      <button
        disabled={currentPage === 1}
        onClick={() => goToPage(currentPage - 1)}
      >
        Previous
      </button>

      <span className={styles.pageInfo}>
        Page {currentPage} of {totalPages}
      </span>

      <button
        disabled={currentPage === totalPages}
        onClick={() => goToPage(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
}
```

---

## Routing

**File**: `packages/client/src/App.tsx`

```tsx
import { QuestionBrowser } from './components/questions';

// Add to routes
<Route
  path="/questions"
  element={
    <RouteErrorBoundary>
      <QuestionBrowser />
    </RouteErrorBoundary>
  }
/>
```

**File**: `packages/client/src/components/layout/AppShell.tsx`

```tsx
// Add to sidebar navigation
<NavLink to="/questions" className={({ isActive }) => isActive ? styles.active : ''}>
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
  Question Bank
</NavLink>
```

---

## CSS Patterns

### QuestionBrowser.module.css
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
}

.count {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.filters select,
.searchInput {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.searchInput {
  min-width: 250px;
}

.questionGrid {
  display: grid;
  gap: 16px;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.card:hover {
  background: var(--bg-elevated);
  transform: translateY(-2px);
}

.questionText {
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.domain {
  font-size: 0.75rem;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
}

.difficulty {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: var(--border-radius-sm);
  font-weight: 500;
}

.difficulty.easy { background: var(--success-bg); color: var(--success); }
.difficulty.medium { background: var(--warning-bg); color: var(--warning); }
.difficulty.hard { background: var(--error-bg); color: var(--error); }

.loading,
.error,
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  text-align: center;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .container { padding: 16px; }
  .header { flex-direction: column; gap: 8px; align-items: flex-start; }
  .filters { flex-direction: column; }
  .filters select,
  .searchInput { width: 100%; }
}
```

### QuestionDetailModal.module.css
```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal {
  background: var(--bg-primary);
  border-radius: var(--border-radius-lg);
  max-width: 700px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
  position: relative;
}

.closeBtn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.closeBtn:hover { color: var(--text-primary); }

.header {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.questionText {
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 24px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
}

.option.correct {
  background: var(--success-bg);
  border-color: var(--success);
}

.optionLabel {
  font-weight: 600;
  min-width: 24px;
}

.checkmark {
  margin-left: auto;
  color: var(--success);
  font-weight: bold;
}

.explanation {
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-md);
}

.explanation h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.explanation p {
  line-height: 1.6;
  color: var(--text-primary);
}
```

### Pagination.module.css
```css
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  padding: 16px 0;
}

.pagination button {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.pagination button:hover:not(:disabled) {
  background: var(--bg-elevated);
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pageInfo {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
```

---

## Success Criteria

- [ ] User can access Question Browser via `/questions` route
- [ ] Search filters questions by text (case-insensitive)
- [ ] Filters work: certification, domain, topic, difficulty
- [ ] Filters cascade correctly (domain options filtered by certification)
- [ ] Pagination works: page navigation
- [ ] Question detail modal shows full question with explanation
- [ ] Responsive design works on mobile (< 768px)
- [ ] URL reflects current filters (shareable links)
- [ ] No TypeScript errors in build
- [ ] Loading states and empty states handled gracefully
