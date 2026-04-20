interface StepEvent {
  type: 'thought' | 'tool_call' | 'observation' | 'final_answer' | 'error';
  step: number;
  content: string;
  tool?: string;
  args?: Record<string, string>;
}

interface AgentStep {
  step: number;
  thought: string;
  toolCall?: { tool: string; args: Record<string, string>; raw: string };
  observation?: string;
}

import { useState, useRef, useCallback } from 'react';

const DEFAULT_MESSAGE = '你好，请帮我查询一下今天北京的天气，然后根据天气推荐一个合适的旅游景点。';

function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [finalAnswer, setFinalAnswer] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const stepsMapRef = useRef<Map<number, AgentStep>>(new Map());
  const loadingRef = useRef(false);

  const handleEvent = useCallback((event: StepEvent) => {
    const steps = stepsMapRef.current;

    switch (event.type) {
      case 'thought': {
        const existing = steps.get(event.step) || { step: event.step, thought: '' };
        existing.thought = event.content;
        steps.set(event.step, existing);
        break;
      }
      case 'tool_call': {
        const existing = steps.get(event.step) || { step: event.step, thought: '' };
        existing.toolCall = { tool: event.tool || '', args: event.args || {}, raw: event.content };
        steps.set(event.step, existing);
        break;
      }
      case 'observation': {
        const existing = steps.get(event.step) || { step: event.step, thought: '' };
        existing.observation = event.content;
        steps.set(event.step, existing);
        break;
      }
      case 'final_answer': {
        setFinalAnswer(event.content);
        return;
      }
      case 'error': {
        setError(event.content);
        return;
      }
    }

    setAgentSteps(
      Array.from(steps.values()).sort((a, b) => a.step - b.step)
    );
  }, []);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');
    setFinalAnswer('');
    setAgentSteps([]);
    stepsMapRef.current.clear();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${errBody ? ': ' + errBody : ''}`);
      }

      if (!response.body) {
        throw new Error('浏览器不支持流式读取');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              dataLine = line.slice(5).trim();
            }
          }
          if (!dataLine) continue;

          try {
            const event: StepEvent = JSON.parse(dataLine);
            handleEvent(event);
          } catch {
            // skip unparseable events
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(`请求失败: ${(e as Error).message}`);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      abortRef.current = null;
    }
  }, [handleEvent]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput('');
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toolNameMap: Record<string, string> = {
    get_weather: '查询天气',
    search_attraction: '搜索景点',
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🌍 智能旅行助手</h1>
        <p className="subtitle">基于 ReAct 模式的 AI Agent — 思考 → 行动 → 观察 → 回答</p>
      </header>

      <div className="chat-container">
        {agentSteps.length > 0 && (
          <div className="steps-panel">
            <h2 className="panel-title">🤖 Agent 推理过程</h2>
            {agentSteps.map((s) => (
              <div key={s.step} className="step-card">
                <div className="step-header">第 {s.step} 步</div>

                {s.thought && (
                  <div className="step-section thought">
                    <span className="label">💭 Thought（思考）</span>
                    <p>{s.thought}</p>
                  </div>
                )}

                {s.toolCall && (
                  <div className="step-section action">
                    <span className="label">🔧 Action（调用工具）</span>
                    <div className="tool-badge">
                      {toolNameMap[s.toolCall.tool] || s.toolCall.tool}
                    </div>
                    <div className="tool-args">
                      {Object.entries(s.toolCall.args).map(([k, v]) => (
                        <span key={k} className="arg-chip">
                          {k}="{v}"
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {s.observation && (
                  <div className="step-section observation">
                    <span className="label">👁️ Observation（观察结果）</span>
                    <pre className="obs-content">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(s.observation), null, 2);
                        } catch {
                          return s.observation;
                        }
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="loading-indicator">
                <div className="spinner" />
                <span>Agent 正在思考中...</span>
              </div>
            )}
          </div>
        )}

        {finalAnswer && (
          <div className="final-answer">
            <h2>✅ 最终建议</h2>
            <div className="answer-content">
              {finalAnswer.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <strong>错误：</strong> {error}
          </div>
        )}
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={DEFAULT_MESSAGE}
          disabled={loading}
          rows={2}
        />
        <div className="input-actions">
          <button
            className="btn-secondary"
            onClick={() => setInput(DEFAULT_MESSAGE)}
            disabled={loading}
          >
            使用示例
          </button>
          {loading ? (
            <button className="btn-stop" onClick={handleStop}>
              停止
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
