import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, questionApi, progressApi, studyApi, caseStudyApi } from '../../api/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCertificationStore } from '../../stores/certificationStore';
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  MODEL_DISPLAY_NAMES,
  DIFFICULTY_OPTIONS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type LLMProvider,
  type AnthropicModel,
  type OpenAIModel,
  type DifficultyOption,
} from '@ace-prep/shared';
import { OfflineSettings } from './OfflineSettings';
import styles from './Settings.module.css';

const DIFFICULTY_LABELS: Record<DifficultyOption, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  mixed: 'Mixed (Balanced)',
};

const QUESTION_COUNT_OPTIONS = [10, 25, 50, 100] as const;

export function Settings() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<LLMProvider>('anthropic');
  const [anthropicModel, setAnthropicModel] = useState<AnthropicModel>(DEFAULT_ANTHROPIC_MODEL);
  const [openaiModel, setOpenaiModel] = useState<OpenAIModel>(DEFAULT_OPENAI_MODEL);
  const [generateDifficulty, setGenerateDifficulty] = useState<DifficultyOption>('mixed');
  const [generateCount, setGenerateCount] = useState<number>(50);
  const [selectedCaseStudyId, setSelectedCaseStudyId] = useState<number | undefined>(undefined);
  const [testStatus, setTestStatus] = useState<{ success?: boolean; message?: string } | null>(
    null
  );

  // Use Zustand store for generation state (survives navigation) and exam preferences
  const {
    generation,
    startGeneration,
    incrementGenerationProgress,
    completeGeneration,
    failGeneration,
    clearGenerationStatus,
    showDifficultyDuringExam,
    setShowDifficultyDuringExam,
  } = useSettingsStore();

  // Certification context
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  // Fetch domains for the selected certification
  const { data: certDomains = [] } = useQuery({
    queryKey: ['studyDomains', selectedCertificationId],
    queryFn: () => studyApi.getDomains(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  // Fetch case studies for PCA certification
  const isPCA = selectedCert?.code === 'PCA';
  const { data: caseStudiesData } = useQuery({
    queryKey: ['caseStudies', selectedCertificationId],
    queryFn: () => caseStudyApi.getAll(selectedCertificationId ?? undefined),
    enabled: isPCA && selectedCertificationId !== null,
  });
  const caseStudies = caseStudiesData?.caseStudies ?? [];

  // Reset case study selection when certification changes
  useEffect(() => {
    setSelectedCaseStudyId(undefined);
  }, [selectedCertificationId]);

  // Sync local state with loaded settings
  useEffect(() => {
    if (settings) {
      if (settings.llmProvider) {
        setProvider(settings.llmProvider);
      }
      if (settings.anthropicModel && ANTHROPIC_MODELS.includes(settings.anthropicModel)) {
        setAnthropicModel(settings.anthropicModel);
      }
      if (settings.openaiModel && OPENAI_MODELS.includes(settings.openaiModel)) {
        setOpenaiModel(settings.openaiModel);
      }
    }
  }, [settings]);

  const { data: questionCount = 0 } = useQuery({
    queryKey: ['questions', 'count', selectedCertificationId],
    queryFn: () => questionApi.getCount({ certificationId: selectedCertificationId ?? undefined }),
    enabled: selectedCertificationId !== null,
  });

  const updateSettings = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const handleTestConnection = async () => {
    if (!apiKey) {
      setTestStatus({ success: false, message: 'Please enter an API key' });
      return;
    }

    try {
      const result = await settingsApi.testApi(provider, apiKey);
      setTestStatus(result);

      if (result.success) {
        // Save the API key
        await updateSettings.mutateAsync({
          llmProvider: provider,
          [provider === 'openai' ? 'openaiApiKey' : 'anthropicApiKey']: apiKey,
        });
        setApiKey('');
      }
    } catch (err: any) {
      setTestStatus({ success: false, message: err.message });
    }
  };

  const handleModelChange = async (
    newModel: AnthropicModel | OpenAIModel,
    isAnthropic: boolean
  ) => {
    if (isAnthropic) {
      setAnthropicModel(newModel as AnthropicModel);
      await updateSettings.mutateAsync({ anthropicModel: newModel as AnthropicModel });
    } else {
      setOpenaiModel(newModel as OpenAIModel);
      await updateSettings.mutateAsync({ openaiModel: newModel as OpenAIModel });
    }
  };

  // Generate questions mutation - runs in background, state persists via Zustand
  const generateMutation = useMutation({
    mutationFn: async () => {
      const currentModel = provider === 'anthropic' ? anthropicModel : openaiModel;
      // Use domains from the selected certification
      const domainIds = certDomains.map((d: any) => d.id);
      if (domainIds.length === 0) {
        throw new Error('No domains available for this certification');
      }
      const questionsPerDomain = Math.ceil(generateCount / domainIds.length);

      startGeneration(domainIds.length);

      // Run all domain generations in parallel for speed
      const results = await Promise.allSettled(
        domainIds.map(async (domainId: number) => {
          const result = await questionApi.generate({
            domainId,
            difficulty: generateDifficulty,
            count: questionsPerDomain,
            model: currentModel,
            caseStudyId: selectedCaseStudyId,
          });
          // Increment progress after each domain completes (order-independent)
          incrementGenerationProgress(result.generated);
          return result.generated;
        })
      );

      // Calculate total from successful results
      const totalGenerated = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
        .reduce((sum, r) => sum + r.value, 0);

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0 && totalGenerated === 0) {
        const firstError = failures[0] as PromiseRejectedResult;
        throw new Error(firstError.reason?.message || 'All generation requests failed');
      }

      return totalGenerated;
    },
    onSuccess: (totalGenerated) => {
      completeGeneration(totalGenerated);
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      failGeneration(message);
    },
  });

  const handleGenerateQuestions = () => {
    if (!generation.isGenerating) {
      generateMutation.mutate();
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Settings</h1>

      {/* API Configuration */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>LLM Provider</h2>
        <p className={styles.sectionDescription}>
          Configure your AI provider for generating questions and explanations.
        </p>

        <div className={styles.formGroup}>
          <label>Provider</label>
          <div className={styles.providerSelect}>
            <button
              className={`${styles.providerBtn} ${provider === 'anthropic' ? styles.providerActive : ''}`}
              onClick={() => setProvider('anthropic')}
            >
              <span className={styles.providerIcon}>◆</span>
              Anthropic (Claude)
            </button>
            <button
              className={`${styles.providerBtn} ${provider === 'openai' ? styles.providerActive : ''}`}
              onClick={() => setProvider('openai')}
            >
              <span className={styles.providerIcon}>◯</span>
              OpenAI (GPT-4)
            </button>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Model</label>
          <select
            className={styles.modelSelect}
            value={provider === 'anthropic' ? anthropicModel : openaiModel}
            onChange={(e) => handleModelChange(e.target.value as any, provider === 'anthropic')}
          >
            {(provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS).map((model) => (
              <option key={model} value={model}>
                {MODEL_DISPLAY_NAMES[model]}
              </option>
            ))}
          </select>
          <span className={styles.hint}>Select the model to use for question generation</span>
        </div>

        <div className={styles.formGroup}>
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Enter your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`}
          />
          <span className={styles.hint}>
            {(provider === 'anthropic' ? settings?.hasAnthropicKey : settings?.hasOpenaiKey)
              ? 'API key configured'
              : 'No API key configured'}
          </span>
        </div>

        <button className="btn btn-primary" onClick={handleTestConnection}>
          Test & Save API Key
        </button>

        {testStatus && (
          <div
            className={`${styles.status} ${testStatus.success ? styles.statusSuccess : styles.statusError}`}
          >
            {testStatus.message}
          </div>
        )}
      </section>

      {/* Question Generation */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>Question Bank</h2>
        <p className={styles.sectionDescription}>
          Generate practice questions for{' '}
          <strong>{selectedCert?.shortName || 'selected certification'}</strong>. You currently have{' '}
          <strong>{questionCount}</strong> questions.
        </p>

        <div className={styles.formGroup}>
          <label>Number of Questions</label>
          <div className={styles.difficultySelect}>
            {QUESTION_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                className={`${styles.difficultyBtn} ${generateCount === count ? styles.difficultyActive : ''}`}
                onClick={() => setGenerateCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
          <span className={styles.hint}>
            Questions will be distributed evenly across all {certDomains.length}{' '}
            {selectedCert?.shortName || ''} domains
          </span>
        </div>

        <div className={styles.formGroup}>
          <label>Difficulty Level</label>
          <div className={styles.difficultySelect}>
            {DIFFICULTY_OPTIONS.map((diff) => (
              <button
                key={diff}
                className={`${styles.difficultyBtn} ${generateDifficulty === diff ? styles.difficultyActive : ''}`}
                onClick={() => setGenerateDifficulty(diff)}
              >
                {DIFFICULTY_LABELS[diff]}
              </button>
            ))}
          </div>
          <span className={styles.hint}>
            "Mixed" generates a balanced distribution of easy, medium, and hard questions
          </span>
        </div>

        {/* Case Study Selection (PCA only) */}
        {isPCA && caseStudies.length > 0 && (
          <div className={styles.formGroup}>
            <label>Case Study (Optional)</label>
            <select
              className={styles.modelSelect}
              value={selectedCaseStudyId ?? ''}
              onChange={(e) =>
                setSelectedCaseStudyId(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">No case study (general questions)</option>
              {caseStudies.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.name}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Select a case study to generate scenario-based questions referencing that company
            </span>
          </div>
        )}

        <div className={styles.generateInfo}>
          <span className={styles.infoLabel}>Model:</span>
          <span className={styles.infoValue}>
            {MODEL_DISPLAY_NAMES[provider === 'anthropic' ? anthropicModel : openaiModel]}
          </span>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleGenerateQuestions}
          disabled={generation.isGenerating}
        >
          {generation.isGenerating ? 'Generating...' : `Generate ${generateCount} Questions`}
        </button>

        {/* Progress indicator */}
        {generation.isGenerating && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(generation.domainsCompleted / generation.domainsTotal) * 100}%`,
                }}
              />
            </div>
            <span className={styles.progressText}>
              Domain {generation.domainsCompleted}/{generation.domainsTotal}
              {generation.questionsGenerated > 0 && ` • ${generation.questionsGenerated} questions`}
            </span>
          </div>
        )}

        {/* Success message */}
        {generation.lastResult && !generation.isGenerating && (
          <div className={`${styles.status} ${styles.statusSuccess}`}>
            Successfully generated {generation.lastResult.generated} questions!
            <button
              className={styles.dismissBtn}
              onClick={clearGenerationStatus}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error message */}
        {generation.error && !generation.isGenerating && (
          <div className={`${styles.status} ${styles.statusError}`}>
            Error: {generation.error}
            <button
              className={styles.dismissBtn}
              onClick={clearGenerationStatus}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
      </section>

      {/* Exam Preferences */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>Exam Preferences</h2>
        <p className={styles.sectionDescription}>Configure your exam-taking experience.</p>

        <div className={styles.formGroup}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showDifficultyDuringExam}
              onChange={(e) => setShowDifficultyDuringExam(e.target.checked)}
              className={styles.toggleInput}
            />
            <span className={styles.toggleText}>Show question difficulty during exams</span>
          </label>
          <span className={styles.hint}>
            Display easy/medium/hard badge next to each question while taking an exam
          </span>
        </div>
      </section>

      {/* Offline Mode */}
      <section className={`card ${styles.section}`}>
        <OfflineSettings />
      </section>

      {/* Data Management */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>Data Management</h2>
        <p className={styles.sectionDescription}>
          Export your progress data for backup or import previously saved data.
        </p>

        <div className={styles.buttonGroup}>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              const data = await progressApi.exportData();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `ace-prep-export-${new Date().toISOString().split('T')[0]}.json`;
              a.click();
            }}
          >
            Export Data
          </button>
          <button className="btn btn-secondary" disabled>
            Import Data (Coming Soon)
          </button>
        </div>
      </section>

      {/* About */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>About</h2>
        <div className={styles.about}>
          <p>
            <strong>Cert Trainer</strong> - Cloud Certification Preparation
          </p>
          <p className={styles.version}>Version 1.0.0</p>
        </div>
      </section>
    </div>
  );
}
