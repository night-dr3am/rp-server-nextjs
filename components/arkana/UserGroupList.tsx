import React, { useState } from 'react';
import ConfirmationDialog from './ConfirmationDialog';

export interface GroupMember {
  arkanaId: number;
  characterName: string;
  slUuid: string;
}

interface UserGroupListProps {
  groupName: string;
  members: GroupMember[];
  onRemove: (arkanaId: number) => Promise<void>;
  onAddClick: () => void;
}

export default function UserGroupList({
  groupName,
  members,
  onRemove,
  onAddClick
}: UserGroupListProps) {
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemoveClick = (member: GroupMember) => {
    setSelectedMember(member);
    setShowConfirmDialog(true);
  };

  const confirmRemove = async () => {
    if (!selectedMember) return;

    setIsRemoving(true);
    setRemovingId(selectedMember.arkanaId);
    try {
      await onRemove(selectedMember.arkanaId);
      setShowConfirmDialog(false);
      setSelectedMember(null);
    } catch (error) {
      console.error('Failed to remove member:', error);
    } finally {
      setIsRemoving(false);
      setRemovingId(null);
    }
  };

  const cancelRemove = () => {
    setShowConfirmDialog(false);
    setSelectedMember(null);
  };

  return (
    <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-cyan-400">{groupName}</h3>
        <button
          onClick={onAddClick}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-cyan-500/30"
        >
          + Add Member
        </button>
      </div>

      {/* Members List */}
      {members.length === 0 ? (
        <div className="text-center py-8 text-cyan-300">
          <p>No members in this group yet.</p>
          <p className="text-sm text-cyan-400 mt-2">Click &ldquo;Add Member&rdquo; to add someone.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.arkanaId}
              className="flex items-center justify-between bg-gray-800 border border-cyan-600 rounded-lg p-4 hover:bg-gray-750 transition-colors"
            >
              {/* Member Info */}
              <div className="flex-1">
                <p className="font-medium text-cyan-300">{member.characterName}</p>
                <div className="flex space-x-4 text-xs text-cyan-400 mt-1">
                  <span>ID: {member.arkanaId}</span>
                  <span>UUID: {member.slUuid}</span>
                </div>
              </div>

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveClick(member)}
                disabled={removingId === member.arkanaId}
                className="ml-4 px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {removingId === member.arkanaId ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Total Count */}
      <div className="mt-4 pt-3 border-t border-cyan-700">
        <p className="text-sm text-cyan-300">
          Total members: <span className="font-bold">{members.length}</span>
        </p>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        title="Remove Member"
        message={`Are you sure you want to remove ${selectedMember?.characterName} from ${groupName}?`}
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={confirmRemove}
        onCancel={cancelRemove}
        isLoading={isRemoving}
      />
    </div>
  );
}
