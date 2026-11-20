import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Crosshair,
  HelpCircle,
  Info,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { InteractionItem, InteractionType, LearnerAnswer } from '../types/course';
import {
  buildDragWordBank,
  evaluateInteractionAnswer,
  formatTime,
  getInteractionTypeLabel,
  parseFillBlankParts,
} from '../utils/storage';

interface InteractionOverlayProps {
  interaction: InteractionItem;
  existingAnswer?: LearnerAnswer;
  isExpanded: boolean;
  onExpand: () => void;
  onCloseAndResume: () => void;
  onSubmitAnswer: (answer: LearnerAnswer) => void;
  onJumpToTimestamp: (seconds: number) => void;
}

function shuffleDeterministic(items: string[], seedStr: string): string[] {
  if (items.length <= 1) return [...items];
  const arr = [...items];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  // Ensure shuffled list isn't accidentally identical to canonical order when >= 2 items
  if (arr.every((v, idx) => v === items[idx]) && arr.length >= 2) {
    const tmp = arr[0];
    arr[0] = arr[1];
    arr[1] = tmp;
  }
  return arr;
}

export const InteractionOverlay: React.FC<InteractionOverlayProps> = ({
  interaction,
  existingAnswer,
  isExpanded,
  onExpand,
  onCloseAndResume,
  onSubmitAnswer,
  onJumpToTimestamp,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(existingAnswer?.selectedOptionIds || []);
  const [blankInputs, setBlankInputs] = useState<string[]>(existingAnswer?.blankInputs || []);
  const [orderedItems, setOrderedItems] = useState<string[]>(() => {
    if (existingAnswer?.orderedItems?.length) return existingAnswer.orderedItems;
    return shuffleDeterministic(interaction.orderingItems || [], interaction.id);
  });
  const [clickedPoint, setClickedPoint] = useState<{ x: number; y: number } | undefined>(
    existingAnswer?.clickedPoint
  );
  const [localResult, setLocalResult] = useState<LearnerAnswer | undefined>(existingAnswer);
  const [attemptsUsed, setAttemptsUsed] = useState<number>(existingAnswer?.attemptsUsed || 0);

  useEffect(() => {
    setSelectedIds(existingAnswer?.selectedOptionIds || []);
    setBlankInputs(existingAnswer?.blankInputs || []);
    setOrderedItems(
      existingAnswer?.orderedItems?.length
        ? existingAnswer.orderedItems
        : shuffleDeterministic(interaction.orderingItems || [], interaction.id)
    );
    setClickedPoint(existingAnswer?.clickedPoint);
    setLocalResult(existingAnswer);
    setAttemptsUsed(existingAnswer?.attemptsUsed || 0);
  }, [interaction.id, existingAnswer]);

  const maxAttempts =
    interaction.maxAttempts && interaction.maxAttempts > 0 ? interaction.maxAttempts : null;
  const canRetry = !maxAttempts || attemptsUsed < maxAttempts;

  const blankParts = useMemo(
    () => parseFillBlankParts(interaction.blankSentence || ''),
    [interaction.blankSentence]
  );

  const wordBank = useMemo(
    () => (interaction.type === InteractionType.DRAG_TEXT ? buildDragWordBank(interaction) : []),
    [interaction]
  );

  const blankCount = useMemo(
    () => blankParts.filter((p) => p.type === 'blank').length,
    [blankParts]
  );

  const [assignedChipIndices, setAssignedChipIndices] = useState<(number | null)[]>([]);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);

  useEffect(() => {
    if (interaction.type !== InteractionType.DRAG_TEXT) {
      setAssignedChipIndices([]);
      setActiveSlotIdx(null);
      return;
    }
    const used = new Set<number>();
    const initial = Array.from({ length: blankCount }, (_, bIdx) => {
      const val = existingAnswer?.blankInputs?.[bIdx];
      if (!val) return null;
      const foundIdx = wordBank.findIndex((w, i) => w === val && !used.has(i));
      if (foundIdx >= 0) {
        used.add(foundIdx);
        return foundIdx;
      }
      return null;
    });
    setAssignedChipIndices(initial);
    setActiveSlotIdx(null);
  }, [interaction.id, interaction.type, existingAnswer, blankCount, wordBank]);

  // Compact Pin Button mode before opening
  if (!isExpanded) {
    const isDone = Boolean(localResult);
    return (
      <button
        type="button"
        onClick={onExpand}
        style={{
          left: `${interaction.position.x}%`,
          top: `${interaction.position.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
        className={`absolute z-30 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border text-xs font-semibold transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 cursor-pointer ${
          isDone
            ? 'bg-emerald-600 border-emerald-400 text-white'
            : 'bg-sky-600 border-sky-300 text-white'
        }`}
      >
        {interaction.type === InteractionType.INFO ? (
          <Info className="w-4 h-4 shrink-0" />
        ) : interaction.type === InteractionType.HOTSPOT ? (
          <Crosshair className="w-4 h-4 shrink-0" />
        ) : (
          <HelpCircle className="w-4 h-4 shrink-0" />
        )}
        <span className="whitespace-nowrap max-w-[180px] truncate">{interaction.title}</span>
      </button>
    );
  }

  // Special full-frame overlay for HOTSPOT mode so learner clicks directly on the video frame!
  if (interaction.type === InteractionType.HOTSPOT) {
    const handleFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (localResult) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const pt = { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
      setClickedPoint(pt);
      const nextAttempts = attemptsUsed + 1;
      setAttemptsUsed(nextAttempts);
      const res = {
        ...evaluateInteractionAnswer(interaction, { clickedPoint: pt }),
        attemptsUsed: nextAttempts,
      };
      setLocalResult(res);
      onSubmitAnswer(res);
    };

    const handleRetryHotspot = () => {
      setClickedPoint(undefined);
      setLocalResult(undefined);
    };

    return (
      <div className="absolute inset-0 z-30 flex flex-col justify-between overflow-hidden">
        {/* Top prompt bar */}
        <div className="relative z-20 m-2 sm:m-3 bg-slate-950/90 backdrop-blur-sm border border-white/15 rounded-xl px-3.5 py-2.5 flex items-start justify-between gap-3 shadow-xl shrink-0">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 text-xs text-sky-300 font-medium">
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>{getInteractionTypeLabel(interaction.type)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{interaction.points} điểm</span>
            </div>
            <p className="text-xs sm:text-sm font-semibold text-white leading-snug">{interaction.prompt}</p>
          </div>
          <button
            type="button"
            onClick={onCloseAndResume}
            aria-label="Đóng tương tác"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clickable video target canvas */}
        <div
          onClick={handleFrameClick}
          className={`relative flex-1 min-h-0 ${localResult ? 'cursor-default' : 'cursor-crosshair'}`}
        >
          {/* Reveal target box after submission */}
          {localResult && interaction.hotspot && (
            <div
              style={{
                left: `${interaction.hotspot.x}%`,
                top: `${interaction.hotspot.y}%`,
                width: `${interaction.hotspot.width}%`,
                height: `${interaction.hotspot.height}%`,
              }}
              className="absolute border-2 border-emerald-400 bg-emerald-500/20 rounded-md pointer-events-none"
            >
              <span className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-semibold whitespace-nowrap">
                Vùng mục tiêu chuẩn
              </span>
            </div>
          )}

          {/* Clicked point marker */}
          {clickedPoint && (
            <div
              style={{
                left: `${clickedPoint.x}%`,
                top: `${clickedPoint.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center pointer-events-none ${
                localResult?.isCorrect ? 'bg-emerald-500' : 'bg-rose-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white" />
            </div>
          )}
        </div>

        {/* Bottom feedback bar after click */}
        {localResult && (
          <div className="relative z-20 m-2 sm:m-3 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 sm:p-3.5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-h-[42%] overflow-y-auto shrink-0">
            <div className="flex items-start gap-3">
              {localResult.isCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {localResult.isCorrect
                    ? `Chính xác (+${localResult.earnedPoints} điểm)`
                    : 'Chưa đúng vị trí mục tiêu (0 điểm)'}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{interaction.explanation}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!localResult.isCorrect && canRetry && (
                <button
                  type="button"
                  onClick={handleRetryHotspot}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Thử lại{maxAttempts ? ` (${attemptsUsed}/${maxAttempts})` : ''}
                </button>
              )}
              {!localResult.isCorrect && !canRetry && maxAttempts && (
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  Đã hết lượt ({attemptsUsed}/{maxAttempts})
                </span>
              )}
              {!localResult.isCorrect && typeof interaction.branchOnWrong === 'number' && (
                <button
                  type="button"
                  onClick={() => onJumpToTimestamp(interaction.branchOnWrong!)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                >
                  Xem lại đoạn {formatTime(interaction.branchOnWrong)}
                </button>
              )}
              <button
                type="button"
                onClick={onCloseAndResume}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 cursor-pointer whitespace-nowrap"
              >
                Tiếp tục video
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleToggleOption = (optId: string) => {
    if (localResult) return;
    if (interaction.type === InteractionType.MULTI_SELECT) {
      setSelectedIds((prev) =>
        prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
      );
    } else {
      setSelectedIds([optId]);
    }
  };

  const handleMoveOrder = (index: number, direction: -1 | 1) => {
    if (localResult) return;
    const target = index + direction;
    if (target < 0 || target >= orderedItems.length) return;
    setOrderedItems((prev) => {
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const handleAssignWordToSlot = (chipIdx: number, targetSlot: number, fromSlot?: number) => {
    if (localResult) return;
    setAssignedChipIndices((prev) => {
      const next = Array.from({ length: blankCount }, (_, i) => prev[i] ?? null);
      if (typeof fromSlot === 'number' && fromSlot >= 0 && fromSlot < blankCount) {
        const displaced = next[targetSlot];
        next[targetSlot] = chipIdx;
        next[fromSlot] = displaced ?? null;
      } else {
        // Remove chip from any previous slot if already placed
        const prevSlot = next.indexOf(chipIdx);
        if (prevSlot >= 0) next[prevSlot] = null;
        next[targetSlot] = chipIdx;
      }
      setBlankInputs(next.map((cIdx) => (cIdx !== null && cIdx !== undefined ? wordBank[cIdx] || '' : '')));
      return next;
    });
    setActiveSlotIdx(null);
  };

  const handleClickBankChip = (chipIdx: number) => {
    if (localResult) return;
    if (assignedChipIndices.includes(chipIdx)) return;
    const nextEmpty = assignedChipIndices.findIndex((c) => c === null || c === undefined);
    const targetSlot =
      activeSlotIdx !== null
        ? activeSlotIdx
        : nextEmpty >= 0
        ? nextEmpty
        : 0;
    if (targetSlot >= 0 && targetSlot < blankCount) {
      handleAssignWordToSlot(chipIdx, targetSlot);
    }
  };

  const handleClearSlot = (slotIdx: number) => {
    if (localResult) return;
    if (assignedChipIndices[slotIdx] !== null && assignedChipIndices[slotIdx] !== undefined) {
      setAssignedChipIndices((prev) => {
        const next = Array.from({ length: blankCount }, (_, i) => prev[i] ?? null);
        next[slotIdx] = null;
        setBlankInputs(next.map((cIdx) => (cIdx !== null && cIdx !== undefined ? wordBank[cIdx] || '' : '')));
        return next;
      });
      setActiveSlotIdx(slotIdx);
    } else {
      setActiveSlotIdx((prev) => (prev === slotIdx ? null : slotIdx));
    }
  };

  const handleCheckSubmit = () => {
    const nextAttempts = attemptsUsed + 1;
    setAttemptsUsed(nextAttempts);
    const effectiveBlanks =
      interaction.type === InteractionType.DRAG_TEXT
        ? assignedChipIndices.map((cIdx) => (cIdx !== null && cIdx !== undefined ? wordBank[cIdx] || '' : ''))
        : blankInputs;
    const res = {
      ...evaluateInteractionAnswer(interaction, {
        selectedOptionIds: selectedIds,
        blankInputs: effectiveBlanks,
        orderedItems,
      }),
      attemptsUsed: nextAttempts,
    };
    setLocalResult(res);
    onSubmitAnswer(res);
  };

  const handleRetry = () => {
    setLocalResult(undefined);
  };

  const canSubmit = (() => {
    if (interaction.type === InteractionType.INFO) return true;
    if (
      interaction.type === InteractionType.MULTIPLE_CHOICE ||
      interaction.type === InteractionType.MULTI_SELECT ||
      interaction.type === InteractionType.TRUE_FALSE
    ) {
      return selectedIds.length > 0;
    }
    if (interaction.type === InteractionType.FILL_BLANK) {
      return blankCount > 0 && Array.from({ length: blankCount }).every((_, i) => (blankInputs[i] || '').trim().length > 0);
    }
    if (interaction.type === InteractionType.DRAG_TEXT) {
      return (
        blankCount > 0 &&
        Array.from({ length: blankCount }).every(
          (_, i) => assignedChipIndices[i] !== null && assignedChipIndices[i] !== undefined
        )
      );
    }
    if (interaction.type === InteractionType.ORDERING) {
      return orderedItems.length > 0;
    }
    return false;
  })();

  return (
    <div className="absolute inset-0 z-30 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
      <div className="w-full max-w-xl max-h-full bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Card Header */}
        <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
            <span className="font-semibold text-sky-700 whitespace-nowrap">
              {getInteractionTypeLabel(interaction.type)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums whitespace-nowrap">{formatTime(interaction.timestamp)}</span>
            {interaction.type !== InteractionType.INFO && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">{interaction.points} điểm</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onCloseAndResume}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Body */}
        <div className="p-4 sm:p-5 space-y-3 flex-1 min-h-0 overflow-y-auto">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">{interaction.title}</h3>
            {interaction.prompt && (
              <p className="text-xs sm:text-sm text-slate-700 mt-1 leading-relaxed">{interaction.prompt}</p>
            )}
          </div>

          {interaction.imageUrl && (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 max-h-36 sm:max-h-44">
              <img
                src={interaction.imageUrl}
                alt={interaction.title}
                referrerPolicy="no-referrer"
                className="w-full max-h-36 sm:max-h-44 object-contain"
              />
            </div>
          )}

          {interaction.type === InteractionType.INFO && (
            <div className="p-4 rounded-lg bg-sky-50 border border-sky-200 text-sm text-slate-800 leading-relaxed">
              {interaction.infoBody}
            </div>
          )}

          {(interaction.type === InteractionType.MULTIPLE_CHOICE ||
            interaction.type === InteractionType.MULTI_SELECT ||
            interaction.type === InteractionType.TRUE_FALSE) && (
            <div className="space-y-2">
              {(interaction.options || []).map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                let borderStyle = 'border-slate-200 hover:border-slate-300 bg-white';
                if (localResult) {
                  if (opt.isCorrect) {
                    borderStyle = 'border-emerald-500 bg-emerald-50';
                  } else if (isSelected && !opt.isCorrect) {
                    borderStyle = 'border-rose-400 bg-rose-50';
                  }
                } else if (isSelected) {
                  borderStyle = 'border-sky-600 bg-sky-50';
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={Boolean(localResult)}
                    onClick={() => handleToggleOption(opt.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default ${borderStyle}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-4 h-4 shrink-0 flex items-center justify-center border ${
                          interaction.type === InteractionType.MULTI_SELECT ? 'rounded' : 'rounded-full'
                        } ${
                          isSelected
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-slate-400 bg-white'
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="text-slate-800 font-medium">{opt.text}</span>
                    </div>
                    {localResult && opt.isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    {localResult && isSelected && !opt.isCorrect && (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {interaction.type === InteractionType.FILL_BLANK && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm leading-loose text-slate-800">
              {blankParts.map((part, idx) => {
                if (part.type === 'text') {
                  return <span key={idx}>{part.value}</span>;
                }
                const bIdx = part.blankIndex ?? 0;
                const val = blankInputs[bIdx] || '';
                const isBlankCorrect =
                  localResult &&
                  (interaction.caseSensitive
                    ? val.trim() === part.value.trim()
                    : val.trim().toLowerCase() === part.value.trim().toLowerCase());

                return (
                  <input
                    key={idx}
                    type="text"
                    disabled={Boolean(localResult)}
                    value={val}
                    onChange={(e) => {
                      const next = [...blankInputs];
                      next[bIdx] = e.target.value;
                      setBlankInputs(next);
                    }}
                    placeholder="..."
                    className={`mx-1.5 px-2.5 py-0.5 w-32 rounded border text-sm font-medium focus:outline-none focus:ring-2 ${
                      localResult
                        ? isBlankCorrect
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-rose-400 bg-rose-50 text-rose-800'
                        : 'border-slate-300 bg-white text-slate-900 focus:ring-sky-500/30 focus:border-sky-600'
                    }`}
                  />
                );
              })}
            </div>
          )}

          {interaction.type === InteractionType.DRAG_TEXT && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm leading-[2.3] text-slate-800">
                {blankParts.map((part, idx) => {
                  if (part.type === 'text') {
                    return <span key={idx}>{part.value}</span>;
                  }
                  const bIdx = part.blankIndex ?? 0;
                  const chipIdx = assignedChipIndices[bIdx];
                  const wordVal =
                    chipIdx !== null && chipIdx !== undefined ? wordBank[chipIdx] || '' : '';
                  const isBlankCorrect =
                    localResult &&
                    (interaction.caseSensitive
                      ? wordVal.trim() === part.value.trim()
                      : wordVal.trim().toLowerCase() === part.value.trim().toLowerCase());

                  const isFocused = activeSlotIdx === bIdx;
                  const isDragOver = dragOverSlotIdx === bIdx;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={Boolean(localResult)}
                      draggable={!localResult && Boolean(wordVal)}
                      onDragStart={(e) => {
                        if (localResult || chipIdx === null || chipIdx === undefined) return;
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ chipIdx, fromSlot: bIdx })
                        );
                      }}
                      onDragOver={(e) => {
                        if (localResult) return;
                        e.preventDefault();
                        if (dragOverSlotIdx !== bIdx) setDragOverSlotIdx(bIdx);
                      }}
                      onDragLeave={() => {
                        if (dragOverSlotIdx === bIdx) setDragOverSlotIdx(null);
                      }}
                      onDrop={(e) => {
                        if (localResult) return;
                        e.preventDefault();
                        setDragOverSlotIdx(null);
                        try {
                          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                          if (typeof data.chipIdx === 'number') {
                            handleAssignWordToSlot(data.chipIdx, bIdx, data.fromSlot);
                          }
                        } catch {
                          // ignore malformed drag payload
                        }
                      }}
                      onClick={() => handleClearSlot(bIdx)}
                      title={
                        wordVal
                          ? 'Nhấp để trả từ về kho gợi ý hoặc kéo sang ô khác'
                          : 'Nhấp để chọn ô này, rồi bấm từ bên dưới hoặc kéo thả vào đây'
                      }
                      className={`inline-flex items-center justify-center min-w-[112px] mx-1.5 px-3 py-1 rounded-lg border-2 text-xs font-semibold align-middle transition-all cursor-pointer disabled:cursor-default ${
                        localResult
                          ? isBlankCorrect
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : 'border-rose-400 bg-rose-50 text-rose-800'
                          : isDragOver
                          ? 'border-sky-500 bg-sky-100 text-sky-900 scale-[1.03]'
                          : wordVal
                          ? 'border-sky-600 bg-sky-50 text-sky-900 hover:bg-sky-100'
                          : isFocused
                          ? 'border-sky-500 border-dashed bg-sky-50/70 text-sky-700'
                          : 'border-slate-300 border-dashed bg-white text-slate-400 hover:border-sky-400'
                      }`}
                    >
                      {wordVal || 'Thả / chọn từ'}
                    </button>
                  );
                })}
              </div>

              {/* Word Bank */}
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-medium text-slate-600">
                  Kho từ gợi ý — Kéo thả từ vào ô trống hoặc bấm trực tiếp vào từ để điền:
                </div>
                <div className="flex flex-wrap gap-2">
                  {wordBank.map((word, cIdx) => {
                    const isUsed = assignedChipIndices.includes(cIdx);
                    return (
                      <button
                        key={`${word}-${cIdx}`}
                        type="button"
                        disabled={Boolean(localResult) || isUsed}
                        draggable={!localResult && !isUsed}
                        onDragStart={(e) => {
                          if (localResult || isUsed) return;
                          e.dataTransfer.setData('text/plain', JSON.stringify({ chipIdx: cIdx }));
                        }}
                        onClick={() => handleClickBankChip(cIdx)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                          isUsed
                            ? 'border-slate-200 bg-slate-100 text-slate-400 line-through cursor-default opacity-50'
                            : localResult
                            ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-default'
                            : 'border-slate-300 bg-slate-50 text-slate-800 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-800 cursor-grab active:cursor-grabbing shadow-xs'
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {interaction.type === InteractionType.ORDERING && (
            <div className="space-y-2">
              {orderedItems.map((stepText, idx) => {
                const isExactPosition =
                  localResult && interaction.orderingItems?.[idx] === stepText;
                return (
                  <div
                    key={`${stepText}-${idx}`}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-sm ${
                      localResult
                        ? isExactPosition
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-rose-300 bg-rose-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-semibold text-slate-500 w-5 shrink-0 tabular-nums">
                        {idx + 1}.
                      </span>
                      <span className="text-slate-800 font-medium">{stepText}</span>
                    </div>
                    {!localResult && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveOrder(idx, -1)}
                          aria-label="Chuyển lên"
                          className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === orderedItems.length - 1}
                          onClick={() => handleMoveOrder(idx, 1)}
                          aria-label="Chuyển xuống"
                          className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Feedback banner after submit */}
          {localResult && (
            <div
              className={`p-3.5 rounded-lg border flex items-start gap-3 ${
                localResult.isCorrect
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              {localResult.isCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs leading-relaxed">
                <div className="font-bold text-sm">
                  {interaction.type === InteractionType.INFO
                    ? 'Đã hoàn thành ghi chú'
                    : localResult.isCorrect
                    ? `Chính xác! +${localResult.earnedPoints} điểm`
                    : `Chưa chính xác (0/${localResult.maxPoints} điểm)`}
                </div>
                {interaction.explanation && <p className="mt-1 text-slate-700">{interaction.explanation}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            {localResult && !localResult.isCorrect && canRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Làm lại{maxAttempts ? ` (${attemptsUsed}/${maxAttempts})` : ' câu này'}
              </button>
            )}
            {localResult && !localResult.isCorrect && !canRetry && maxAttempts && (
              <span className="text-xs font-medium text-slate-500">
                Đã hết lượt làm lại ({attemptsUsed}/{maxAttempts})
              </span>
            )}
            {localResult && !localResult.isCorrect && typeof interaction.branchOnWrong === 'number' && (
              <button
                type="button"
                onClick={() => onJumpToTimestamp(interaction.branchOnWrong!)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
              >
                Xem lại đoạn {formatTime(interaction.branchOnWrong)}
              </button>
            )}
            {localResult && localResult.isCorrect && typeof interaction.branchOnCorrect === 'number' && (
              <button
                type="button"
                onClick={() => onJumpToTimestamp(interaction.branchOnCorrect!)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sky-300 bg-sky-50 text-xs font-medium text-sky-800 hover:bg-sky-100 cursor-pointer whitespace-nowrap"
              >
                Đi tới phân đoạn {formatTime(interaction.branchOnCorrect)}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {interaction.type === InteractionType.INFO ? (
              <button
                type="button"
                onClick={() => {
                  if (!localResult) {
                    const res = evaluateInteractionAnswer(interaction, {});
                    setLocalResult(res);
                    onSubmitAnswer(res);
                  }
                  onCloseAndResume();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Đã hiểu &amp; Tiếp tục
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : !localResult ? (
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleCheckSubmit}
                className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                Kiểm tra đáp án
              </button>
            ) : (
              <button
                type="button"
                onClick={onCloseAndResume}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                Tiếp tục xem video
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
