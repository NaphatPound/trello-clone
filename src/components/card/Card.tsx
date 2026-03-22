import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageSquare, Paperclip, CheckSquare, Clock, AlignLeft, Pencil, Bot, Loader2, CircleCheck, CircleX } from 'lucide-react';
import { Card as CardType, Board } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { formatDueDate, getDueDateStatus, getChecklistProgress } from '../../utils/helpers';
import Avatar from '../common/Avatar';
import './card.css';

interface CardProps {
  card: CardType;
  board: Board;
  isDragging?: boolean;
}

const Card: React.FC<CardProps> = ({ card, board, isDragging = false }) => {
  const { openCard } = useUIStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId: card.listId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.4 : 1,
  };

  const cardLabels = board.labels.filter(l => card.labelIds.includes(l.id));
  const cardMembers = board.members.filter(m => card.memberIds.includes(m.id));
  const allChecklistItems = card.checklists.flatMap(c => c.items);
  const checklistProgress = allChecklistItems.length > 0 ? getChecklistProgress(allChecklistItems) : null;
  const dueDateStatus = card.dueDate ? getDueDateStatus(card.dueDate, card.isDueDateComplete) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card ${isDragging ? 'card--dragging' : ''}`}
      onClick={() => !isSortDragging && openCard(card.id)}
      {...attributes}
      {...listeners}
    >
      {card.coverColor && (
        <div className="card-cover" style={{ backgroundColor: card.coverColor }} />
      )}
      {cardLabels.length > 0 && (
        <div className="card-labels">
          {cardLabels.map(label => (
            <span key={label.id} className="card-label" style={{ backgroundColor: label.color }} title={label.name}>
              {label.name}
            </span>
          ))}
        </div>
      )}
      <span className="card-title">{card.title}</span>
      <div className="card-badges">
        {card.description && (
          <span className="card-badge" title="Has description">
            <AlignLeft size={14} />
          </span>
        )}
        {card.comments.length > 0 && (
          <span className="card-badge" title={`${card.comments.length} comments`}>
            <MessageSquare size={14} />
            <span>{card.comments.length}</span>
          </span>
        )}
        {card.attachments.length > 0 && (
          <span className="card-badge" title={`${card.attachments.length} attachments`}>
            <Paperclip size={14} />
            <span>{card.attachments.length}</span>
          </span>
        )}
        {checklistProgress && (
          <span className={`card-badge card-badge--checklist ${checklistProgress.percent === 100 ? 'card-badge--complete' : ''}`}>
            <CheckSquare size={14} />
            <span>{checklistProgress.checked}/{checklistProgress.total}</span>
          </span>
        )}
        {card.dueDate && (
          <span className={`card-badge card-badge--due card-badge--due-${dueDateStatus}`} title={card.dueDate}>
            <Clock size={14} />
            <span>{formatDueDate(card.dueDate)}</span>
          </span>
        )}
        {card.claudeTaskStatus === 'running' || card.claudeTaskStatus === 'queued' ? (
          <span className="card-badge card-badge--claude card-badge--claude-running" title="Claude Code task running">
            <Loader2 size={12} className="card-claude-spin" />
            <span>Running</span>
          </span>
        ) : card.claudeTaskStatus === 'completed' ? (
          <span className="card-badge card-badge--claude card-badge--claude-done" title="Claude Code task completed">
            <CircleCheck size={12} />
            <span>Done</span>
          </span>
        ) : card.claudeTaskStatus === 'failed' || card.claudeTaskStatus === 'stopped' ? (
          <span className="card-badge card-badge--claude card-badge--claude-failed" title={`Claude Code task ${card.claudeTaskStatus}`}>
            <CircleX size={12} />
            <span>{card.claudeTaskStatus === 'failed' ? 'Failed' : 'Stopped'}</span>
          </span>
        ) : card.claudeTaskId ? (
          <span className="card-badge card-badge--claude" title="Claude Code task">
            <Bot size={12} />
          </span>
        ) : null}
        {cardMembers.length > 0 && (
          <div className="card-members">
            {cardMembers.map(m => (
              <Avatar key={m.id} name={m.name} color={m.color} size="sm" isAI={m.id === 'member-ai'} />
            ))}
          </div>
        )}
      </div>
      <button className="card-edit-btn" onClick={e => { e.stopPropagation(); openCard(card.id); }}>
        <Pencil size={14} />
      </button>
    </div>
  );
};

export default Card;
