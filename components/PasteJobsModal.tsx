
import React, { useState } from 'react';
import { LoadingIcon, PasteIcon, ProcessIcon, XIcon } from './icons';

interface PasteJobsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onParse: (text: string, onComplete: () => void) => Promise<void>;
    isParsing: boolean;
}

const PasteJobsModal: React.FC<PasteJobsModalProps> = ({ isOpen, onClose, onParse, isParsing }) => {
    const [pastedText, setPastedText] = useState('');

    const handleParse = () => {
        onParse(pastedText, () => {
            setPastedText('');
            onClose();
        });
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                         <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-200 text-indigo-600">
                            <PasteIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Paste Job Information</h2>
                            <p className="text-xs text-gray-500">Import jobs from spreadsheet, email, or text</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition">
                        <XIcon className="h-6 w-6" />
                    </button>
                </header>
                <div className="p-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Job Data</label>
                    <div className="relative">
                        <textarea
                            rows={12}
                            className="w-full p-4 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-sm font-mono leading-relaxed resize-none"
                            placeholder="Example:&#10;Monday, Nov 20, 2023&#10;7:30am - 10am&#10;MESA, AZ 85204 (Tile 2700sqft) -> Christian Noren&#10;13858 West Tara Lane..."
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            autoFocus
                        />
                        <div className="absolute bottom-3 right-3 text-xs text-gray-400 bg-white px-2 py-1 rounded border border-gray-100">
                            {pastedText.length} chars
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <span className="font-bold text-indigo-600">Tip:</span> Include the date, time ranges, and city names for best results.
                    </p>
                </div>
                <footer className="px-6 py-4 bg-gray-50 border-t flex justify-end space-x-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition shadow-sm">
                        Cancel
                    </button>
                    <button
                        onClick={handleParse}
                        disabled={isParsing || !pastedText.trim()}
                        className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] shadow-md hover:shadow-lg transition-all active:scale-95"
                    >
                        {isParsing ? <LoadingIcon /> : <ProcessIcon className="h-4 w-4" />}
                        <span className="ml-2">{isParsing ? 'Processing...' : 'Process Jobs'}</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default PasteJobsModal;
