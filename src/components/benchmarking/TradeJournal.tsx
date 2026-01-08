'use client';

import { useState, useEffect } from 'react';
import {
    Loader2, AlertCircle, Plus, BookOpen, Lightbulb, MessageSquare, Target,
    Edit3, Trash2, ChevronDown, ChevronUp, Check, X, ThumbsUp, ThumbsDown
} from 'lucide-react';
import {
    getJournalEntries,
    createJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
} from '@/app/journal-actions';
import { TradeJournalEntry, JournalEntryType, CreateJournalEntryInput } from '@/lib/benchmarking/types';

interface TradeJournalProps {
    tradeId: string;
}

const ENTRY_TYPE_CONFIG: Record<JournalEntryType, { label: string; icon: React.ReactNode; color: string }> = {
    ENTRY_THESIS: { label: 'Entry Thesis', icon: <Target className="w-4 h-4" />, color: 'blue' },
    EXIT_REVIEW: { label: 'Exit Review', icon: <BookOpen className="w-4 h-4" />, color: 'purple' },
    MID_TRADE_NOTE: { label: 'Mid-Trade Note', icon: <MessageSquare className="w-4 h-4" />, color: 'gray' },
    LESSON_LEARNED: { label: 'Lesson Learned', icon: <Lightbulb className="w-4 h-4" />, color: 'amber' },
};

function JournalEntryCard({
    entry,
    onEdit,
    onDelete,
}: {
    entry: TradeJournalEntry;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const config = ENTRY_TYPE_CONFIG[entry.entry_type];
    const colorClasses: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        purple: 'bg-purple-50 text-purple-700 border-purple-200',
        gray: 'bg-gray-50 text-gray-700 border-gray-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
    };

    const hasDetails = entry.what_went_well || entry.what_went_wrong || entry.lesson_learned ||
        entry.confidence_before !== null || entry.would_take_again !== null;

    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border ${colorClasses[config.color]}`}>
                            {config.icon}
                            {config.label}
                        </span>
                        <span className="text-xs text-gray-400">{entry.entry_date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onEdit}
                            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit"
                        >
                            <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>

                {hasDetails && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expanded ? 'Hide details' : 'Show details'}
                    </button>
                )}
            </div>

            {expanded && hasDetails && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                    {entry.what_went_well && (
                        <div>
                            <p className="text-xs font-medium text-green-600 mb-1">What Went Well</p>
                            <p className="text-sm text-gray-700">{entry.what_went_well}</p>
                        </div>
                    )}
                    {entry.what_went_wrong && (
                        <div>
                            <p className="text-xs font-medium text-red-600 mb-1">What Went Wrong</p>
                            <p className="text-sm text-gray-700">{entry.what_went_wrong}</p>
                        </div>
                    )}
                    {entry.lesson_learned && (
                        <div>
                            <p className="text-xs font-medium text-amber-600 mb-1">Lesson Learned</p>
                            <p className="text-sm text-gray-700">{entry.lesson_learned}</p>
                        </div>
                    )}
                    <div className="flex items-center gap-4 pt-2">
                        {entry.would_take_again !== null && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">Would take again:</span>
                                {entry.would_take_again ? (
                                    <ThumbsUp className="w-4 h-4 text-green-500" />
                                ) : (
                                    <ThumbsDown className="w-4 h-4 text-red-500" />
                                )}
                            </div>
                        )}
                        {entry.confidence_before != null && entry.confidence_after != null && (
                            <div className="text-xs text-gray-500">
                                Confidence: {entry.confidence_before} → {entry.confidence_after}
                                <span className={`ml-1 ${entry.confidence_after > entry.confidence_before! ? 'text-green-500' : entry.confidence_after < entry.confidence_before! ? 'text-red-500' : ''}`}>
                                    ({entry.confidence_after > entry.confidence_before! ? '+' : ''}{entry.confidence_after - entry.confidence_before!})
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface JournalFormData {
    entry_type: JournalEntryType;
    content: string;
    what_went_well?: string;
    what_went_wrong?: string;
    lesson_learned?: string;
    would_take_again?: boolean;
    confidence_before?: number;
    confidence_after?: number;
}

function JournalEntryForm({
    initialData,
    onSubmit,
    onCancel,
    isLoading,
}: {
    initialData?: Partial<JournalFormData>;
    onSubmit: (data: JournalFormData) => void;
    onCancel: () => void;
    isLoading: boolean;
}) {
    const [formData, setFormData] = useState<JournalFormData>({
        entry_type: initialData?.entry_type || 'ENTRY_THESIS',
        content: initialData?.content || '',
        what_went_well: initialData?.what_went_well || '',
        what_went_wrong: initialData?.what_went_wrong || '',
        lesson_learned: initialData?.lesson_learned || '',
        would_take_again: initialData?.would_take_again,
        confidence_before: initialData?.confidence_before,
        confidence_after: initialData?.confidence_after,
    });
    const [showAdvanced, setShowAdvanced] = useState(
        !!(initialData?.what_went_well || initialData?.what_went_wrong || initialData?.lesson_learned ||
            initialData?.would_take_again !== undefined || initialData?.confidence_before)
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.content.trim()) {
            onSubmit(formData);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            {/* Entry Type */}
            <div>
                <label className="block text-xs text-gray-500 mb-2">Entry Type</label>
                <div className="flex flex-wrap gap-2">
                    {(Object.keys(ENTRY_TYPE_CONFIG) as JournalEntryType[]).map((type) => {
                        const config = ENTRY_TYPE_CONFIG[type];
                        const isSelected = formData.entry_type === type;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setFormData({ ...formData, entry_type: type })}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                                    isSelected
                                        ? 'bg-teal-50 text-teal-700 border-teal-300'
                                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                }`}
                            >
                                {config.icon}
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                    rows={4}
                    placeholder="What's on your mind about this trade?"
                    required
                />
            </div>

            {/* Advanced toggle */}
            <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showAdvanced ? 'Hide' : 'Show'} structured reflection
            </button>

            {/* Advanced fields */}
            {showAdvanced && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                    <div>
                        <label className="block text-xs text-green-600 mb-1">What Went Well</label>
                        <textarea
                            value={formData.what_went_well || ''}
                            onChange={(e) => setFormData({ ...formData, what_went_well: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                            rows={2}
                            placeholder="What worked in this trade?"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-red-600 mb-1">What Went Wrong</label>
                        <textarea
                            value={formData.what_went_wrong || ''}
                            onChange={(e) => setFormData({ ...formData, what_went_wrong: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                            rows={2}
                            placeholder="What could have been better?"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-amber-600 mb-1">Lesson Learned</label>
                        <textarea
                            value={formData.lesson_learned || ''}
                            onChange={(e) => setFormData({ ...formData, lesson_learned: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                            rows={2}
                            placeholder="What will you do differently next time?"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Would Take Again?</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, would_take_again: true })}
                                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded border transition-colors ${
                                        formData.would_take_again === true
                                            ? 'bg-green-50 text-green-700 border-green-300'
                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    <ThumbsUp className="w-4 h-4" />
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, would_take_again: false })}
                                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded border transition-colors ${
                                        formData.would_take_again === false
                                            ? 'bg-red-50 text-red-700 border-red-300'
                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    <ThumbsDown className="w-4 h-4" />
                                    No
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Confidence (1-10)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={formData.confidence_before || ''}
                                    onChange={(e) => setFormData({ ...formData, confidence_before: e.target.value ? parseInt(e.target.value) : undefined })}
                                    className="w-16 px-2 py-2 border border-gray-200 rounded text-sm text-center"
                                    placeholder="Before"
                                />
                                <span className="text-gray-400">→</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={formData.confidence_after || ''}
                                    onChange={(e) => setFormData({ ...formData, confidence_after: e.target.value ? parseInt(e.target.value) : undefined })}
                                    className="w-16 px-2 py-2 border border-gray-200 rounded text-sm text-center"
                                    placeholder="After"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isLoading || !formData.content.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    Save Entry
                </button>
            </div>
        </form>
    );
}

export function TradeJournal({ tradeId }: TradeJournalProps) {
    const [entries, setEntries] = useState<TradeJournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingEntry, setEditingEntry] = useState<TradeJournalEntry | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const fetchEntries = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await getJournalEntries(tradeId);

            if (result.success && result.data) {
                setEntries(result.data);
            } else {
                setError(result.error || 'Failed to load journal entries');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, [tradeId]);

    const handleCreate = async (data: JournalFormData) => {
        setSubmitting(true);
        setError(null);

        try {
            const input: CreateJournalEntryInput = {
                trade_id: tradeId,
                entry_type: data.entry_type,
                content: data.content,
                what_went_well: data.what_went_well || undefined,
                what_went_wrong: data.what_went_wrong || undefined,
                lesson_learned: data.lesson_learned || undefined,
                would_take_again: data.would_take_again,
                confidence_before: data.confidence_before,
                confidence_after: data.confidence_after,
            };

            const result = await createJournalEntry(input);

            if (result.success && result.data) {
                setEntries([result.data, ...entries]);
                setShowForm(false);
            } else {
                setError(result.error || 'Failed to create entry');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (data: JournalFormData) => {
        if (!editingEntry) return;

        setSubmitting(true);
        setError(null);

        try {
            const result = await updateJournalEntry(editingEntry.id, {
                entry_type: data.entry_type,
                content: data.content,
                what_went_well: data.what_went_well || undefined,
                what_went_wrong: data.what_went_wrong || undefined,
                lesson_learned: data.lesson_learned || undefined,
                would_take_again: data.would_take_again,
                confidence_before: data.confidence_before,
                confidence_after: data.confidence_after,
            });

            if (result.success && result.data) {
                setEntries(entries.map(e => e.id === editingEntry.id ? result.data! : e));
                setEditingEntry(null);
            } else {
                setError(result.error || 'Failed to update entry');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (entryId: string) => {
        try {
            const result = await deleteJournalEntry(entryId);

            if (result.success) {
                setEntries(entries.filter(e => e.id !== entryId));
                setDeleteConfirm(null);
            } else {
                setError(result.error || 'Failed to delete entry');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Trade Journal</h3>
                {!showForm && !editingEntry && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Entry
                    </button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                    <button
                        onClick={() => setError(null)}
                        className="ml-auto text-red-500 hover:text-red-700"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* New Entry Form */}
            {showForm && (
                <JournalEntryForm
                    onSubmit={handleCreate}
                    onCancel={() => setShowForm(false)}
                    isLoading={submitting}
                />
            )}

            {/* Edit Form */}
            {editingEntry && (
                <JournalEntryForm
                    initialData={editingEntry}
                    onSubmit={handleUpdate}
                    onCancel={() => setEditingEntry(null)}
                    isLoading={submitting}
                />
            )}

            {/* Entries List */}
            {entries.length === 0 && !showForm ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                    <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No journal entries yet</p>
                    <p className="text-gray-400 text-xs mt-1">
                        Document your thoughts, lessons, and reflections
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {entries.map((entry) => (
                        <div key={entry.id}>
                            {deleteConfirm === entry.id ? (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <p className="text-sm text-red-700 mb-3">Delete this journal entry?</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleDelete(entry.id)}
                                            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition-colors"
                                        >
                                            Delete
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(null)}
                                            className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <JournalEntryCard
                                    entry={entry}
                                    onEdit={() => setEditingEntry(entry)}
                                    onDelete={() => setDeleteConfirm(entry.id)}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
