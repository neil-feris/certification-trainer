import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, questionApi } from '../../api/client';
import styles from './Settings.module.css';

export function Settings() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('anthropic');
  const [testStatus, setTestStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [generateStatus, setGenerateStatus] = useState<{ loading?: boolean; message?: string } | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const { data: questions } = useQuery({
    queryKey: ['questions'],
    queryFn: () => questionApi.list(),
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

  const handleGenerateQuestions = async () => {
    setGenerateStatus({ loading: true, message: 'Generating questions...' });

    try {
      // Generate questions for each domain
      const domains = [1, 2, 3, 4, 5]; // Domain IDs
      let totalGenerated = 0;

      for (const domainId of domains) {
        const result = await questionApi.generate({
          domainId,
          difficulty: 'medium',
          count: 10,
        });
        totalGenerated += result.generated;
      }

      setGenerateStatus({
        loading: false,
        message: `Successfully generated ${totalGenerated} questions!`,
      });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    } catch (err: any) {
      setGenerateStatus({
        loading: false,
        message: `Error: ${err.message}`,
      });
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
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Enter your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`}
          />
          <span className={styles.hint}>
            {settings?.[provider === 'anthropic' ? 'anthropicApiKey' : 'openaiApiKey']
              ? `Current key: ${settings[provider === 'anthropic' ? 'anthropicApiKey' : 'openaiApiKey']}`
              : 'No API key configured'}
          </span>
        </div>

        <button className="btn btn-primary" onClick={handleTestConnection}>
          Test & Save API Key
        </button>

        {testStatus && (
          <div className={`${styles.status} ${testStatus.success ? styles.statusSuccess : styles.statusError}`}>
            {testStatus.message}
          </div>
        )}
      </section>

      {/* Question Generation */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>Question Bank</h2>
        <p className={styles.sectionDescription}>
          Generate practice questions using AI. You currently have <strong>{questions?.length || 0}</strong> questions.
        </p>

        <button
          className="btn btn-primary"
          onClick={handleGenerateQuestions}
          disabled={generateStatus?.loading}
        >
          {generateStatus?.loading ? 'Generating...' : 'Generate 50 Questions'}
        </button>

        {generateStatus?.message && (
          <div className={`${styles.status} ${generateStatus.loading ? '' : styles.statusSuccess}`}>
            {generateStatus.message}
          </div>
        )}
      </section>

      {/* Data Management */}
      <section className={`card ${styles.section}`}>
        <h2 className={styles.sectionTitle}>Data Management</h2>
        <p className={styles.sectionDescription}>
          Export your progress data for backup or import previously saved data.
        </p>

        <div className={styles.buttonGroup}>
          <button className="btn btn-secondary" onClick={async () => {
            const data = await settingsApi.get();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ace-prep-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
          }}>
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
          <p><strong>ACE Prep</strong> - Google Cloud Associate Cloud Engineer Certification Preparation</p>
          <p className={styles.version}>Version 1.0.0</p>
        </div>
      </section>
    </div>
  );
}
