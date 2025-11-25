
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Settings } from '../types';
import { XIcon } from './icons';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsSlider: React.FC<{
    label: string;
    value: number;
    onChange: (val: number) => void;
    description?: string;
}> = ({ label, value, onChange, description }) => (
    <div className="mb-5 last:mb-0">
        <div className="flex justify-between items-end mb-2">
            <label className="text-sm font-semibold text-gray-700">{label}</label>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{value.toFixed(1)}x</span>
        </div>
        <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        />
        {description && <p className="text-[11px] text-gray-500 mt-1.5 leading-tight">{description}</p>}
    </div>
);

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { settings, updateSettings, log } = useAppContext();
    const [localSettings, setLocalSettings] = useState<Settings>(settings);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings, isOpen]);

    const handleSave = () => {
        updateSettings(localSettings);
        log('SETTINGS: Updated assignment settings.');
        onClose();
    };

    const handleChange = (key: keyof Settings, value: any) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };
    
    const handleScoringChange = (key: keyof Settings['scoringWeights'], value: number) => {
        setLocalSettings(prev => ({
            ...prev,
            scoringWeights: { ...prev.scoringWeights, [key]: value }
        }));
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Assignment Settings</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Configure rules for automated dispatching</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition">
                        <XIcon className="h-6 w-6" />
                    </button>
                </header>

                <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar">
                    {/* General Rules Section */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-6 w-1 bg-indigo-500 rounded-full"></div>
                            <h3 className="text-lg font-bold text-gray-900">General Constraints</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 hover:border-indigo-100 transition-colors">
                                <label htmlFor="maxJobsPerRep" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Max Jobs / Rep</label>
                                <div className="flex items-center">
                                    <input
                                        type="number" id="maxJobsPerRep"
                                        value={localSettings.maxJobsPerRep}
                                        onChange={e => handleChange('maxJobsPerRep', parseInt(e.target.value, 10))}
                                        className="w-full p-2 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 hover:border-indigo-100 transition-colors">
                                <label htmlFor="minJobsPerRep" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Min Target / Rep</label>
                                <div className="flex items-center">
                                    <input
                                        type="number" id="minJobsPerRep"
                                        value={localSettings.minJobsPerRep}
                                        onChange={e => handleChange('minJobsPerRep', parseInt(e.target.value, 10))}
                                        className="w-full p-2 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 hover:border-indigo-100 transition-colors sm:col-span-2">
                                <label htmlFor="maxCitiesPerRep" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Max Cities / Rep</label>
                                <div className="flex items-center">
                                    <input
                                        type="number" id="maxCitiesPerRep"
                                        value={localSettings.maxCitiesPerRep}
                                        onChange={e => handleChange('maxCitiesPerRep', parseInt(e.target.value, 10))}
                                        className="w-full p-2 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                            <div className="p-4 flex items-center justify-between">
                                <div>
                                    <label htmlFor="allowDoubleBooking" className="block text-sm font-semibold text-gray-900">Allow Double Booking</label>
                                    <p className="text-xs text-gray-500 mt-0.5">Enable scheduling multiple jobs in the same time slot.</p>
                                </div>
                                <div className="flex items-center">
                                    <input
                                        type="checkbox" id="allowDoubleBooking"
                                        checked={localSettings.allowDoubleBooking}
                                        onChange={e => handleChange('allowDoubleBooking', e.target.checked)}
                                        className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition cursor-pointer"
                                    />
                                </div>
                            </div>
                             {localSettings.allowDoubleBooking && (
                                <div className="p-4 bg-indigo-50/50 flex items-center justify-between">
                                    <label htmlFor="maxJobsPerSlot" className="text-sm font-medium text-indigo-900">Max jobs per time slot</label>
                                    <input
                                        type="number" id="maxJobsPerSlot"
                                        value={localSettings.maxJobsPerSlot}
                                        onChange={e => handleChange('maxJobsPerSlot', parseInt(e.target.value, 10))}
                                        className="w-20 p-1.5 border border-gray-300 bg-white text-gray-900 rounded-md text-sm text-center shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                             )}
                        </div>
                    </section>

                    {/* Auto-Assignment Logic Section */}
                    <section>
                         <div className="flex items-center gap-2 mb-4">
                            <div className="h-6 w-1 bg-purple-500 rounded-full"></div>
                            <h3 className="text-lg font-bold text-gray-900">AI & Auto-Assignment Logic</h3>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 mb-6">
                            <div className="p-4 flex items-center justify-between">
                                <div>
                                    <label htmlFor="allowAssignOutsideAvailability" className="block text-sm font-semibold text-gray-900">Override Rep Availability</label>
                                    <p className="text-xs text-gray-500 mt-0.5">Allow AI to assign jobs to unavailable slots (with penalty).</p>
                                </div>
                                <input
                                    type="checkbox" id="allowAssignOutsideAvailability"
                                    checked={localSettings.allowAssignOutsideAvailability}
                                    onChange={e => handleChange('allowAssignOutsideAvailability', e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition cursor-pointer"
                                />
                            </div>

                            <div className="p-4 flex items-center justify-between">
                                <div>
                                    <label htmlFor="strictTimeSlotMatching" className="block text-sm font-semibold text-gray-900">Strict Time Slot Matching</label>
                                    <p className="text-xs text-gray-500 mt-0.5">Only assign jobs to the exact time slot from the source.</p>
                                </div>
                                <input
                                    type="checkbox" id="strictTimeSlotMatching"
                                    checked={localSettings.strictTimeSlotMatching}
                                    onChange={e => handleChange('strictTimeSlotMatching', e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition cursor-pointer"
                                />
                            </div>

                            <div className="p-4 flex items-center justify-between">
                                <div>
                                    <label htmlFor="allowRegionalRepsInPhoenix" className="block text-sm font-semibold text-gray-900">Allow Regional Reps in Phoenix</label>
                                    <p className="text-xs text-gray-500 mt-0.5">Permit North (London) and South (Richard/Joseph) reps to be assigned Phoenix jobs.</p>
                                </div>
                                <input
                                    type="checkbox" id="allowRegionalRepsInPhoenix"
                                    checked={localSettings.allowRegionalRepsInPhoenix}
                                    onChange={e => handleChange('allowRegionalRepsInPhoenix', e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Gamification Settings */}
                        <div className="bg-amber-50 p-5 rounded-lg border border-amber-200 shadow-sm">
                            <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-4 border-b border-amber-200 pb-2 flex items-center gap-2">
                                <span>🏆</span> Gamification / Scoring Rules
                            </h4>
                            <p className="text-xs text-amber-800 mb-4">
                                Define how the "Assignment Score" is calculated. The Auto-Assign algorithm will always choose the highest scoring rep.
                            </p>
                            <div className="space-y-2">
                                <SettingsSlider
                                    label="Distance: Home Base"
                                    value={localSettings.scoringWeights.distanceBase}
                                    onChange={(val) => handleScoringChange('distanceBase', val)}
                                    description="Proximity to Rep's Home Zip (when schedule is empty)."
                                />
                                <SettingsSlider
                                    label="Distance: Job Cluster"
                                    value={localSettings.scoringWeights.distanceCluster}
                                    onChange={(val) => handleScoringChange('distanceCluster', val)}
                                    description="Proximity to other assigned jobs (clustering)."
                                />
                                <SettingsSlider
                                    label="Skill: Roofing"
                                    value={localSettings.scoringWeights.skillRoofing}
                                    onChange={(val) => handleScoringChange('skillRoofing', val)}
                                    description="Skills for Tile, Shingle, Flat, Metal."
                                />
                                <SettingsSlider
                                    label="Skill: Type"
                                    value={localSettings.scoringWeights.skillType}
                                    onChange={(val) => handleScoringChange('skillType', val)}
                                    description="Skills for Insurance vs Commercial jobs."
                                />
                                <SettingsSlider
                                    label="Sales Performance / Rank"
                                    value={localSettings.scoringWeights.performance}
                                    onChange={(val) => handleScoringChange('performance', val)}
                                    description="Prioritize reps with higher sales rankings (e.g. Top 10)."
                                />
                                <div className="border-t border-amber-200 my-4"></div>
                                <SettingsSlider
                                    label="Unavailability Penalty"
                                    value={localSettings.unavailabilityPenalty}
                                    onChange={(val) => handleChange('unavailabilityPenalty', val)}
                                    description="Score reduction for assigning to an unavailable slot (if override is enabled)."
                                />
                            </div>
                        </div>
                    </section>
                </div>

                <footer className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center flex-shrink-0 rounded-b-xl">
                     <button onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all active:scale-95">
                        Save Configuration
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default SettingsModal;