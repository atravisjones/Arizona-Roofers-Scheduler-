
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { XIcon, ClipboardIcon, SaveIcon, BrainIcon } from './icons';

interface TrainingDataModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TrainingDataModal: React.FC<TrainingDataModalProps> = ({ isOpen, onClose }) => {
    const { appState, selectedDate, activeSheetName, usingMockData, debugLogs, aiThoughts } = useAppContext();
    const [copySuccess, setCopySuccess] = useState(false);

    const trainingData = useMemo(() => {
        const activeReps = appState.reps.map(r => ({
            id: r.id,
            name: r.name,
            region: r.region,
            skills: r.skills,
            salesRank: r.salesRank,
            homeZips: r.zipCodes,
            availability: r.availability,
            unavailableSlots: r.unavailableSlots,
            scoringOverrides: r.scoringOverrides,
            currentLoad: {
                totalJobs: r.schedule.reduce((acc, s) => acc + s.jobs.length, 0),
                cities: [...new Set(r.schedule.flatMap(s => s.jobs).map(j => j.city).filter(Boolean))]
            },
            schedule: r.schedule.map(s => ({
                slotId: s.id,
                label: s.label,
                jobs: s.jobs.map(j => ({
                    id: j.id,
                    city: j.city,
                    address: j.address,
                    notes: j.notes,
                    originalTimeframe: j.originalTimeframe,
                    assignmentScore: j.assignmentScore,
                    scoreBreakdown: j.scoreBreakdown
                }))
            }))
        }));

        return {
            meta: {
                timestamp: new Date().toISOString(),
                selectedDate: selectedDate.toISOString(),
                sheetName: activeSheetName,
                isMockData: usingMockData,
            },
            settings: appState.settings,
            statistics: {
                totalReps: appState.reps.length,
                totalAssignedJobs: activeReps.reduce((acc, r) => acc + r.currentLoad.totalJobs, 0),
                totalUnassignedJobs: appState.unassignedJobs.length
            },
            representatives: activeReps,
            unassignedJobs: appState.unassignedJobs.map(j => ({
                id: j.id,
                city: j.city,
                address: j.address,
                notes: j.notes,
                originalTimeframe: j.originalTimeframe,
                geocodeError: (j as any).geocodeError
            })),
            logs: {
                applicationLogs: debugLogs,
                aiThinkingProcess: aiThoughts
            }
        };
    }, [appState, selectedDate, activeSheetName, usingMockData, debugLogs, aiThoughts]);

    const jsonString = useMemo(() => JSON.stringify(trainingData, null, 2), [trainingData]);

    const handleCopy = () => {
        navigator.clipboard.writeText(jsonString).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2500);
        });
    };

    const handleDownload = () => {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                            <BrainIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Training Data & Session Analysis</h2>
                            <p className="text-xs text-gray-500">Complete snapshot for logistics optimization analysis</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-sm"
                        >
                            <SaveIcon className="h-4 w-4" />
                            Download JSON
                        </button>
                        <button 
                            onClick={handleCopy}
                            className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors text-sm text-white shadow-md ${copySuccess ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        >
                            <ClipboardIcon className="h-4 w-4" />
                            {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
                        </button>
                        <button onClick={onClose} className="ml-2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                            <XIcon className="h-6 w-6" />
                        </button>
                    </div>
                </header>

                <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
                    {/* Sidebar Summary */}
                    <div className="w-full md:w-80 bg-gray-50 border-r border-gray-200 p-6 overflow-y-auto flex-shrink-0">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Session Stats</h3>
                        
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <p className="text-xs text-gray-500">Assigned Jobs</p>
                                <p className="text-2xl font-bold text-green-600">{trainingData.statistics.totalAssignedJobs}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <p className="text-xs text-gray-500">Unassigned Jobs</p>
                                <p className="text-2xl font-bold text-amber-600">{trainingData.statistics.totalUnassignedJobs}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <p className="text-xs text-gray-500">Active Reps</p>
                                <p className="text-2xl font-bold text-indigo-600">{trainingData.representatives.filter(r => r.currentLoad.totalJobs > 0).length} / {trainingData.statistics.totalReps}</p>
                            </div>
                        </div>

                        <div className="mt-8">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Active Settings</h3>
                            <div className="text-xs space-y-1.5 text-gray-600">
                                <p>Max Jobs/Rep: <b>{trainingData.settings.maxJobsPerRep}</b></p>
                                <p>Weights:</p>
                                <ul className="pl-2 space-y-1 border-l-2 border-gray-200 ml-1">
                                    <li>Cluster: {trainingData.settings.scoringWeights.distanceCluster}x</li>
                                    <li>Skill: {trainingData.settings.scoringWeights.skillRoofing}x</li>
                                    <li>Rank: {trainingData.settings.scoringWeights.performance}x</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Main Content - JSON Viewer */}
                    <div className="flex-grow flex flex-col h-full overflow-hidden bg-slate-900">
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                            <span className="text-xs font-mono text-slate-400">training_session_data.json</span>
                            <span className="text-xs text-slate-500">{Math.round(jsonString.length / 1024)} KB</span>
                        </div>
                        <pre className="flex-grow p-4 overflow-auto font-mono text-xs leading-relaxed text-slate-300 selection:bg-indigo-500/30">
                            {jsonString}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrainingDataModal;
