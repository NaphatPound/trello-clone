import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCorners, DragEndEvent, DragOverEvent, DragStartEvent, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useBoardStore } from '../../stores/boardStore';
import { useUIStore } from '../../stores/uiStore';
import { Card as CardType } from '../../types';
import { createRunnerTask } from '../../services/claudeRunner';
import { useTaskPoller } from '../../hooks/useTaskPoller';
import BoardHeader from './BoardHeader';
import BoardMenu from './BoardMenu';
import List from '../list/List';
import AddList from '../list/AddList';
import CardDetail from '../card/CardDetail';
import Card from '../card/Card';
import AIAssistant from '../assistant/AIAssistant';
import './board.css';

function buildPromptFromCard(card: CardType): string {
  const lines: string[] = [`# Task: ${card.title}`];
  if (card.description) {
    lines.push('', '## Description', card.description);
  }
  if (card.checklists.length > 0) {
    lines.push('', '## Subtasks to complete');
    for (const checklist of card.checklists) {
      if (card.checklists.length > 1) lines.push(`\n### ${checklist.title}`);
      for (const item of checklist.items) {
        lines.push(`- ${item.isChecked ? '[x]' : '[ ]'} ${item.text}`);
      }
    }
  }
  return lines.join('\n');
}

const WORKING_DIR = import.meta.env.VITE_CLAUDE_RUNNER_WORKING_DIR || '';

const BoardView: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const board = useBoardStore(s => boardId ? s.boards[boardId] : undefined);
  const lists = useBoardStore(s => s.lists);
  const cards = useBoardStore(s => s.cards);
  const moveList = useBoardStore(s => s.moveList);
  const moveCard = useBoardStore(s => s.moveCard);
  const updateCard = useBoardStore(s => s.updateCard);
  const addComment = useBoardStore(s => s.addComment);
  const { activeCardId, closeCard, activeBoardMenuOpen } = useUIStore();
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<'list' | 'card' | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);

  // Start polling for Claude Code Runner tasks
  useTaskPoller(boardId ?? '');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const triggerClaudeTask = useCallback(async (card: CardType) => {
    if (card.claudeTaskId) return; // Already has a task running

    const prompt = buildPromptFromCard(card);
    try {
      updateCard(card.id, { claudeTaskStatus: 'queued' });
      const task = await createRunnerTask(prompt, WORKING_DIR || undefined);
      updateCard(card.id, { claudeTaskId: task.id, claudeTaskStatus: task.status });
      addComment(card.id, `🤖 Claude Code task started (ID: ${task.id}). Monitoring for completion…`);
    } catch (e) {
      console.error('Failed to create Claude Code Runner task:', e);
      updateCard(card.id, { claudeTaskStatus: undefined });
      addComment(card.id, `❌ Failed to start Claude Code task: ${String(e)}`);
    }
  }, [updateCard, addComment]);

  if (!board || !boardId) {
    return (
      <div className="board-not-found">
        <h2>Board not found</h2>
        <button onClick={() => navigate('/')}>Go to home</button>
      </div>
    );
  }

  const boardLists = board.listIds.map(id => lists[id]).filter(Boolean);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const type = active.data.current?.type;
    setDragActiveId(active.id as string);
    setDragType(type);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'card') {
      const activeListId = active.data.current?.listId;
      const overListId = overType === 'card' ? over.data.current?.listId : over.id as string;

      if (activeListId && overListId && activeListId !== overListId) {
        const overList = lists[overListId];
        if (overList) {
          const overIndex = overType === 'card'
            ? overList.cardIds.indexOf(over.id as string)
            : overList.cardIds.length;
          moveCard(active.id as string, activeListId, overListId, overIndex >= 0 ? overIndex : overList.cardIds.length);
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragActiveId(null);
    setDragType(null);

    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;

    if (activeType === 'list') {
      const oldIndex = board.listIds.indexOf(active.id as string);
      const newIndex = board.listIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        moveList(boardId, oldIndex, newIndex);
      }
    } else if (activeType === 'card') {
      const activeListId = active.data.current?.listId;
      const overListId = over.data.current?.type === 'card'
        ? over.data.current?.listId
        : over.id as string;

      if (activeListId && overListId) {
        const targetList = lists[overListId];
        if (targetList) {
          const overIndex = over.data.current?.type === 'card'
            ? targetList.cardIds.indexOf(over.id as string)
            : targetList.cardIds.length;

          if (activeListId === overListId) {
            const currentIndex = targetList.cardIds.indexOf(active.id as string);
            if (currentIndex !== overIndex) {
              moveCard(active.id as string, activeListId, overListId, overIndex >= 0 ? overIndex : targetList.cardIds.length);
            }
          }
        }
      }

      // After drag completes, check if card landed in "In Progress" list
      // Use getState() to get the freshest card data (handleDragOver may have already committed the move)
      const freshCard = useBoardStore.getState().cards[active.id as string];
      if (freshCard && !freshCard.claudeTaskId) {
        const freshList = useBoardStore.getState().lists[freshCard.listId];
        if (freshList?.title.toLowerCase().includes('in progress')) {
          void triggerClaudeTask(freshCard);
        }
      }
    }
  };

  const draggedCard = dragActiveId && dragType === 'card' ? cards[dragActiveId] : null;

  return (
    <div className="board-view" style={{ background: board.background.value }}>
      <BoardHeader board={board} onOpenAssistant={() => setShowAssistant(true)} />
      <div className="board-canvas">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={board.listIds} strategy={horizontalListSortingStrategy}>
            <div className="board-lists">
              {boardLists.map(list => (
                <List key={list.id} list={list} board={board} />
              ))}
              <AddList boardId={boardId} />
            </div>
          </SortableContext>
          <DragOverlay>
            {draggedCard && (
              <div style={{ width: 252, opacity: 0.9 }}>
                <Card card={draggedCard} board={board} isDragging />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {activeBoardMenuOpen && <BoardMenu board={board} />}
      {activeCardId && cards[activeCardId] && (
        <CardDetail card={cards[activeCardId]} board={board} onClose={closeCard} />
      )}
      {showAssistant && (
        <AIAssistant board={board} onClose={() => setShowAssistant(false)} />
      )}
    </div>
  );
};

export default BoardView;
