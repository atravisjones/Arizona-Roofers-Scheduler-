import React, { useState, useRef, useEffect } from 'react';
import { ClipboardIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon } from './icons';

interface DebugLogProps {
    logs: string[];
    onClear: () => void;
}

const DebugLog: React.FC<DebugLogProps> = ({ logs, onClear }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const logContainerRef = React.useRef<HTMLPreElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isExpanded && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, isExpanded]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsExpanded(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleCopy = () => {
        if (logs.length > 0) {
            navigator.clipboard.writeText(logs.join('\n')).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
            });
        }
    };

    return (
        <div ref={wrapperRef} className="relative">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center space-x-2 px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition"
                title={`Debug Log (${logs.length} entries)`}
            >
                <span className="text-xs font-semibold text-gray-600">Log</span>
                <span className="text-xs bg-gray-200 text-gray-700 font-mono rounded-full px-1.5 py-0">{logs.length}</span>
                {isExpanded ? <ChevronDownIcon className="h-4 w-4 text-gray-400" /> : <ChevronUpIcon className="h-4 w-4 text-gray-400" />}
            </button>
            {isExpanded && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-300 rounded-lg shadow-xl z-50">
                    <pre ref={logContainerRef} className="text-[11px] leading-4 text-gray-600 bg-gray-50 p-2 h-40 overflow-y-auto font-mono rounded-t-lg">
                        {logs.length > 0 ? logs.join('\n') : 'No log messages yet.'}
                    </pre>
                    <div className="p-1.5 bg-gray-100 border-t flex justify-end space-x-2 rounded-b-lg">
                        <button
                            onClick={handleCopy}
                            className={`flex items-center space-x-1 px-2 py-0.5 text-xs font-semibold rounded-md transition ${copySuccess ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                        >
                            <ClipboardIcon className="h-3 w-3" />
                            <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
                        </button>
                        <button
                            onClick={onClear}
                            className="flex items-center space-x-1 px-2 py-0.5 bg-red-100 hover:bg-red-200 text-xs text-red-800 font-semibold rounded-md transition"
                        >
                            <TrashIcon className="h-3 w-3" />
                            <span>Clear</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DebugLog;