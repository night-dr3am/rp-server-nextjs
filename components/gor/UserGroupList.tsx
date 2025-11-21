import React, { useState } from 'react';
import { GoreanButton, GoreanColors, GoreanFonts } from './GoreanTheme';
import ConfirmationDialog from './ConfirmationDialog';

export interface GroupMember {
  goreanId: number;
  characterName: string;
  slUuid: string;
}

interface UserGroupListProps {
  groupName: string;
  members: GroupMember[];
  onRemove: (goreanId: number) => Promise<void>;
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
    setRemovingId(selectedMember.goreanId);
    try {
      await onRemove(selectedMember.goreanId);
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

  // Determine header color based on group type
  const isEnemies = groupName.toLowerCase() === 'enemies';
  const headerColor = isEnemies ? GoreanColors.bloodRed : GoreanColors.bronze;

  return (
    <div
      className="rounded-lg shadow-lg p-6"
      style={{
        backgroundColor: GoreanColors.parchment,
        border: `3px solid ${GoreanColors.leather}`,
        fontFamily: GoreanFonts.body
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3
          className="text-xl font-bold"
          style={{
            color: headerColor,
            fontFamily: GoreanFonts.heading
          }}
        >
          {groupName}
        </h3>
        <GoreanButton
          variant="primary"
          size="sm"
          onClick={onAddClick}
        >
          + Add Member
        </GoreanButton>
      </div>

      {/* Members List */}
      {members.length === 0 ? (
        <div
          className="text-center py-8"
          style={{ color: GoreanColors.stone }}
        >
          <p>No members in this group yet.</p>
          <p className="text-sm mt-2" style={{ color: GoreanColors.leather }}>
            Click &ldquo;Add Member&rdquo; to add someone.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.goreanId}
              className="flex items-center justify-between rounded-lg p-4 transition-colors hover:opacity-90"
              style={{
                backgroundColor: GoreanColors.parchmentDark,
                border: `2px solid ${GoreanColors.stone}`
              }}
            >
              {/* Member Info */}
              <div className="flex-1">
                <p
                  className="font-medium"
                  style={{ color: GoreanColors.charcoal }}
                >
                  {member.characterName}
                </p>
                <div
                  className="flex space-x-4 text-xs mt-1"
                  style={{ color: GoreanColors.stone }}
                >
                  <span>ID: {member.goreanId}</span>
                  <span>UUID: {member.slUuid}</span>
                </div>
              </div>

              {/* Remove Button */}
              <GoreanButton
                variant="danger"
                size="sm"
                onClick={() => handleRemoveClick(member)}
                disabled={removingId === member.goreanId}
                className="ml-4"
              >
                {removingId === member.goreanId ? 'Removing...' : 'Remove'}
              </GoreanButton>
            </div>
          ))}
        </div>
      )}

      {/* Total Count */}
      <div
        className="mt-4 pt-3"
        style={{ borderTop: `2px solid ${GoreanColors.leather}` }}
      >
        <p className="text-sm" style={{ color: GoreanColors.stone }}>
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
