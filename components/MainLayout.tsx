import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { DragHandleIcon, WarningIcon, SummaryIcon, SaveIcon, UploadIcon, UndoIcon, RedoIcon, UserIcon, TagIcon, BrainIcon, RepairIcon, RescheduleIcon } from './icons';
import DayTabs from './DayTabs';
import SchedulesPanel from './SchedulesPanel';
import JobsPanel from './JobsPanel';
import RouteMapPanel from './RoutePanel';
import DebugLog from './DebugLog';
import DailySummaryModal from './DailySummary';
import RepSummaryModal from './RepSummary';
import AvailabilitySummaryModal from './AvailabilitySummary';
import AiAssistantPopup from './AiAssistantPopup';
import RepSettingsModal from './RepSettingsModal';
import TrainingDataModal from './TrainingDataModal';
import NeedsDetailsModal from './NeedsDetailsModal';
import NeedsRescheduleModal from './NeedsRescheduleModal';
import { TAG_KEYWORDS } from '../constants';
import { Job } from '../types';

const MIN_COLUMN_PERCENTAGE = 10;
type ColumnId = 'schedules' | 'jobs' | 'routes';

// Helper function to check time overlap, required for badge calculation
const parseTimeRange = (timeStr: string | undefined): { start: number, end: number } | null => {
    if (!timeStr) return null;
    const parts = timeStr.split('-').map(s => s.trim());
    
    const parseTime = (t: string) => {
        const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!match) return 0;
        let h = parseInt(match[1]);
        const m = parseInt(match[2] || '0');
        const p = match[3]?.toLowerCase();
        if (p === 'pm' && h < 12) h += 12;
        if (p === 'am' && h === 12) h = 0;
        if (!p && h >= 1 && h <= 6) h += 12;
        return h * 60 + m;
    };

    if (parts.length >= 2) {
        return { start: parseTime(parts[0]), end: parseTime(parts[1]) };
    }
    return null;
};
const doTimesOverlap = (t1: string | undefined, t2: string | undefined): boolean => {
    const r1 = parseTimeRange(t1);
    const r2 = parseTimeRange(t2);
    if (!r1 || !r2) return true; 
    return r1.start < r2.end && r2.start < r1.end;
};


const MainLayout: React.FC = () => {
  const context = useAppContext();
  // Removed 'details' from default order
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(['schedules', 'jobs', 'routes']);
  // Adjusted widths for 3 columns
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>({ schedules: 35, jobs: 30, routes: 35 });
  const draggedItem = useRef<ColumnId | null>(null);
  const dragOverItem = useRef<ColumnId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDailySummaryOpen, setIsDailySummaryOpen] = useState(false);
  const [isRepSummaryOpen, setIsRepSummaryOpen] = useState(false);
  const [isAvailabilitySummaryOpen, setIsAvailabilitySummaryOpen] = useState(false);
  const [isTrainingDataOpen, setIsTrainingDataOpen] = useState(false);
  const [isNeedsDetailsOpen, setIsNeedsDetailsOpen] = useState(false);
  const [isNeedsRescheduleOpen, setIsNeedsRescheduleOpen] = useState(false);
  const [isAiPopupOpen, setIsAiPopupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (context.isAiAssigning || context.aiThoughts.length > 0) {
        setIsAiPopupOpen(true);
    }
  }, [context.isAiAssigning, context.aiThoughts.length]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isUndo = (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && e.key === 'z';
        const isRedo = (isMac ? e.metaKey && e.shiftKey : e.ctrlKey) && e.key === 'y' || (isMac && e.metaKey && e.shiftKey && e.key === 'z');

        if (isUndo) {
            e.preventDefault();
            context.handleUndo();
        } else if (isRedo) {
            e.preventDefault();
            context.handleRedo();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [context]);


  const handleCloseAiPopup = () => {
      setIsAiPopupOpen(false);
      if (!context.isAiAssigning) {
          context.clearAiThoughts();
      }
  };

  const handleDragStart = (id: ColumnId) => { draggedItem.current = id; };
  const handleDragEnter = (id: ColumnId) => { dragOverItem.current = id; };
  const handleDragEnd = () => {
    if (draggedItem.current && dragOverItem.current && draggedItem.current !== dragOverItem.current) {
      const newColumnOrder = [...columnOrder];
      const draggedIndex = newColumnOrder.indexOf(draggedItem.current);
      const targetIndex = newColumnOrder.indexOf(dragOverItem.current);
      if (draggedIndex > -1 && targetIndex > -1) {
        const [removed] = newColumnOrder.splice(draggedIndex, 1);
        newColumnOrder.splice(targetIndex, 0, removed);
        setColumnOrder(newColumnOrder);
      }
    }
    draggedItem.current = null;
    dragOverItem.current = null;
  };

  const handleResizeStart = useCallback((e: React.MouseEvent, leftColId: ColumnId, rightColId: ColumnId) => {
    e.preventDefault();
    const startX = e.clientX;
    const containerNode = containerRef.current;
    if (!containerNode) return;
    const initialLeftPercent = columnWidths[leftColId];
    const initialRightPercent = columnWidths[rightColId];
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const containerWidth = containerNode.getBoundingClientRect().width;
      if (!containerWidth) return;
      const dxPercent = (dx / containerWidth) * 100;
      let newLeftPercent = initialLeftPercent + dxPercent;
      let newRightPercent = initialRightPercent - dxPercent;
      if (newLeftPercent < MIN_COLUMN_PERCENTAGE) {
          newRightPercent += newLeftPercent - MIN_COLUMN_PERCENTAGE;
          newLeftPercent = MIN_COLUMN_PERCENTAGE;
      }
      if (newRightPercent < MIN_COLUMN_PERCENTAGE) {
          newLeftPercent += newRightPercent - MIN_COLUMN_PERCENTAGE;
          newRightPercent = MIN_COLUMN_PERCENTAGE;
      }
      setColumnWidths(prev => ({ ...prev, [leftColId]: newLeftPercent, [rightColId]: newRightPercent }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  }, [columnWidths]);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result;
            if (typeof text !== 'string') {
                throw new Error("File content is not readable text.");
            }
            const loadedState = JSON.parse(text);
            context.handleLoadStateFromFile(loadedState);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to read or parse file.";
            context.log(`- ERROR (File Read): ${errorMessage}`);
            alert(`Error reading file: ${errorMessage}`);
        }
    };
    reader.onerror = () => {
        context.log(`- ERROR (File Read): FileReader error.`);
        alert("An error occurred while reading the file.");
    };
    reader.readAsText(file);

    event.target.value = '';
  };

  // Logic to count jobs needing details for badge
  const needsDetailsCount = useMemo(() => {
      const countTags = (job: Job) => {
        const notes = (job.notes || '').toLowerCase();
        let count = 0;
        TAG_KEYWORDS.forEach(tag => {
            if (new RegExp(`\\b${tag.toLowerCase()}\\b`).test(notes)) count++;
        });
        if (/\b\d+\s*sq/i.test(notes)) count++;
        if (/\b\d+\s*yrs\b/i.test(notes)) count++;
        if (/\b\d+S\b/i.test(notes)) count++;
        return count;
      };
      return context.appState.unassignedJobs.filter(job => countTags(job) <= 1).length;
  }, [context.appState.unassignedJobs]);

  const jobsNeedingRescheduleCount = useMemo(() => {
    let count = 0;
    const seenJobIds = new Set<string>();

    context.appState.reps.forEach(rep => {
        if (rep.isOptimized) {
            rep.schedule.forEach(slot => {
                slot.jobs.forEach(job => {
                    if (!seenJobIds.has(job.id)) {
                        count++;
                        seenJobIds.add(job.id);
                    }
                });
            });
        } else {
            rep.schedule.forEach(slot => {
                slot.jobs.forEach(job => {
                    if (job.originalTimeframe && slot.label) {
                        const overlaps = doTimesOverlap(job.originalTimeframe, slot.label);
                        if (!overlaps && !seenJobIds.has(job.id)) {
                            count++;
                            seenJobIds.add(job.id);
                        }
                    }
                });
            });
        }
    });
    return count;
  }, [context.appState.reps]);


  const renderPanelContent = (id: ColumnId) => {
    switch (id) {
      case 'schedules':
        return <SchedulesPanel onDragStart={() => handleDragStart('schedules')} onDragEnd={handleDragEnd} />;
      case 'jobs':
        return <JobsPanel onDragStart={() => handleDragStart('jobs')} onDragEnd={handleDragEnd} />;
      case 'routes':
        return (
          <>
            <div className="flex justify-between items-center mb-2 border-b pb-1">
              <h2 className="text-lg font-semibold">3. Route Map</h2>
              <div 
                draggable
                onDragStart={() => handleDragStart('routes')}
                onDragEnd={handleDragEnd}
                className="cursor-move text-gray-400 hover:text-gray-600" title="Drag to reorder column">
                <DragHandleIcon />
              </div>
            </div>
            <div className="flex-grow min-h-0">
              <RouteMapPanel routeData={context.activeRoute} isLoading={context.isRouting} />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-800 font-sans overflow-hidden">
      <header className="bg-white border-b border-gray-200 h-16 flex-shrink-0 px-6 flex items-center justify-between z-30 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Left Section: Branding & History */}
        <div className="flex items-center gap-6">
             {/* Branding */}
             <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">Rep Route Planner</h1>
                <div className="flex items-center gap-1.5 mt-1">
                    <div className={`w-2 h-2 rounded-full ${context.usingMockData ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`}></div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                        {context.usingMockData ? 'Mock Data' : 'Live'}:
                    </span>
                    <span className="text-[10px] font-bold text-gray-700 truncate max-w-[200px]" title={context.activeSheetName}>
                        {context.activeSheetName || 'Loading...'}
                    </span>
                </div>
             </div>

             {/* Divider */}
             <div className="h-8 w-px bg-gray-100"></div>

             {/* History Controls */}
             <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                <button onClick={context.handleUndo} disabled={!context.canUndo} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-gray-800 disabled:opacity-30 transition" title="Undo (Ctrl+Z)">
                    <UndoIcon className="h-4 w-4" />
                </button>
                <button onClick={context.handleRedo} disabled={!context.canRedo} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-gray-800 disabled:opacity-30 transition" title="Redo (Ctrl+Y)">
                    <RedoIcon className="h-4 w-4" />
                </button>
            </div>
        </div>

        {/* Center Section: Date Navigation */}
        <div className="flex-1 flex justify-center px-4">
            <DayTabs />
        </div>

        {/* Right Section: Reports & Tools */}
        <div className="flex items-center gap-4">
            
            <button 
                onClick={() => setIsNeedsRescheduleOpen(true)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-md transition-all ${
                    jobsNeedingRescheduleCount > 0 
                        ? 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 shadow-sm' 
                        : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'
                }`}
                title="Review jobs with potential scheduling conflicts"
            >
                <RescheduleIcon className={`h-3.5 w-3.5 ${jobsNeedingRescheduleCount > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>Needs Reschedule</span>
                {jobsNeedingRescheduleCount > 0 && (
                    <span className="flex items-center justify-center h-4 min-w-[16px] px-1 text-[9px] font-bold rounded-full bg-blue-500 text-white shadow-sm">
                        {jobsNeedingRescheduleCount}
                    </span>
                )}
            </button>
            
            <button 
                onClick={() => setIsNeedsDetailsOpen(true)} 
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-md transition-all ${
                    needsDetailsCount > 0 
                        ? 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50 shadow-sm' 
                        : 'bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100'
                }`}
                title="Review jobs missing essential details"
            >
                <RepairIcon className={`h-3.5 w-3.5 ${needsDetailsCount > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                <span>Needs Details</span>
                {needsDetailsCount > 0 && (
                    <span className="flex items-center justify-center h-4 min-w-[16px] px-1 text-[9px] font-bold rounded-full bg-amber-500 text-white shadow-sm">
                        {needsDetailsCount}
                    </span>
                )}
            </button>

            {/* Reports Navigation */}
             <div className="flex items-center bg-gray-100/50 p-1 rounded-lg border border-gray-200/50">
                <button onClick={() => setIsDailySummaryOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-md transition-all">
                    <SummaryIcon className="h-3.5 w-3.5" />
                    <span>Daily</span>
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                 <button onClick={() => setIsRepSummaryOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-md transition-all">
                    <UserIcon className="h-3.5 w-3.5" />
                    <span>Reps</span>
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                 <button onClick={() => setIsAvailabilitySummaryOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-md transition-all">
                    <TagIcon className="h-3.5 w-3.5" />
                    <span>Slots</span>
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                 <button onClick={() => setIsTrainingDataOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:shadow-sm rounded-md transition-all" title="View Training Data">
                    <BrainIcon className="h-3.5 w-3.5" />
                    <span>Training</span>
                </button>
            </div>

             {/* Data Controls */}
            <div className="flex items-center gap-2">
                <button onClick={context.handleSaveStateToFile} className="group p-2 rounded-full hover:bg-indigo-50 transition relative" title="Save State">
                    <SaveIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                </button>
                <button onClick={handleLoadClick} className="group p-2 rounded-full hover:bg-indigo-50 transition relative" title="Load State">
                    <UploadIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                </button>
            </div>

            <div className="h-8 w-px bg-gray-200"></div>
            
            <DebugLog logs={context.debugLogs} onClear={() => { context.log('Log cleared.'); }} />
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
      </header>

      <div ref={containerRef} className="flex w-full flex-grow min-h-0 relative z-10 p-4 gap-4 overflow-hidden">
        {columnOrder.map((id, i) => {
          const rightColId = i < columnOrder.length - 1 ? columnOrder[i + 1] : null;
          return (
            <React.Fragment key={id}>
              <div
                data-col-id={id}
                className="bg-white p-4 rounded-lg shadow-md flex flex-col min-w-0 h-full"
                style={{ flexBasis: `${columnWidths[id]}%` }}
                onDragEnter={() => handleDragEnter(id)}
                onDragOver={(e) => e.preventDefault()}
              >
                {renderPanelContent(id)}
              </div>
              {rightColId && ( <div className="w-4 flex items-center justify-center cursor-col-resize group flex-shrink-0" onMouseDown={e => handleResizeStart(e, id, rightColId)}> <div className="w-1 h-16 bg-gray-300 group-hover:bg-indigo-400 rounded-full transition-colors" /> </div> )}
            </React.Fragment>
          );
        })}
      </div>

        <DailySummaryModal isOpen={isDailySummaryOpen} onClose={() => setIsDailySummaryOpen(false)} />
        <RepSummaryModal isOpen={isRepSummaryOpen} onClose={() => setIsRepSummaryOpen(false)} />
        <AvailabilitySummaryModal isOpen={isAvailabilitySummaryOpen} onClose={() => setIsAvailabilitySummaryOpen(false)} />
        <TrainingDataModal isOpen={isTrainingDataOpen} onClose={() => setIsTrainingDataOpen(false)} />
        <NeedsDetailsModal isOpen={isNeedsDetailsOpen} onClose={() => setIsNeedsDetailsOpen(false)} />
        <NeedsRescheduleModal isOpen={isNeedsRescheduleOpen} onClose={() => setIsNeedsRescheduleOpen(false)} />
        
        <AiAssistantPopup 
            isOpen={isAiPopupOpen}
            onClose={handleCloseAiPopup}
            thoughts={context.aiThoughts}
            isThinking={context.isAiAssigning}
            title="AI Assignment Assistant"
        />
        
        <RepSettingsModal
            isOpen={!!context.repSettingsModalRepId}
            onClose={() => context.setRepSettingsModalRepId(null)}
            repId={context.repSettingsModalRepId}
        />

    </div>
  );
};

export default MainLayout;