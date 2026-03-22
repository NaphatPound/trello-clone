import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Board } from '../../types';
import { useBoardStore } from '../../stores/boardStore';
import { analyzeRequirements } from '../../services/ai';
import './ai-assistant.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdCards?: string[];
  isLoading?: boolean;
  isError?: boolean;
}

interface AIAssistantProps {
  board: Board;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ board, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi! I'm your AI assistant for the "${board.title}" board. Describe your project requirements and I'll automatically break them down into tasks and create cards in your To Do list.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lists = useBoardStore(s => s.lists);
  const createCard = useBoardStore(s => s.createCard);
  const updateCard = useBoardStore(s => s.updateCard);
  const addChecklist = useBoardStore(s => s.addChecklist);
  const addChecklistItem = useBoardStore(s => s.addChecklistItem);
  const createLabel = useBoardStore(s => s.createLabel);

  const todoList = board.listIds
    .map(id => lists[id])
    .filter(Boolean)
    .find(l => {
      const t = l.title.toLowerCase();
      return t.includes('to do') || t === 'todo' || t === 'backlog';
    }) ?? (board.listIds.length > 0 ? lists[board.listIds[0]] : null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleQuickAdd = () => {
    if (!input.trim() || isLoading) return;
    if (!todoList) {
      setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: 'No list found. Please create a list first.', isError: true }]);
      return;
    }
    const title = input.trim();
    createCard(todoList.id, board.id, title);
    setInput('');
    setMessages(prev => [...prev,
      { id: uuidv4(), role: 'user', content: title },
      { id: uuidv4(), role: 'assistant', content: `Quick-added 1 card in "${todoList.title}":`, createdCards: [title] },
    ]);
  };

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: uuidv4(), role: 'user', content: input.trim() };
    const loadingId = uuidv4();
    const loadingMessage: Message = { id: loadingId, role: 'assistant', content: '', isLoading: true };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      if (!todoList) {
        throw new Error('No list found to add cards to. Please create a list first.');
      }

      const existingLabels = board.labels.map(l => ({ name: l.name, color: l.color }));

      // Show streaming tokens in the loading bubble
      const onChunk = (partial: string) => {
        setMessages(prev => prev.map(m =>
          m.id === loadingId ? { ...m, content: partial } : m
        ));
      };

      const tasks = await analyzeRequirements(userMessage.content, existingLabels, onChunk);

      const createdTitles: string[] = [];

      for (const task of tasks) {
        const card = createCard(todoList.id, board.id, task.title);

        if (task.description) {
          updateCard(card.id, { description: task.description });
        }

        for (const labelSpec of task.labels ?? []) {
          const { boards } = useBoardStore.getState();
          const freshBoard = boards[board.id];
          const existing = freshBoard?.labels.find(l => l.name === labelSpec.name);
          const labelId = existing
            ? existing.id
            : createLabel(board.id, labelSpec.name, labelSpec.color).id;
          const freshCard = useBoardStore.getState().cards[card.id];
          if (freshCard && !freshCard.labelIds.includes(labelId)) {
            updateCard(card.id, { labelIds: [...freshCard.labelIds, labelId] });
          }
        }

        if (task.checklist && task.checklist.length > 0) {
          addChecklist(card.id, 'Tasks');
          const freshCard = useBoardStore.getState().cards[card.id];
          const checklist = freshCard?.checklists[freshCard.checklists.length - 1];
          if (checklist) {
            for (const item of task.checklist) {
              addChecklistItem(card.id, checklist.id, item);
            }
          }
        }

        createdTitles.push(task.title);
      }

      const response: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `I've created ${tasks.length} task${tasks.length !== 1 ? 's' : ''} in "${todoList.title}":`,
        createdCards: createdTitles,
      };
      setMessages(prev => prev.filter(m => m.id !== loadingId).concat(response));
    } catch (e) {
      const raw = String(e);
      const friendly = raw.includes('401') || raw.includes('403')
        ? 'Authentication failed. Check VITE_OLLAMA_API_KEY in your .env file.'
        : raw.includes('500')
        ? 'Ollama server error (500). The model may be unavailable — try again in a moment.'
        : raw.includes('fetch') || raw.includes('Failed to fetch')
        ? 'Could not reach the Ollama server. Check your connection and VITE_OLLAMA_BASE_URL.'
        : `Sorry, I ran into an error: ${raw}`;
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: friendly,
        isError: true,
      };
      setMessages(prev => prev.filter(m => m.id !== loadingId).concat(errorMsg));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="ai-assistant">
      <div className="ai-assistant-header">
        <div className="ai-assistant-title">
          <Bot size={18} />
          <span>AI Assistant</span>
        </div>
        <button className="ai-assistant-close" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="ai-assistant-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`ai-msg ai-msg--${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="ai-msg-avatar">
                <Bot size={13} />
              </div>
            )}
            <div className={`ai-msg-bubble${msg.isError ? ' ai-msg-bubble--error' : ''}`}>
              {msg.isLoading ? (
                <div className="ai-msg-loading">
                  <Loader2 size={14} className="ai-spin" />
                  {msg.content
                    ? <span className="ai-msg-stream">{msg.content}</span>
                    : <span>Thinking…</span>
                  }
                </div>
              ) : (
                <>
                  {msg.isError && <AlertCircle size={14} style={{ flexShrink: 0 }} />}
                  <p>{msg.content}</p>
                  {msg.createdCards && (
                    <ul className="ai-created-list">
                      {msg.createdCards.map((title, i) => (
                        <li key={i}>
                          <CheckCircle2 size={12} />
                          <span>{title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-assistant-footer">
        <textarea
          ref={textareaRef}
          className="ai-assistant-input"
          placeholder="Describe requirements for AI analysis, or quick-add a single task directly…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={isLoading}
        />
        <div className="ai-assistant-actions">
          <button
            className="ai-quick-add-btn"
            onClick={handleQuickAdd}
            disabled={!input.trim() || isLoading}
            title="Quick Add — create card directly without AI"
          >
            + Quick Add
          </button>
          <button
            className="ai-assistant-send"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            title="Analyze with AI (Enter)"
          >
            {isLoading ? <Loader2 size={16} className="ai-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
