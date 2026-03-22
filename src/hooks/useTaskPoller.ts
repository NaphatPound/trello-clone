import { useEffect, useRef } from 'react';
import { useBoardStore } from '../stores/boardStore';
import { getRunnerTaskStatus } from '../services/claudeRunner';

const POLL_INTERVAL = 5000;

export function useTaskPoller(boardId: string) {
  // Keep refs to latest state to avoid re-triggering the interval effect
  const cardsRef = useRef(useBoardStore.getState().cards);
  const listsRef = useRef(useBoardStore.getState().lists);
  const boardsRef = useRef(useBoardStore.getState().boards);

  useEffect(() => {
    return useBoardStore.subscribe(state => {
      cardsRef.current = state.cards;
      listsRef.current = state.lists;
      boardsRef.current = state.boards;
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      if (!mounted) return;
      const board = boardsRef.current[boardId];
      if (!board) return;

      const runningCards = Object.values(cardsRef.current).filter(
        card =>
          card.boardId === boardId &&
          card.claudeTaskId &&
          (card.claudeTaskStatus === 'running' || card.claudeTaskStatus === 'queued')
      );

      for (const card of runningCards) {
        if (!mounted) break;
        try {
          const status = await getRunnerTaskStatus(card.claudeTaskId!);
          if (!mounted) break;

          if (status.done) {
            const { updateCard, moveCard, addComment, cards, lists } = useBoardStore.getState();
            const freshCard = cards[card.id];
            if (!freshCard) continue;

            updateCard(card.id, { claudeTaskStatus: status.status as 'completed' | 'failed' | 'stopped' });

            if (status.status === 'completed') {
              const doneList = board.listIds
                .map(id => lists[id])
                .filter(Boolean)
                .find(l => l.title.toLowerCase().includes('done'));

              if (doneList && freshCard.listId !== doneList.id) {
                const freshDoneList = useBoardStore.getState().lists[doneList.id];
                if (freshDoneList) {
                  moveCard(card.id, freshCard.listId, doneList.id, freshDoneList.cardIds.length);
                  addComment(card.id, `✅ Claude Code task completed. Card auto-moved to "${doneList.title}".`);
                }
              } else {
                addComment(card.id, `✅ Claude Code task completed.`);
              }
            } else if (status.status === 'failed') {
              addComment(card.id, `❌ Claude Code task failed (exit code: ${status.exitCode ?? 'unknown'}).`);
            } else if (status.status === 'stopped') {
              addComment(card.id, `⏹️ Claude Code task was stopped.`);
            }
          }
        } catch (e) {
          console.error(`Error polling task ${card.claudeTaskId}:`, e);
        }
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    poll();

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [boardId]);
}
