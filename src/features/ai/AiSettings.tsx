import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveAiConfig } from '@/ai/transport';
import { useAiConfig } from './useAiConfig';

const DEFAULTS = { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' };

export function AiSettings() {
  const config = useAiConfig();
  const saved = config.status === 'ready' ? config.config : null;
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saved) return;
    setBaseURL(saved.baseURL || DEFAULTS.baseURL);
    setModel(saved.model || DEFAULTS.model);
  }, [saved?.baseURL, saved?.model]);
  const locked = !saved || saved.managed || saving;
  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveAiConfig({ baseURL, model, ...(apiKey.trim() ? { apiKey } : {}) });
      setApiKey('');
      setStatus({ error: false, text: '已保存' });
    } catch (error) {
      setStatus({ error: true, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="preferences-section" aria-labelledby="ai-service-heading">
      <h3 id="ai-service-heading">AI 问答</h3>
      <p>
        {config.status === 'error'
          ? config.message
          : saved?.managed
            ? '模型服务由环境变量配置。'
            : '支持 OpenAI 兼容接口。提问时，选中的文字和所在章节会发送到这里配置的服务。'}
      </p>
      <form
        className="preferences-ai"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor="ai-base-url">服务地址</label>
        <Input
          id="ai-base-url"
          value={baseURL}
          disabled={locked}
          placeholder={DEFAULTS.baseURL}
          onChange={(event) => setBaseURL(event.target.value)}
        />
        <label htmlFor="ai-model">模型</label>
        <Input
          id="ai-model"
          value={model}
          disabled={locked}
          placeholder={DEFAULTS.model}
          onChange={(event) => setModel(event.target.value)}
        />
        <label htmlFor="ai-api-key">API Key</label>
        <Input
          id="ai-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          disabled={locked}
          placeholder={saved?.hasKey ? '已保存，留空则不修改' : 'sk-…'}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <div className="preferences-ai-actions">
          {status && (
            <span role={status.error ? 'alert' : 'status'} data-error={status.error}>
              {status.text}
            </span>
          )}
          <Button type="submit" size="sm" disabled={locked}>
            保存
          </Button>
        </div>
      </form>
    </section>
  );
}
